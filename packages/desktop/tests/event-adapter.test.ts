import { describe, expect, test } from 'bun:test'
import { DesktopEventAdapter } from '../core/event-adapter.js'

describe('DesktopEventAdapter', () => {
  test('emits one priced usage report for multiple model calls', () => {
    let now = 100
    const adapter = new DesktopEventAdapter('session-1', () => now, 0, false, {
      provider: 'anthropic',
      model: 'sonnet',
      pricing: {
        currency: 'USD',
        perMillionInputTokens: 3,
        perMillionOutputTokens: 15,
        perMillionCacheCreationTokens: 3.75,
        perMillionCacheReadTokens: 0.3,
      },
    }, 0)
    const stream = (event: unknown) => adapter.consume({ type: 'stream_event', event })
    stream({ type: 'message_start', message: { usage: { input_tokens: 100, cache_read_input_tokens: 900 } } })
    stream({ type: 'message_delta', usage: { output_tokens: 50 }, delta: {} })
    stream({ type: 'message_stop' })
    stream({ type: 'message_start', message: { usage: { input_tokens: 20, cache_creation_input_tokens: 200 } } })
    stream({ type: 'message_delta', usage: { output_tokens: 10 }, delta: {} })
    stream({ type: 'message_stop' })
    now = 1200

    const reportEvent = adapter.consume({ type: 'result', result: '' }).find(event => event.type === 'turn.usage.completed')
    expect(reportEvent).toMatchObject({
      type: 'turn.usage.completed',
      report: {
        provider: 'anthropic',
        model: 'sonnet',
        apiCalls: 2,
        durationMs: 1200,
        usage: {
          inputTokens: 120,
          outputTokens: 60,
          cacheCreationInputTokens: 200,
          cacheReadInputTokens: 900,
        },
      },
    })
    if (reportEvent?.type !== 'turn.usage.completed') throw new Error('missing usage report')
    expect(reportEvent.report.costUsd).toBeGreaterThan(0)
  })

  test('keeps partial usage when a turn is interrupted before message_stop', () => {
    let now = 1_000
    const adapter = new DesktopEventAdapter('session-1', () => now)
    const stream = (event: unknown) => ({ type: 'stream_event', event })
    adapter.consume(stream({
      type: 'message_start',
      message: { usage: { input_tokens: 25, cache_read_input_tokens: 75 } },
    }))
    adapter.consume(stream({ type: 'message_delta', usage: { output_tokens: 10 }, delta: {} }))
    now = 2_000

    const [event] = adapter.complete('interrupted')
    expect(event?.type).toBe('turn.usage.completed')
    if (event?.type !== 'turn.usage.completed') throw new Error('missing usage report')
    expect(event.report.status).toBe('interrupted')
    expect(event.report.apiCalls).toBe(1)
    expect(event.report.usage).toEqual({
      inputTokens: 25,
      outputTokens: 10,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 75,
    })
  })
  test('converts streaming text into sequenced desktop events', () => {
    const adapter = new DesktopEventAdapter('session-1', () => 100)

    expect(adapter.consume({ type: 'stream_request_start' })).toEqual([
      {
        type: 'generation.state',
        sessionId: 'session-1',
        sequence: 1,
        state: 'running',
      },
    ])
    expect(
      adapter.consume({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } },
      }),
    ).toEqual([
      {
        type: 'message.delta',
        sessionId: 'session-1',
        sequence: 2,
        messageId: 'streaming-assistant',
        delta: 'Hi',
      },
    ])
  })

  test('converts a completed assistant message', () => {
    const adapter = new DesktopEventAdapter('session-1', () => 100)
    expect(
      adapter.consume({
        type: 'assistant',
        uuid: 'message-1',
        message: { content: [{ type: 'text', text: 'Done' }] },
      }),
    ).toEqual([
      {
        type: 'message.added',
        sessionId: 'session-1',
        sequence: 1,
        message: {
          id: 'message-1',
          role: 'assistant',
          kind: 'text',
          content: 'Done',
          createdAt: 100,
          displayOrder: 1,
        },
      },
    ])
  })

  test('finalizes the streaming placeholder instead of adding a duplicate', () => {
    const adapter = new DesktopEventAdapter('session-1', () => 100)
    adapter.consume({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Do' } },
    })

    const events = adapter.consume({
      type: 'assistant',
      uuid: 'message-1',
      message: { content: [{ type: 'text', text: 'Done' }] },
    })

    expect(events[0]?.type).toBe('message.added')
    expect(events[0]?.type === 'message.added' && events[0].message.id).toBe(
      'streaming-assistant',
    )
  })

  test('converts tool use blocks into running tool cards', () => {
    const adapter = new DesktopEventAdapter('session-1', () => 100)
    expect(
      adapter.consume({
        type: 'assistant',
        uuid: 'message-1',
        message: {
          content: [{ type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: 'a.ts' } }],
        },
      }),
    ).toEqual([
      {
        type: 'tool.updated',
        sessionId: 'session-1',
        sequence: 1,
        tool: {
          id: 'tool-1',
          name: 'Read',
          state: 'running',
          summary: 'a.ts',
          input: { file_path: 'a.ts' },
          startedAt: 100,
          displayOrder: 1,
        },
      },
    ])
  })

  test('completes a previously started tool from a tool result', () => {
    const adapter = new DesktopEventAdapter('session-1', () => 200)
    adapter.consume({
      type: 'assistant',
      uuid: 'message-1',
      message: {
        content: [{ type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: 'a.ts' } }],
      },
    })

    expect(
      adapter.consume({
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'file text' }],
        },
      }),
    ).toEqual([
      {
        type: 'tool.updated',
        sessionId: 'session-1',
        sequence: 2,
        tool: {
          id: 'tool-1',
          name: 'Read',
          state: 'success',
          summary: 'a.ts',
          input: { file_path: 'a.ts' },
          startedAt: 200,
          completedAt: 200,
          displayOrder: 1,
          output: 'file text',
        },
      },
    ])
  })

  test('preserves text and tool blocks from the same assistant message', () => {
    const adapter = new DesktopEventAdapter('session-1', () => 100)
    const events = adapter.consume({
      type: 'assistant',
      uuid: 'message-1',
      message: { content: [
        { type: 'text', text: 'I will inspect the file.' },
        { type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: 'a.ts' } },
      ] },
    })
    expect(events.map(event => event.type)).toEqual(['message.added', 'tool.updated'])
  })

  test('preserves interleaved assistant text and tool block order', () => {
    const adapter = new DesktopEventAdapter('session-1', () => 100)
    const events = adapter.consume({
      type: 'assistant',
      uuid: 'message-1',
      message: { content: [
        { type: 'text', text: 'First text' },
        { type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: 'a.ts' } },
        { type: 'text', text: 'Second text' },
      ] },
    })

    expect(events.map(event => event.type)).toEqual([
      'message.added',
      'tool.updated',
      'message.added',
    ])
    expect(events.map(event =>
      event.type === 'message.added'
        ? event.message.displayOrder
        : event.type === 'tool.updated'
          ? event.tool.displayOrder
          : undefined,
    )).toEqual([1, 2, 3])
  })

  test('converts thinking blocks into a distinct desktop message', () => {
    const adapter = new DesktopEventAdapter('session-1', () => 100)
    const events = adapter.consume({
      type: 'assistant',
      uuid: 'message-1',
      message: { content: [{ type: 'thinking', thinking: 'Analyze dependencies' }] },
    })
    expect(events[0]?.type === 'message.added' && events[0].message).toMatchObject({
      role: 'assistant',
      kind: 'thinking',
      content: 'Analyze dependencies',
    })
  })

  test('converts local command result text into an assistant message', () => {
    const adapter = new DesktopEventAdapter('session-1', () => 100)

    expect(adapter.consume({ type: 'result', result: 'Local command output' })[0]).toEqual(
      {
        type: 'message.added',
        sessionId: 'session-1',
        sequence: 1,
        message: {
          id: 'result-1',
          role: 'assistant',
          kind: 'text',
          content: 'Local command output',
          createdAt: 100,
          displayOrder: 1,
        },
      },
    )
  })

  test('does not duplicate the final result after assistant text was already emitted', () => {
    const adapter = new DesktopEventAdapter('session-1', () => 100)
    adapter.consume({
      type: 'assistant',
      uuid: 'message-1',
      message: { content: [{ type: 'text', text: '你好！' }] },
    })

    expect(adapter.consume({ type: 'result', result: '你好！' }).map(event => event.type)).toEqual([
      'turn.usage.completed',
    ])
  })
})
