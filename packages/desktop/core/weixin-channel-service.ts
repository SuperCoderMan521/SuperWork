import type {
  DesktopChannelWeixinRuntime,
  DesktopEvent,
  DesktopMessage,
  DesktopSession,
} from '../shared/protocol.js'
import type { ParsedMessage } from '@claude-code-best/weixin'

type Emit = (event: DesktopEvent) => void
type Subscribe = (listener: (event: DesktopEvent) => void) => () => void

/** Subset of DesktopConversationController used by the weixin bridge. */
export interface DesktopConversationControllerLike {
  isBusy(): boolean
  createSession(cwd: string, title?: string): DesktopSession
  getSession(sessionId: string): DesktopSession | undefined
  submitPrompt(sessionId: string, text: string): Promise<unknown>
  interrupt(sessionId: string): boolean
}

type StartPollLoop = typeof import('@claude-code-best/weixin')['startPollLoop']
type LoadAccount = typeof import('@claude-code-best/weixin')['loadAccount']
type SendText = typeof import('@claude-code-best/weixin')['sendText']
type GetContextToken = typeof import('@claude-code-best/weixin')['getContextToken']

type WeixinRuntimeDeps = {
  loadAccount: LoadAccount
  startPollLoop: StartPollLoop
  sendText: SendText
  getContextToken: GetContextToken
  defaultBaseUrl: string
  cdnBaseUrl: string
}

type WeixinConversation = DesktopChannelWeixinRuntime['conversations'][number]

const MAX_MESSAGES_PER_CHAT = 80
const MAX_CONVERSATIONS = 30
const MAX_QUEUE_PER_CHAT = 5
const MAX_RETRIES = 3

interface QueuedMessage {
  prompt: string
  enqueuedAt: number
  retries: number
}

interface WeixinBridgeOptions {
  emit: Emit
  now?: () => number
  subscribe: Subscribe
  getController: () => DesktopConversationControllerLike | undefined
  cwd: string
}

function messageId(msg: ParsedMessage, createdAt: number): string {
  return msg.messageId || `${msg.fromUserId}-${createdAt}`
}

/** Build a Claude prompt from an inbound WeChat message. */
export function buildPrompt(msg: ParsedMessage): string {
  const parts: string[] = []
  if (msg.attachmentPath) {
    const label = msg.attachmentType ?? '附件'
    parts.push(`[用户通过微信发来${label}，已保存至：${msg.attachmentPath}]`)
    parts.push('你可以使用 FileReadTool 读取该文件查看内容。')
  }
  if (msg.text && msg.text !== '(media attachment)') {
    parts.push(msg.text)
  }
  return parts.join('\n\n') || '(空消息)'
}

/** Collect assistant text replies from new session messages. */
export function collectReply(newMessages: DesktopMessage[]): string {
  return newMessages
    .filter(m => m.role === 'assistant' && m.kind === 'text')
    .map(m => m.content)
    .join('\n\n')
    .trim()
}

function isAlreadyGenerating(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes('already generating')
  )
}

export class DesktopWeixinChannelService {
  private runtime: DesktopChannelWeixinRuntime = {
    running: false,
    status: 'stopped',
    conversations: [],
  }
  private controller: AbortController | null = null
  private loadingDeps: Promise<WeixinRuntimeDeps> | null = null

  private readonly chatIdToSessionId = new Map<string, string>()
  private readonly queue = new Map<string, QueuedMessage[]>()
  private readonly activeChat = new Set<string>()
  private unsubscribe: (() => void) | null = null
  private activeRequestId: string | null = null

  private readonly now: () => number

  constructor(private readonly options: WeixinBridgeOptions) {
    this.now = options.now ?? Date.now
  }

  snapshot(): DesktopChannelWeixinRuntime {
    return {
      ...this.runtime,
      conversations: this.runtime.conversations.map(conversation => ({
        ...conversation,
        messages: [...conversation.messages],
      })),
    }
  }

  emitSnapshot(requestId: string): void {
    this.options.emit({
      type: 'channel.weixin.runtime',
      requestId,
      runtime: this.snapshot(),
    })
  }

  private emitActiveSnapshot(): void {
    this.emitSnapshot(this.activeRequestId ?? '')
  }

  async start(requestId: string): Promise<DesktopChannelWeixinRuntime> {
    this.activeRequestId = requestId

    // Subscribe to generation.state=idle so queued WeChat messages get drained
    // whenever any generation (UI-triggered or WeChat-triggered) finishes.
    this.unsubscribe?.()
    this.unsubscribe = this.options.subscribe(event => {
      if (
        event.type === 'generation.state' &&
        event.state === 'idle'
      ) {
        this.tryDrainAll()
      }
    })

    if (this.controller && !this.controller.signal.aborted) {
      this.runtime = {
        ...this.runtime,
        running: true,
        status: 'running',
        message: '微信消息接收中',
      }
      this.emitActiveSnapshot()
      return this.snapshot()
    }

    this.runtime = {
      ...this.runtime,
      running: false,
      status: 'starting',
      message: '正在启动微信消息接收',
    }
    this.emitActiveSnapshot()

    const deps = await this.deps()
    const account = deps.loadAccount()
    if (!account) {
      this.runtime = {
        ...this.runtime,
        running: false,
        status: 'failed',
        message: '微信尚未登录，请先扫码登录',
      }
      this.emitActiveSnapshot()
      return this.snapshot()
    }

    const controller = new AbortController()
    this.controller = controller
    this.runtime = {
      ...this.runtime,
      running: true,
      status: 'running',
      message: '微信消息接收中',
    }
    this.emitActiveSnapshot()

    void deps.startPollLoop({
      baseUrl: account.baseUrl || deps.defaultBaseUrl,
      cdnBaseUrl: deps.cdnBaseUrl,
      token: account.token,
      abortSignal: controller.signal,
      onMessage: async msg => {
        this.recordInbound(msg)
        this.emitActiveSnapshot()
        this.enqueue(msg.fromUserId, buildPrompt(msg))
        this.trySubmit(msg.fromUserId)
      },
      onPairingRequired: async pairing => {
        this.recordPairingRequired(pairing.fromUserId, pairing.code)
        this.emitActiveSnapshot()
      },
      onPermissionResponse: async () => {},
    }).catch(error => {
      if (controller.signal.aborted) return
      this.controller = null
      this.runtime = {
        ...this.runtime,
        running: false,
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      }
      this.emitActiveSnapshot()
    })

    return this.snapshot()
  }

  stop(message = '微信消息接收已停止'): DesktopChannelWeixinRuntime {
    // Tear down bridge state first so any in-flight runGeneration skips push.
    this.unsubscribe?.()
    this.unsubscribe = null

    const controller = this.options.getController()
    for (const chatId of this.activeChat) {
      const sessionId = this.chatIdToSessionId.get(chatId)
      if (sessionId && controller) controller.interrupt(sessionId)
    }
    this.queue.clear()
    this.activeChat.clear()
    this.chatIdToSessionId.clear()
    this.activeRequestId = null

    if (this.controller && !this.controller.signal.aborted) {
      this.controller.abort()
    }
    this.controller = null
    this.runtime = {
      ...this.runtime,
      running: false,
      status: 'stopped',
      message,
    }
    return this.snapshot()
  }

  // ---- Bridge: queue + generation ----

  private enqueue(chatId: string, prompt: string): void {
    const list = this.queue.get(chatId) ?? []
    if (list.length >= MAX_QUEUE_PER_CHAT) {
      // Drop oldest to bound memory; notify the user.
      list.shift()
      void this.sendWeixinError(chatId, '(消息过多，请稍后)')
    }
    list.push({ prompt, enqueuedAt: this.now(), retries: 0 })
    this.queue.set(chatId, list)
  }

  private tryDrainAll(): void {
    for (const chatId of this.queue.keys()) {
      this.trySubmit(chatId)
    }
  }

  private trySubmit(chatId: string): void {
    if (this.activeChat.has(chatId)) return
    const list = this.queue.get(chatId)
    if (!list || list.length === 0) return
    const controller = this.options.getController()
    if (!controller) return
    if (controller.isBusy()) return
    const next = list.shift()!
    if (list.length === 0) this.queue.delete(chatId)
    else this.queue.set(chatId, list)
    this.activeChat.add(chatId)
    void this.runGeneration(chatId, next)
  }

  private async runGeneration(
    chatId: string,
    job: QueuedMessage,
  ): Promise<void> {
    const controller = this.options.getController()
    if (!controller) {
      this.activeChat.delete(chatId)
      return
    }

    const sessionId = this.getOrCreateSession(chatId)
    const beforeCount = controller.getSession(sessionId)?.messages.length ?? 0

    try {
      await controller.submitPrompt(sessionId, job.prompt)
    } catch (error) {
      if (isAlreadyGenerating(error) && job.retries < MAX_RETRIES) {
        // Re-enqueue at head; wait for next idle event to retry.
        const list = this.queue.get(chatId) ?? []
        list.unshift({ ...job, retries: job.retries + 1 })
        this.queue.set(chatId, list)
        this.activeChat.delete(chatId)
        return
      }
      const reason =
        error instanceof Error ? error.message : String(error)
      process.stderr.write(
        `[weixin-bridge] submitPrompt failed for ${chatId}: ${reason}\n`,
      )
      await this.sendWeixinError(
        chatId,
        `Claude 处理失败：${reason}`,
      )
      this.activeChat.delete(chatId)
      this.tryDrainAll()
      return
    }

    // If stop() ran during generation, skip push entirely.
    if (!this.activeChat.has(chatId)) {
      this.tryDrainAll()
      return
    }

    const after = controller.getSession(sessionId)?.messages ?? []
    const reply = collectReply(after.slice(beforeCount))
    const outboundText =
      reply || '(Claude 完成了操作但未生成文本回复)'

    try {
      await this.pushOutbound(chatId, outboundText)
      this.recordOutbound(chatId, outboundText)
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : String(error)
      process.stderr.write(
        `[weixin-bridge] sendText failed for ${chatId}: ${reason}\n`,
      )
      this.recordOutbound(chatId, `(发送失败) ${outboundText}`)
    } finally {
      this.emitActiveSnapshot()
      this.activeChat.delete(chatId)
      this.tryDrainAll()
    }
  }

  private getOrCreateSession(chatId: string): string {
    const existing = this.chatIdToSessionId.get(chatId)
    if (existing) return existing
    const controller = this.options.getController()
    const session = controller!.createSession(
      this.options.cwd,
      `微信 ${chatId}`,
    )
    this.chatIdToSessionId.set(chatId, session.id)
    return session.id
  }

  private async pushOutbound(chatId: string, text: string): Promise<void> {
    const deps = await this.deps()
    const account = deps.loadAccount()
    if (!account) {
      process.stderr.write(
        '[weixin-bridge] No account, cannot send outbound message\n',
      )
      return
    }
    const contextToken = deps.getContextToken(chatId) ?? ''
    await deps.sendText({
      to: chatId,
      text,
      baseUrl: account.baseUrl || deps.defaultBaseUrl,
      token: account.token,
      contextToken,
    })
  }

  private async sendWeixinError(chatId: string, text: string): Promise<void> {
    try {
      await this.pushOutbound(chatId, text)
    } catch (error) {
      process.stderr.write(
        `[weixin-bridge] Failed to send error notice to ${chatId}: ${
          error instanceof Error ? error.message : String(error)
        }\n`,
      )
    }
  }

  private recordOutbound(chatId: string, text: string): void {
    this.recordRuntimeMessage({
      id: `outbound-${chatId}-${this.now()}`,
      chatId,
      senderId: 'claude',
      text,
      direction: 'outbound' as const,
      createdAt: this.now(),
    })
  }

  private recordInbound(msg: ParsedMessage): void {
    const createdAt = this.now()
    const existing = this.runtime.conversations.find(
      conversation => conversation.chatId === msg.fromUserId,
    )
    const nextMessage = {
      id: messageId(msg, createdAt),
      chatId: msg.fromUserId,
      senderId: msg.fromUserId,
      text: msg.text,
      direction: 'inbound' as const,
      createdAt,
      ...(msg.attachmentPath ? { attachmentPath: msg.attachmentPath } : {}),
      ...(msg.attachmentType ? { attachmentType: msg.attachmentType } : {}),
    }

    const updated: WeixinConversation = existing
      ? {
          ...existing,
          updatedAt: createdAt,
          messages: [...existing.messages, nextMessage].slice(
            -MAX_MESSAGES_PER_CHAT,
          ),
        }
      : {
          chatId: msg.fromUserId,
          title: `微信 ${msg.fromUserId}`,
          updatedAt: createdAt,
          messages: [nextMessage],
        }

    this.runtime = {
      ...this.runtime,
      conversations: [
        updated,
        ...this.runtime.conversations.filter(
          conversation => conversation.chatId !== msg.fromUserId,
        ),
      ]
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, MAX_CONVERSATIONS),
    }
  }

  private recordPairingRequired(fromUserId: string, code: string): void {
    const createdAt = this.now()
    this.recordRuntimeMessage({
      id: `pairing-${fromUserId}-${createdAt}`,
      chatId: fromUserId,
      senderId: fromUserId,
      text: `待授权用户首次发来消息。配对码：${code}`,
      direction: 'inbound' as const,
      createdAt,
    })
  }

  private recordRuntimeMessage(
    nextMessage: WeixinConversation['messages'][number],
  ): void {
    const existing = this.runtime.conversations.find(
      conversation => conversation.chatId === nextMessage.chatId,
    )
    const updated: WeixinConversation = existing
      ? {
          ...existing,
          updatedAt: nextMessage.createdAt,
          messages: [...existing.messages, nextMessage].slice(
            -MAX_MESSAGES_PER_CHAT,
          ),
        }
      : {
          chatId: nextMessage.chatId,
          title: `微信 ${nextMessage.chatId}`,
          updatedAt: nextMessage.createdAt,
          messages: [nextMessage],
        }

    this.runtime = {
      ...this.runtime,
      conversations: [
        updated,
        ...this.runtime.conversations.filter(
          conversation => conversation.chatId !== nextMessage.chatId,
        ),
      ]
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, MAX_CONVERSATIONS),
    }
  }

  private deps(): Promise<WeixinRuntimeDeps> {
    this.loadingDeps ??= import('@claude-code-best/weixin').then(module => ({
      loadAccount: module.loadAccount,
      startPollLoop: module.startPollLoop,
      sendText: module.sendText,
      getContextToken: module.getContextToken,
      defaultBaseUrl: module.DEFAULT_BASE_URL,
      cdnBaseUrl: module.CDN_BASE_URL,
    }))
    return this.loadingDeps
  }
}
