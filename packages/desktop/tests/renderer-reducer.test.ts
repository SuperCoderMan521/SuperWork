import { describe, expect, test } from 'bun:test'
import {
  createDesktopState,
  desktopReducer,
} from '../renderer/src/app/reducer.js'

describe('desktopReducer', () => {
  test('adds streaming text without rebuilding existing messages', () => {
    const state = createDesktopState()
    const next = desktopReducer(state, {
      type: 'message.delta',
      sessionId: 'session-1',
      sequence: 1,
      messageId: 'assistant-1',
      delta: 'Hello',
    })
    const final = desktopReducer(next, {
      type: 'message.delta',
      sessionId: 'session-1',
      sequence: 2,
      messageId: 'assistant-1',
      delta: ' world',
    })

    expect(final.sessions['session-1']?.messages['assistant-1']?.content).toBe(
      'Hello world',
    )
  })

  test('preserves the original display order when a streamed assistant message is finalized', () => {
    const state = createDesktopState()
    const streamed = desktopReducer(state, {
      type: 'message.delta',
      sessionId: 'session-1',
      sequence: 1,
      messageId: 'streaming-assistant',
      delta: 'answer',
    })
    const withTool = desktopReducer(streamed, {
      type: 'tool.updated',
      sessionId: 'session-1',
      sequence: 2,
      tool: {
        id: 'tool-1',
        name: 'Read',
        state: 'running',
        summary: 'README.md',
        displayOrder: 2,
      },
    })
    const finalized = desktopReducer(withTool, {
      type: 'message.added',
      sessionId: 'session-1',
      sequence: 3,
      message: {
        id: 'streaming-assistant',
        role: 'assistant',
        kind: 'text',
        content: 'answer',
        createdAt: 3,
        displayOrder: 3,
      },
    })

    expect(
      finalized.sessions['session-1']?.messages['streaming-assistant']?.displayOrder,
    ).toBe(1)
  })

  test('uses reserved display order from streaming deltas before finalizing text', () => {
    const state = createDesktopState()
    const streamed = desktopReducer(state, {
      type: 'message.delta',
      sessionId: 'session-1',
      sequence: 1,
      messageId: 'streaming-assistant-1',
      delta: 'answer',
      displayOrder: 2,
    })
    const thinking = desktopReducer(streamed, {
      type: 'message.added',
      sessionId: 'session-1',
      sequence: 2,
      message: {
        id: 'message-1-0',
        role: 'assistant',
        kind: 'thinking',
        content: 'reasoning',
        createdAt: 2,
        displayOrder: 1,
      },
    })
    const finalized = desktopReducer(thinking, {
      type: 'message.added',
      sessionId: 'session-1',
      sequence: 3,
      message: {
        id: 'streaming-assistant-1',
        role: 'assistant',
        kind: 'text',
        content: 'answer',
        createdAt: 3,
        displayOrder: 2,
      },
    })

    const session = finalized.sessions['session-1']!
    expect(session.messages['message-1-0']?.displayOrder).toBe(1)
    expect(session.messages['streaming-assistant-1']?.displayOrder).toBe(2)
  })

  test('lets final assistant block order move a provisional streamed answer after thinking', () => {
    const state = createDesktopState()
    const streamed = desktopReducer(state, {
      type: 'message.delta',
      sessionId: 'session-1',
      sequence: 1,
      messageId: 'streaming-assistant',
      delta: 'answer',
    })
    const finalized = desktopReducer(streamed, {
      type: 'message.added',
      sessionId: 'session-1',
      sequence: 2,
      message: {
        id: 'streaming-assistant',
        role: 'assistant',
        kind: 'text',
        content: 'answer',
        createdAt: 2,
        displayOrder: 3,
        displayOrderProvisional: false,
      },
    })

    expect(finalized.sessions['session-1']?.messages['streaming-assistant']?.displayOrder).toBe(3)
  })

  test('merges consecutive thinking messages instead of appending many collapsed cards', () => {
    const first = desktopReducer(createDesktopState(), {
      type: 'message.added',
      sessionId: 'session-1',
      sequence: 1,
      message: {
        id: 'thinking-1',
        role: 'assistant',
        kind: 'thinking',
        content: 'First thought.',
        createdAt: 1,
        displayOrder: 1,
      },
    })
    const second = desktopReducer(first, {
      type: 'message.added',
      sessionId: 'session-1',
      sequence: 2,
      message: {
        id: 'thinking-2',
        role: 'assistant',
        kind: 'thinking',
        content: 'Second thought.',
        createdAt: 2,
        displayOrder: 2,
      },
    })

    const session = second.sessions['session-1']!
    expect(session.messageOrder).toEqual(['thinking-1'])
    expect(session.messages['thinking-1']?.content).toBe('First thought.\n\nSecond thought.')
    expect(session.messages['thinking-2']).toBeUndefined()
  })

  test('keeps one assistant answer when duplicate ids arrive in the same user turn', () => {
    const user = desktopReducer(createDesktopState(), {
      type: 'message.added',
      sessionId: 'session-1',
      sequence: 1,
      message: {
        id: 'user-1',
        role: 'user',
        content: '你好',
        createdAt: 1,
        displayOrder: 1,
      },
    })
    const first = desktopReducer(user, {
      type: 'message.added',
      sessionId: 'session-1',
      sequence: 2,
      message: {
        id: 'assistant-1',
        role: 'assistant',
        kind: 'text',
        content: '你好！有什么我可以帮你的吗？',
        createdAt: 2,
        displayOrder: 2,
      },
    })
    const duplicate = desktopReducer(first, {
      type: 'message.added',
      sessionId: 'session-1',
      sequence: 3,
      message: {
        id: 'assistant-2',
        role: 'assistant',
        kind: 'text',
        content: '你好！  有什么我可以帮你的吗？',
        createdAt: 3,
        displayOrder: 3,
      },
    })

    const session = duplicate.sessions['session-1']!
    expect(session.messageOrder).toEqual(['user-1', 'assistant-1'])
    expect(session.messages['assistant-1']).toMatchObject({
      content: '你好！  有什么我可以帮你的吗？',
      displayOrder: 3,
    })
    expect(session.messages['assistant-2']).toBeUndefined()
  })

  test('allows the same assistant answer in separate user turns', () => {
    const events = [
      {
        type: 'message.added' as const,
        sessionId: 'session-1',
        sequence: 1,
        message: { id: 'user-1', role: 'user' as const, content: '你好', createdAt: 1 },
      },
      {
        type: 'message.added' as const,
        sessionId: 'session-1',
        sequence: 2,
        message: { id: 'assistant-1', role: 'assistant' as const, content: '你好！', createdAt: 2 },
      },
      {
        type: 'message.added' as const,
        sessionId: 'session-1',
        sequence: 3,
        message: { id: 'user-2', role: 'user' as const, content: '再说一次', createdAt: 3 },
      },
      {
        type: 'message.added' as const,
        sessionId: 'session-1',
        sequence: 4,
        message: { id: 'assistant-2', role: 'assistant' as const, content: '你好！', createdAt: 4 },
      },
    ]
    const state = events.reduce(desktopReducer, createDesktopState())

    expect(state.sessions['session-1']?.messageOrder).toEqual([
      'user-1',
      'assistant-1',
      'user-2',
      'assistant-2',
    ])
  })

  test('marks a session for resync when sequence has a gap', () => {
    const state = createDesktopState()
    const next = desktopReducer(state, {
      type: 'generation.state',
      sessionId: 'session-1',
      sequence: 3,
      state: 'running',
    })

    expect(next.sessions['session-1']?.needsSnapshot).toBe(true)
  })

  test('replaces session state from a snapshot', () => {
    const state = createDesktopState()
    const next = desktopReducer(state, {
      type: 'session.snapshot',
      sessionId: 'session-1',
      sequence: 4,
      session: {
        id: 'session-1',
        title: 'Conversation',
        cwd: 'G:/project',
        updatedAt: 100,
        model: 'sonnet',
        mode: 'default',
        messages: [],
        tools: [],
        generationState: 'idle',
        sequence: 4,
      },
    })

    expect(next.sessions['session-1']?.needsSnapshot).toBe(false)
    expect(next.sessions['session-1']?.model).toBe('sonnet')
  })

  test('deduplicates messages with the same id when restoring a snapshot', () => {
    const next = desktopReducer(createDesktopState(), {
      type: 'session.snapshot',
      sessionId: 'session-1',
      sequence: 4,
      session: {
        id: 'session-1',
        title: 'Conversation',
        cwd: 'G:/project',
        updatedAt: 100,
        model: 'sonnet',
        mode: 'default',
        messages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            content: 'partial answer',
            createdAt: 100,
          },
          {
            id: 'assistant-1',
            role: 'assistant',
            content: 'final answer',
            createdAt: 200,
          },
        ],
        tools: [],
        generationState: 'idle',
        sequence: 4,
      },
    })

    expect(next.sessions['session-1']?.messageOrder).toEqual(['assistant-1'])
    expect(next.sessions['session-1']?.messages['assistant-1']?.content).toBe('final answer')
  })

  test('deduplicates same-turn assistant answers with different ids in a snapshot', () => {
    const next = desktopReducer(createDesktopState(), {
      type: 'session.snapshot',
      sessionId: 'session-1',
      sequence: 4,
      session: {
        id: 'session-1',
        title: 'Conversation',
        cwd: 'G:/project',
        updatedAt: 100,
        model: 'sonnet',
        mode: 'default',
        messages: [
          { id: 'user-1', role: 'user', content: '你好', createdAt: 1 },
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '你好！有什么我可以帮你的吗？',
            createdAt: 2,
            displayOrder: 2,
          },
          {
            id: 'assistant-2',
            role: 'assistant',
            content: '你好！  有什么我可以帮你的吗？',
            createdAt: 3,
            displayOrder: 3,
          },
        ],
        tools: [],
        generationState: 'idle',
        sequence: 4,
      },
    })

    const session = next.sessions['session-1']!
    expect(session.messageOrder).toEqual(['user-1', 'assistant-1'])
    expect(session.messages['assistant-1']).toMatchObject({
      content: '你好！  有什么我可以帮你的吗？',
      displayOrder: 3,
    })
    expect(session.messages['assistant-2']).toBeUndefined()
  })

  test('backfills display order for restored messages without moving new streamed output before history', () => {
    const state = desktopReducer(createDesktopState(), {
      type: 'session.snapshot',
      sessionId: 'session-1',
      sequence: 8,
      session: {
        id: 'session-1',
        title: 'Conversation',
        cwd: 'G:/project',
        updatedAt: 100,
        model: 'sonnet',
        mode: 'default',
        messages: [
          {
            id: 'old-user',
            role: 'user',
            content: 'old question',
            createdAt: 100,
          },
          {
            id: 'old-assistant',
            role: 'assistant',
            content: 'old answer',
            createdAt: 200,
          },
        ],
        tools: [],
        generationState: 'idle',
        sequence: 8,
      },
    })

    const streaming = desktopReducer(state, {
      type: 'message.delta',
      sessionId: 'session-1',
      sequence: 9,
      messageId: 'streaming-assistant',
      delta: 'new answer',
    })

    const session = streaming.sessions['session-1']
    expect(session?.messages['old-user']?.displayOrder).toBe(1)
    expect(session?.messages['old-assistant']?.displayOrder).toBe(2)
    expect(
      session?.messages['streaming-assistant']?.displayOrder,
    ).toBeGreaterThan(session?.messages['old-assistant']?.displayOrder ?? 0)
  })

  test('removes a permission when its tool reaches a terminal state', () => {
    const state = createDesktopState()
    const requested = desktopReducer(state, {
      type: 'permission.requested',
      sessionId: 'session-1',
      sequence: 1,
      request: {
        id: 'permission-1',
        toolCallId: 'tool-1',
        toolName: 'Read',
        summary: 'file',
        input: {},
        decisions: ['deny', 'allow_once'],
      },
    })
    const completed = desktopReducer(requested, {
      type: 'tool.updated',
      sessionId: 'session-1',
      sequence: 2,
      tool: { id: 'tool-1', name: 'Read', state: 'success', summary: 'file' },
    })

    expect(completed.sessions['session-1']?.permissionOrder).toEqual([])
  })

  test('marks the source session failed when a command fails', () => {
    const state = desktopReducer(createDesktopState(), {
      type: 'session.snapshot',
      sessionId: 'session-1',
      sequence: 1,
      session: {
        id: 'session-1',
        title: 'Conversation',
        cwd: 'G:/project',
        updatedAt: 100,
        model: 'sonnet',
        mode: 'default',
        messages: [],
        tools: [],
        generationState: 'running',
        sequence: 1,
      },
    })

    const failed = desktopReducer(state, {
      type: 'command.failed',
      requestId: 'request-1',
      sessionId: 'session-1',
      error: {
        code: 'QUERY_FAILED',
        message: 'network stalled',
        recoverable: true,
      },
    })

    expect(failed.sessions['session-1']?.generationState).toBe('failed')
    expect(failed.lastError).toBe('network stalled')
  })

  test('clears the last error when the renderer dismisses it', () => {
    const failed = desktopReducer(createDesktopState(), {
      type: 'command.failed',
      requestId: 'request-1',
      sessionId: 'session-1',
      error: {
        code: 'QUERY_FAILED',
        message: 'network stalled',
        recoverable: true,
      },
    })

    const cleared = desktopReducer(failed, {
      type: 'renderer.clearError',
    })

    expect(cleared.lastError).toBeNull()
  })

  test('allows the renderer to show an immediate interrupting state', () => {
    const state = desktopReducer(createDesktopState(), {
      type: 'session.snapshot',
      sessionId: 'session-1',
      sequence: 1,
      session: {
        id: 'session-1',
        title: 'Conversation',
        cwd: 'G:/project',
        updatedAt: 100,
        model: 'sonnet',
        mode: 'default',
        messages: [],
        tools: [],
        generationState: 'running',
        sequence: 1,
      },
    })

    const interrupted = desktopReducer(state, {
      type: 'renderer.localGenerationState',
      sessionId: 'session-1',
      state: 'interrupting',
    })

    expect(interrupted.sessions['session-1']?.generationState).toBe('interrupting')
  })

  test('returns to idle when an interrupt arrives after the core generation already ended', () => {
    const state = desktopReducer(createDesktopState(), {
      type: 'session.snapshot',
      sessionId: 'session-1',
      sequence: 1,
      session: {
        id: 'session-1',
        title: 'Conversation',
        cwd: 'G:/project',
        updatedAt: 100,
        model: 'sonnet',
        mode: 'default',
        messages: [],
        tools: [],
        generationState: 'interrupting',
        sequence: 1,
      },
    })

    const next = desktopReducer(state, {
      type: 'command.failed',
      requestId: 'request-1',
      sessionId: 'session-1',
      error: {
        code: 'QUERY_FAILED',
        message: 'No active generation to interrupt',
        recoverable: true,
      },
    })

    expect(next.sessions['session-1']?.generationState).toBe('idle')
    expect(next.lastError).toBeNull()
  })
})
