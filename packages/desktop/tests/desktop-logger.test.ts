import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DesktopLogger } from '../electron/desktop-logger.js'

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function tempDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'ccb-desktop-log-'))
  directories.push(directory)
  return directory
}

describe('DesktopLogger', () => {
  test('redacts secrets before writing', () => {
    const directory = tempDirectory()
    const logger = new DesktopLogger({ directory })

    logger.info(
      'auth',
      'Authorization: Bearer secret-token OPENAI_API_KEY=sk-private token=my-token',
    )

    const content = readFileSync(logger.filePath, 'utf8')
    expect(content).not.toContain('secret-token')
    expect(content).not.toContain('sk-private')
    expect(content).not.toContain('my-token')
    expect(content).toContain('[REDACTED]')
  })

  test('returns only the requested latest lines', () => {
    const logger = new DesktopLogger({ directory: tempDirectory() })
    logger.info('test', 'first')
    logger.warn('test', 'second')
    logger.error('test', 'third')

    const latest = logger.readLatestLines(2)
    expect(latest).toContain('second')
    expect(latest).toContain('third')
    expect(latest).not.toContain('first')
  })

  test('rotates files when the size limit is reached', () => {
    const directory = tempDirectory()
    const logger = new DesktopLogger({
      directory,
      maxBytes: 80,
      retainedFiles: 3,
    })

    logger.info('test', 'a'.repeat(60))
    logger.info('test', 'b'.repeat(60))

    expect(readFileSync(join(directory, 'desktop.log.1'), 'utf8')).toContain('a')
    expect(readFileSync(join(directory, 'desktop.log'), 'utf8')).toContain('b')
  })
})
