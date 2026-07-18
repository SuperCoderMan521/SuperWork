import { describe, expect, test } from 'bun:test'
import { SidecarManager } from '../electron/sidecar-manager.js'
import type { SidecarProcess } from '../electron/sidecar-manager.js'

class FakeProcess implements SidecarProcess {
  readonly writes: string[] = []
  private outputListeners = new Set<(chunk: string) => void>()
  private exitListeners = new Set<(code: number | null) => void>()
  private errorListeners = new Set<(error: Error) => void>()

  write(value: string): boolean {
    this.writes.push(value)
    return true
  }

  onOutput(listener: (chunk: string) => void): () => void {
    this.outputListeners.add(listener)
    return () => this.outputListeners.delete(listener)
  }

  onExit(listener: (code: number | null) => void): () => void {
    this.exitListeners.add(listener)
    return () => this.exitListeners.delete(listener)
  }

  onError(listener: (error: Error) => void): () => void {
    this.errorListeners.add(listener)
    return () => this.errorListeners.delete(listener)
  }

  terminate(): void {}

  output(value: unknown): void {
    const line = `${JSON.stringify(value)}\n`
    for (const listener of this.outputListeners) listener(line)
  }

  exit(code = 1): void {
    for (const listener of this.exitListeners) listener(code)
  }

  fail(): void {
    for (const listener of this.errorListeners) listener(new Error('spawn failed'))
  }
}

describe('SidecarManager', () => {
  test('queues initial commands until the ready handshake', () => {
    const process = new FakeProcess()
    const manager = new SidecarManager(() => process)
    manager.start()

    manager.send({ type: 'session.list', requestId: 'request-1' })
    expect(process.writes).toEqual([])

    process.output({ type: 'core.ready', protocolVersion: 1 })

    expect(process.writes).toEqual([
      '{"type":"session.list","requestId":"request-1"}\n',
    ])
  })

  test('restarts once without replaying commands', () => {
    const processes = [new FakeProcess(), new FakeProcess()]
    let index = 0
    const manager = new SidecarManager(() => processes[index++]!)
    manager.start()
    processes[0]!.output({ type: 'core.ready', protocolVersion: 1 })
    manager.send({ type: 'session.list', requestId: 'request-1' })

    processes[0]!.exit()
    processes[1]!.output({ type: 'core.ready', protocolVersion: 1 })

    expect(processes[1]!.writes).toEqual([])
    expect(manager.status).toBe('ready')
  })

  test('handles spawn errors without crashing the Electron process', () => {
    const processes = [new FakeProcess(), new FakeProcess()]
    let index = 0
    const manager = new SidecarManager(() => processes[index++]!)
    manager.start()

    processes[0]!.fail()
    expect(manager.status).toBe('restarting')
    processes[1]!.output({ type: 'core.ready', protocolVersion: 1 })
    expect(manager.status).toBe('ready')
  })
})
