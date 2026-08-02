import type {
  DesktopChannelWeixinRuntime,
  DesktopEvent,
} from '../shared/protocol.js'
import type { ParsedMessage } from '@claude-code-best/weixin'

type Emit = (event: DesktopEvent) => void

type StartPollLoop = typeof import('@claude-code-best/weixin')['startPollLoop']
type LoadAccount = typeof import('@claude-code-best/weixin')['loadAccount']

type WeixinRuntimeDeps = {
  loadAccount: LoadAccount
  startPollLoop: StartPollLoop
  defaultBaseUrl: string
  cdnBaseUrl: string
}

type WeixinConversation = DesktopChannelWeixinRuntime['conversations'][number]

const MAX_MESSAGES_PER_CHAT = 80
const MAX_CONVERSATIONS = 30

function messageId(msg: ParsedMessage, createdAt: number): string {
  return msg.messageId || `${msg.fromUserId}-${createdAt}`
}

export class DesktopWeixinChannelService {
  private runtime: DesktopChannelWeixinRuntime = {
    running: false,
    status: 'stopped',
    conversations: [],
  }
  private controller: AbortController | null = null
  private loadingDeps: Promise<WeixinRuntimeDeps> | null = null

  constructor(
    private readonly emit: Emit,
    private readonly now: () => number = () => Date.now(),
  ) {}

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
    this.emit({
      type: 'channel.weixin.runtime',
      requestId,
      runtime: this.snapshot(),
    })
  }

  async start(requestId: string): Promise<DesktopChannelWeixinRuntime> {
    if (this.controller && !this.controller.signal.aborted) {
      this.runtime = {
        ...this.runtime,
        running: true,
        status: 'running',
        message: '微信消息接收中',
      }
      this.emitSnapshot(requestId)
      return this.snapshot()
    }

    this.runtime = {
      ...this.runtime,
      running: false,
      status: 'starting',
      message: '正在启动微信消息接收',
    }
    this.emitSnapshot(requestId)

    const deps = await this.deps()
    const account = deps.loadAccount()
    if (!account) {
      this.runtime = {
        ...this.runtime,
        running: false,
        status: 'failed',
        message: '微信尚未登录，请先扫码登录',
      }
      this.emitSnapshot(requestId)
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
    this.emitSnapshot(requestId)

    void deps.startPollLoop({
      baseUrl: account.baseUrl || deps.defaultBaseUrl,
      cdnBaseUrl: deps.cdnBaseUrl,
      token: account.token,
      abortSignal: controller.signal,
      onMessage: async msg => {
        this.recordInbound(msg)
        this.emitSnapshot(requestId)
      },
      onPairingRequired: async pairing => {
        this.recordPairingRequired(pairing.fromUserId, pairing.code)
        this.emitSnapshot(requestId)
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
      this.emitSnapshot(requestId)
    })

    return this.snapshot()
  }

  stop(message = '微信消息接收已停止'): DesktopChannelWeixinRuntime {
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
      defaultBaseUrl: module.DEFAULT_BASE_URL,
      cdnBaseUrl: module.CDN_BASE_URL,
    }))
    return this.loadingDeps
  }
}
