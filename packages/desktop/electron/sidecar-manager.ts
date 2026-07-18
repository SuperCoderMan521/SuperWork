import type { DesktopCommand, DesktopEvent } from '../shared/protocol.js'
import { DesktopEventSchema } from '../shared/schemas.js'
import { encodeJsonLine, JsonLineDecoder } from './json-lines.js'

export type SidecarStatus =
  | 'stopped'
  | 'starting'
  | 'ready'
  | 'restarting'
  | 'failed'

export interface SidecarProcess {
  write(value: string): boolean
  onOutput(listener: (chunk: string) => void): () => void
  onExit(listener: (code: number | null) => void): () => void
  onError(listener: (error: Error) => void): () => void
  terminate(): void
}

export type SidecarProcessFactory = () => SidecarProcess

type SidecarManagerOptions = {
  onEvent?: (event: DesktopEvent) => void
  onPermanentFailure?: (code: number | null) => void
  onStatusChange?: (status: SidecarStatus) => void
  onProcessError?: (error: Error) => void
}

/** Supervises one Core process and deliberately never replays commands. */
export class SidecarManager {
  status: SidecarStatus = 'stopped'

  private process: SidecarProcess | null = null
  private restartCount = 0
  private stoppedByOwner = false
  private readonly initialQueue: DesktopCommand[] = []

  constructor(
    private readonly createProcess: SidecarProcessFactory,
    private readonly options: SidecarManagerOptions = {},
  ) {}

  start(): void {
    if (this.process) return
    this.stoppedByOwner = false
    this.setStatus(this.restartCount === 0 ? 'starting' : 'restarting')
    this.attach(this.createProcess())
  }

  send(command: DesktopCommand): void {
    if (this.status === 'starting' && this.restartCount === 0 && this.process) {
      this.initialQueue.push(command)
      return
    }
    if (this.status !== 'ready' || !this.process) {
      throw new Error('Desktop Core is not ready')
    }
    if (!this.process.write(encodeJsonLine(command))) {
      throw new Error('Desktop Core command stream is applying backpressure')
    }
  }

  stop(): void {
    this.stoppedByOwner = true
    this.process?.terminate()
    this.process = null
    this.setStatus('stopped')
  }

  private attach(process: SidecarProcess): void {
    this.process = process
    const decoder = new JsonLineDecoder()

    process.onOutput(chunk => {
      for (const value of decoder.push(chunk)) {
        const event = DesktopEventSchema.parse(value)
        if (event.type === 'core.ready') {
          console.log(
            `[sidecar] core ready handshake received protocolVersion=${event.protocolVersion}`,
          )
          this.setStatus('ready')
          for (const command of this.initialQueue.splice(0)) {
            if (!process.write(encodeJsonLine(command))) {
              throw new Error('Desktop Core command stream is applying backpressure')
            }
          }
        }
        this.options.onEvent?.(event)
      }
    })

    process.onExit(code => this.handleProcessFailure(process, code))
    process.onError(error => {
      this.options.onProcessError?.(error)
      this.handleProcessFailure(process, null)
    })
  }

  private handleProcessFailure(
    failedProcess: SidecarProcess,
    code: number | null,
  ): void {
    if (failedProcess !== this.process) return
    this.process = null
    this.initialQueue.length = 0

    if (this.stoppedByOwner) {
      this.setStatus('stopped')
      return
    }

    if (this.restartCount === 0) {
      this.restartCount += 1
      this.setStatus('restarting')
      this.attach(this.createProcess())
      return
    }

    this.setStatus('failed')
    this.options.onPermanentFailure?.(code)
  }

  private setStatus(status: SidecarStatus): void {
    this.status = status
    this.options.onStatusChange?.(status)
  }
}
