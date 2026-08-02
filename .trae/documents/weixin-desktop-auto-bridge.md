# 微信 ↔ Claude 全自动桥接（Desktop 模式）

## Context

**问题**：desktop 模式下微信 channel 是单向接收。[packages/desktop/core/weixin-channel-service.ts](file:///g:/ai/own/cc-v2/claude-code/claude-code-main/packages/desktop/core/weixin-channel-service.ts) 调用 weixin 包的 `startPollLoop` 收消息后只 `recordInbound` 展示到 UI，既不触发 Claude 对话，也不把回复推回微信。

**根因**：
- `DesktopWeixinChannelService.deps()` 只 import 了 `loadAccount/startPollLoop/DEFAULT_BASE_URL/CDN_BASE_URL`，未 import `sendText/getContextToken`
- 没有任何代码把微信 inbound 消息路由到 `controller.submitPrompt`
- 没有任何代码订阅 controller 的 assistant 回复并调 `sendText`

**目标**：微信用户发消息 → 自动触发 Claude 对话（同 chatId 复用 session 保留上下文）→ Claude 回复完成 → 自动 `sendText` 推回该微信用户 → UI 显示双向对话。

## 设计要点

### 数据流

```
微信消息 → onMessage
  → recordInbound (UI 显示入站)
  → enqueue(chatId, buildPrompt(msg))
  → trySubmit(chatId)
       ├─ controller.isBusy() → 留队列，等 generation.state=idle 事件 drain
       └─ 空闲 → runGeneration:
            1. getOrCreateSession(chatId)  // chatId → sessionId 复用
            2. beforeCount = session.messages.length
            3. await controller.submitPrompt(sessionId, prompt)
            4. reply = collectReply(session.messages.slice(beforeCount))
            5. await sendText({ to: chatId, text: reply, ... })
            6. recordOutbound(chatId, reply) + emitSnapshot
            7. finally: activeChat.delete(chatId); tryDrainAll()
```

### 关键决策

1. **会话路由**：`chatIdToSessionId: Map<string, string>`，每个微信用户复用一个 desktop session（保留上下文）。session title 为 `微信 <chatId>`。映射仅内存（重启丢失，MVP 可接受）。

2. **并发控制**：`controller.activeGeneration` 是单例（无队列，并发 submitPrompt 抛 `'already generating'`）。在 service 内实现 FIFO 队列串行化：
   - `queue: Map<chatId, QueuedMessage[]>`（每 chatId 独立 FIFO，避免某用户消息饿死其他用户）
   - `activeChat: Set<chatId>`（同 chatId 串行）
   - `trySubmit(chatId)`：activeChat 已有 → return；controller.isBusy() → return（等 idle 事件 drain）；否则出队执行
   - 队列上限 `MAX_QUEUE_PER_CHAT = 5`，溢出丢最旧并发微信提示

3. **事件订阅**：包装 `emit` 做 fan-out，提供 `subscribe(listener)`。**仅用于监听 `generation.state=idle` 触发 `tryDrainAll`**（UI 手动对话结束/其他 chatId 生成结束时唤醒等待中的微信消息）。

4. **回复收集**（不靠事件订阅）：`submitPrompt` 是 async，await 结束即生成完成。controller 在执行期间同步 push assistant message 到 `session.messages`。所以：
   ```ts
   const before = controller.getSession(sid)?.messages.length ?? 0
   await controller.submitPrompt(sid, prompt)
   const after = controller.getSession(sid)?.messages ?? []
   const reply = collectReply(after.slice(before))
   ```
   `getSession` 返回引用（已确认 [conversation-controller.ts:76](file:///g:/ai/own/cc-v2/claude-code/claude-code-main/packages/desktop/core/conversation-controller.ts)），slice 安全。

5. **Prompt 构造**（纯函数 `buildPrompt`）：附件路径拼成文本提示，让 Claude 用 FileReadTool 读取。不加来源前缀（session 已绑定用户）。

6. **Outbound 记录**：复用现有私有方法 `recordRuntimeMessage`，schema 已支持 `direction: 'outbound'`（[schemas.ts:217](file:///g:/ai/own/cc-v2/claude-code/claude-code-main/packages/desktop/shared/schemas.ts)）。

## 文件改动清单

### 1. [packages/desktop/core/conversation-controller.ts](file:///g:/ai/own/cc-v2/claude-code/claude-code-main/packages/desktop/core/conversation-controller.ts)（~3 行）
- 新增 `isBusy(): boolean { return this.activeGeneration !== null }`
- `createSession(cwd: string, title?: string)`：title 默认 `'New conversation'`

### 2. [packages/desktop/core/main.ts](file:///g:/ai/own/cc-v2/claude-code/claude-code-main/packages/desktop/core/main.ts)（~10 行）
- `emit` 定义前增加 `subscribers: Set<(e: DesktopEvent) => void>` 与 `subscribe` 函数
- 包装 `emit`：先 `process.stdout.write(encodeJsonLine(event))`，再 fan-out 给 subscribers
- `DesktopWeixinChannelService` 构造改为 options 对象：`{ emit, subscribe, getController: () => controller, cwd: process.cwd() }`
- 注意：`controller` 用 `let` 声明（已是 `let controller`），`getController` 闭包返回当前值，避免循环依赖问题

### 3. [packages/desktop/core/weixin-channel-service.ts](file:///g:/ai/own/cc-v2/claude-code/claude-code-main/packages/desktop/core/weixin-channel-service.ts)（核心，~150 行新增）

**类型/依赖**：
- `WeixinRuntimeDeps` 增加 `sendText`、`getContextToken`
- 构造函数改为 `{ emit, now?, subscribe, getController, cwd }`
- `deps()` import 补充 `sendText`、`getContextToken`

**新增字段**：
- `chatIdToSessionId: Map<string, string>`
- `queue: Map<string, QueuedMessage[]>`
- `activeChat: Set<string>`
- `unsubscribe: (() => void) | null`
- `activeRequestId: string | null`

**新增纯函数（export 便于测试）**：
- `buildPrompt(msg: ParsedMessage): string` — 文本+附件路径拼接
- `collectReply(newMessages: DesktopMessage[]): string` — 过滤 `role==='assistant' && kind==='text'`，join `'\n\n'`

**新增方法**：
- `getOrCreateSession(chatId): string` — 查映射，无则 `controller.createSession(cwd, '微信 ' + chatId)`
- `enqueue(chatId, prompt): void` — 入队 + 溢出处理
- `trySubmit(chatId): void` — 检查 activeChat/isBusy，否则 `void runGeneration`
- `tryDrainAll(): void` — 遍历 queue 调 trySubmit
- `runGeneration(chatId, prompt): Promise<void>` — 主流程（含错误处理）
- `pushOutbound(chatId, text): Promise<void>` — 调 sendText
- `recordOutbound(chatId, text): void` — 调 recordRuntimeMessage
- `sendWeixinError(chatId, text): Promise<void>` — 错误提示推送

**修改 `start()`**：保存 `activeRequestId`；调 `this.unsubscribe = this.options.subscribe(event => { if (event.type === 'generation.state' && event.state === 'idle') this.tryDrainAll() })`

**修改 `stop()`**：先 `this.unsubscribe?.()`；遍历 activeChat 调 `controller.interrupt(sessionId)`；`queue.clear()`、`activeChat.clear()`、`chatIdToSessionId.clear()`；再走原 abort poll loop 逻辑

**修改 `onMessage` 回调**（在 `recordInbound` 后）：`this.enqueue(msg.fromUserId, buildPrompt(msg))` 然后 `this.trySubmit(msg.fromUserId)`

### 不需要改动
- `packages/desktop/shared/schemas.ts` / `types.ts` / `protocol.ts`：现有 schema 已支持 outbound 消息和所有事件类型
- `packages/weixin/src/*`：`sendText`/`getContextToken`/`loadAccount` 已导出，签名匹配
- `packages/desktop/core/event-adapter.ts` / `command-dispatcher.ts`：事件流和命令分发不变

## 错误处理矩阵

| 场景 | 处理 |
|------|------|
| `submitPrompt` 抛 `'already generating'` | 重入队头，retries++，等 idle 事件；超 `MAX_RETRIES=3` 发微信 `(Claude 正忙，请稍后重试)` |
| `submitPrompt` 抛 timeout/其他 | 发微信 `(Claude 处理失败：${msg})`；记录 outbound |
| `reply === ''` | 发微信 `(Claude 完成了操作但未生成文本回复)` |
| `sendText` 抛错 | stderr 日志；outbound 记录 `(发送失败) ${reply}`；不重试 |
| `loadAccount()` null | stderr 日志；无法推送 |
| 队列满 | 丢最旧；发微信 `(消息过多，请稍后)` |
| `stop()` 期间 | runGeneration 在 await 后检查 `!activeChat.has(chatId)` 跳过推送 |

## 验证方案

### 类型检查
```bash
cd packages/desktop && bun run typecheck
```

### 单元测试（新增 `packages/desktop/tests/weixin-channel-service.test.ts`）
参考 [conversation-controller.test.ts](file:///g:/ai/own/cc-v2/claude-code/claude-code-main/packages/desktop/tests/conversation-controller.test.ts) 模式。覆盖：
- `buildPrompt`：纯函数 — 文本/附件/混合/`(media attachment)` 占位符过滤
- `collectReply`：纯函数 — 空/单条/多条/过滤 thinking+user+tool
- 队列串行：同 chatId 两条消息串行；不同 chatId 第二条等第一条完成
- `already generating` 重试：mock controller 第一次抛错、第二次成功
- UI 冲突：mock `isBusy()` 返回 true → 入队；idle 事件 → drain
- outbound 记录：成功生成 → runtime.conversations 含 outbound
- sendText 失败：mock throw → outbound 记录含错误标识，不重试
- stop()：队列清空、activeChat 清空、interrupt 被调

Mock 清单：fake controller（createSession/getSession/submitPrompt/interrupt/isBusy）、spy sendText、固定 getContextToken/loadAccount、可触发的 startPollLoop、捕获 emit、捕获 subscribe。

### 端到端验证
1. `cd packages/desktop && bun run dev` 启动 desktop
2. 设置页执行微信扫码登录 → 自动启动 channel
3. 用已授权微信账号发文本消息 → 观察 desktop UI 出现 inbound + 自动创建 session + 生成中
4. 等 Claude 生成完成 → UI 出现 outbound 消息 + 微信收到回复
5. 发带图片消息 → 验证附件路径进 prompt + Claude 可读图
6. 两微信用户快速各发一条 → 验证串行处理
7. UI 手动对话生成中时微信发消息 → 验证消息入队、UI 完成后自动处理

### 全量检查
```bash
cd packages/desktop && bun run typecheck && bun test
```
