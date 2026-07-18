import type {
  CoreDiagnosticStatus,
  DiagnosticsSnapshot,
} from '../shared/protocol.js'
import { DesktopLogger } from './desktop-logger.js'

export class DiagnosticsService {
  private coreStatus: CoreDiagnosticStatus = 'stopped'
  private lastError: string | null = null

  constructor(readonly logger: DesktopLogger) {}

  setCoreStatus(status: CoreDiagnosticStatus): void {
    this.coreStatus = status
    this.logger.info('sidecar', `status=${status}`)
    if (status === 'ready') this.lastError = null
  }

  recordError(scope: string, error: unknown): void {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    this.lastError = error instanceof Error ? error.message : String(error)
    this.logger.error(scope, message)
  }

  recordSidecarStderr(chunk: string): void {
    for (const rawLine of chunk.split(/\r?\n/)) {
      const message = rawLine.trim()
      if (!message) continue
      const match = /^\[(INFO|WARN|ERROR)\]\s+(.*)$/.exec(message)
      if (match) {
        const level = match[1] as 'INFO' | 'WARN' | 'ERROR'
        const body = match[2]
        if (level === 'INFO') this.logger.info('desktop-core', body)
        else if (level === 'WARN') this.logger.warn('desktop-core', body)
        else this.logger.error('desktop-core', body)
      } else {
        this.logger.error('desktop-core', message)
      }
    }
  }

  snapshot(): DiagnosticsSnapshot {
    return {
      coreStatus: this.coreStatus,
      logPath: this.logger.filePath,
      latestLines: this.logger.readLatestLines(200),
      lastError: this.lastError,
    }
  }
}
