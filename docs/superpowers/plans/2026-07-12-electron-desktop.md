# Electron Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows-first Electron desktop client with streaming chat, tool display, permissions, model/mode settings, history, and interruption while preserving the TUI and `src/query.ts`.

**Architecture:** A React DOM renderer talks through a narrow preload API to Electron Main. Main supervises an independent Bun Sidecar; the Sidecar invokes the existing query stack and emits a versioned, runtime-validated desktop protocol over JSON Lines.

**Tech Stack:** Bun, Electron, React 19, Vite, TypeScript strict mode, Zod, bun:test, Testing Library, Playwright Electron

---

## File Map

- `packages/desktop/package.json`: workspace scripts and desktop dependencies.
- `packages/desktop/tsconfig.json`: shared strict TypeScript configuration.
- `packages/desktop/vite.config.ts`: renderer bundle configuration.
- `packages/desktop/electron/main.ts`: secure BrowserWindow and IPC lifecycle.
- `packages/desktop/electron/preload.ts`: narrow `window.desktopApi` bridge.
- `packages/desktop/electron/sidecar-manager.ts`: Bun child-process transport and restart policy.
- `packages/desktop/core/entry.ts`: JSON Lines Sidecar entry.
- `packages/desktop/core/conversation-controller.ts`: desktop conversation state machine and existing `query()` invocation.
- `packages/desktop/core/event-adapter.ts`: raw query stream to desktop-domain events.
- `packages/desktop/core/permission-broker.ts`: pending permission lifecycle.
- `packages/desktop/core/session-service.ts`: existing session index and transcript adapters.
- `packages/desktop/shared/schemas.ts`: Zod protocol schemas.
- `packages/desktop/shared/protocol.ts`: inferred protocol types and version.
- `packages/desktop/shared/errors.ts`: stable error construction.
- `packages/desktop/renderer/src/app/*`: application shell, store, reducer, and bridge subscription.
- `packages/desktop/renderer/src/features/*`: focused chat, history, permissions, and settings UI.
- `packages/desktop/tests/*`: protocol, Core, renderer, and Electron integration tests.
- `package.json`: root desktop scripts only; existing CLI scripts remain unchanged.

## Task 1: Scaffold the Independent Desktop Workspace

**Files:**
- Create: `packages/desktop/package.json`
- Create: `packages/desktop/tsconfig.json`
- Create: `packages/desktop/vite.config.ts`
- Create: `packages/desktop/index.html`
- Create: `packages/desktop/renderer/src/main.tsx`
- Modify: `package.json`

- [ ] **Step 1: Add a failing workspace smoke test**

Create `packages/desktop/tests/workspace.test.ts` that imports the desktop protocol version and expects it to equal `1`.

```ts
import { expect, test } from "bun:test";
import { DESKTOP_PROTOCOL_VERSION } from "../shared/protocol";

test("exports desktop protocol version", () => {
  expect(DESKTOP_PROTOCOL_VERSION).toBe(1);
});
```

- [ ] **Step 2: Verify the test fails**

Run: `bun test packages/desktop/tests/workspace.test.ts`  
Expected: FAIL because `../shared/protocol` does not exist.

- [ ] **Step 3: Add workspace configuration and minimal renderer entry**

Use package name `@claude-code-best/desktop`, `type: module`, and scripts `dev`, `build`, `typecheck`, `test`, and `package:win`. Add Electron, electron-builder, React DOM, Vite React plugin, Zod, Testing Library, and Playwright as desktop package dependencies. Add root scripts `desktop:dev`, `desktop:build`, and `desktop:test` without changing existing CLI scripts.

- [ ] **Step 4: Add the protocol constant**

Create `shared/protocol.ts` with:

```ts
export const DESKTOP_PROTOCOL_VERSION = 1 as const;
```

- [ ] **Step 5: Verify workspace health**

Run: `bun test packages/desktop/tests/workspace.test.ts`  
Expected: PASS.

Run: `bun run --cwd packages/desktop typecheck`  
Expected: zero TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add package.json packages/desktop
git commit -m "feat: scaffold electron desktop workspace"
```

## Task 2: Define the Versioned Desktop Protocol

**Files:**
- Create: `packages/desktop/shared/schemas.ts`
- Modify: `packages/desktop/shared/protocol.ts`
- Create: `packages/desktop/shared/errors.ts`
- Create: `packages/desktop/tests/protocol.test.ts`

- [ ] **Step 1: Write protocol validation tests**

Cover a valid `prompt.submit`, invalid empty `requestId`, valid `message.delta`, invalid protocol version, and exhaustive error codes. Assert `safeParse()` success or failure explicitly.

- [ ] **Step 2: Verify protocol tests fail**

Run: `bun test packages/desktop/tests/protocol.test.ts`  
Expected: FAIL because the schemas are not defined.

- [ ] **Step 3: Implement schemas as discriminated unions**

Define `DesktopCommandSchema`, `DesktopEventSchema`, `DesktopMessageSchema`, `DesktopToolCallSchema`, `DesktopSessionSchema`, `PermissionDecisionSchema`, and `DesktopErrorSchema`. Use non-empty strings for IDs, `z.literal(1)` for the handshake version, and enums for every state.

- [ ] **Step 4: Infer public types from schemas**

Use `z.infer<typeof Schema>` exclusively so runtime and compile-time protocol definitions cannot diverge. Export `assertDesktopCommand()` and `assertDesktopEvent()` parsing helpers.

- [ ] **Step 5: Verify protocol tests and types**

Run: `bun test packages/desktop/tests/protocol.test.ts`  
Expected: PASS.

Run: `bun run --cwd packages/desktop typecheck`  
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add packages/desktop/shared packages/desktop/tests/protocol.test.ts
git commit -m "feat: define desktop ipc protocol"
```

## Task 3: Implement JSON Lines Transport and Sidecar Supervision

**Files:**
- Create: `packages/desktop/electron/json-lines.ts`
- Create: `packages/desktop/electron/sidecar-manager.ts`
- Create: `packages/desktop/tests/json-lines.test.ts`
- Create: `packages/desktop/tests/sidecar-manager.test.ts`

- [ ] **Step 1: Test chunk-safe JSON Lines decoding**

Feed one event split across two chunks, two events in one chunk, and malformed JSON. Assert ordered delivery and a typed transport error.

- [ ] **Step 2: Verify decoder tests fail**

Run: `bun test packages/desktop/tests/json-lines.test.ts`  
Expected: FAIL because `JsonLineDecoder` does not exist.

- [ ] **Step 3: Implement a focused decoder and encoder**

`JsonLineDecoder.push(chunk)` buffers only the incomplete final line and parses complete lines. `encodeJsonLine(value)` returns one JSON object plus `\n` and rejects newline-corrupting non-serializable values.

- [ ] **Step 4: Test Sidecar lifecycle with an injected process factory**

Assert ready handshake, command forwarding, one automatic restart, no prompt replay, graceful shutdown, and second-crash terminal failure.

- [ ] **Step 5: Implement `SidecarManager`**

Keep process creation behind `SidecarProcessFactory`, validate all inbound events, write commands with backpressure handling, and expose named callbacks for ready, event, crash, and permanent failure.

- [ ] **Step 6: Verify transport tests**

Run: `bun test packages/desktop/tests/json-lines.test.ts packages/desktop/tests/sidecar-manager.test.ts`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/desktop/electron packages/desktop/tests
git commit -m "feat: add desktop sidecar transport"
```

## Task 4: Build the Permission Broker

**Files:**
- Create: `packages/desktop/core/permission-broker.ts`
- Create: `packages/desktop/tests/permission-broker.test.ts`

- [ ] **Step 1: Write permission lifecycle tests**

Test allow once, deny, session allow, unknown permission ID, duplicate resolution, session cancellation, timeout, and cancellation on interruption.

- [ ] **Step 2: Verify tests fail**

Run: `bun test packages/desktop/tests/permission-broker.test.ts`  
Expected: FAIL because `PermissionBroker` is absent.

- [ ] **Step 3: Implement the broker**

Use a `Map<string, PendingPermission>` internally, inject ID generation and timers for deterministic tests, emit serializable requests, and translate decisions into the existing permission result type at the boundary.

- [ ] **Step 4: Verify tests and leak cleanup**

Run: `bun test packages/desktop/tests/permission-broker.test.ts`  
Expected: PASS and the broker reports zero pending requests after every terminal path.

- [ ] **Step 5: Commit**

```bash
git add packages/desktop/core/permission-broker.ts packages/desktop/tests/permission-broker.test.ts
git commit -m "feat: add desktop permission broker"
```

## Task 5: Adapt Existing Query Events Without Changing the Loop

**Files:**
- Create: `packages/desktop/core/event-adapter.ts`
- Create: `packages/desktop/tests/fixtures/query-events.ts`
- Create: `packages/desktop/tests/event-adapter.test.ts`
- Read only: `src/utils/messages.ts`
- Read only: `src/query.ts`

- [ ] **Step 1: Capture representative contract fixtures**

Create typed fixtures for stream start, assistant text delta, completed assistant message, tool start/update/result, permission-related tool state, tombstone, API error, compact boundary, and user interruption.

- [ ] **Step 2: Write exact event-sequence tests**

Assert stable desktop IDs, monotonic sequence values, delta batching, immediate tool/error delivery, and terminal generation state.

- [ ] **Step 3: Verify adapter tests fail**

Run: `bun test packages/desktop/tests/event-adapter.test.ts`  
Expected: FAIL because `DesktopEventAdapter` does not exist.

- [ ] **Step 4: Implement the adapter**

Reuse exported pure helpers from `src/utils/messages.ts` where possible. If a required normalizer is nested inside `REPL.tsx`, extract only that pure normalizer to `src/utils/messages.ts` with its existing TUI call site unchanged. Do not edit `src/query.ts` and do not move React state code into Core.

- [ ] **Step 5: Verify contract and existing message tests**

Run: `bun test packages/desktop/tests/event-adapter.test.ts src/utils/__tests__`  
Expected: PASS.

- [ ] **Step 6: Assert the query loop is untouched**

Run: `git diff -- src/query.ts`  
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add packages/desktop/core/event-adapter.ts packages/desktop/tests src/utils/messages.ts src/screens/REPL.tsx
git commit -m "feat: adapt query events for desktop"
```

## Task 6: Implement Conversation Control and Session History

**Files:**
- Create: `packages/desktop/core/conversation-controller.ts`
- Create: `packages/desktop/core/session-service.ts`
- Create: `packages/desktop/tests/conversation-controller.test.ts`
- Create: `packages/desktop/tests/session-service.test.ts`
- Reuse: `src/utils/listSessionsImpl.ts`
- Reuse: `src/utils/sessionStorage.ts`

- [ ] **Step 1: Test the conversation state machine**

Cover create, resume, submit, reject a second concurrent submit, model change, mode change, interrupt twice, normal completion, query failure, and permission cancellation.

- [ ] **Step 2: Test session adapters**

Use temporary transcript fixtures to verify lightweight listing, lazy full load, missing session, and deletion constrained to known session paths.

- [ ] **Step 3: Verify tests fail**

Run: `bun test packages/desktop/tests/conversation-controller.test.ts packages/desktop/tests/session-service.test.ts`  
Expected: FAIL because controller and service are absent.

- [ ] **Step 4: Implement `SessionService` using existing storage APIs**

Map `listSessionsImpl()` results to summaries and existing transcript deserialization to desktop snapshots. Keep filesystem operations inside the service and validate session IDs before resolving paths.

- [ ] **Step 5: Implement `DesktopConversationController`**

Inject the query generator for unit tests. In production, build the same query context inputs used by the interactive path, connect `PermissionBroker` as `canUseTool`, iterate `query()` unchanged, feed the event adapter, and flush session storage after terminal states.

- [ ] **Step 6: Verify controller and session tests**

Run: `bun test packages/desktop/tests/conversation-controller.test.ts packages/desktop/tests/session-service.test.ts`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/desktop/core packages/desktop/tests
git commit -m "feat: add desktop conversation controller"
```

## Task 7: Add the Bun Sidecar Entry

**Files:**
- Create: `packages/desktop/core/entry.ts`
- Create: `packages/desktop/tests/core-entry.test.ts`

- [ ] **Step 1: Write entry integration tests**

Spawn the entry with an isolated test controller, assert `core.ready`, send a valid command, reject malformed input without exiting, and complete `core.shutdown` cleanly.

- [ ] **Step 2: Verify the integration test fails**

Run: `bun test packages/desktop/tests/core-entry.test.ts`  
Expected: FAIL because the entry does not exist.

- [ ] **Step 3: Implement stdin/stdout dispatch**

Parse one validated command per line, route commands through a command dispatcher, serialize events only to stdout, route logs to stderr, and wait for pending storage flush on shutdown.

- [ ] **Step 4: Verify entry integration**

Run: `bun test packages/desktop/tests/core-entry.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/desktop/core/entry.ts packages/desktop/tests/core-entry.test.ts
git commit -m "feat: add bun desktop core entry"
```

## Task 8: Add Secure Electron Main and Preload APIs

**Files:**
- Create: `packages/desktop/electron/main.ts`
- Create: `packages/desktop/electron/preload.ts`
- Create: `packages/desktop/renderer/src/env.d.ts`
- Create: `packages/desktop/tests/preload-api.test.ts`

- [ ] **Step 1: Test the exposed API surface**

Assert the bridge exposes only named session, prompt, permission, model, mode, interruption, subscription, and lifecycle methods. Assert arbitrary IPC channel access is impossible.

- [ ] **Step 2: Verify the API test fails**

Run: `bun test packages/desktop/tests/preload-api.test.ts`  
Expected: FAIL because preload API is absent.

- [ ] **Step 3: Implement secure BrowserWindow defaults**

Set `contextIsolation: true`, `nodeIntegration: false`, sandbox the renderer, install a strict CSP, deny unexpected navigation/window creation, and allow only validated HTTPS external links through the system browser.

- [ ] **Step 4: Implement the typed preload bridge**

Every method builds a concrete validated command. `subscribe(listener)` returns an unsubscribe function and validates events before invoking the renderer callback.

- [ ] **Step 5: Verify API and types**

Run: `bun test packages/desktop/tests/preload-api.test.ts`  
Expected: PASS.

Run: `bun run --cwd packages/desktop typecheck`  
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add packages/desktop/electron packages/desktop/renderer/src/env.d.ts packages/desktop/tests
git commit -m "feat: add secure electron shell"
```

## Task 9: Build the Deterministic Renderer Store

**Files:**
- Create: `packages/desktop/renderer/src/app/store.tsx`
- Create: `packages/desktop/renderer/src/app/reducer.ts`
- Create: `packages/desktop/renderer/src/app/useDesktopBridge.ts`
- Create: `packages/desktop/tests/renderer-reducer.test.ts`

- [ ] **Step 1: Write pure reducer tests**

Cover snapshots, ordered deltas, sequence gaps, tool transitions, permission queues, generation states, confirmed settings, and command errors.

- [ ] **Step 2: Verify reducer tests fail**

Run: `bun test packages/desktop/tests/renderer-reducer.test.ts`  
Expected: FAIL because the reducer is absent.

- [ ] **Step 3: Implement normalized renderer state**

Store sessions by ID, messages and tools by ID with ordered ID arrays, pending permissions by ID, and UI-only selection separately. Reducer branches must be exhaustive and pure.

- [ ] **Step 4: Implement bridge subscription**

Subscribe once at application mount, dispatch validated events, request a snapshot on sequence gaps, and cleanly unsubscribe on unmount.

- [ ] **Step 5: Verify reducer tests**

Run: `bun test packages/desktop/tests/renderer-reducer.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/desktop/renderer/src/app packages/desktop/tests/renderer-reducer.test.ts
git commit -m "feat: add desktop renderer state"
```

## Task 10: Build the Desktop Shell and Conversation UI

**Files:**
- Create: `packages/desktop/renderer/src/app/App.tsx`
- Create: `packages/desktop/renderer/src/styles.css`
- Create: `packages/desktop/renderer/src/features/history/SessionSidebar.tsx`
- Create: `packages/desktop/renderer/src/features/chat/ConversationPane.tsx`
- Create: `packages/desktop/renderer/src/features/chat/MessageList.tsx`
- Create: `packages/desktop/renderer/src/features/chat/MessageRow.tsx`
- Create: `packages/desktop/renderer/src/features/chat/ToolCallCard.tsx`
- Create: `packages/desktop/renderer/src/features/chat/Composer.tsx`
- Create: `packages/desktop/tests/chat-ui.test.tsx`

- [ ] **Step 1: Write user-facing UI tests**

Test sidebar history selection, streamed Markdown display, tool-card expansion, send disabled while active, and the interruption action.

- [ ] **Step 2: Verify UI tests fail**

Run: `bun test packages/desktop/tests/chat-ui.test.tsx`  
Expected: FAIL because the components are absent.

- [ ] **Step 3: Implement the warm two-pane application shell**

Use semantic CSS variables based on `#D77757`, warm light/dark surfaces, a resizable 260 px sidebar, responsive collapse, accessible focus states, and no gradients or glass effects.

- [ ] **Step 4: Implement normalized message rendering**

Render user, assistant, system, error, and tool messages through small focused components. Keep tool output collapsed by default and add virtualization before accepting histories over the fixture threshold.

- [ ] **Step 5: Implement composer semantics**

Enter sends, Shift+Enter inserts a newline, Escape interrupts an active generation, and controls expose accessible labels. Commands are sent through `desktopApi` only.

- [ ] **Step 6: Verify UI tests**

Run: `bun test packages/desktop/tests/chat-ui.test.tsx`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/desktop/renderer packages/desktop/tests/chat-ui.test.tsx
git commit -m "feat: build desktop conversation ui"
```

## Task 11: Add Permission and Settings UI

**Files:**
- Create: `packages/desktop/renderer/src/features/permissions/PermissionPanel.tsx`
- Create: `packages/desktop/renderer/src/features/settings/ModelSettings.tsx`
- Create: `packages/desktop/renderer/src/features/settings/ModeSelector.tsx`
- Create: `packages/desktop/tests/permission-ui.test.tsx`
- Create: `packages/desktop/tests/settings-ui.test.tsx`

- [ ] **Step 1: Write interaction tests**

Test deny, allow once, allow for session, queued requests, confirmed model changes, rejected changes, and confirmed mode changes.

- [ ] **Step 2: Verify tests fail**

Run: `bun test packages/desktop/tests/permission-ui.test.tsx packages/desktop/tests/settings-ui.test.tsx`  
Expected: FAIL because feature components are absent.

- [ ] **Step 3: Implement permission UI**

Show the active request at the bottom of the conversation, preserve queued request count, summarize tool input safely, and return only the selected protocol decision.

- [ ] **Step 4: Implement settings UI**

Read available models and modes from confirmed Core state. Keep requested values pending until an acknowledgment event arrives; restore the confirmed value and display a recoverable error on failure.

- [ ] **Step 5: Verify feature tests**

Run: `bun test packages/desktop/tests/permission-ui.test.tsx packages/desktop/tests/settings-ui.test.tsx`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/desktop/renderer/src/features packages/desktop/tests
git commit -m "feat: add desktop permissions and settings"
```

## Task 12: Package, Integrate, and Run Full Verification

**Files:**
- Create: `packages/desktop/electron-builder.yml`
- Create: `packages/desktop/scripts/resolve-sidecar.ts`
- Create: `packages/desktop/tests/electron-smoke.test.ts`
- Modify: `packages/desktop/package.json`
- Modify: `README.md`

- [ ] **Step 1: Write the Electron smoke test**

Launch the packaged development app with a fixture Sidecar, assert secure web preferences, handshake, prompt streaming, permission approval, interruption, history restore, and crash recovery without prompt replay.

- [ ] **Step 2: Verify the smoke test fails**

Run: `bun test packages/desktop/tests/electron-smoke.test.ts`  
Expected: FAIL because packaging and startup wiring are incomplete.

- [ ] **Step 3: Configure Windows packaging**

Bundle the renderer and Electron entry, include a Bun executable and built Sidecar asset, isolate platform-specific path resolution in `resolve-sidecar.ts`, and configure an unpacked executable location compatible with electron-builder ASAR rules.

- [ ] **Step 4: Document development and packaging commands**

Add concise README instructions for desktop development, testing, Windows packaging, logs, and the fact that TUI and Desktop are independent entry points.

- [ ] **Step 5: Run desktop verification**

Run: `bun run --cwd packages/desktop typecheck`  
Expected: zero errors.

Run: `bun test packages/desktop`  
Expected: all desktop tests pass.

Run: `bun run desktop:build`  
Expected: renderer, Electron, and Sidecar builds succeed.

- [ ] **Step 6: Run repository regression checks**

Run: `bun run typecheck`  
Expected: zero errors.

Run: `bun run test:all`  
Expected: all configured checks pass.

Run: `git diff -- src/query.ts`  
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add package.json packages/desktop README.md
git commit -m "feat: package electron desktop application"
```

## Task 13: Add Persistent Diagnostics and In-App Log Viewer

**Files:**
- Create: `packages/desktop/electron/desktop-logger.ts`
- Create: `packages/desktop/electron/diagnostics-service.ts`
- Modify: `packages/desktop/electron/main.ts`
- Modify: `packages/desktop/electron/preload.ts`
- Modify: `packages/desktop/electron/desktop-api.ts`
- Create: `packages/desktop/renderer/src/features/diagnostics/DiagnosticsDrawer.tsx`
- Modify: `packages/desktop/renderer/src/app/App.tsx`
- Modify: `packages/desktop/renderer/src/features/history/SessionSidebar.tsx`
- Test: `packages/desktop/tests/desktop-logger.test.ts`
- Test: `packages/desktop/tests/diagnostics-ui.test.tsx`

- [ ] **Step 1: Write failing logger tests**

Verify redaction, append format, latest-line reads, and 5 MB / three-file rotation.

- [ ] **Step 2: Implement the focused logger and diagnostics service**

Keep filesystem access in Electron Main and expose only latest diagnostics and
open-log-directory operations.

- [ ] **Step 3: Write failing diagnostics UI tests**

Verify Core state, startup failure reason, latest log content, refresh, copy,
and open-directory actions.

- [ ] **Step 4: Implement Main, Preload, and Renderer wiring**

Capture Main lifecycle and Sidecar stderr/spawn/exit information without logging
conversation content or credentials.

- [ ] **Step 5: Verify and package**

Run desktop tests, root typecheck, desktop build, Sidecar smoke test, and Windows
NSIS packaging.
