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
