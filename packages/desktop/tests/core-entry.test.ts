import { describe, expect, test } from 'bun:test'
import { runCoreProtocol } from '../core/entry.js'
import type { DesktopCommand, DesktopEvent } from '../shared/protocol.js'

async function* lines(values: string[]): AsyncGenerator<string> {
  for (const value of values) yield value
}

describe('runCoreProtocol', () => {
  test('announces readiness and dispatches valid commands', async () => {
    const events: DesktopEvent[] = []
    const commands: DesktopCommand[] = []

    await runCoreProtocol({
      input: lines(['{"type":"session.list","requestId":"request-1"}\n']),
      emit: event => events.push(event),
      dispatch: command => {
        commands.push(command)
      },
    })

    expect(events[0]).toEqual({ type: 'core.ready', protocolVersion: 1 })
    expect(commands).toEqual([{ type: 'session.list', requestId: 'request-1' }])
  })

  test('reports malformed commands and continues', async () => {
    const events: DesktopEvent[] = []
    const commands: DesktopCommand[] = []

    await runCoreProtocol({
      input: lines([
        '{"type":"session.list","requestId":""}\n',
        '{"type":"session.list","requestId":"request-2"}\n',
      ]),
      emit: event => events.push(event),
      dispatch: command => {
        commands.push(command)
      },
    })

    expect(events[1]?.type).toBe('command.failed')
    expect(commands).toEqual([{ type: 'session.list', requestId: 'request-2' }])
  })
})
