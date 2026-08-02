import { describe, expect, test, mock, beforeEach } from 'bun:test'
import type { DesktopEvent, DesktopMessage, DesktopSession } from '../shared/protocol.js'
import type { ParsedMessage } from '@claude-code-best/weixin'

// ---- Mock @claude-code-best/weixin before the service loads it via deps() ----

interface CapturedPollParams {
  onMessage: (msg: ParsedMessage) => Promise<void>
  onPairingRequired: (pairing: { fromUserId: string; code: string }) => Promise<void>
  abortSignal: AbortSignal
}

let capturedPollParams: CapturedPollParams | null = null
const startPollLoopMock = mock(async (params: CapturedPollParams & Record<string, unknown>) => {
  capturedPollParams = params
  // Keep the loop "running" without doing anything; tests drive onMessage manually.
  return undefined
})
const sendTextMock = mock(async (_params: {
  to: string
  text: string
  baseUrl?: string
  token?: string
  contextToken?: string
}) => ({ messageId: 'mock-msg-id' }))
const loadAccountMock = mock(() => ({
  baseUrl: 'https://wx.example.com',
  token: 'mock-token',
  userId: 'self',
}))
const getContextTokenMock = mock(() => 'mock-context-token')

mock.module('@claude-code-best/weixin', () => ({
  startPollLoop: startPollLoopMock,
  sendText: sendTextMock,
  loadAccount: loadAccountMock,
  getContextToken: getContextTokenMock,
  DEFAULT_BASE_URL: 'https://wx.example.com',
  CDN_BASE_URL: 'https://cdn.example.com',
}))

const {
  DesktopWeixinChannelService,
  buildPrompt,
  collectReply,
} = await import('../core/weixin-channel-service.js')

// Reset mock call counts and captured params between tests.
beforeEach(() => {
  startPollLoopMock.mockClear()
  sendTextMock.mockClear()
  loadAccountMock.mockClear()
  getContextTokenMock.mockClear()
  capturedPollParams = null
})

// ---- Helpers ----

interface FakeControllerOptions {
  reply?: string
  submitBehavior?: 'ok' | 'alreadyGenerating' | 'fail'
}

interface FakeController {
  sessions: Map<string, DesktopSession>
  isBusy: () => boolean
  createSession: (cwd: string, title?: string) => DesktopSession
  getSession: (id: string) => DesktopSession | undefined
  submitPrompt: (id: string, text: string) => Promise<void>
  interrupt: (id: string) => boolean
  setBusy: (b: boolean) => void
}

function makeFakeController(opts: FakeControllerOptions = {}): FakeController {
  const sessions = new Map<string, DesktopSession>()
  let counter = 0
  let busy = false
  const replyText = opts.reply ?? '你好，我是 Claude'
  const interruptMock = mock(() => true)
  return {
    sessions,
    isBusy: () => busy,
    createSession: (cwd, title) => {
      counter += 1
      const id = `s${counter}`
      const session: DesktopSession = {
        id,
        title: title ?? 'New conversation',
        cwd,
        updatedAt: 100,
        model: 'sonnet',
        mode: 'default',
        messages: [],
        tools: [],
        turnUsageReports: [],
        generationState: 'idle',
        sequence: 0,
      }
      sessions.set(id, session)
      return session
    },
    getSession: id => sessions.get(id),
    submitPrompt: async (id, text) => {
      if (opts.submitBehavior === 'alreadyGenerating') {
        throw new Error('A desktop session is already generating')
      }
      if (opts.submitBehavior === 'fail') {
        throw new Error('boom')
      }
      busy = true
      const session = sessions.get(id)
      if (session) {
        session.messages.push({
          id: `${id}-u`,
          role: 'user',
          kind: 'text',
          content: text,
          createdAt: 100,
          displayOrder: session.messages.length + 1,
        })
        session.messages.push({
          id: `${id}-a`,
          role: 'assistant',
          kind: 'text',
          content: replyText,
          createdAt: 101,
          displayOrder: session.messages.length + 1,
        })
      }
      busy = false
    },
    interrupt: interruptMock,
    setBusy: b => {
      busy = b
    },
  }
}

function makeService(controller: FakeController) {
  const events: DesktopEvent[] = []
  const subscribers = new Set<(event: DesktopEvent) => void>()
  const service = new DesktopWeixinChannelService({
    emit: event => {
      events.push(event)
      for (const sub of subscribers) {
        try {
          sub(event)
        } catch {
          /* ignore */
        }
      }
    },
    subscribe: listener => {
      subscribers.add(listener)
      return () => {
        subscribers.delete(listener)
      }
    },
    getController: () => controller,
    cwd: 'G:/project',
    now: () => 200,
  })
  return { service, events, subscribers }
}

function makeInbound(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    fromUserId: 'wxid_userA',
    messageId: 'msg-1',
    text: '你好',
    ...overrides,
  }
}

// Allow pending microtasks/timers to flush.
function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 10))
}

// ---- Tests ----

describe('buildPrompt', () => {
  test('text only', () => {
    expect(buildPrompt(makeInbound({ text: '帮我写代码' }))).toBe('帮我写代码')
  })

  test('attachment only appends file path hint', () => {
    const prompt = buildPrompt(
      makeInbound({ text: '(media attachment)', attachmentPath: 'C:/tmp/img.jpg', attachmentType: 'image' }),
    )
    expect(prompt).toContain('用户通过微信发来image')
    expect(prompt).toContain('C:/tmp/img.jpg')
    expect(prompt).toContain('FileReadTool')
    expect(prompt).not.toContain('(media attachment)')
  })

  test('text + attachment combines both', () => {
    const prompt = buildPrompt(
      makeInbound({ text: '看这张图', attachmentPath: 'C:/tmp/img.jpg', attachmentType: 'image' }),
    )
    expect(prompt).toContain('看这张图')
    expect(prompt).toContain('C:/tmp/img.jpg')
  })

  test('empty message falls back to placeholder', () => {
    expect(buildPrompt(makeInbound({ text: '' }))).toBe('(空消息)')
  })
})

describe('collectReply', () => {
  function msg(role: DesktopMessage['role'], kind: DesktopMessage['kind'], content: string): DesktopMessage {
    return { id: `${role}-${kind}`, role, kind, content, createdAt: 100, displayOrder: 1 }
  }

  test('empty array returns empty string', () => {
    expect(collectReply([])).toBe('')
  })

  test('single assistant text', () => {
    expect(collectReply([msg('assistant', 'text', 'Hi')])).toBe('Hi')
  })

  test('multiple assistant text joined with blank line', () => {
    expect(
      collectReply([msg('assistant', 'text', 'A'), msg('assistant', 'text', 'B')]),
    ).toBe('A\n\nB')
  })

  test('filters out user / thinking / tool messages', () => {
    const messages = [
      msg('user', 'text', 'question'),
      msg('assistant', 'thinking', 'internal thought'),
      msg('assistant', 'text', 'final answer'),
    ]
    expect(collectReply(messages)).toBe('final answer')
  })
})

describe('DesktopWeixinChannelService bridge', () => {
  test('inbound message triggers Claude reply and pushes outbound to WeChat', async () => {
    const controller = makeFakeController()
    const { service } = makeService(controller)
    await service.start('req-1')
    expect(capturedPollParams).not.toBeNull()

    sendTextMock.mockClear()
    await capturedPollParams!.onMessage(makeInbound())
    await flush()

    // Inbound recorded
    const runtime = service.snapshot()
    const conv = runtime.conversations.find(c => c.chatId === 'wxid_userA')
    expect(conv).toBeDefined()
    expect(conv!.messages.some(m => m.direction === 'inbound')).toBe(true)
    // Outbound recorded
    expect(conv!.messages.some(m => m.direction === 'outbound')).toBe(true)
    // sendText called with the assistant reply
    expect(sendTextMock).toHaveBeenCalledTimes(1)
    const call = sendTextMock.mock.calls[0]?.[0] as { to: string; text: string } | undefined
    expect(call?.to).toBe('wxid_userA')
    expect(call?.text).toBe('你好，我是 Claude')
  })

  test('same chatId reuses one desktop session across messages', async () => {
    const controller = makeFakeController()
    const { service } = makeService(controller)
    await service.start('req-1')

    await capturedPollParams!.onMessage(makeInbound({ messageId: 'm1' }))
    await flush()
    await capturedPollParams!.onMessage(makeInbound({ messageId: 'm2' }))
    await flush()

    // Two distinct WeChat users would create two sessions; here same user reuses one.
    expect(controller.sessions.size).toBe(1)
    const session = [...controller.sessions.values()][0]
    expect(session?.title).toBe('微信 wxid_userA')
    // Both user prompts landed in the same session's messages.
    expect(session?.messages.filter(m => m.role === 'user')).toHaveLength(2)
  })

  test('queues second message while controller is busy, drains on idle', async () => {
    const controller = makeFakeController()
    const { service, subscribers } = makeService(controller)
    await service.start('req-1')

    // Make controller report busy; first onMessage will enqueue but not run.
    controller.setBusy(true)

    await capturedPollParams!.onMessage(makeInbound({ messageId: 'm1', text: 'first' }))
    // No submit happened yet.
    expect(controller.sessions.size).toBe(0)

    // Release: simulate generation.state=idle event fanning out to subscribers.
    controller.setBusy(false)
    for (const sub of subscribers) {
      sub({ type: 'generation.state', sessionId: 'irrelevant', sequence: 1, state: 'idle' } as DesktopEvent)
    }
    await flush()

    // Now the queued message should have been processed.
    expect(controller.sessions.size).toBe(1)
    expect(sendTextMock).toHaveBeenCalledTimes(1)
  })

  test('two different chatIds are processed sequentially', async () => {
    const controller = makeFakeController()
    const { service } = makeService(controller)
    await service.start('req-1')

    // Fire two messages from different users back-to-back.
    await capturedPollParams!.onMessage(makeInbound({ fromUserId: 'userA', messageId: 'a1' }))
    await capturedPollParams!.onMessage(makeInbound({ fromUserId: 'userB', messageId: 'b1' }))
    await flush()

    // Both should eventually be processed (serially).
    expect(sendTextMock).toHaveBeenCalledTimes(2)
    const calls = sendTextMock.mock.calls.map(c => (c[0] as { to: string }).to).sort()
    expect(calls).toEqual(['userA', 'userB'])
    expect(controller.sessions.size).toBe(2)
  })

  test('submitPrompt already-generating is retried then succeeds', async () => {
    let attempt = 0
    const controller = makeFakeController()
    controller.submitPrompt = async (id, text) => {
      attempt += 1
      if (attempt === 1) throw new Error('A desktop session is already generating')
      controller.sessions.get(id)?.messages.push(
        { id: `${id}-u`, role: 'user', kind: 'text', content: text, createdAt: 100, displayOrder: 1 },
        { id: `${id}-a`, role: 'assistant', kind: 'text', content: 'retry-ok', createdAt: 101, displayOrder: 2 },
      )
    }
    const { service, subscribers } = makeService(controller)
    await service.start('req-1')

    await capturedPollParams!.onMessage(makeInbound())
    await flush()
    // First attempt failed with already-generating; message re-enqueued. Trigger drain.
    for (const sub of subscribers) {
      sub({ type: 'generation.state', sessionId: 'x', sequence: 1, state: 'idle' } as DesktopEvent)
    }
    await flush()

    expect(attempt).toBe(2)
    expect(sendTextMock).toHaveBeenCalledTimes(1)
    expect((sendTextMock.mock.calls[0]?.[0] as { text: string }).text).toBe('retry-ok')
  })

  test('sendText failure records an error-tagged outbound without throwing', async () => {
    const controller = makeFakeController()
    const { service } = makeService(controller)
    await service.start('req-1')

    sendTextMock.mockImplementationOnce(async () => {
      throw new Error('network down')
    })

    await capturedPollParams!.onMessage(makeInbound())
    await flush()

    const conv = service.snapshot().conversations.find(c => c.chatId === 'wxid_userA')
    const outbound = conv?.messages.find(m => m.direction === 'outbound')
    expect(outbound).toBeDefined()
    expect(outbound!.text).toContain('发送失败')
  })

  test('stop() clears queue and stops runtime without throwing', async () => {
    const controller = makeFakeController()
    const { service } = makeService(controller)
    await service.start('req-1')

    // Put a message in flight while controller is busy (so it queues, never runs).
    controller.setBusy(true)
    await capturedPollParams!.onMessage(makeInbound())
    // Now stop before it can run.
    expect(() => service.stop()).not.toThrow()

    // Queue cleared, runtime stopped.
    expect(service.snapshot().status).toBe('stopped')
    expect(service.snapshot().running).toBe(false)
    // No outbound was produced because the queued message never ran.
    expect(sendTextMock).not.toHaveBeenCalled()
  })
})
