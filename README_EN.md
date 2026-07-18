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
