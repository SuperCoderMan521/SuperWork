import { describe, expect, test } from 'bun:test'
import { normalize } from 'node:path'
import { SessionService } from '../core/session-service.js'

describe('SessionService', () => {
  test('maps existing session metadata to desktop summaries', async () => {
    const service = new SessionService(async () => [
      {
        sessionId: 'session-1',
        summary: 'Analyze API',
        lastModified: 200,
        cwd: 'G:/project',
      },
      {
        sessionId: 'session-2',
        summary: 'Fallback path',
        customTitle: 'Fix login',
        lastModified: 100,
      },
    ])

    expect(await service.list('G:/project')).toEqual([
      {
        id: 'session-1',
        title: 'Analyze API',
        cwd: 'G:/project',
        updatedAt: 200,
      },
      {
        id: 'session-2',
        title: 'Fix login',
        cwd: 'G:/project',
        updatedAt: 100,
      },
    ])
  })

  test('loads a conversation snapshot and retains raw query history', async () => {
    const service = new SessionService(
      async () => [
        { sessionId: 'session-1', summary: 'History', lastModified: 200, cwd: 'G:/project' },
      ],
      async () => [
        {
          type: 'user',
          uuid: 'user-1',
          message: { content: 'Hello' },
        },
        {
          type: 'assistant',
          uuid: 'assistant-1',
          message: { content: [{ type: 'text', text: 'Hi' }] },
        },
      ],
    )

    await service.list()
    const snapshot = await service.resume('session-1', 'sonnet', 'default')

    expect(snapshot.messages.map(message => message.content)).toEqual(['Hello', 'Hi'])
    expect(service.rawMessages('session-1')).toHaveLength(2)
  })

  test('creates an immediate summary snapshot before full history is loaded', async () => {
    const service = new SessionService(async () => [
      {
        sessionId: 'session-1',
        summary: 'History',
        lastModified: 200,
        cwd: 'G:/project',
      },
    ])

    await service.list()
    const snapshot = service.summarySnapshot('session-1', 'sonnet', 'default')

    expect(snapshot).toMatchObject({
      id: 'session-1',
      title: 'History',
      cwd: 'G:/project',
      model: 'sonnet',
      mode: 'default',
      generationState: 'idle',
    })
    expect(snapshot.messages).toEqual([])
  })

  test('resolves a history transcript path from the session cwd', async () => {
    const service = new SessionService(
      async () => [
        {
          sessionId: 'session-1',
          summary: 'History',
          lastModified: 200,
          cwd: 'G:/project',
        },
      ],
      undefined,
      cwd => `${cwd}/.claude/projects/project-key`,
    )

    await service.list()

    expect(
      service.transcriptPathForDelete(
        'session-1',
        sessionId => `fallback/${sessionId}.jsonl`,
      ),
    ).toBe(normalize('G:/project/.claude/projects/project-key/session-1.jsonl'))
  })

  test('falls back for unknown sessions when deleting', () => {
    const service = new SessionService(async () => [])

    expect(
      service.transcriptPathForDelete(
        'session-unknown',
        sessionId => `fallback/${sessionId}.jsonl`,
      ),
    ).toBe('fallback/session-unknown.jsonl')
  })
})
