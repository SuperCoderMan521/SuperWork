# Desktop Session History Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure Desktop conversations are persisted in Claude Code's standard project history directory and recover legacy Desktop transcripts written to workspace roots.

**Architecture:** Keep all behavior changes under `packages/desktop`. A small session-storage activation helper resets the process-global Claude session state before every Desktop query. A dedicated legacy migration service copies UUID-named JSONL files from the remembered workspace into the standard project history directory, and the optional workspace travels through the existing `session.list` protocol before the global history scan.

**Tech Stack:** TypeScript, Bun, Electron protocol schemas, `bun:test`, Node.js filesystem APIs.

---

### Task 1: Drive session storage activation with a failing unit test

**Files:**
- Modify: `packages/desktop/core/desktop-query-runner.ts`
- Create: `packages/desktop/tests/desktop-session-storage.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test that calls an exported `activateDesktopSessionStorage` helper twice with different sessions. Record calls from fake `setOriginalCwd` and `switchSession` functions and expect this exact order:

```ts
expect(calls).toEqual([
  'cwd:G:/one',
  'session:session-one',
  'cwd:G:/two',
  'session:session-two',
])
expect(projectDirs).toEqual([undefined, undefined])
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test packages/desktop/tests/desktop-session-storage.test.ts
```

Expected: FAIL because `activateDesktopSessionStorage` is not exported.

- [ ] **Step 3: Implement the minimal helper**

Export a helper accepting the bootstrap module and `{ id, cwd }`. It must call `setOriginalCwd(cwd)` followed by `switchSession(id)` with no second argument. In `DesktopQueryRunner.run`, load the bootstrap module and call the helper before `getOrCreateEngine`, then remove the incorrect `switchSession(id, cwd)` call from the engine-creation-only branch.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
bun test packages/desktop/tests/desktop-session-storage.test.ts
```

Expected: PASS.

### Task 2: Recover legacy workspace-root transcripts

**Files:**
- Create: `packages/desktop/core/legacy-session-migration.ts`
- Create: `packages/desktop/tests/legacy-session-migration.test.ts`

- [ ] **Step 1: Write failing migration tests**

Use temporary source and destination directories. Cover:

```ts
expect(result.copied).toEqual(['11111111-1111-1111-1111-111111111111.jsonl'])
expect(await Bun.file(destinationFile).text()).toBe('legacy transcript')
```

Also verify an existing destination is unchanged and `notes.jsonl` is ignored.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun test packages/desktop/tests/legacy-session-migration.test.ts
```

Expected: FAIL because the migration module does not exist.

- [ ] **Step 3: Implement safe copy migration**

Implement `copyLegacyDesktopTranscripts(workspace, projectHistoryDir)` using `readdir`, `mkdir`, and `copyFile(..., COPYFILE_EXCL)`. Only accept filenames matching the full UUID JSONL pattern. Return copied filenames and warning strings. Treat `EEXIST` as a safe skip and never delete source files.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
bun test packages/desktop/tests/legacy-session-migration.test.ts
```

Expected: PASS.

### Task 3: Pass the remembered workspace through session listing

**Files:**
- Modify: `packages/desktop/shared/schemas.ts`
- Modify: `packages/desktop/electron/desktop-api.ts`
- Modify: `packages/desktop/core/command-dispatcher.ts`
- Modify: `packages/desktop/core/main.ts`
- Modify: `packages/desktop/renderer/src/app/App.tsx`
- Modify: `packages/desktop/tests/protocol.test.ts`
- Modify: `packages/desktop/tests/preload-api.test.ts`
- Modify: `packages/desktop/tests/command-dispatcher.test.ts`

- [ ] **Step 1: Write failing protocol and dispatcher tests**

Require `session.list` to accept:

```ts
{ type: 'session.list', requestId: 'request-1', cwd: 'K:/ai/12' }
```

Require the dispatcher to call `listSessions('K:/ai/12')`, and require the renderer API to send the optional `cwd`.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun test packages/desktop/tests/protocol.test.ts packages/desktop/tests/preload-api.test.ts packages/desktop/tests/command-dispatcher.test.ts
```

Expected: FAIL because `cwd` is not part of `session.list` and the callback has no parameter.

- [ ] **Step 3: Implement protocol plumbing and migration hook**

Add optional `cwd` to the `session.list` schema and `DesktopApi.listSessions(cwd?)`. Change `CommandDispatcherOptions.listSessions` to accept an optional workspace and forward `command.cwd`. In Desktop Core, when a workspace is provided, copy legacy transcripts to `storageModule.getProjectDir(cwd)`, log warnings, then call the existing global `sessionService.list()` so other workspace groups remain visible. In `App`, call `listSessions(storedWorkspace ?? undefined)` during startup.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
bun test packages/desktop/tests/protocol.test.ts packages/desktop/tests/preload-api.test.ts packages/desktop/tests/command-dispatcher.test.ts
```

Expected: PASS.

### Task 4: Verify behavior and repository health

**Files:**
- Verify all modified Desktop files.

- [ ] **Step 1: Run focused Desktop tests**

```bash
bun test packages/desktop/tests/desktop-session-storage.test.ts packages/desktop/tests/legacy-session-migration.test.ts packages/desktop/tests/protocol.test.ts packages/desktop/tests/preload-api.test.ts packages/desktop/tests/command-dispatcher.test.ts packages/desktop/tests/app.test.tsx
```

Expected: all tests pass.

- [ ] **Step 2: Run Desktop typecheck**

```bash
bun run --cwd packages/desktop typecheck
```

Expected: zero TypeScript errors.

- [ ] **Step 3: Run repository typecheck**

```bash
bun run typecheck
```

Expected: zero TypeScript errors.

- [ ] **Step 4: Inspect the diff**

Run `git diff --check` and confirm no unrelated files changed.
