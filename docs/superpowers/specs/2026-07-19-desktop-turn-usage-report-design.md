# SuperWork 单轮使用报表设计

## 目标

每次用户问答的完整 Loop 结束后，在最后一条模型输出下方展示一条默认折叠的使用报表。报表统计本轮所有模型调用，包括工具调用前后的多次模型请求，但不修改原有 `query()` 与 Loop 行为。

## 界面设计

报表位于本轮最后一条模型输出下方，与该轮回答绑定。

默认折叠行：

```text
◷ 本轮使用  10,046 tokens · 缓存 78% · $0.0184 · 12.6s  ⌄
```

展开后展示：

- 输入 Token
- 输出 Token
- 缓存读取 Token
- 缓存写入 Token
- 缓存命中率
- 费用
- 总耗时
- 实际模型
- 模型 API 调用次数
- 多模型明细（仅在本轮使用多个模型时展示）

视觉上沿用工具折叠卡片的深色、单层折叠结构，但报表更轻量，不使用运行中的流光样式。

## 统计边界

“本轮”从 `prompt.submit` 成功进入运行态开始，到以下任一状态结束：

- 正常完成
- 用户中断
- 请求失败

一次用户问答可能包含多次模型 API 调用。每次调用在 `message_start` 时读取输入与缓存 Token，在 `message_delta` 中取得最终输出 Token，在 `message_stop` 时累加到当前轮次。

报表采用本轮增量，不直接展示 `QueryEngine.totalUsage` 的会话累计值。

## Usage 数据

统一字段：

```ts
type DesktopTokenUsage = {
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
}
```

派生字段：

```text
totalTokens = inputTokens + outputTokens
totalPromptTokens = inputTokens + cacheCreationInputTokens + cacheReadInputTokens
cacheHitRate = cacheReadInputTokens / totalPromptTokens
```

折叠行的 Token 总量使用供应商计费口径：

```text
billedTokens = inputTokens + outputTokens + cacheCreationInputTokens + cacheReadInputTokens
```

若 `totalPromptTokens` 为 0，缓存命中率显示 `--`。

## 价格配置

价格按“供应商 + 模型名称”保存，避免不同服务对同名模型采用不同价格。

```ts
type DesktopModelPricing = {
  provider: string
  model: string
  currency: 'USD'
  perMillionInputTokens: number
  perMillionOutputTokens: number
  perMillionCacheCreationTokens: number
  perMillionCacheReadTokens: number
}
```

配置入口放在现有模型设置页面，在 Base URL、Token、MODEL 配置下增加“Token 价格”区域。所有价格以美元/百万 Token 填写，允许输入 0，不允许负数。

价格写入项目 `.claudecode/setting.json`，与现有图形化模型配置保持同一读写边界。

费用计算：

```text
cost = inputTokens / 1,000,000 × inputPrice
     + outputTokens / 1,000,000 × outputPrice
     + cacheCreationInputTokens / 1,000,000 × cacheCreationPrice
     + cacheReadInputTokens / 1,000,000 × cacheReadPrice
```

历史报表保存价格快照和计算结果。修改价格只影响后续问答，不重新计算历史费用。

价格未配置时显示“费用未配置”。任一必需价格缺失时显示“费用配置不完整”，不使用猜测价格。

## Desktop 数据流

保持原有核心 Loop 不变：

```text
QueryEngine result/stream events
        ↓
DesktopQueryRunner
        ↓
DesktopEventAdapter 统计本轮增量
        ↓
turn.usage.completed
        ↓
Renderer reducer
        ↓
ConversationPane 使用报表折叠条
```

新增协议事件建议：

```ts
type TurnUsageCompletedEvent = {
  type: 'turn.usage.completed'
  sessionId: string
  sequence: number
  turnId: string
  status: 'completed' | 'interrupted' | 'failed'
  usage: DesktopTokenUsage
  modelBreakdown: Array<{
    provider: string
    model: string
    apiCalls: number
    usage: DesktopTokenUsage
    pricing?: DesktopModelPricing
    costUsd?: number
  }>
  totalCostUsd?: number
  durationMs: number
}
```

Renderer 将报表实体按 `turnId` 绑定到该轮最后一条 Assistant 消息，而不是作为普通聊天消息插入时间线。

## Provider 兼容

- Anthropic Compatible：读取输入、输出、缓存写入、缓存读取。
- OpenAI Responses：读取输入、输出和 cached tokens；缓存写入通常为 0。
- Grok：使用接口实际返回的字段，未返回项为 0 并标记数据来源。
- Gemini：当前实现没有完整 Usage 时显示“供应商未返回用量”，不伪造数据。

## 中断和失败

- 用户中断：保留已收到的 Token，状态标记为“已中断”。
- 请求失败：若已有 Usage 则展示并标记“执行失败”；完全无 Usage 时显示“未获得用量”。
- Core 重启：未完成轮次不写入虚假报表；恢复后只展示已经持久化的完整报表。
- 重复完成事件：使用 `turnId` 幂等覆盖，避免出现两张报表。

## 持久化

会话快照增加 `turnUsageReports`，保存：

- 原始 Token 数值
- Provider 与实际模型
- API 调用次数
- 当时价格快照
- 当时计算费用
- 开始时间、结束时间与耗时
- 完成状态

Token 报表属于会话数据，不写入全局日志。日志只记录事件是否成功生成，不记录用户输入或密钥。

## 测试要求

1. 单次无工具调用生成一张报表。
2. 多次工具循环合并为一张报表，并正确累计 API 调用次数。
3. 下一轮只显示增量，不重复上轮累计 Usage。
4. 多模型调用分别计算后合计费用。
5. 缓存命中率计算正确，分母为 0 时显示 `--`。
6. 未配置或配置不完整时不计算费用。
7. 修改价格后历史费用不变。
8. 中断和失败仍展示已产生的 Usage。
9. 重复完成事件不会创建重复报表。
10. Gemini 等未返回 Usage 的供应商显示明确占位状态。

## 非目标

- 不修改 `src/query.ts` 的循环控制。
- 不改变现有 TUI 的 Usage 展示。
- 不从网络自动抓取模型价格。
- 首版不提供人民币汇率换算。
- 首版不实现跨会话、按日或按月的费用统计看板。
