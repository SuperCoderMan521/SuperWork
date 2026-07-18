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
    expect(await decision).toBe('allow_once')
    expect(broker.pendingCount).toBe(0)
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
    expect(await decision).toBe('deny')
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
    expect(await first).toBe('deny')
    expect(broker.pendingCount).toBe(1)
    broker.resolve('permission-2', 'allow_session')
    expect(await second).toBe('allow_session')
  })
})
