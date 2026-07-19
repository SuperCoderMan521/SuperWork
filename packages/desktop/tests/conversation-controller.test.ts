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
      'message.added',
      'generation.state',
      'message.added',
      'turn.usage.completed',
      'generation.state',
    ])
    expect(controller.getSession(session.id)?.generationState).toBe('idle')
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
