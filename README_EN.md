# SuperWork

English | [中文](./README.md)

![SuperWork Desktop interface](./main.png)

SuperWork is a desktop-capability extension of `claude-code-best/claude-code`. Its purpose is to add an independent Electron desktop client through a Bun Core Sidecar while preserving the upstream TUI, configuration compatibility, and core `query()`/loop logic.

> **Upstream attribution:** SuperWork is derived from [claude-code-best/claude-code](https://github.com/claude-code-best/claude-code), primarily to add Desktop capabilities to the upstream project. Its README limits the project to educational and research use, and no readable root `LICENSE` file is currently provided. This repository therefore does not grant permission to copy, redistribute, or commercially use upstream code. Renaming or modifying the project does not alter upstream rights.

## Highlights

- Streaming chat, thinking blocks, Markdown, and code rendering
- Collapsed tool views for read, edit, write, shell, search, and other calls
- Permission approval, generation interruption, and diagnostic logs
- Session history grouped by workspace
- File preview, edit diffs, HTML, Mermaid, and local PlantUML rendering
- Configuration pages for models, modes, Skills, MCP, Plugins, and memory
- The original TUI remains available; the desktop module does not rewrite `query()`

## Quick Start

Bun 1.3 or newer is required.

```bash
bun install
bun run desktop:dev
```

Useful commands:

```bash
bun run desktop:test
bun run desktop:build
bun run --cwd packages/desktop package:win
bun run typecheck
```

Windows installers are written to `packages/desktop/release/`. This is a local build-artifact directory and is not committed.

## Architecture

### Process Model

SuperWork desktop follows a dual-process **Electron + Bun Core Sidecar** architecture with clear responsibilities across renderer, main, and Core layers:

- **Electron Main process** (Node.js runtime): windows / menu / IPC / local resource access, supervises the Sidecar lifecycle
- **Bun Core Sidecar** (Bun runtime): hosts the Claude Code core `query()` loop, tool execution, and session state
- **Renderer process** (Chromium): React 19 + Vite, only talks to Main via the `desktopApi` exposed by preload

```
┌──────────────────────── Electron Main ────────────────────────┐
│  BrowserWindow + preload  ⇄  SidecarManager  ⇄  Diagnostics   │
│         (desktopApi)         (supervise)         (logs/status) │
└──────────────┬───────────────────┬────────────────────────────┘
               │ IPC (Zod-validated)│ spawn / stdin / stdout / stderr
               ▼                    ▼
┌────────────────────── Renderer ──────────────┐  ┌──────── Core Sidecar (Bun) ────────────┐
│  App.tsx (useReducer)                        │  │  entry.ts (protocol pump)               │
│   └─ reducer.ts (event→state)                │  │   └─ CommandDispatcher (25+ commands)   │
│       └─ features/ (chat/history/settings/…) │  │       └─ ConversationController         │
└──────────────────────────────────────────────┘  │           └─ DesktopQueryRunner         │
                                                  │               └─ src/QueryEngine.ts    │
                                                  │                   └─ src/query.ts       │
                                                  │           EventAdapter (stream→protocol)│
                                                  └─────────────────────────────────────────┘
```

### Layered Responsibilities

**Shared Layer** — [`packages/desktop/shared/`](./packages/desktop/shared/)

Single source of truth for the cross-process protocol. Every `DesktopCommand` / `DesktopEvent` is validated by a Zod schema before entering the other process.

- [`protocol.ts`](./packages/desktop/shared/protocol.ts): `DESKTOP_PROTOCOL_VERSION = 1`, diagnostic status enums, type re-exports
- [`schemas.ts`](./packages/desktop/shared/schemas.ts): all Zod schemas (commands, events, sessions, tools, permissions, config, performance, Buddy)
- [`types.ts`](./packages/desktop/shared/types.ts): TypeScript types inferred from schemas
- [`errors.ts`](./packages/desktop/shared/errors.ts): `createDesktopError` factory with 7 error codes
- [`file-paths.ts`](./packages/desktop/shared/file-paths.ts): desktop path resolution

**Electron Main Layer** — [`packages/desktop/electron/`](./packages/desktop/electron/)

Window lifecycle, Sidecar supervision, IPC routing, local resource access.

- [`main.ts`](./packages/desktop/electron/main.ts): entry — creates `BrowserWindow`, registers 6 IPC handlers, starts `SidecarManager`
- [`sidecar-manager.ts`](./packages/desktop/electron/sidecar-manager.ts): state machine `stopped/starting/ready/restarting/failed`; one auto-restart after a crash, permanent failure on the second; queues commands before handshake
- [`node-sidecar-process.ts`](./packages/desktop/electron/node-sidecar-process.ts): `child_process.spawn('bun', ['run', entry])` with `stdio: pipe`, `windowsHide: true`
- [`resolve-sidecar.ts`](./packages/desktop/electron/resolve-sidecar.ts): resolves Bun executable and entry paths (packaged: `resources/runtime/bun.exe` + `resources/core/main.js`; dev: `dist/`; overridable via `CCB_BUN_PATH`)
- [`desktop-api.ts`](./packages/desktop/electron/desktop-api.ts): `createDesktopApi` returns an `Object.freeze` API surface, **no generic IPC primitive exposed**
- [`preload.ts`](./packages/desktop/electron/preload.ts): `contextBridge.exposeInMainWorld('desktopApi', ...)` — the single renderer entry point
- [`diagnostics-service.ts`](./packages/desktop/electron/diagnostics-service.ts): aggregates Core status + Sidecar stderr (routed by `[LEVEL]` prefix) + own logs
- [`desktop-logger.ts`](./packages/desktop/electron/desktop-logger.ts) / [`workspace-editor-service.ts`](./packages/desktop/electron/workspace-editor-service.ts) / [`app-menu.ts`](./packages/desktop/electron/app-menu.ts) / [`window-options.ts`](./packages/desktop/electron/window-options.ts) / [`channels.ts`](./packages/desktop/electron/channels.ts): file logging, system editor detection, menu template, window options, IPC channel constants

**Core Sidecar Layer** — [`packages/desktop/core/`](./packages/desktop/core/) (Bun runtime)

Reuses upstream [`src/query.ts`](./src/query.ts) and [`src/QueryEngine.ts`](./src/QueryEngine.ts) without forking or rewriting — only protocol adaptation is layered on top.

- [`main.ts`](./packages/desktop/core/main.ts): entry — `logCore` writes stderr only (with `[INFO]`/`[ERROR]` prefixes; stdout stays pure NDJSON); dynamically imports upstream `init`/`config`/`model`/`session`/`storage` modules and assembles services
- [`entry.ts`](./packages/desktop/core/entry.ts): `runCoreProtocol` pump — emits `core.ready` immediately, decodes stdin via `JsonLineDecoder`, validates with `DesktopCommandSchema`, emits `command.failed (INVALID_COMMAND)` on parse failure
- [`command-dispatcher.ts`](./packages/desktop/core/command-dispatcher.ts): routes 25+ commands to services (`session.*` / `prompt.submit` / `generation.interrupt` / `permission.resolve` / `model.set` / `mode.set` / `config.*` / `file.*` / `memory.*` / `buddy.*` / `performance.get` / `core.shutdown`)
- [`conversation-controller.ts`](./packages/desktop/core/conversation-controller.ts): owns the `sessions` Map, enforces a **single active generation per session** (`activeGeneration`), 45s first-event timeout, three-state finalize (interrupt/failed/completed)
- [`desktop-query-runner.ts`](./packages/desktop/core/desktop-query-runner.ts): one `QueryEngine` instance per session; `createDesktopCanUseTool` bridges the upstream permission pipeline to `PermissionBroker`; locally handles `/help` and other slash commands
- [`event-adapter.ts`](./packages/desktop/core/event-adapter.ts): converts the unstable `query()` event stream (`stream_request_start` / `result` / `stream_event.assistant` / `user`) into the stable desktop protocol, accumulates token usage
- [`permission-broker.ts`](./packages/desktop/core/permission-broker.ts): bridges awaited permission checks from the core to serializable UI events; 5min timeout defaults to deny
- [`desktop-config-service.ts`](./packages/desktop/core/desktop-config-service.ts) / [`session-service.ts`](./packages/desktop/core/session-service.ts) / [`buddy-service.ts`](./packages/desktop/core/buddy-service.ts) / [`performance-service.ts`](./packages/desktop/core/performance-service.ts) / [`model-connection-test.ts`](./packages/desktop/core/model-connection-test.ts) / [`turn-usage.ts`](./packages/desktop/core/turn-usage.ts): config read/write, session list/resume/delete, desktop buddy, performance stats (7d/30d/all), model connectivity test, token usage & cost

**Renderer Layer** — [`packages/desktop/renderer/src/`](./packages/desktop/renderer/src/) (React 19 + Vite)

Consumes only `desktopApi`; no direct fs/network/ipc access.

- [`main.tsx`](./packages/desktop/renderer/src/main.tsx): renderer entry
- [`app/App.tsx`](./packages/desktop/renderer/src/app/App.tsx): main component, `useReducer` + `desktopApi.subscribe`, three views (`chat` / `settings` / `performance`)
- [`app/reducer.ts`](./packages/desktop/renderer/src/app/reducer.ts): reducer handles `DesktopEvent` + local actions; session messages/tools/permissions are all Map-based
- [`app/ResizableWorkspace.tsx`](./packages/desktop/renderer/src/app/ResizableWorkspace.tsx): resizable layout
- `features/` modules:
  - `chat/` — `ConversationPane`, `Composer`, `MessageRow`, `MarkdownMessage`, `DiagramRenderer`, `ToolCallCard`, `TurnUsageReport`, `slashCommands`, `toolRendering`, `plantumlLocalRenderer`
  - `history/` — `SessionSidebar` (grouped by workspace)
  - `settings/` — `ConfigCenter`, `SessionSettings` (model/mode/Skills/MCP/Plugins/memory)
  - `files/` — `ConversationFilesPanel` (file preview / diff)
  - `permissions/` — tool permission approval UI
  - `diagnostics/` — `DiagnosticsDrawer` (Core status + logs)
  - `buddy/` — `BuddyPanel`
  - `performance/` — `PerformanceCenter` (trends / model distribution / tool stats)
  - `i18n/` — internationalization

### Cross-Process Protocol

**Startup Handshake**

1. Electron `whenReady` → `createWindow` → `resolveSidecar` → `spawn('bun', ['run', entry])`
2. Bun sidecar starts → immediately emits `core.ready { protocolVersion: 1 }` → `SidecarManager` switches to `ready`, flushes commands queued before the handshake
3. Renderer's `desktopApi.subscribe` receives `core.ready` and marks `coreReady = true`

**stdin / stdout / stderr Contract** (hard constraint)

| Channel | Direction | Payload | Notes |
|---------|-----------|---------|-------|
| stdin | Electron → Bun | NDJSON `DesktopCommand` | one per line, Zod-validated |
| stdout | Bun → Electron | NDJSON `DesktopEvent` | **protocol only, no logs** |
| stderr | Bun → Electron | `[LEVEL] [desktop-core] message` | `DiagnosticsService` routes by prefix |

**Command Dispatch** (Renderer → Core)

```
window.desktopApi.submitPrompt(sessionId, text)
  → ipcRenderer.send(DESKTOP_COMMAND_CHANNEL, command)
  → ipcMain.on → sidecar.send(encodeJsonLine(command))
  → Bun stdin → JsonLineDecoder → DesktopCommandSchema.safeParse
  → dispatcher.dispatch → service execution
```

**Event Propagation** (Core → Renderer)

```
Core emit(event) → process.stdout.write(encodeJsonLine(event))
  → Electron onOutput → DesktopEventSchema.parse
  → webContents.send(DESKTOP_EVENT_CHANNEL, event)
  → renderer ipcRenderer.on → reducer
```

**Permission Flow** (core bridge)

```
QueryEngine encounters a tool requiring ask
  → createDesktopCanUseTool → PermissionBroker.request
  → emit permission.requested
  → renderer permissions UI → user click
  → desktopApi.resolvePermission(id, decision)
  → IPC → command-dispatcher → permissionBroker.resolve
  → Promise resolves → QueryEngine continues
```

**Errors & Recovery**

- Protocol mismatch → `command.failed (INVALID_COMMAND)`
- Command exception → `command.failed (QUERY_FAILED, recoverable=true)`
- Sidecar crash → one auto-restart; on the second failure `onPermanentFailure` → emits `SIDECAR_CRASHED (recoverable=false)`
- First-event 45s timeout → `AbortController.abort` → `complete('failed')`
- Permission request 5min timeout → defaults to `deny`

### Security Model

- **Minimal renderer capability**: preload exposes only `desktopApi` via `contextBridge`, never `ipcRenderer`; `DesktopCommand` is Zod-validated before forwarding to the Sidecar
- **Navigation restrictions**: `will-navigate` is blocked; new windows only allow `https://` via the external browser
- **Protocol version negotiation**: `core.ready` carries `protocolVersion`; future versions may reject incompatible clients
- **Single active generation**: `DesktopConversationController` enforces at most one `activeGeneration` per session at any time

### Relationship with Upstream Core

The desktop layer **does not fork or rewrite** [`src/query.ts`](./src/query.ts) / [`src/QueryEngine.ts`](./src/QueryEngine.ts) / [`src/tools.ts`](./src/tools.ts) / [`src/Tool.ts`](./src/Tool.ts); it reuses them via dynamic imports:

- Core Sidecar calls `src/entrypoints/init.ts` on startup to run the original initialization
- `DesktopQueryRunner.getOrCreateEngine` directly instantiates `new QueryEngine({...})` with the desktop-side `canUseTool` bridge
- The tool list still comes from `src/tools.ts`'s `getTools(permissionContext)`, all 59 built-in tools available
- The permission pipeline layers `PermissionBroker` on top of the upstream `hasPermissionsToUseTool` to bridge the UI

The original TUI entry [`src/screens/REPL.tsx`](./src/screens/REPL.tsx) and the desktop share the same core logic without interfering with each other.

## Project Layout

- `packages/desktop/electron/`: Electron main process and secure preload
- `packages/desktop/core/`: Bun Sidecar and desktop event adaptation
- `packages/desktop/renderer/`: React desktop UI
- `packages/desktop/shared/`: desktop protocol and shared types
- `src/query.ts`: existing core query loop
- `src/screens/REPL.tsx`: existing TUI entry

## Configuration and Data

SuperWork can read and write Claude Code-compatible settings. Never commit API tokens, user sessions, logs, or private workspace data. The repository ignores `.env`, `.claudecode/`, `.claude/`, `*.jsonl`, logs, caches, desktop runtime data, and build directories.

## Legal and Compliance Notice

SuperWork is an independent educational and research derivative based on `claude-code-best/claude-code`. It is not affiliated with Anthropic and is not an official Claude Code product. Rights related to Claude Code remain with Anthropic and the applicable rights holders. Connect only to models and services you are authorized to use. Do not bypass authentication, payment, permission, or security controls. Preserve the original `CLAUDE.md`, `AGENTS.md`, upstream attribution, and third-party notices.

This repository is marked `UNLICENSED` and does not grant a license to upstream code or third-party components. Obtain explicit authorization from the applicable rights holders before public copying, distribution, commercial use, or relicensing.

See the bilingual [Project Protocol](./PROJECT_PROTOCOL.md) and [Upstream Notice](./UPSTREAM_NOTICE.md) for the complete boundaries. Use must also comply with applicable law, upstream notices, third-party licenses, and model-provider terms.

## Contributing

Before submitting code, run:

```bash
bun run typecheck
bun test packages/desktop/tests
```

Use Conventional Commits, for example: `feat: add desktop file preview`.
