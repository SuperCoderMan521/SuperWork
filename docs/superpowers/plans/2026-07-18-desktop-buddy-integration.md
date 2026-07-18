# Desktop Buddy Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the existing Buddy behavior into the Electron Desktop UI while modifying only `packages/desktop`.

**Architecture:** A Bun-side `DesktopBuddyService` will reuse existing `src/buddy` and config modules, expose validated Buddy commands/events through the existing JSON-lines protocol, and keep OAuth/config access out of the renderer. React components in `packages/desktop/renderer` will render a graphical Buddy panel and local animations.

**Tech Stack:** Bun, Electron, JSON-lines IPC, Zod schemas, React 19, TypeScript, existing Desktop reducer/API patterns.

---

### Task 1: Extend the shared Buddy protocol

**Files:** `packages/desktop/shared/schemas.ts`, `packages/desktop/shared/protocol.ts`, `packages/desktop/shared/types.ts`; tests in `packages/desktop/tests/protocol.test.ts`.

- [ ] Add `BuddySnapshotSchema`, `BuddyCommand` schemas for get/hatch/rehatch/pet/setMuted, and `buddy.snapshot`/`buddy.reaction` events.
- [ ] Keep payloads serializable: companion metadata, sprite lines, mute state, reaction, and timestamps only.
- [ ] Add schema tests for valid commands, snapshots, and rejection of invalid rarity/stat payloads.

### Task 2: Add the Core Buddy adapter and dispatcher wiring

**Files:** Create `packages/desktop/core/buddy-service.ts`; modify `packages/desktop/core/command-dispatcher.ts`, `packages/desktop/core/main.ts`.

- [ ] Implement `DesktopBuddyService` using dynamic imports from `src/buddy/*` and `src/utils/config.js`.
- [ ] Implement get/hatch/rehatch/pet/mute operations; persist through existing global config helpers.
- [ ] Return `renderSprite()` output as data, but never import Ink components.
- [ ] Wire commands in `main.ts` and dispatcher; emit `buddy.snapshot` after every mutation.
- [ ] Make reaction failures non-fatal and log-only.
- [ ] Add service/dispatcher tests with mocked Buddy/config modules.

### Task 3: Expose Buddy methods through the preload API

**Files:** `packages/desktop/electron/desktop-api.ts`, `packages/desktop/electron/preload.ts`, `packages/desktop/renderer/src/env.d.ts`; tests in `packages/desktop/tests/preload-api.test.ts`.

- [ ] Add typed methods `getBuddy`, `hatchBuddy`, `rehatchBuddy`, `petBuddy`, `setBuddyMuted`.
- [ ] Reuse the existing command channel and request-id generation; do not add an unrestricted IPC channel.
- [ ] Add API contract tests for command shapes.

### Task 4: Add renderer Buddy state and panel

**Files:** Create `packages/desktop/renderer/src/features/buddy/BuddyPanel.tsx`, `BuddySprite.tsx`, `BuddyStats.tsx`; modify `renderer/src/app/App.tsx`, `renderer/src/app/reducer.ts`, `renderer/src/styles.css`.

- [ ] Store `BuddySnapshot` in renderer state and update it from subscription events.
- [ ] Render empty state with Hatch action, companion card with sprite/name/species/rarity/personality/stats, and Pet/Mute/Rehatch controls.
- [ ] Animate sprite frames and pet hearts using CSS/React timers; keep animations local to the renderer.
- [ ] Add a toggleable right-side panel alongside the existing files panel.
- [ ] Add component and reducer tests for empty, populated, muted, reaction, and pet states.

### Task 5: Integrate slash commands and reaction lifecycle

**Files:** `packages/desktop/renderer/src/features/chat/slashCommands.ts`, `renderer/src/app/App.tsx`, `packages/desktop/core/desktop-query-runner.ts` or `conversation-controller.ts`; tests in `slash-commands.test.ts` and a new Buddy lifecycle test.

- [ ] Route `/buddy`, `/buddy hatch`, `/buddy rehatch`, `/buddy pet`, `/buddy off`, and `/buddy on` to Desktop Buddy actions while preserving all other slash commands.
- [ ] After a successful query turn, request a best-effort Core Buddy reaction for the active session and display it as a dismissible speech bubble.
- [ ] Ensure no Buddy API/config failure changes query success/failure state.

### Task 6: Verify and package

**Files:** only Desktop tests/build outputs as generated.

- [ ] Run focused Buddy/protocol/API/UI tests.
- [ ] Run `bun run typecheck` for the repository and `bun run typecheck` from `packages/desktop`.
- [ ] Run `bun run build` from `packages/desktop` and verify the Core bundle contains Buddy adapter code.
- [ ] Confirm `git diff --name-only` contains no files outside `packages/desktop` and the plan document.

