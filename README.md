# SuperWork

[English](./README_EN.md) | 中文

![SuperWork Desktop 界面](./main.png)

SuperWork 是基于 `claude-code-best/claude-code` 的桌面能力扩展项目。项目目的，是在保留上游 TUI、配置兼容性和核心 `query()`/loop 逻辑的前提下，通过 Electron + Bun Core Sidecar 为原项目增加独立 Desktop 桌面端能力。

> **上游项目声明：** SuperWork 基于 [claude-code-best/claude-code](https://github.com/claude-code-best/claude-code) 二次开发，主要修改目的是为原项目增加 Desktop 桌面能力。上游 README 声明项目仅供学习研究使用，且当前未提供可读取的根目录 `LICENSE` 文件。因此，本仓库不对上游代码授予复制、再分发或商业使用许可。原项目及其贡献者的权利不因本项目改名或二次开发而改变。

## 主要能力

- 流式问答、思考块与 Markdown/代码块渲染
- 读取、编辑、写入、Shell、搜索等工具调用折叠展示
- 工具权限审批、生成中断与错误日志
- 按工作区归类的会话历史
- 文件预览、编辑 Diff、HTML、Mermaid 与本地 PlantUML 渲染
- 模型、模式、Skills、MCP、Plugins 与记忆配置入口
- 保留原有 TUI；桌面模块不改写核心 `query()` 循环

## 快速开始

需要 Bun 1.3 或更高版本。

```bash
bun install
bun run desktop:dev
```

常用命令：

```bash
bun run desktop:test
bun run desktop:build
bun run --cwd packages/desktop package:win
bun run typecheck
```

Windows 安装包默认输出到 `packages/desktop/release/`，该目录属于本地构建产物，不提交到仓库。

## 项目结构

- `packages/desktop/electron/`：Electron 主进程与安全 preload
- `packages/desktop/core/`：Bun Sidecar 与桌面事件适配
- `packages/desktop/renderer/`：React 桌面界面
- `packages/desktop/shared/`：桌面协议与共享类型
- `src/query.ts`：原有核心查询循环
- `src/screens/REPL.tsx`：原有 TUI 入口

## 配置与数据

SuperWork 可读取和写入 Claude Code 兼容配置。请勿提交 API Token、用户会话、日志或工作区私有数据。本仓库已忽略 `.env`、`.claudecode/`、`.claude/`、`*.jsonl`、日志、缓存、桌面运行数据和构建目录。

## 合法合规声明

SuperWork 是基于 `claude-code-best/claude-code` 二次开发的独立学习研究项目，不隶属于 Anthropic，也不是官方 Claude Code 产品。Claude Code 相关权利归 Anthropic 及相应权利人所有。项目只应连接使用者有权访问的模型与服务，不得用于绕过认证、付费、权限或安全限制。原始 `CLAUDE.md`、`AGENTS.md`、上游署名和第三方声明应保持完整。

本仓库标记为 `UNLICENSED`，不构成对上游代码或第三方组件的许可授权。公开复制、分发、商业使用或再许可前，应自行取得相关权利人的明确授权。

完整中英文边界见 [项目生命协议](./PROJECT_PROTOCOL.md) 与 [上游声明](./UPSTREAM_NOTICE.md)。使用本项目时，还应遵守适用法律、上游声明、第三方许可证以及模型服务条款。

## 贡献

提交代码前请运行：

```bash
bun run typecheck
bun test packages/desktop/tests
```

提交信息使用 Conventional Commits，例如：`feat: 添加桌面文件预览`。
