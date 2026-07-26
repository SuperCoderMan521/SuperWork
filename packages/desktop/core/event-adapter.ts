import type {
  DesktopEvent,
  DesktopModelConfig,
  DesktopTokenUsage,
  DesktopToolCall,
} from '../shared/protocol.js'
import {
  addUsage,
  EMPTY_DESKTOP_USAGE,
  hasUsage,
  mergeCallUsage,
  providerAndModel,
  tokenUsage,
  usageCostUsd,
} from './turn-usage.js'

type UnknownRecord = Record<string, unknown>
type SessionEvent = Extract<
  DesktopEvent,
  { sessionId: string; sequence: number }
>
type SessionEventInput = SessionEvent extends infer Event
  ? Event extends SessionEvent
    ? Omit<Event, 'sessionId' | 'sequence'>
    : never
  : never

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null
}

function stringProperty(value: UnknownRecord, key: string): string | undefined {
  const property = value[key]
  return typeof property === 'string' ? property : undefined
}

function contentBlocks(event: UnknownRecord): UnknownRecord[] {
  const message = event.message
  if (!isRecord(message) || !Array.isArray(message.content)) return []
  return message.content.filter(isRecord)
}

type IndexedContentBlock = {
  block: UnknownRecord
  index: number
}

function thinkingContent(block: UnknownRecord): string | undefined {
  const type = stringProperty(block, 'type')
  if (type === 'thinking') return stringProperty(block, 'thinking')
  if (type === 'redacted_thinking') return '姝ゆ€濊€冨唴瀹瑰凡闅愯棌'
  return undefined
}

function mergeAdjacentThinkingBlocks(blocks: UnknownRecord[]): IndexedContentBlock[] {
  const merged: IndexedContentBlock[] = []
  blocks.forEach((block, index) => {
    const blockType = stringProperty(block, 'type')
    const isThinking = blockType === 'thinking' || blockType === 'redacted_thinking'
    const previous = merged[merged.length - 1]
    const previousType = previous ? stringProperty(previous.block, 'type') : undefined
    if (isThinking && previous && previousType === blockType) {
      const previousContent = thinkingContent(previous.block)
      const nextContent = thinkingContent(block)
      if (blockType === 'thinking' && previousContent && nextContent) {
        previous.block = {
          ...previous.block,
          thinking: `${previousContent}\n\n${nextContent}`,
        }
      }
      return
    }
    merged.push({ block, index })
  })
  return merged
}

function toolSummary(input: unknown): string {
  if (!isRecord(input)) return ''
  for (const key of ['file_path', 'path', 'command', 'query']) {
    const value = stringProperty(input, key)
    if (value) return value
  }
  return ''
}

function assistantTextSignature(content: string): string {
  return content.replace(/\s+/g, '')
}

/** Converts unstable query stream shapes into the stable desktop protocol. */
export class DesktopEventAdapter {
  private sequence = 0
  private readonly tools = new Map<string, DesktopToolCall>()
  private hasStreamingText = false
  private readonly streamingTextBlockIds = new Map<number, string>()
  private readonly streamingTextDisplayOrders = new Map<number, number>()
  private streamingBlockDisplayBase: number | undefined
  private readonly emittedAssistantTextSignatures = new Set<string>()
  private hasAssistantOutput = false
  private currentUsage: DesktopTokenUsage = { ...EMPTY_DESKTOP_USAGE }
  private totalUsage: DesktopTokenUsage = { ...EMPTY_DESKTOP_USAGE }
  private apiCalls = 0
  private finalized = false
  private anchorMessageId: string | undefined

  constructor(
    private readonly sessionId: string,
    private readonly now: () => number = Date.now,
    initialSequence = 0,
    private readonly emitRequestState = true,
    private readonly modelConfig?: DesktopModelConfig,
    private readonly startedAt = now(),
  ) {
    this.sequence = initialSequence
  }

  consume(value: unknown): SessionEvent[] {
    if (!isRecord(value)) return []

    this.captureUsage(value)

    if (value.type === 'stream_request_start') {
      if (!this.emitRequestState) return []
      return [this.sessionEvent({ type: 'generation.state', state: 'running' })]
    }

    if (value.type === 'result') {
      const result = stringProperty(value, 'result')
      const events: SessionEvent[] = []
      if (!this.hasAssistantOutput && result) {
        const messageId = `result-${this.sequence + 1}`
        this.anchorMessageId = messageId
        events.push(this.sessionEvent({
          type: 'message.added',
          message: {
            id: messageId,
            role: 'assistant',
            kind: 'text',
            content: result,
            createdAt: this.now(),
            displayOrder: this.nextDisplayOrder(),
          },
        }))
      }
      const status = value.is_error === true ? 'failed' : 'completed'
      return [...events, ...this.complete(status)]
    }

    const textDelta = this.textDelta(value)
    if (textDelta !== undefined) {
      this.hasStreamingText = true
      this.hasAssistantOutput = true
      this.anchorMessageId = textDelta.messageId
      return [this.sessionEvent({
        type: 'message.delta',
        messageId: textDelta.messageId,
        delta: textDelta.delta,
        ...(textDelta.displayOrder !== undefined ? { displayOrder: textDelta.displayOrder } : {}),
      })]
    }

    if (value.type === 'user') return this.toolResults(value)
    if (value.type !== 'assistant') return []

    const rawBlocks = contentBlocks(value)
    const blocks = mergeAdjacentThinkingBlocks(rawBlocks)
    const messageBlockCount = blocks.filter(({ block }) =>
      block.type === 'text' || block.type === 'thinking' || block.type === 'redacted_thinking',
    ).length
    const baseDisplayOrder = this.displayOrderBaseForCompletedBlocks(rawBlocks.length)
    const events = blocks.flatMap(({ block, index }) => {
      const blockType = stringProperty(block, 'type')
      if (blockType === 'tool_use' || blockType === 'server_tool_use') {
        const id = stringProperty(block, 'id')
        const name = stringProperty(block, 'name')
        if (!id || !name) return []
        const input = block.input
        const tool: DesktopToolCall = {
          id,
          name,
          state: 'running',
          summary: toolSummary(input),
          input,
          startedAt: this.now(),
          displayOrder: this.displayOrderForBlock(index, baseDisplayOrder),
        }
        this.tools.set(id, tool)
        return [this.sessionEvent({ type: 'tool.updated', tool })]
      }

      const content = blockType === 'text'
        ? stringProperty(block, 'text')
        : blockType === 'thinking'
          ? stringProperty(block, 'thinking')
          : blockType === 'redacted_thinking'
            ? '此思考内容已隐藏'
            : undefined
      if (!content) return []
      const kind = blockType === 'thinking'
        ? 'thinking' as const
        : blockType === 'redacted_thinking'
          ? 'redacted_thinking' as const
          : 'text' as const
      if (kind === 'text') {
        const signature = assistantTextSignature(content)
        if (signature && this.emittedAssistantTextSignatures.has(signature)) {
          return []
        }
        if (signature) this.emittedAssistantTextSignatures.add(signature)
      }
      const streamingTextId = blockType === 'text' ? this.streamingTextIdForCompletedBlock(index) : undefined
      const streamingText = blockType === 'text' && (streamingTextId !== undefined || this.hasStreamingText)
      const baseId = stringProperty(value, 'uuid')
      if (!streamingText && !baseId) return []
      if (streamingText) this.hasStreamingText = false
      return [this.sessionEvent({
        type: 'message.added',
        message: {
          id: streamingText
            ? streamingTextId ?? 'streaming-assistant'
            : messageBlockCount === 1 ? baseId! : `${baseId}-${index}`,
          role: 'assistant',
          kind,
          content,
          createdAt: this.now(),
          displayOrder: this.displayOrderForBlock(index, baseDisplayOrder),
          ...(streamingText ? { displayOrderProvisional: false } : {}),
        },
      })]
    })
    if (events.some(event => event.type === 'message.added')) {
      this.hasAssistantOutput = true
      const lastMessage = [...events].reverse().find(event => event.type === 'message.added')
      if (lastMessage?.type === 'message.added') this.anchorMessageId = lastMessage.message.id
    }
    this.streamingTextBlockIds.clear()
    this.streamingTextDisplayOrders.clear()
    this.streamingBlockDisplayBase = undefined
    return events
  }

  complete(status: 'completed' | 'interrupted' | 'failed'): SessionEvent[] {
    if (this.finalized) return []
    this.finalized = true
    this.finishCurrentCall()
    const { provider, model } = providerAndModel(this.modelConfig, 'default')
    return [this.sessionEvent({
      type: 'turn.usage.completed',
      report: {
        id: `usage-${this.sessionId}-${this.sequence + 1}`,
        anchorMessageId: this.anchorMessageId,
        status,
        provider,
        model,
        usage: this.totalUsage,
        apiCalls: this.apiCalls,
        costUsd: usageCostUsd(this.totalUsage, this.modelConfig?.pricing),
        durationMs: Math.max(0, this.now() - this.startedAt),
        completedAt: this.now(),
        displayOrder: this.sequence + 1,
      },
    })]
  }

  private captureUsage(value: UnknownRecord): void {
    if (value.type !== 'stream_event' || !isRecord(value.event)) return
    const event = value.event
    if (event.type === 'message_start') {
      this.currentUsage = { ...EMPTY_DESKTOP_USAGE }
      const message = isRecord(event.message) ? event.message : null
      this.currentUsage = mergeCallUsage(this.currentUsage, tokenUsage(message?.usage))
    } else if (event.type === 'message_delta') {
      this.currentUsage = mergeCallUsage(this.currentUsage, tokenUsage(event.usage))
    } else if (event.type === 'message_stop') {
      this.finishCurrentCall()
    }
  }

  private finishCurrentCall(): void {
    if (!hasUsage(this.currentUsage)) return
    this.totalUsage = addUsage(this.totalUsage, this.currentUsage)
    this.apiCalls += 1
    this.currentUsage = { ...EMPTY_DESKTOP_USAGE }
  }

  private textDelta(value: UnknownRecord): { messageId: string; delta: string; displayOrder?: number } | undefined {
    if (value.type !== 'stream_event' || !isRecord(value.event)) return undefined
    const event = value.event
    if (event.type !== 'content_block_delta' || !isRecord(event.delta)) {
      return undefined
    }
    if (event.delta.type !== 'text_delta') return undefined
    const delta = stringProperty(event.delta, 'text')
    if (delta === undefined) return undefined
    return {
      messageId: this.streamingTextIdForDelta(event),
      delta,
      ...this.displayOrderForDelta(event),
    }
  }

  private displayOrderForDelta(event: UnknownRecord): { displayOrder: number } | Record<string, never> {
    const index = event.index
    if (typeof index !== 'number' || index < 0) return {}
    const existing = this.streamingTextDisplayOrders.get(index)
    if (existing !== undefined) return { displayOrder: existing }
    this.streamingBlockDisplayBase ??= this.sequence + 1
    const displayOrder = this.streamingBlockDisplayBase + index
    this.streamingTextDisplayOrders.set(index, displayOrder)
    return { displayOrder }
  }

  private streamingTextIdForDelta(event: UnknownRecord): string {
    const index = event.index
    if (typeof index !== 'number') return 'streaming-assistant'
    const existing = this.streamingTextBlockIds.get(index)
    if (existing) return existing
    const messageId = `streaming-assistant-${index}`
    this.streamingTextBlockIds.set(index, messageId)
    return messageId
  }

  private streamingTextIdForCompletedBlock(index: number): string | undefined {
    const messageId = this.streamingTextBlockIds.get(index)
    if (messageId) {
      this.streamingTextBlockIds.delete(index)
      this.streamingTextDisplayOrders.delete(index)
      if (this.streamingTextDisplayOrders.size === 0) {
        this.streamingBlockDisplayBase = undefined
      }
    }
    return messageId
  }

  private displayOrderBaseForCompletedBlocks(blockCount: number): number {
    if (this.streamingBlockDisplayBase !== undefined) {
      return this.streamingBlockDisplayBase
    }
    const indexedOrders = [...this.streamingTextDisplayOrders.entries()]
      .filter(([index]) => index >= 0 && index < blockCount)
      .map(([index, displayOrder]) => displayOrder - index)
    return indexedOrders.length ? Math.min(...indexedOrders) : this.sequence + 1
  }

  private displayOrderForBlock(index: number, base: number): number {
    return base + index
  }

  private toolResults(value: UnknownRecord): SessionEvent[] {
    return contentBlocks(value).flatMap(block => {
      if (block.type !== 'tool_result') return []
      const id = stringProperty(block, 'tool_use_id')
      if (!id) return []
      const previous = this.tools.get(id)
      if (!previous) return []
      const rawOutput = block.content
      const output =
        typeof rawOutput === 'string'
          ? rawOutput
          : rawOutput === undefined
            ? ''
            : JSON.stringify(rawOutput)
      const tool: DesktopToolCall = {
        ...previous,
        state: block.is_error === true ? 'error' : 'success',
        output,
        completedAt: this.now(),
        displayOrder: previous.displayOrder,
      }
      this.tools.set(id, tool)
      return [this.sessionEvent({ type: 'tool.updated', tool })]
    })
  }

  private sessionEvent(event: SessionEventInput): SessionEvent {
    return {
      ...event,
      sessionId: this.sessionId,
      sequence: ++this.sequence,
    } as unknown as SessionEvent
  }

  private nextDisplayOrder(): number {
    return this.sequence + 1
  }
}
