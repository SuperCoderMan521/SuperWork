# Electron Desktop Design

**Status:** Approved design, pending written-spec review  
**Date:** 2026-07-12  
**Scope:** Windows-first Electron desktop client for the existing Claude Code core

## 1. Goal

Build a desktop application that supports the daily interactive workflow currently provided by the TUI while preserving the existing TUI and the existing query/tool loop.

The first release includes:

- streaming questions and answers;
- tool-call status and output;
- tool permission approval;
- model settings;
- conversation history;
- model and permission-mode switching; and
- generation interruption.

The desktop application is a new, independent workspace module. It does not render Ink components, import TUI JSX, or replace the CLI entry point.

## 2. Constraints

1. `src/query.ts` and its loop semantics remain unchanged.
2. Existing providers, tools, context construction, authentication, session persistence, and permission rules continue to run under Bun.
3. The TUI remains independently buildable and runnable.
4. The desktop renderer cannot access API keys, Node APIs, Bun APIs, the filesystem, or arbitrary Electron IPC.
5. Windows is the first packaging target. Process and path abstractions must not prevent later macOS and Linux packaging.
6. Production code uses strict TypeScript without `any`.
7. Readability is a release requirement, not a cleanup task deferred until after implementation.

## 3. Current Architecture Findings

The interactive TUI consumes the asynchronous generator returned by `query()` inside `src/screens/REPL.tsx`. Each yielded event is passed to `onQueryEvent`, which invokes `handleMessageFromStream`. Its callbacks update React state for messages, streaming text, thinking, tool calls, and tombstones. Ink components then rerender from that state.

The effective path is:

```text
query() -> onQueryEvent -> handleMessageFromStream -> React state -> Ink UI
```

`QueryEngine` is currently a headless/SDK-oriented wrapper. The TUI does not use it, and its non-interactive assumptions do not directly satisfy desktop permission and interactive-session behavior. The first desktop release therefore calls the existing `query()` path through a new desktop controller instead of forcing the UI through `QueryEngine.submitMessage()`.

## 4. Chosen Architecture

Use Electron with an independent Bun Core Sidecar.

```text
Electron Renderer (React DOM)
        <-> contextBridge API
Electron Preload
        <-> Electron IPC
Electron Main
        <-> versioned JSON Lines over stdio
Bun Core Sidecar
        -> DesktopConversationController
        -> existing query(), tools, providers, and session storage
```

### 4.1 Electron Renderer

The renderer owns layout, presentation, routes, view-local state, and a deterministic desktop event reducer. It never interprets raw query events and never makes permission decisions on its own.

### 4.2 Electron Preload

The preload exposes a narrow `window.desktopApi` through `contextBridge`. It provides explicit commands such as `submitPrompt`, `interruptGeneration`, `resolvePermission`, `setModel`, `setMode`, and session operations. It does not expose `ipcRenderer` or a generic channel API.

### 4.3 Electron Main

The main process owns windows, application lifecycle, safe IPC forwarding, the Sidecar process, crash reporting, and graceful shutdown. It contains no query or conversation business logic.

### 4.4 Bun Core Sidecar

The Sidecar owns conversation state and all access to the existing core. A `DesktopConversationController` prepares the existing query context, invokes `query()`, converts its output into stable desktop events, coordinates permissions, and manages interruption.

The Sidecar communicates only through stdin/stdout JSON Lines. Diagnostic logs go to stderr or the existing logging system so that they cannot corrupt the protocol stream.

### 4.5 Shared Protocol

The desktop package contains a runtime-validated, versioned protocol shared by Main, Preload, Renderer, and Sidecar. Zod schemas are the source of truth; TypeScript types are inferred from them.

Cross-process payloads contain only serializable values. They never contain functions, React nodes, `Map`, `Set`, `AbortController`, or the full internal `AppState`.

## 5. Module Structure and Readability

The module lives under `packages/desktop/`:

```text
packages/desktop/
├── package.json
├── electron/
│   ├── main.ts
│   ├── preload.ts
│   └── sidecar-manager.ts
├── core/
│   ├── entry.ts
│   ├── conversation-controller.ts
│   ├── event-adapter.ts
│   ├── permission-broker.ts
│   └── session-service.ts
├── shared/
│   ├── protocol.ts
│   ├── schemas.ts
│   └── errors.ts
├── renderer/
│   └── src/
│       ├── app/
│       ├── features/chat/
│       ├── features/history/
│       ├── features/permissions/
│       └── features/settings/
└── tests/
```

Readability rules:

- Each file has one primary responsibility and a small public interface.
- Protocol, transport, conversation orchestration, and rendering remain separate.
- Features own their components, state selectors, and tests; there is no desktop equivalent of the monolithic `REPL.tsx`.
- Names describe domain behavior, such as `PermissionBroker.resolve()` and `ConversationController.interrupt()`, rather than transport details.
- Reducers are pure and exhaustively switch on discriminated unions.
- Comments explain constraints and reasons, not restate code.
- Shared abstractions are introduced only after two real consumers require them.
- Production code does not use `any`, broad casts, or unvalidated IPC payloads.
- Files that become difficult to understand in one view are split by responsibility before feature work continues.

## 6. Desktop Layout

The shell uses a left navigation sidebar and a dominant right conversation area.

```text
┌────────────────────────────────────────────────────────────────────┐
│ CCB Desktop                    Project             Model / Mode  ⚙ │
├───────────────────┬────────────────────────────────────────────────┤
│ + New conversation│ Conversation title                             │
│                   │ Project path · branch · usage                  │
│ Conversations     ├────────────────────────────────────────────────┤
│  Today            │ User message                                   │
│  · Fix login      │                                                │
│  · Analyze API    │ Assistant Markdown                             │
│  Yesterday        │ Tool cards / results / errors                  │
│                   │                                                │
│ Settings          ├────────────────────────────────────────────────┤
│  Models           │ Multiline prompt                         Send  │
│  General          │ Mode · Model                         Esc stop  │
│                   │                                                │
│ Core: connected   │                                                │
└───────────────────┴────────────────────────────────────────────────┘
```

The sidebar defaults to approximately 260 px, is resizable, and collapses at narrow widths. It contains new conversation, searchable history grouped by date, model settings, general settings, and Sidecar health.

The conversation side contains a session header, a virtualized message list, and a persistent composer. Streaming updates mutate only the active message record rather than rebuilding all rendered messages.

The visual language follows `.impeccable.md`: warm light and dark surfaces, Claude Orange `#D77757` as the primary accent, dense but calm information hierarchy, readable typography, and monospaced tool output. It avoids gradients, glass effects, neon colors, and generic AI styling.

## 7. Tool Calls and Permissions

Tool calls render as collapsible cards with a stable state:

```ts
type DesktopToolState =
  | "pending"
  | "running"
  | "success"
  | "error"
  | "denied"
  | "interrupted";
```

The collapsed view shows tool name, concise input summary, state, and duration. The expanded view shows validated input, output, errors, or a file diff where applicable.

Permission requests appear in a fixed panel at the bottom of the message area. Available decisions are deny, allow once, and allow for the session when the existing permission system supports that option.

The Sidecar implements `canUseTool` through a `PermissionBroker`:

1. Create a unique permission ID.
2. Emit `permission.requested`.
3. Store the pending resolver.
4. Receive `permission.resolve` from the renderer.
5. Convert the decision to the existing `CanUseToolFn` result.
6. Reject pending requests when the session closes, the renderer disconnects, generation is interrupted, or the request expires.

Persistent permission semantics continue to be interpreted and stored by the existing permission system. Desktop code does not create a second rule engine.

## 8. Protocol and State

Renderer-to-Core commands include:

```ts
type DesktopCommand =
  | { type: "session.create"; requestId: string; cwd: string }
  | { type: "session.resume"; requestId: string; sessionId: string }
  | { type: "session.list"; requestId: string }
  | { type: "session.delete"; requestId: string; sessionId: string }
  | { type: "prompt.submit"; requestId: string; sessionId: string; text: string }
  | { type: "generation.interrupt"; requestId: string; sessionId: string }
  | { type: "permission.resolve"; requestId: string; permissionId: string; decision: PermissionDecision }
  | { type: "model.set"; requestId: string; sessionId: string; model: string }
  | { type: "mode.set"; requestId: string; sessionId: string; mode: PermissionMode }
  | { type: "core.shutdown"; requestId: string };
```

Core-to-Renderer events include:

```ts
type DesktopEvent =
  | { type: "core.ready"; protocolVersion: 1 }
  | { type: "session.listed"; requestId: string; sessions: DesktopSessionSummary[] }
  | { type: "session.snapshot"; session: DesktopSession }
  | { type: "message.added"; sessionId: string; message: DesktopMessage }
  | { type: "message.delta"; sessionId: string; messageId: string; delta: string }
  | { type: "tool.updated"; sessionId: string; tool: DesktopToolCall }
  | { type: "permission.requested"; sessionId: string; request: DesktopPermissionRequest }
  | { type: "generation.state"; sessionId: string; state: GenerationState }
  | { type: "settings.changed"; settings: DesktopSettings }
  | { type: "command.failed"; requestId: string; error: DesktopError };
```

Every command has a `requestId`. Session events have a `sessionId` and monotonically increasing `sequence`. If the renderer detects a sequence gap, it requests a fresh session snapshot.

The Core batches text deltas for approximately 16–32 ms to reduce IPC and render overhead. Permission, error, tool-state, and completion events bypass batching.

## 9. Conversation and Interruption Semantics

Each desktop session owns messages, working directory, selected model, permission mode, read-file state, an abort controller, and pending permissions.

The first release stores multiple sessions but runs only one foreground query at a time. This avoids races caused by process-level state such as the current working directory and existing module singletons. Concurrent active sessions require a separate design.

Generation interruption is idempotent. The controller aborts the active `AbortController`, rejects that session's pending permissions, allows existing query interruption handling to emit its normal message, and finally emits the idle generation state. Interruption does not restart the Sidecar.

## 10. Session History and Settings

The Core uses the existing session persistence and transcript format. Desktop does not create a competing conversation database. History listing loads lightweight summaries; full messages load only when a session is opened.

Desktop-only preferences include window bounds, sidebar state, theme, and recent project/session identifiers. Credentials and provider keys remain in the existing configuration system and never enter renderer state.

Model and mode changes are commands, not optimistic UI mutations. The renderer updates confirmed state only after the Core emits the corresponding snapshot or settings event.

## 11. Lifecycle and Recovery

Electron Main locates the packaged Bun executable and Sidecar entry, starts it with stdio pipes, waits for `core.ready`, validates protocol version 1, and then allows conversation commands.

On normal exit, Main sends `core.shutdown`, waits for graceful completion, then terminates the child only if the deadline expires.

On unexpected Sidecar exit:

- the active generation becomes failed;
- pending permissions are rejected;
- the renderer keeps its last confirmed snapshot;
- Main performs at most one automatic restart;
- incomplete prompts are never automatically replayed; and
- a second failure exposes diagnostics and a manual restart action.

This prevents duplicate tool execution after a crash.

## 12. Security

- Enable `contextIsolation`.
- Disable `nodeIntegration`.
- Apply a strict renderer Content Security Policy.
- Expose only named preload methods.
- Validate commands in Electron Main and again in the Sidecar.
- Validate protocol versions before accepting commands.
- Open external links through an allowlisted system-browser handler.
- Use stdio rather than a listening TCP port.
- Keep credentials, environment variables, filesystem access, and tool execution outside the renderer.

## 13. Errors

Desktop transport and orchestration errors use stable codes:

```ts
type DesktopErrorCode =
  | "INVALID_COMMAND"
  | "CORE_UNAVAILABLE"
  | "PROTOCOL_MISMATCH"
  | "SESSION_NOT_FOUND"
  | "QUERY_FAILED"
  | "PERMISSION_CANCELLED"
  | "SIDECAR_CRASHED";
```

Errors also contain a safe user message, a recoverability flag, and optional diagnostic detail. Full stacks stay in local logs. Existing API failures remain normal assistant/system messages and are not reinterpreted by Electron.

## 14. Testing

Testing is divided into four levels:

1. Protocol unit tests validate every command, event, malformed payload, and version mismatch.
2. Core unit tests cover event adaptation, permission resolution, permission cancellation, interruption idempotency, session transitions, and delta batching.
3. Renderer unit tests cover the pure event reducer, message delta application, tool cards, permission queues, and confirmed model/mode changes.
4. Electron integration tests cover launch, Sidecar handshake, prompt submission, simulated streaming, permissions, interruption, history restoration, and crash recovery.

Contract fixtures feed representative existing query-stream events into the desktop event adapter and assert the exact stable `DesktopEvent` sequence. These tests detect upstream event-shape changes without coupling renderer tests to internal query types.

Required verification after implementation:

```bash
bun run typecheck
bun test packages/desktop
bun run test:all
```

## 15. First-Release Non-Goals

- Removing, replacing, or visually rewriting the TUI.
- Modifying the query, provider, or tool loop.
- Concurrent query execution across desktop sessions.
- Plugin marketplace UI.
- MCP management UI.
- Remote Control UI.
- Voice input.
- Agent and background-task panels.
- Full parity with every slash-command dialog.
- A general refactor of existing TUI state.

## 16. Acceptance Criteria

1. Users can create, resume, switch, and delete conversations.
2. Assistant Markdown streams without whole-list flicker or full-message-list reconstruction per token.
3. Tool calls show accurate running, success, failure, denial, and interruption states.
4. Users can deny, allow once, or allow for the session when supported by the core.
5. Model and permission mode changes are confirmed by the Core.
6. Users can interrupt generation without restarting the Sidecar.
7. Sidecar crashes do not automatically repeat an incomplete prompt or tool call.
8. The desktop and TUI start independently, and existing TUI behavior remains unchanged.
9. The project passes strict TypeScript checks and desktop/core regression tests.
10. A Windows desktop package starts successfully, while platform-specific code remains isolated for later macOS/Linux packaging.

## 17. Local Diagnostics Log

Electron Main writes a persistent diagnostic log under the Electron `userData`
directory at `logs/desktop.log`. The logger rotates at 5 MB and retains three
files. It redacts authorization headers, API keys, access tokens, and secret-like
values before writing.

The log records application lifecycle, renderer load failures, Sidecar paths,
Sidecar state transitions, stderr, spawn failures, exit codes, and permanent
failure summaries. It does not record prompts or assistant message bodies.

The sidebar Core status opens a diagnostics drawer showing the latest 200 lines.
Users can refresh, copy the visible text, or open the log directory. Startup
failure is also shown in the main content area with a concise reason and log
path. Preload exposes only named `getDiagnostics` and `openLogFolder` methods;
the renderer cannot read arbitrary files.
