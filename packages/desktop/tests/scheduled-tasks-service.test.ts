import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { DesktopScheduledTasksService } from '../core/scheduled-tasks-service.js'

describe('DesktopScheduledTasksService', () => {
  test('returns an empty snapshot when the local scheduled task file is missing', async () => {
    const cwd = await createTempWorkspace()
    const snapshot = await new DesktopScheduledTasksService(() => 100, () => []).snapshot(cwd)

    expect(snapshot).toMatchObject({
      cwd,
      path: join(cwd, '.claude', 'scheduled_tasks.json'),
      generatedAt: 100,
      tasks: [],
      warnings: [],
    })
  })

  test('reads durable local scheduled tasks from the workspace file', async () => {
    const cwd = await createTempWorkspace()
    await mkdir(join(cwd, '.claude'), { recursive: true })
    await writeFile(
      join(cwd, '.claude', 'scheduled_tasks.json'),
      JSON.stringify({
        tasks: [{
          id: 'abc123ef',
          cron: '0 9 * * 1',
          prompt: 'Run weekly standup',
          recurring: true,
          createdAt: Date.parse('2026-07-26T00:00:00.000Z'),
          lastFiredAt: Date.parse('2026-07-26T09:00:00.000Z'),
          agentId: 'researcher',
        }],
      }),
    )

    const snapshot = await new DesktopScheduledTasksService(() => 200, () => []).snapshot(cwd)

    expect(snapshot.tasks).toEqual([{
      id: 'abc123ef',
      cron: '0 9 * * 1',
      prompt: 'Run weekly standup',
      recurring: true,
      source: 'file',
      durable: true,
      createdAt: '2026-07-26T00:00:00.000Z',
      lastFiredAt: '2026-07-26T09:00:00.000Z',
      agentId: 'researcher',
    }])
    expect(snapshot.warnings).toEqual([])
  })

  test('reports invalid local scheduled task json without throwing', async () => {
    const cwd = await createTempWorkspace()
    await mkdir(join(cwd, '.claude'), { recursive: true })
    await writeFile(join(cwd, '.claude', 'scheduled_tasks.json'), '{nope')

    const snapshot = await new DesktopScheduledTasksService(() => 300, () => []).snapshot(cwd)

    expect(snapshot.tasks).toEqual([])
    expect(snapshot.error).toContain('无法读取本地定时任务')
  })

  test('includes session-only cron tasks when the durable file is empty', async () => {
    const cwd = await createTempWorkspace()
    const snapshot = await new DesktopScheduledTasksService(() => 400, () => [{
      id: '578a7453',
      cron: '0 5 * * *',
      prompt: '查询当日天气',
      createdAt: Date.parse('2026-07-26T00:00:00.000Z'),
      recurring: true,
    }]).snapshot(cwd)

    expect(snapshot.tasks).toEqual([{
      id: '578a7453',
      cron: '0 5 * * *',
      prompt: '查询当日天气',
      recurring: true,
      source: 'session',
      durable: false,
      createdAt: '2026-07-26T00:00:00.000Z',
    }])
    expect(snapshot.warnings).toContain('会话临时任务来自当前 Desktop Core 进程内存，不会写入 scheduled_tasks.json。')
  })

  test('persists a session-only cron task into the workspace scheduled task file', async () => {
    const cwd = await createTempWorkspace()
    const removed: string[][] = []
    const service = new DesktopScheduledTasksService(
      () => 500,
      () => [{
        id: '578a7453',
        cron: '0 5 * * *',
        prompt: '查询当日天气',
        createdAt: Date.parse('2026-07-26T00:00:00.000Z'),
        recurring: true,
      }],
      ids => {
        removed.push([...ids])
        return ids.length
      },
    )

    const snapshot = await service.persistSessionTask(cwd, '578a7453')

    expect(snapshot.tasks).toEqual([{
      id: '578a7453',
      cron: '0 5 * * *',
      prompt: '查询当日天气',
      recurring: true,
      source: 'file',
      durable: true,
      createdAt: '2026-07-26T00:00:00.000Z',
    }])
    expect(removed).toEqual([['578a7453']])
  })
})

async function createTempWorkspace(): Promise<string> {
  return await import('node:fs/promises').then(fs =>
    fs.mkdtemp(join(import.meta.dir, 'tmp-scheduled-tasks-')),
  )
}
