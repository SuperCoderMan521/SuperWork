# Desktop Auto Memory Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every Markdown file from Claude Code's real project-scoped auto-memory directory in the desktop Memory page, with hierarchy and Chinese descriptions.

**Architecture:** Extend the shared memory-file contract with presentation metadata. Let `DesktopConfigService` reuse CC's canonical memory path, recursively discover Markdown files, and let the renderer separate authored instructions from automatic memories while retaining the existing absolute-path editor flow.

**Tech Stack:** TypeScript, Bun, React 19, Zod, Node filesystem APIs.

---

## File Structure

- `packages/desktop/shared/schemas.ts`: memory presentation contract.
- `packages/desktop/core/desktop-config-service.ts`: canonical path lookup, recursive discovery, metadata parsing.
- `packages/desktop/renderer/src/features/settings/ConfigCenter.tsx`: sectioned tree UI.
- `packages/desktop/renderer/src/styles.css`: hierarchy and description styling.
- `packages/desktop/tests/{protocol,desktop-config-service,settings-ui}.test.*`: behavioral coverage.

### Task 1: Extend the shared memory contract

**Files:**
- Modify: `packages/desktop/shared/schemas.ts:108-115`
- Test: `packages/desktop/tests/protocol.test.ts`

- [ ] **Step 1: Write the failing protocol test**

Add a snapshot memory entry with these fields and assert `parseCoreEvent()` preserves them:

```ts
description: '用户对工作方式的反馈与约束',
relativePath: 'team/feedback.md',
depth: 1,
```

- [ ] **Step 2: Verify RED**

Run: `bun test packages/desktop/tests/protocol.test.ts`

Expected: FAIL because Zod strips the new fields.

- [ ] **Step 3: Add the schema fields**

```ts
description: z.string().optional(),
relativePath: z.string().optional(),
depth: z.number().int().nonnegative().optional(),
```

- [ ] **Step 4: Verify GREEN and commit**

Run: `bun test packages/desktop/tests/protocol.test.ts`

Expected: PASS.

```bash
git add packages/desktop/shared/schemas.ts packages/desktop/tests/protocol.test.ts
git commit -m "feat: 扩展 desktop 记忆文件元数据"
```

### Task 2: Recursively discover auto-memory files

**Files:**
- Modify: `packages/desktop/core/desktop-config-service.ts`
- Test: `packages/desktop/tests/desktop-config-service.test.ts`

- [ ] **Step 1: Write failing discovery tests**

Create a temporary tree containing `MEMORY.md`, `preferences.md`, `notes.txt`,
`team/MEMORY.md`, and `team/project-context.md`. Test the wished-for API:

```ts
const files = await discoverAutoMemoryFiles(memoryDir)
expect(files.map(file => file.relativePath)).toEqual([
  'MEMORY.md',
  'preferences.md',
  'team/MEMORY.md',
  'team/project-context.md',
])
expect(files.find(file => file.relativePath === 'preferences.md')?.description)
  .toBe('用户信息、目标与偏好')
expect(files.find(file => file.relativePath === 'team/project-context.md')?.scope)
  .toBe('team')
```

Also assert a missing directory returns `[]`, `notes.txt` is excluded, and malformed frontmatter remains visible as `未分类记忆文件`.

- [ ] **Step 2: Verify RED**

Run: `bun test packages/desktop/tests/desktop-config-service.test.ts`

Expected: FAIL because `discoverAutoMemoryFiles` does not exist.

- [ ] **Step 3: Implement the scanner**

Export `discoverAutoMemoryFiles(memoryDir: string): Promise<DesktopMemoryFile[]>`.
Recursively use `readdir(..., { withFileTypes: true })`, sort names, include only
case-insensitive `.md`, compute `relativePath` and `depth`, and catch unreadable
directories. Parse only a leading `---` frontmatter block for `type:`.

Use this exact mapping:

```ts
const MEMORY_TYPE_DESCRIPTIONS = {
  user: '用户信息、目标与偏好',
  feedback: '用户对工作方式的反馈与约束',
  project: '无法直接从代码推导的项目背景和长期事项',
  reference: '外部系统与资料入口',
} as const
```

Use `自动记忆索引` for `MEMORY.md`, `未分类记忆文件` for unknown types,
and prefix descriptions under `team/` with `团队共享记忆 · `.

- [ ] **Step 4: Verify GREEN and commit**

Run: `bun test packages/desktop/tests/desktop-config-service.test.ts`

Expected: PASS.

```bash
git add packages/desktop/core/desktop-config-service.ts packages/desktop/tests/desktop-config-service.test.ts
git commit -m "feat: 递归发现 desktop 自动记忆文件"
```

### Task 3: Use CC's canonical project memory path

**Files:**
- Modify: `packages/desktop/core/desktop-config-service.ts`
- Test: `packages/desktop/tests/desktop-config-service.test.ts`

- [ ] **Step 1: Write a failing snapshot integration test**

Define the desired injectable boundary:

```ts
const service = new DesktopConfigService({ getAutoMemoryPath: () => memoryDir })
const snapshot = await service.snapshot(projectDir)
expect(snapshot.memoryFiles.map(file => file.relativePath))
  .toContain('team/project-context.md')
```

Assert no entry points to `~/.claude/memory/MEMORY.md`.

- [ ] **Step 2: Verify RED**

Run: `bun test packages/desktop/tests/desktop-config-service.test.ts`

Expected: FAIL because the service lacks the resolver and still creates a synthetic entry.

- [ ] **Step 3: Implement canonical integration**

Add this constructor dependency, defaulted through a lazy import of
`src/memdir/paths.js#getAutoMemPath`:

```ts
type DesktopConfigServiceOptions = {
  getAutoMemoryPath?: () => string | Promise<string>
}
```

Remove the synthetic Auto Memory entry. Keep `memoryFilesForCwd()` limited to
the three authored instruction files, with descriptions:

```ts
'当前项目的主要开发规则与上下文'
'当前项目的 Claude Code 专用规则'
'适用于所有项目的用户级规则'
```

In `snapshot()`, append `await discoverAutoMemoryFiles(realMemoryPath)`.

- [ ] **Step 4: Verify GREEN and commit**

Run: `bun test packages/desktop/tests/desktop-config-service.test.ts`

Expected: PASS.

```bash
git add packages/desktop/core/desktop-config-service.ts packages/desktop/tests/desktop-config-service.test.ts
git commit -m "fix: 使用 CC 实际自动记忆目录"
```

### Task 4: Render the full memory tree with Chinese descriptions

**Files:**
- Modify: `packages/desktop/renderer/src/features/settings/ConfigCenter.tsx`
- Modify: `packages/desktop/renderer/src/styles.css`
- Test: `packages/desktop/tests/settings-ui.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Add project, auto-index, and nested team fixtures. Assert rendered HTML includes:

```ts
expect(html).toContain('规则文件')
expect(html).toContain('自动记忆文件')
expect(html).toContain('自动记忆索引')
expect(html).toContain('团队共享记忆')
expect(html).toContain('team/project-context.md')
```

For a snapshot without auto files, assert `尚未生成自动记忆`.

- [ ] **Step 2: Verify RED**

Run: `bun test packages/desktop/tests/settings-ui.test.tsx`

Expected: FAIL because sectioned tree rendering is absent.

- [ ] **Step 3: Implement sectioned tree rendering**

```ts
const instructionFiles = memoryFiles.filter(file =>
  file.scope === 'project' || file.scope === 'user')
const autoMemoryFiles = memoryFiles.filter(file =>
  file.scope === 'auto' || file.scope === 'team')
```

Render headings `规则文件` and `自动记忆文件`. Each row displays
`relativePath ?? label`, its Chinese `description`, and Chinese scope. Indent by
`(depth ?? 0) * 16` pixels. Preserve read/create/collapse/edit/save/compact behavior.

- [ ] **Step 4: Add focused styles**

Add classes for section headings, relative paths, muted descriptions, scope
badges, and indentation using existing color variables. Do not change unrelated layout.

- [ ] **Step 5: Verify GREEN and commit**

Run: `bun test packages/desktop/tests/settings-ui.test.tsx`

Expected: PASS.

```bash
git add packages/desktop/renderer/src/features/settings/ConfigCenter.tsx packages/desktop/renderer/src/styles.css packages/desktop/tests/settings-ui.test.tsx
git commit -m "feat: 展示完整自动记忆树和中文说明"
```

### Task 5: Full verification

**Files:** Verify only files listed above; preserve unrelated working-tree changes.

- [ ] **Step 1: Run focused tests**

```bash
bun test packages/desktop/tests/protocol.test.ts packages/desktop/tests/desktop-config-service.test.ts packages/desktop/tests/settings-ui.test.tsx
```

Expected: zero failures.

- [ ] **Step 2: Run all desktop tests**

Run: `bun test packages/desktop/tests`

Expected: zero failures.

- [ ] **Step 3: Run both typechecks**

```bash
bun run --cwd packages/desktop typecheck
bun run typecheck
```

Expected: both exit with code 0 and zero TypeScript errors.

- [ ] **Step 4: Inspect the final diff**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and unrelated user changes remain untouched.
