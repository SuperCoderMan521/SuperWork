import { describe, expect, test } from 'bun:test'
import { PermissionBroker } from '../core/permission-broker.js'

describe('PermissionBroker', () => {
  test('resolves an allow-once request', async () => {
    const requests: string[] = []
    const broker = new PermissionBroker({
      createId: () => 'permission-1',
      emit: request => requests.push(request.id),
    })

    const decision = broker.request({
      sessionId: 'session-1',
      toolCallId: 'tool-1',
      toolName: 'Bash',
      summary: 'bun test',
      input: { command: 'bun test' },
      allowSession: true,
    })

    expect(requests).toEqual(['permission-1'])
    expect(broker.resolve('permission-1', 'allow_once')).toBe(true)
    expect(await decision).toEqual({ decision: 'allow_once' })
    expect(broker.pendingCount).toBe(0)
  })

  test('carries an interactive payload with the resolution', async () => {
    const broker = new PermissionBroker({
      createId: () => 'permission-1',
      emit: () => {},
    })
    const resolution = broker.request({
      sessionId: 'session-1',
      toolCallId: 'tool-1',
      toolName: 'AskUserQuestion',
      summary: 'Which library?',
      input: { questions: [] },
      allowSession: false,
    })

    expect(
      broker.resolve('permission-1', 'allow_once', {
        answers: { 'Which library?': 'date-fns' },
      }),
    ).toBe(true)
    expect(await resolution).toEqual({
      decision: 'allow_once',
      payload: { answers: { 'Which library?': 'date-fns' } },
    })
  })

  test('emits permission suggestions for the renderer', async () => {
    let emitted: unknown
    const broker = new PermissionBroker({
      createId: () => 'permission-1',
      emit: request => {
        emitted = request
      },
    })

    void broker.request({
      sessionId: 'session-1',
      toolCallId: 'tool-1',
      toolName: 'Write',
      summary: 'Write a file to the local filesystem.',
      input: { file_path: 'K:\\ai\\12\\seckill-node\\package.json' },
      allowSession: true,
      permissionSuggestions: [
        { type: 'setMode', mode: 'acceptEdits', destination: 'session' },
      ],
    })

    expect(emitted).toMatchObject({
      id: 'permission-1',
      permissionSuggestions: [
        { type: 'setMode', mode: 'acceptEdits', destination: 'session' },
      ],
    })
  })

  test('rejects duplicate and unknown resolutions', async () => {
    const broker = new PermissionBroker({
      createId: () => 'permission-1',
      emit: () => {},
    })
    const decision = broker.request({
      sessionId: 'session-1',
      toolCallId: 'tool-1',
      toolName: 'Read',
      summary: 'read file',
      input: {},
      allowSession: false,
    })

    expect(broker.resolve('permission-1', 'deny')).toBe(true)
    expect(broker.resolve('permission-1', 'deny')).toBe(false)
    expect(broker.resolve('missing', 'deny')).toBe(false)
    expect(await decision).toEqual({ decision: 'deny' })
  })

  test('denies every pending request for an interrupted session', async () => {
    let id = 0
    const broker = new PermissionBroker({
      createId: () => `permission-${++id}`,
      emit: () => {},
    })
    const first = broker.request({
      sessionId: 'session-1',
      toolCallId: 'tool-1',
      toolName: 'Bash',
      summary: 'first',
      input: {},
      allowSession: true,
    })
    const second = broker.request({
      sessionId: 'session-2',
      toolCallId: 'tool-2',
      toolName: 'Edit',
      summary: 'second',
      input: {},
      allowSession: true,
    })

    expect(broker.cancelSession('session-1')).toBe(1)
    expect(await first).toEqual({ decision: 'deny' })
    expect(broker.pendingCount).toBe(1)
    broker.resolve('permission-2', 'allow_session')
    expect(await second).toEqual({ decision: 'allow_session' })
  })

  test('denies new requests for a closed session without emitting another prompt', async () => {
    const emitted: string[] = []
    const broker = new PermissionBroker({
      createId: () => `permission-${emitted.length + 1}`,
      emit: request => emitted.push(request.id),
    })
    const pending = broker.request({
      sessionId: 'session-1',
      toolCallId: 'tool-1',
      toolName: 'Write',
      summary: 'write file',
      input: {},
      allowSession: true,
    })

    expect(broker.closeSession('session-1')).toBe(1)
    expect(await pending).toEqual({ decision: 'deny' })
    const late = await broker.request({
      sessionId: 'session-1',
      toolCallId: 'tool-late',
      toolName: 'Bash',
      summary: 'late command',
      input: {},
      allowSession: true,
    })

    expect(late).toEqual({ decision: 'deny' })
    expect(emitted).toEqual(['permission-1'])
    expect(broker.pendingCount).toBe(0)
  })
})
