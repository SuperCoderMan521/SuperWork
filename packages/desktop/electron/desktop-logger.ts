import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { join } from 'node:path'

type LogLevel = 'INFO' | 'WARN' | 'ERROR'

type DesktopLoggerOptions = {
  directory: string
  maxBytes?: number
  retainedFiles?: number
}

const SECRET_PATTERNS: RegExp[] = [
  /(authorization\s*:\s*bearer\s+)[^\s]+/gi,
  /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret)\s*[=:]\s*)[^\s,;]+/gi,
  /\bsk-[a-z0-9_-]{8,}\b/gi,
]

export function redactDiagnosticText(value: string): string {
  return SECRET_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, '$1[REDACTED]'),
    value,
  )
}

/** Small synchronous logger for startup paths where losing the last line hurts diagnosis. */
export class DesktopLogger {
  readonly filePath: string
  private readonly maxBytes: number
  private readonly retainedFiles: number

  constructor(private readonly options: DesktopLoggerOptions) {
    mkdirSync(options.directory, { recursive: true })
    this.filePath = join(options.directory, 'desktop.log')
    this.maxBytes = options.maxBytes ?? 5 * 1024 * 1024
    this.retainedFiles = options.retainedFiles ?? 3
  }

  info(scope: string, message: string): void {
    this.write('INFO', scope, message)
  }

  warn(scope: string, message: string): void {
    this.write('WARN', scope, message)
  }

  error(scope: string, message: string): void {
    this.write('ERROR', scope, message)
  }

  readLatestLines(limit = 200): string {
    if (!existsSync(this.filePath)) return ''
    const lines = readFileSync(this.filePath, 'utf8').split(/\r?\n/)
    if (lines.at(-1) === '') lines.pop()
    return lines.slice(-Math.max(0, limit)).join('\n')
  }

  private write(level: LogLevel, scope: string, message: string): void {
    const cleanScope = redactDiagnosticText(scope).replace(/[\r\n]+/g, ' ')
    const cleanMessage = redactDiagnosticText(message).replace(/[\r\n]+/g, ' ')
    const line = `${new Date().toISOString()} ${level} [${cleanScope}] ${cleanMessage}\n`
    this.rotateIfNeeded(Buffer.byteLength(line))
    appendFileSync(this.filePath, line, 'utf8')
  }

  private rotateIfNeeded(incomingBytes: number): void {
    if (!existsSync(this.filePath)) return
    if (statSync(this.filePath).size + incomingBytes <= this.maxBytes) return

    const oldest = `${this.filePath}.${this.retainedFiles}`
    if (existsSync(oldest)) unlinkSync(oldest)
    for (let index = this.retainedFiles - 1; index >= 1; index -= 1) {
      const source = `${this.filePath}.${index}`
      if (existsSync(source)) renameSync(source, `${this.filePath}.${index + 1}`)
    }
    renameSync(this.filePath, `${this.filePath}.1`)
  }
}
