import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ScheduledTasksCenter } from '../renderer/src/features/scheduled-tasks/ScheduledTasksCenter.js'

test('renders local scheduled tasks and workspace file path', () => {
  const html = renderToStaticMarkup(
    <ScheduledTasksCenter
      cwd="G:/project"
      loading={false}
      snapshot={{
        cwd: 'G:/project',
        path: 'G:/project/.claude/scheduled_tasks.json',
        generatedAt: 100,
        warnings: [],
        tasks: [{
          id: 'abc123ef',
          cron: '0 9 * * 1',
          prompt: 'Run weekly standup',
          recurring: true,
          source: 'file',
          durable: true,
          createdAt: '2026-07-26T00:00:00.000Z',
          lastFiredAt: '2026-07-26T09:00:00.000Z',
          agentId: 'researcher',
        }],
      }}
      onPersist={() => {}}
      onBack={() => {}}
      onRefresh={() => {}}
    />,
  )

  expect(html).toContain('本地定时任务')
  expect(html).toContain('abc123ef')
  expect(html).toContain('0 9 * * 1')
  expect(html).toContain('Run weekly standup')
  expect(html).toContain('循环')
  expect(html).toContain('持久')
  expect(html).toContain('researcher')
})

test('renders session-only local scheduled tasks clearly', () => {
  const html = renderToStaticMarkup(
    <ScheduledTasksCenter
      cwd="G:/project"
      loading={false}
      snapshot={{
        cwd: 'G:/project',
        path: 'G:/project/.claude/scheduled_tasks.json',
        generatedAt: 100,
        warnings: ['会话临时任务来自当前 Desktop Core 进程内存，不会写入 scheduled_tasks.json。'],
        tasks: [{
          id: '578a7453',
          cron: '0 5 * * *',
          prompt: '查询当日天气',
          recurring: true,
          source: 'session',
          durable: false,
          createdAt: '2026-07-26T00:00:00.000Z',
        }],
      }}
      onPersist={() => {}}
      onBack={() => {}}
      onRefresh={() => {}}
    />,
  )

  expect(html).toContain('578a7453')
  expect(html).toContain('临时')
  expect(html).toContain('转为持久')
  expect(html).toContain('查询当日天气')
})

test('renders an empty state when no local scheduled tasks exist', () => {
  const html = renderToStaticMarkup(
    <ScheduledTasksCenter
      cwd="G:/project"
      loading={false}
      snapshot={{
        cwd: 'G:/project',
        path: 'G:/project/.claude/scheduled_tasks.json',
        generatedAt: 100,
        warnings: [],
        tasks: [],
      }}
      onPersist={() => {}}
      onBack={() => {}}
      onRefresh={() => {}}
    />,
  )

  expect(html).toContain('当前工作区暂无本地定时任务')
})
