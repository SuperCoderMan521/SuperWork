# Desktop 会话历史路径修复设计

## 背景

Desktop 在创建 QueryEngine 时调用：

```ts
switchSession(sessionId, cwd)
```

`switchSession` 的第二个参数表示“会话 JSONL 所在目录”，不是工作目录。当前实现因此把会话写到工作区根目录，例如 `K:\ai\12\<sessionId>.jsonl`。左侧历史列表则调用 Claude Code 原有的 `listSessionsImpl`，只扫描 `~/.claude/projects/<sanitized-cwd>/`，所以应用重启后无法发现这些会话。

## 目标

1. 新 Desktop 会话继续使用 Claude Code 原有的标准历史目录。
2. 不修改 `src/` 中 Claude Code 原始会话存储实现。
3. 已经误写到工作区根目录的 Desktop JSONL 可以被安全恢复。
4. 恢复操作不得覆盖标准目录中已有的同名会话。

## 方案

### 会话路径激活

在 Desktop 每次运行会话时（包括复用已经创建的 QueryEngine）：

1. 调用 `setOriginalCwd(session.cwd)`。
2. 调用 `switchSession(session.id)`，不传工作目录作为 `sessionProjectDir`。

这样 `getTranscriptPathForSession` 会继续通过 Claude Code 原始逻辑，根据 `originalCwd` 解析 `~/.claude/projects/<sanitized-cwd>/<sessionId>.jsonl`。

必须在每次运行前执行，而不是只在 QueryEngine 首次创建时执行。Bootstrap 会话状态是进程级共享状态；如果用户依次使用多个 Desktop 会话，只在初始化时切换会让后续复用的 QueryEngine 继承另一个会话的存储位置。

### 旧历史兼容

在 `packages/desktop/core/` 新增一个仅属于 Desktop 的迁移服务。服务接收工作目录和标准项目历史目录：

1. 只枚举工作区根目录中的 UUID 命名 `.jsonl` 文件。
2. 目标目录不存在时创建。
3. 目标不存在时复制源文件；目标已存在时跳过。
4. 不删除源文件，使迁移可恢复、可重复执行。
5. 单个文件失败只产生警告，不阻塞 Desktop 启动或历史列表。

Renderer 启动时把上次工作目录传给 `session.list`。Core 在列出历史前执行兼容复制，然后调用现有 `listSessionsImpl({ dir: cwd })`，确保旧会话立即进入左侧历史列表。没有保存工作目录时维持当前的全局历史扫描。

## 协议变化

`session.list` 增加可选 `cwd` 字段，`DesktopApi.listSessions(cwd?)` 同步支持该字段。该变化只影响 `packages/desktop`。

## 测试

1. 验证每次运行会话都会先设置 `originalCwd`，并且不再把 `cwd` 传给 `switchSession`。
2. 验证旧 UUID JSONL 被复制到标准历史目录。
3. 验证同名目标存在时不会覆盖。
4. 验证非 UUID JSONL 不会迁移。
5. 验证 `session.list` 将可选工作目录传递到 SessionService。
6. 运行 Desktop 测试、Desktop typecheck 和仓库根 typecheck。

## 非目标

- 不删除用户工作区根目录中的旧 JSONL。
- 不修改 Claude Code CLI 的历史存储或扫描规则。
- 不迁移非 UUID 文件。
- 不改变左侧历史分组的视觉样式。
