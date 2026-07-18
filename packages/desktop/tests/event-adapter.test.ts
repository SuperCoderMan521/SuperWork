import { describe, expect, test } from 'bun:test'
import { DesktopEventAdapter } from '../core/event-adapter.js'

describe('DesktopEventAdapter', () => {
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

    expect(adapter.consume({ type: 'result', result: 'Local command output' })).toEqual([
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
        },
      },
    ])
  })

  test('does not duplicate the final result after assistant text was already emitted', () => {
    const adapter = new DesktopEventAdapter('session-1', () => 100)
    adapter.consume({
      type: 'assistant',
      uuid: 'message-1',
      message: { content: [{ type: 'text', text: '你好！' }] },
    })

    expect(adapter.consume({ type: 'result', result: '你好！' })).toEqual([])
  })
})
