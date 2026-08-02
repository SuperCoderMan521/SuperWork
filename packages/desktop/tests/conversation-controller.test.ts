import { describe, expect, test } from 'bun:test'
import { DesktopConversationController } from '../core/conversation-controller.js'
import type { DesktopEvent } from '../shared/protocol.js'

async function* completedQuery(): AsyncGenerator<unknown> {
  yield { type: 'stream_request_start' }
  yield {
    type: 'assistant',
    uuid: 'assistant-1',
    message: { content: [{ type: 'text', text: 'Hello' }] },
  }
}

describe('DesktopConversationController', () => {
  test('creates a session and streams a query to desktop events', async () => {
    const events: DesktopEvent[] = []
    const controller = new DesktopConversationController({
      runQuery: () => completedQuery(),
      emit: event => events.push(event),
      createId: () => 'session-1',
      now: () => 100,
      defaultModel: 'sonnet',
      defaultMode: 'default',
    })

    const session = controller.createSession('G:/project')
    await controller.submitPrompt(session.id, 'Hi')

    expect(events.map(event => event.type)).toEqual([
      'session.snapshot',
      'session.snapshot',
      'message.added',
      'generation.state',
      'message.added',
      'turn.usage.completed',
      'generation.state',
    ])
    expect(controller.getSession(session.id)?.generationState).toBe('idle')
  })

  test('derives the session title from the first user prompt', async () => {
    const events: DesktopEvent[] = []
    const controller = new DesktopConversationController({
      runQuery: () => completedQuery(),
      emit: event => events.push(event),
      createId: () => 'session-1',
      now: () => 100,
      defaultModel: 'sonnet',
      defaultMode: 'default',
    })

    const session = controller.createSession('G:/project')
    expect(session.title).toBe('New conversation')

    await controller.submitPrompt(session.id, 'Help me refactor the auth module')

    expect(controller.getSession(session.id)?.title).toBe('Help me refactor the auth module')

    const titleSnapshot = events.find(
      event =>
        event.type === 'session.snapshot' &&
        event.session.title !== 'New conversation',
    )
    expect(titleSnapshot?.type).toBe('session.snapshot')
  })

  test('truncates long prompts and collapses whitespace in the derived title', async () => {
    const controller = new DesktopConversationController({
      runQuery: () => completedQuery(),
      emit: () => {},
      createId: () => 'session-1',
      now: () => 100,
      defaultModel: 'sonnet',
      defaultMode: 'default',
    })

    const session = controller.createSession('G:/project')
    const longPrompt = `Please review this code\n\n${'a'.repeat(80)}`
    await controller.submitPrompt(session.id, longPrompt)

    const title = controller.getSession(session.id)?.title ?? ''
    expect(title).toMatch(/…$/)
    expect(title).not.toContain('\n')
    expect(title.length).toBeLessThanOrEqual(49)
  })

  test('does not overwrite a non-default title on subsequent prompts', async () => {
    let queryCount = 0
    const controller = new DesktopConversationController({
      runQuery: () => {
        queryCount += 1
        return completedQuery()
      },
      emit: () => {},
      createId: () => 'session-1',
      now: () => 100,
      defaultModel: 'sonnet',
      defaultMode: 'default',
    })

    const session = controller.createSession('G:/project')
    await controller.submitPrompt(session.id, 'First prompt')
    await controller.submitPrompt(session.id, 'Second prompt that should not replace the title')

    expect(controller.getSession(session.id)?.title).toBe('First prompt')
    expect(queryCount).toBe(2)
  })

  test('keeps only one stored assistant message when streaming finalizes a placeholder', async () => {
    async function* streamingThenFinalQuery(): AsyncGenerator<unknown> {
      yield {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Hel' },
        },
      }
      yield {
        type: 'assistant',
        uuid: 'assistant-1',
        message: { content: [{ type: 'text', text: 'Hello' }] },
      }
    }
    const controller = new DesktopConversationController({
      runQuery: () => streamingThenFinalQuery(),
      emit: () => {},
      createId: () => 'session-1',
      now: () => 100,
      defaultModel: 'sonnet',
      defaultMode: 'default',
    })

    const session = controller.createSession('G:/project')
    await controller.submitPrompt(session.id, 'Hi')

    const assistantMessages = controller
      .getSession(session.id)
      ?.messages.filter(message => message.role === 'assistant')
    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages?.[0]?.id).toMatch(/^streaming-assistant-\d+-\d+$/)
    expect(assistantMessages?.[0]?.content).toBe('Hello')
  })

  test('keeps streaming message ids unique across sequential prompts', async () => {
    let queryCount = 0
    const events: DesktopEvent[] = []
    const controller = new DesktopConversationController({
      runQuery: () => {
        queryCount += 1
        const responseNumber = queryCount
        const content = responseNumber === 1 ? 'First answer' : 'Second answer'
        return (async function* (): AsyncGenerator<unknown> {
          yield {
            type: 'stream_event',
            event: {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: content },
            },
          }
          yield {
            type: 'assistant',
            uuid: `assistant-${responseNumber}`,
            message: { content: [{ type: 'text', text: content }] },
          }
        })()
      },
      emit: event => events.push(event),
      createId: () => 'session-1',
      now: () => 100,
      defaultModel: 'sonnet',
      defaultMode: 'default',
    })

    const session = controller.createSession('G:/project')
    await controller.submitPrompt(session.id, 'First prompt')
    await controller.submitPrompt(session.id, 'Second prompt')

    const deltaIds = events
      .filter(event => event.type === 'message.delta')
      .map(event => event.messageId)
    expect(new Set(deltaIds).size).toBe(2)
    const assistantIds = controller.getSession(session.id)?.messages
      .filter(message => message.role === 'assistant')
      .map(message => message.id)
    expect(new Set(assistantIds).size).toBe(2)
  })

  test('rejects a second prompt while generation is active', async () => {
    let release: (() => void) | undefined
    async function* blockedQuery(): AsyncGenerator<unknown> {
      await new Promise<void>(resolve => {
        release = resolve
      })
    }
    const controller = new DesktopConversationController({
      runQuery: () => blockedQuery(),
      emit: () => {},
      createId: () => 'session-1',
      defaultModel: 'sonnet',
      defaultMode: 'default',
    })
    const session = controller.createSession('G:/project')
    const first = controller.submitPrompt(session.id, 'first')

    await expect(controller.submitPrompt(session.id, 'second')).rejects.toThrow(
      'already generating',
    )
    release?.()
    await first
  })

  test('interrupt is idempotent and aborts the active query', async () => {
    let signal: AbortSignal | undefined
    async function* blockedQuery(input: { signal: AbortSignal }): AsyncGenerator<unknown> {
      signal = input.signal
      await new Promise<void>(resolve =>
        input.signal.addEventListener('abort', () => resolve(), { once: true }),
      )
    }
    const controller = new DesktopConversationController({
      runQuery: blockedQuery,
      emit: () => {},
      createId: () => 'session-1',
      defaultModel: 'sonnet',
      defaultMode: 'default',
    })
    const session = controller.createSession('G:/project')
    const pending = controller.submitPrompt(session.id, 'wait')

    expect(controller.interrupt(session.id)).toBe(true)
    expect(controller.interrupt(session.id)).toBe(false)
    expect(signal?.aborted).toBe(true)
    await pending
  })

  test('returns to idle when the query throws after an interruption', async () => {
    async function* abortedQuery(input: { signal: AbortSignal }): AsyncGenerator<unknown> {
      await new Promise<void>(resolve => input.signal.addEventListener('abort', () => resolve(), { once: true }))
      throw new DOMException('aborted', 'AbortError')
    }
    const events: DesktopEvent[] = []
    const controller = new DesktopConversationController({ runQuery: abortedQuery, emit: event => events.push(event), createId: () => 'session-1', defaultModel: 'sonnet', defaultMode: 'default' })
    const session = controller.createSession('G:/project')
    const pending = controller.submitPrompt(session.id, 'wait')
    controller.interrupt(session.id)
    await expect(pending).resolves.toBeUndefined()
    expect(controller.getSession(session.id)?.generationState).toBe('idle')
    expect(events.at(-1)).toMatchObject({ type: 'generation.state', state: 'idle' })
  })

  test('returns to idle when interrupted while the query iterator is stalled', async () => {
    async function* stalledQuery(): AsyncGenerator<unknown> {
      await new Promise(() => {})
    }
    const events: DesktopEvent[] = []
    const controller = new DesktopConversationController({
      runQuery: stalledQuery,
      emit: event => events.push(event),
      createId: () => 'session-1',
      defaultModel: 'sonnet',
      defaultMode: 'default',
      firstEventTimeoutMs: 10_000,
    })
    const session = controller.createSession('G:/project')
    const pending = controller.submitPrompt(session.id, 'wait')

    expect(controller.interrupt(session.id)).toBe(true)
    await expect(
      Promise.race([
        pending.then(() => 'resolved'),
        new Promise(resolve => setTimeout(() => resolve('still pending'), 20)),
      ]),
    ).resolves.toBe('resolved')
    expect(controller.getSession(session.id)?.generationState).toBe('idle')
    expect(events.at(-1)).toMatchObject({ type: 'generation.state', state: 'idle' })
  })

  test('fails visibly when the query produces no first event before the timeout', async () => {
    async function* stalledQuery(): AsyncGenerator<unknown> {
      await new Promise(() => {})
    }
    const controller = new DesktopConversationController({
      runQuery: stalledQuery,
      emit: () => {},
      createId: () => 'session-1',
      defaultModel: 'sonnet',
      defaultMode: 'default',
      firstEventTimeoutMs: 1,
    })
    const session = controller.createSession('G:/project')

    await expect(controller.submitPrompt(session.id, 'hello')).rejects.toThrow(
      'Timed out waiting for the model to start responding',
    )
    expect(controller.getSession(session.id)?.generationState).toBe('failed')
  })

  test('restores a persisted session snapshot', () => {
    const events: DesktopEvent[] = []
    const controller = new DesktopConversationController({
      runQuery: () => completedQuery(),
      emit: event => events.push(event),
      defaultModel: 'sonnet',
      defaultMode: 'default',
    })

    controller.restoreSession({
      id: 'session-1',
      title: 'History',
      cwd: 'G:/project',
      updatedAt: 100,
      model: 'sonnet',
      mode: 'default',
      messages: [],
      tools: [],
      generationState: 'idle',
      sequence: 7,
    })

    expect(controller.getSession('session-1')?.title).toBe('History')
    expect(events[0]?.type).toBe('session.snapshot')
  })
})
