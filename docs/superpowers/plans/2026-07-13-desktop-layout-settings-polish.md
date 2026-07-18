# Desktop Layout and Settings Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve ccWork desktop usability with resizable panes, an in-app settings page, working memory/config controls, keyboard slash command selection, and provider model configuration.

**Architecture:** Keep the existing Electron + Bun Core sidecar boundary. Renderer owns layout, page routing, local slash command interception, and form state. Core sidecar exposes only typed config read/write commands and never changes the existing loop/query execution path.

**Tech Stack:** Electron 40, Bun, React 19, TypeScript, Vite, zod protocol schemas, bun:test.

---

### Task 1: Renderer tests for layout, settings page, and slash interactions

**Files:**
- Modify: `packages/desktop/tests/chat-ui.test.tsx`
- Modify: `packages/desktop/tests/settings-ui.test.tsx`
- Modify: `packages/desktop/tests/preload-api.test.ts`
- Modify: `packages/desktop/tests/command-dispatcher.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests that assert:
- `ResizableWorkspace` renders left/middle/right panes and a close-file-panel button.
- `ConfigCenter` renders as a page with a back button, refresh icon, memory create/collapse controls, and model provider fields.
- `createDesktopApi` exposes config write methods.
- `DesktopCommandDispatcher` emits `config.saved`.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bun test packages/desktop/tests/chat-ui.test.tsx packages/desktop/tests/settings-ui.test.tsx packages/desktop/tests/preload-api.test.ts packages/desktop/tests/command-dispatcher.test.ts
```

Expected: failures for missing components/props/commands.

### Task 2: Resizable three-pane main layout

**Files:**
- Create: `packages/desktop/renderer/src/app/ResizableWorkspace.tsx`
- Modify: `packages/desktop/renderer/src/app/App.tsx`
- Modify: `packages/desktop/renderer/src/styles.css`

- [ ] **Step 1: Implement `ResizableWorkspace`**

Create a component with internal state for sidebar width and file panel width, pointer-driven splitters, and a file-panel close callback.

- [ ] **Step 2: Wire App into the layout**

Wrap `SessionSidebar`, `ConversationPane`, and `ConversationFilesPanel` in `ResizableWorkspace`. Hide the file panel when closed.

- [ ] **Step 3: Style rounded panes**

Add dark, rounded shell styles and draggable splitter hit areas.

### Task 3: In-app settings page and memory fixes

**Files:**
- Modify: `packages/desktop/renderer/src/app/App.tsx`
- Modify: `packages/desktop/renderer/src/features/settings/ConfigCenter.tsx`
- Modify: `packages/desktop/renderer/src/features/settings/SessionSettings.tsx`
- Modify: `packages/desktop/renderer/src/styles.css`

- [ ] **Step 1: Replace drawer behavior with page routing**

Use `view: 'chat' | 'settings'` in App. `settings.opened` switches to settings page, and back returns to chat.

- [ ] **Step 2: Fix memory create/collapse**

For missing memory files, clicking "创建" loads an empty draft and saving writes the file. Clicking an active memory item again collapses the editor.

- [ ] **Step 3: Add provider model fields**

Expose `baseUrl`, `token`, `model`, and provider toggles in the model settings form.

### Task 4: Config service write support and broader discovery

**Files:**
- Modify: `packages/desktop/shared/schemas.ts`
- Modify: `packages/desktop/electron/desktop-api.ts`
- Modify: `packages/desktop/core/command-dispatcher.ts`
- Modify: `packages/desktop/core/desktop-config-service.ts`
- Modify: `packages/desktop/core/main.ts`

- [ ] **Step 1: Add typed config write command/event**

Add `config.write` command and `config.saved` event for provider environment-like settings.

- [ ] **Step 2: Persist config in project `.claude/settings.local.json`**

Write provider values to a desktop-owned `desktop.modelConfig` object, preserving unrelated settings.

- [ ] **Step 3: Improve skill/MCP/plugin discovery**

Scan project and user `.agents/skills`, `.claude/skills`, `.codex/skills`, plugin folders, and MCP config files.

### Task 5: Slash command keyboard and local command execution

**Files:**
- Modify: `packages/desktop/renderer/src/features/chat/Composer.tsx`
- Modify: `packages/desktop/renderer/src/features/chat/slashCommands.ts`
- Modify: `packages/desktop/renderer/src/features/chat/ConversationPane.tsx`
- Modify: `packages/desktop/renderer/src/app/App.tsx`

- [ ] **Step 1: Add selected suggestion state**

Support ArrowUp/ArrowDown, Enter/Tab selection, and command chip rendering.

- [ ] **Step 2: Execute local UI slash commands**

Intercept `/config`, `/model`, `/memory`, `/mcp`, `/plugin`, `/skill` in App to open settings page on the matching tab. Send all other input to core.

### Task 6: Verification and package

**Files:** no source files.

- [ ] **Step 1: Run focused tests**

```bash
bun test packages/desktop/tests/chat-ui.test.tsx packages/desktop/tests/settings-ui.test.tsx packages/desktop/tests/preload-api.test.ts packages/desktop/tests/command-dispatcher.test.ts
```

- [ ] **Step 2: Run full desktop tests**

```bash
bun test packages/desktop/tests
```

- [ ] **Step 3: Run typechecks**

```bash
bun run --cwd packages/desktop typecheck
bun run typecheck
```

- [ ] **Step 4: Build and package**

```bash
bun run --cwd packages/desktop build
bun run --cwd packages/desktop package:win
```
