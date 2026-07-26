import { describe, expect, test } from 'bun:test'

describe('Desktop session storage activation', () => {
  test('reactivates the session and cwd without treating cwd as a transcript directory', async () => {
    const module = await import('../core/desktop-query-runner.js')
    const candidate = (module as Record<string, unknown>).activateDesktopSessionStorage

    expect(typeof candidate).toBe('function')
    if (typeof candidate !== 'function') return

    const calls: string[] = []
    const projectDirs: Array<string | null | undefined> = []
    const activate = candidate as (
      bootstrap: {
        setOriginalCwd: (cwd: string) => void
        switchSession: (
          sessionId: never,
          projectDir?: string | null,
        ) => void
      },
      session: { id: string; cwd: string },
    ) => void
    const bootstrap = {
      setOriginalCwd: (cwd: string) => calls.push(`cwd:${cwd}`),
      switchSession: (sessionId: never, projectDir?: string | null) => {
        calls.push(`session:${String(sessionId)}`)
        projectDirs.push(projectDir)
      },
    }

    activate(bootstrap, { id: 'session-one', cwd: 'G:/one' })
    activate(bootstrap, { id: 'session-two', cwd: 'G:/two' })

    expect(calls).toEqual([
      'cwd:G:/one',
      'session:session-one',
      'cwd:G:/two',
      'session:session-two',
    ])
    expect(projectDirs).toEqual([undefined, undefined])
  })
})
