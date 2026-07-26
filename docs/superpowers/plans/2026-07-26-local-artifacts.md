# Local Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add desktop-only Local Artifacts so generated HTML/Markdown/diagram/SVG content can be previewed and managed locally without uploading to cloud services.

**Architecture:** Keep the feature in `packages/desktop`. Derive artifacts in the renderer from the current `RendererSession` messages/tools; do not extend the desktop protocol for MVP. Reuse existing `MarkdownMessage`, `DiagramRenderer`, and file loading APIs.

**Tech Stack:** React renderer, TypeScript, Bun tests, existing desktop reducer/session types.

---

### Task 1: Local artifact derivation

**Files:**
- Create: `packages/desktop/renderer/src/features/artifacts/localArtifacts.ts`
- Test: `packages/desktop/tests/local-artifacts.test.ts`

- [ ] **Step 1: Write failing derivation tests**

Create tests that assert:

```ts
import { describe, expect, test } from 'bun:test'
import { deriveLocalArtifacts } from '../renderer/src/features/artifacts/localArtifacts.js'

describe('deriveLocalArtifacts', () => {
  test('detects artifact file paths from write tools', () => {
    const artifacts = deriveLocalArtifacts({
      messages: {},
      messageOrder: [],
      tools: {
        'tool-1': {
          id: 'tool-1',
          name: 'Write',
          state: 'success',
          summary: 'dashboard.html',
          input: { file_path: 'G:/tmp/dashboard.html' },
          displayOrder: 3,
        },
      },
      toolOrder: ['tool-1'],
    })
    expect(artifacts.map(item => item.path)).toEqual(['G:/tmp/dashboard.html'])
    expect(artifacts[0]?.kind).toBe('html')
  })

  test('detects complete fenced artifacts from assistant messages', () => {
    const artifacts = deriveLocalArtifacts({
      messages: {
        'msg-1': {
          id: 'msg-1',
          role: 'assistant',
          kind: 'text',
          content: '```mermaid\ngraph TD; A-->B\n```',
          createdAt: 10,
          displayOrder: 10,
        },
      },
      messageOrder: ['msg-1'],
      tools: {},
      toolOrder: [],
    })
    expect(artifacts).toMatchObject([
      { source: 'message', kind: 'mermaid', content: 'graph TD; A-->B' },
    ])
  })

  test('ignores incomplete fenced blocks and cloud artifact links', () => {
    const artifacts = deriveLocalArtifacts({
      messages: {
        'msg-1': {
          id: 'msg-1',
          role: 'assistant',
          kind: 'text',
          content: '```html\n<div>',
          createdAt: 10,
        },
      },
      messageOrder: ['msg-1'],
      tools: {
        'tool-1': {
          id: 'tool-1',
          name: 'artifact',
          state: 'success',
          summary: 'cloud',
          output: 'Artifact uploaded: https://x.test/7d/a.html (id: a, expires: 2026-06-27T10:00:00.000Z)',
        },
      },
      toolOrder: ['tool-1'],
    })
    expect(artifacts).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
bun test ./packages/desktop/tests/local-artifacts.test.ts
```

Expected: FAIL because `localArtifacts.ts` does not exist.

- [ ] **Step 3: Implement derivation**

Create:

```ts
export type DesktopLocalArtifact = {
  id: string
  source: 'file' | 'message'
  title: string
  kind: 'html' | 'markdown' | 'mermaid' | 'plantuml' | 'svg' | 'text'
  status: 'ready' | 'missing' | 'error'
  path?: string
  content?: string
  messageId?: string
  toolCallId?: string
  createdAt: number
  displayOrder?: number
  error?: string
}
```

Implement `deriveLocalArtifacts(sessionLike)` from `messages/messageOrder/tools/toolOrder`, supporting write tool paths and complete fenced blocks only.

- [ ] **Step 4: Verify task**

Run:

```bash
bun test ./packages/desktop/tests/local-artifacts.test.ts
```

Expected: PASS.

---

### Task 2: Right workspace Artifacts panel

**Files:**
- Create: `packages/desktop/renderer/src/features/artifacts/LocalArtifactsPanel.tsx`
- Modify: `packages/desktop/renderer/src/features/workspace/WorkspacePanel.tsx`
- Test: `packages/desktop/tests/chat-ui.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Add tests that render `WorkspacePanel` with `activeTab="artifacts"` and assert:

```ts
expect(html).toContain('Artifacts')
expect(html).toContain('dashboard.html')
expect(html).toContain('html-preview')
expect(html).toContain('sandbox=""')
```

Also assert empty state contains `还没有本地 Artifacts`.

- [ ] **Step 2: Run UI tests and confirm failure**

Run:

```bash
bun test ./packages/desktop/tests/chat-ui.test.tsx
```

Expected: FAIL because `artifacts` tab is not supported.

- [ ] **Step 3: Implement panel**

Create `LocalArtifactsPanel` with props:

```ts
{
  artifacts: DesktopLocalArtifact[]
  selectedArtifactId: string | null
  content: string | null
  onSelect: (artifact: DesktopLocalArtifact) => void
  onOpenFile?: (path: string) => void
}
```

Render list, selected preview, missing/error states, and buttons for open/copy path/copy content.

- [ ] **Step 4: Wire workspace tab**

Change `WorkspacePanel` tab type from `'files' | 'agents'` to `'files' | 'agents' | 'artifacts'`; add `artifacts`, `selectedArtifactId`, `artifactContent`, `onSelectArtifact`, and render `LocalArtifactsPanel`.

- [ ] **Step 5: Verify task**

Run:

```bash
bun test ./packages/desktop/tests/chat-ui.test.tsx
```

Expected: PASS.

---

### Task 3: Conversation local artifact cards and app wiring

**Files:**
- Create: `packages/desktop/renderer/src/features/artifacts/LocalArtifactCard.tsx`
- Modify: `packages/desktop/renderer/src/app/App.tsx`
- Modify: `packages/desktop/renderer/src/features/chat/ConversationPane.tsx`
- Test: `packages/desktop/tests/chat-ui.test.tsx`

- [ ] **Step 1: Write failing interaction tests**

Add a test that renders `App` or `ConversationPane` with an assistant HTML fenced block and asserts:

```ts
expect(html).toContain('Local Artifact')
expect(html).toContain('预览')
```

Add a test that simulates opening an artifact by invoking the callback and asserts the workspace can be switched to Artifacts.

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
bun test ./packages/desktop/tests/chat-ui.test.tsx
```

Expected: FAIL because no artifact cards exist.

- [ ] **Step 3: Implement card**

Create `LocalArtifactCard` with preview/open/copy actions. Use concise Chinese UI labels:

```text
本地产物
预览
打开
复制
```

- [ ] **Step 4: Wire App**

In `App.tsx`:

- derive artifacts from selected session with `deriveLocalArtifacts(selected)`
- add `workspaceTab: 'files' | 'agents' | 'artifacts'`
- add `selectedArtifactId`
- add `artifactContent`
- on artifact preview: open file content via existing `desktopApi.loadFile(path)` for file artifacts, use `content` directly for message artifacts, set tab to `artifacts`

- [ ] **Step 5: Wire ConversationPane**

Pass artifacts and `onOpenArtifact` into `ConversationPane`. Render artifact cards near their source message/tool, or after the source message for message artifacts.

- [ ] **Step 6: Verify task**

Run:

```bash
bun test ./packages/desktop/tests/chat-ui.test.tsx
```

Expected: PASS.

---

### Task 4: Styling and full verification

**Files:**
- Modify: `packages/desktop/renderer/src/styles.css`
- Test: `packages/desktop/tests/styles.test.ts`

- [ ] **Step 1: Add failing style tests**

Assert stylesheet contains:

```ts
expect(css).toContain('.local-artifact-card')
expect(css).toContain('.local-artifacts-panel')
expect(css).toContain('.local-artifact-preview')
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
bun test ./packages/desktop/tests/styles.test.ts
```

Expected: FAIL because styles are missing.

- [ ] **Step 3: Implement styles**

Add warm dark cards consistent with existing desktop UI:

- compact card in conversation
- right panel list
- preview shell
- muted empty/error states
- small action buttons

- [ ] **Step 4: Run relevant tests**

Run:

```bash
bun test ./packages/desktop/tests/local-artifacts.test.ts ./packages/desktop/tests/chat-ui.test.tsx ./packages/desktop/tests/styles.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: exit 0.

- [ ] **Step 6: Build desktop bundle**

Run:

```bash
bun run build
```

Expected: exit 0.
