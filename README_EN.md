<div align="center">

# SuperWork

**Desktop Extension for Claude Code — Electron + Bun Sidecar Dual-Process Architecture**

Adds an independent Desktop GUI to Claude Code while preserving the upstream TUI and core `query()` loop.

English | [中文](./README.md)

[![CI](https://github.com/SuperCoderMan521/SuperWork/actions/workflows/ci.yml/badge.svg)](https://github.com/SuperCoderMan521/SuperWork/actions/workflows/ci.yml)
[![Bun](https://img.shields.io/badge/Bun-%3E%3D1.3-000000?logo=bun&logoColor=white)](https://bun.sh)
[![Electron](https://img.shields.io/badge/Electron-Desktop-47848F?logo=electron&logoColor=white)](https://www.electronjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-UNLICENSED-red.svg)](#legal-and-compliance-notice)

![SuperWork Desktop UI](./main.png)

</div>


## Why SuperWork?

> Claude Code is powerful, but it's terminal-only. SuperWork gives it a desktop GUI.

| Pain Point | SuperWork's Solution |
|------------|---------------------|
| Reading code diffs in terminal is guesswork | Visual diff + file preview — see exactly what changed |
| Tool calls flood the screen, burying key info | 59 tool calls collapsed by default — expand only what you care about |
| Permission prompts are blind yes/no | GUI approval panel — inspect parameters before deciding |
| Lost sessions are gone forever | Auto-archived by workspace — resume any conversation anytime |
| Switching models/MCP requires editing config files | Settings panel — one-click switching, zero config barrier |
| Worried fork can't keep up with upstream | Zero-invasion architecture — no fork, dynamic import reuse, conflict-free upgrades |

**In one line: everything the terminal can do, it does; everything the terminal does poorly, it does better.**

## Table of Contents

- [Highlights](#highlights)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Project Layout](#project-layout)
- [Configuration and Data](#configuration-and-data)
- [Contributing](#contributing)
- [Legal and Compliance Notice](#legal-and-compliance-notice)

## Highlights

| Capability | Description |
|-----------|-------------|
| Streaming Chat | Streaming Q&A, thinking blocks, real-time Markdown/code rendering |
| Tool Calls | 59 built-in tools (read, edit, write, shell, search…) with collapsed display |
| Permission Control | Tool permission approval, generation interrupt, and error logs |
| Session Management | Workspace-grouped session history with resume and delete |
| File Preview | Edit diff, HTML, Mermaid, and local PlantUML rendering |
| Config Center | Model, mode, Skills, MCP, Plugins, and memory settings |
| Zero-Invasion Core | Original TUI preserved; desktop module never rewrites the `query()` loop |

## Quick Start

**Requirements:** [Bun](https://bun.sh) >= 1.3

```bash
# Install dependencies
bun install

# Launch desktop (dev mode)
bun run desktop:dev
```

<details>
<summary>More commands</summary>

```bash
bun run desktop:test          # Run desktop tests
bun run desktop:build         # Build desktop
bun run --cwd packages/desktop package:win   # Package Windows installer
bun run typecheck             # Type check
```

Windows installers are output to `packages/desktop/release/`.

</details>

## Architecture

![SuperWork Architecture Overview](./images/architecture.png)

### Core Engine Internals

![Claude Code Core Architecture](./images/core-architecture.png)

Layered structure of the upstream Claude Code core engine (fully reused by SuperWork via dynamic import):

| Layer | Module | Responsibility |
|-------|--------|---------------|
| Entry | `cli.tsx` → `main.tsx` → `init.ts` | Bootstrap, mode routing (REPL / Print / MCP Server) |
| Agent Loop | `query.ts` (AsyncGenerator) | Model call → Tool execution → Continue/Stop state machine |
| Services | `api/` · `tools/` · `compact/` · `hooks/` | Streaming API, concurrent tool orchestration, context compaction, lifecycle hooks |
| Tools | `packages/builtin-tools/` (59+) | Bash, FileEdit, Grep, Agent, MCP, WebSearch… |
| Permissions | `utils/permissions/` + `hooks/useCanUseTool` | Rules → Classifier → UI Dialog (3-tier) |
| TUI | `screens/REPL.tsx` + `components/` (180+) | Ink + React terminal interface |

### Process Model

SuperWork desktop follows a dual-process **Electron + Bun Core Sidecar** architecture:

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

- **Electron Main** (Node.js): window/menu/IPC/local resource access, supervises Sidecar lifecycle
- **Bun Core Sidecar** (Bun): hosts the core `query()` loop, tool execution, and session state
- **Renderer** (Chromium): React 19 + Vite, communicates with Main only via `desktopApi`

<details>
<summary>Cross-Process Protocol Details</summary>

**Startup Handshake**

1. Electron `whenReady` → `createWindow` → `resolveSidecar` → `spawn('bun', ['run', entry])`
2. Bun sidecar starts → immediately emits `core.ready { protocolVersion: 1 }` → `SidecarManager` switches to `ready`
3. Renderer's `desktopApi.subscribe` receives `core.ready`, marks `coreReady = true`

**stdin / stdout / stderr Contract**

| Channel | Direction | Payload | Notes |
|---------|-----------|---------|-------|
| stdin | Electron → Bun | NDJSON `DesktopCommand` | One per line, Zod-validated |
| stdout | Bun → Electron | NDJSON `DesktopEvent` | Protocol only, no logs |
| stderr | Bun → Electron | `[LEVEL] [desktop-core] message` | Routed by prefix |

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

**Permission Flow**

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
- Sidecar crash → one auto-restart; second failure → `onPermanentFailure`
- First-event 45s timeout → `AbortController.abort` → `complete('failed')`
- Permission request 5min timeout → defaults to `deny`

</details>

<details>
<summary>Security Model</summary>

- **Minimal renderer capability**: preload exposes only `desktopApi` via `contextBridge`, never `ipcRenderer`
- **Navigation restrictions**: `will-navigate` blocked; new windows only allow `https://` via external browser
- **Protocol version negotiation**: `core.ready` carries `protocolVersion`; future versions may reject incompatible clients
- **Single active generation**: enforces at most one `activeGeneration` per session at any time

</details>

<details>
<summary>Relationship with Upstream Core</summary>

The desktop layer **does not fork or rewrite** `src/query.ts` / `src/QueryEngine.ts` / `src/tools.ts` / `src/Tool.ts`; it reuses them via dynamic imports:

- Core Sidecar calls `src/entrypoints/init.ts` on startup for original initialization
- `DesktopQueryRunner.getOrCreateEngine` directly instantiates `new QueryEngine({...})`
- Tool list still comes from `src/tools.ts`'s `getTools(permissionContext)` — all 59 built-in tools available
- Permission pipeline layers `PermissionBroker` on top of upstream `hasPermissionsToUseTool` to bridge the UI

The original TUI entry `src/screens/REPL.tsx` and the desktop share the same core logic without interfering.

</details>

## Project Layout

```
packages/desktop/
├── electron/       # Electron main process and secure preload
├── core/           # Bun Sidecar and desktop event adaptation
├── renderer/       # React desktop UI
└── shared/         # Desktop protocol and shared types (Zod schemas)

src/
├── query.ts        # Original core query loop
└── screens/REPL.tsx # Original TUI entry
```

## Configuration and Data

SuperWork can read and write Claude Code-compatible settings. Never commit API tokens, user sessions, logs, or private workspace data.

## Contributing

Issues and Pull Requests are welcome!

```bash
# Ensure these pass before submitting
bun run typecheck
bun test packages/desktop/tests
```

Use [Conventional Commits](https://www.conventionalcommits.org/), e.g.: `feat: add desktop file preview`.

## Legal and Compliance Notice

> **Upstream attribution:** SuperWork is derived from [claude-code-best/claude-code](https://github.com/claude-code-best/claude-code), primarily to add Desktop capabilities. The upstream README limits the project to educational and research use, and no readable root `LICENSE` file is currently provided. This repository therefore does not grant permission to copy, redistribute, or commercially use upstream code. Renaming or modifying the project does not alter upstream rights.

SuperWork is an independent educational and research derivative of `claude-code-best/claude-code`. It is not affiliated with Anthropic and is not an official Claude Code product. This repository is marked `UNLICENSED` and does not grant a license to upstream code or third-party components.

See the bilingual [Project Protocol](./PROJECT_PROTOCOL.md) and [Upstream Notice](./UPSTREAM_NOTICE.md) for complete boundaries.

## Screenshots

<div align="center">

<img src="./images/1.png" width="49%" /> <img src="./images/2.png" width="49%" />
<img src="./images/3.png" width="49%" />

</div>

## Star History

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=SuperCoderMan521/SuperWork&type=Date)](https://star-history.com/#SuperCoderMan521/SuperWork&Date)

</div>

---

<div align="center">

**If this project helps you, please give it a Star!**

</div>

## Tech Stack

SuperWork is built with Electron, Bun, React 19, Vite, TypeScript, and Zod. It serves as an open-source Claude Code desktop client, AI coding assistant GUI, and agentic coding environment with MCP (Model Context Protocol) support. Related topics: AI pair programming, LLM developer tools, code generation desktop app, Copilot alternative, ChatGPT alternative for coding, Electron sidecar architecture, Bun runtime desktop application.
