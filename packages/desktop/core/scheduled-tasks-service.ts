import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  getSessionCronTasks,
  removeSessionCronTasks,
  type SessionCronTask,
} from 'src/bootstrap/state.js'
import type {
  DesktopScheduledTask,
  DesktopScheduledTasksSnapshot,
} from '../shared/protocol.js'

type RawTask = {
  id?: unknown
  cron?: unknown
  prompt?: unknown
  createdAt?: unknown
  lastFiredAt?: unknown
  recurring?: unknown
  permanent?: unknown
  agentId?: unknown
}

type DiskTask = {
  id: string
  cron: string
  prompt: string
  createdAt: number
  lastFiredAt?: number
  recurring?: boolean
  permanent?: boolean
}

const SCHEDULED_TASKS_RELATIVE_PATH = join('.claude', 'scheduled_tasks.json')
const SESSION_TASK_WARNING = '会话临时任务来自当前 Desktop Core 进程内存，不会写入 scheduled_tasks.json。'

function toIsoTimestamp(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return new Date(value).toISOString()
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? value : new Date(parsed).toISOString()
  }
  return null
}

function normalizeTask(
  task: RawTask,
  source: DesktopScheduledTask['source'],
): DesktopScheduledTask | null {
  if (
    typeof task.id !== 'string' ||
    !task.id ||
    typeof task.cron !== 'string' ||
    !task.cron ||
    typeof task.prompt !== 'string'
  ) {
    return null
  }
  const createdAt = toIsoTimestamp(task.createdAt)
  if (!createdAt) return null
  const lastFiredAt = toIsoTimestamp(task.lastFiredAt)
  return {
    id: task.id,
    cron: task.cron,
    prompt: task.prompt,
    createdAt,
    source,
    durable: source === 'file',
    ...(lastFiredAt ? { lastFiredAt } : {}),
    ...(typeof task.recurring === 'boolean' ? { recurring: task.recurring } : {}),
    ...(typeof task.permanent === 'boolean' ? { permanent: task.permanent } : {}),
    ...(typeof task.agentId === 'string' && task.agentId ? { agentId: task.agentId } : {}),
  }
}

function toDiskTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value)
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function normalizeDiskTask(task: RawTask): DiskTask | null {
  if (
    typeof task.id !== 'string' ||
    !task.id ||
    typeof task.cron !== 'string' ||
    !task.cron ||
    typeof task.prompt !== 'string'
  ) {
    return null
  }
  const createdAt = toDiskTimestamp(task.createdAt)
  if (createdAt === null) return null
  const lastFiredAt = toDiskTimestamp(task.lastFiredAt)
  return {
    id: task.id,
    cron: task.cron,
    prompt: task.prompt,
    createdAt,
    ...(lastFiredAt !== null ? { lastFiredAt } : {}),
    ...(task.recurring === true ? { recurring: true } : {}),
    ...(task.permanent === true ? { permanent: true } : {}),
  }
}

export class DesktopScheduledTasksService {
  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly sessionTasks: () => SessionCronTask[] = getSessionCronTasks,
    private readonly removeSessionTasks: (ids: readonly string[]) => number = removeSessionCronTasks,
  ) {}

  async snapshot(cwd: string): Promise<DesktopScheduledTasksSnapshot> {
    const path = join(cwd, SCHEDULED_TASKS_RELATIVE_PATH)
    const base: DesktopScheduledTasksSnapshot = {
      cwd,
      path,
      generatedAt: this.now(),
      tasks: [],
      warnings: [],
    }

    let raw: string | null = null
    try {
      raw = await readFile(path, 'utf8')
    } catch (error) {
      if (!isMissingFile(error)) return {
        ...base,
        error: `无法读取本地定时任务：${error instanceof Error ? error.message : String(error)}`,
      }
    }

    const fileTasks: DesktopScheduledTask[] = []
    const warnings: string[] = []
    try {
      if (raw !== null) {
        const parsed = JSON.parse(raw) as { tasks?: unknown }
        if (!Array.isArray(parsed.tasks)) {
          warnings.push('scheduled_tasks.json 中没有有效的 tasks 数组。')
        } else {
          for (const [index, task] of parsed.tasks.entries()) {
            const normalized = normalizeTask(task as RawTask, 'file')
            if (normalized) {
              fileTasks.push(normalized)
            } else {
              warnings.push(`已跳过第 ${index + 1} 个无效任务。`)
            }
          }
        }
      }
    } catch (error) {
      return {
        ...base,
        error: `无法读取本地定时任务：${error instanceof Error ? error.message : String(error)}`,
      }
    }

    const sessionTasks = this.sessionTasks()
      .map(task => normalizeTask(task, 'session'))
      .filter((task): task is DesktopScheduledTask => Boolean(task))
    const fileTaskIds = new Set(fileTasks.map(task => task.id))
    const mergedSessionTasks = sessionTasks.filter(task => !fileTaskIds.has(task.id))
    if (mergedSessionTasks.length > 0) warnings.push(SESSION_TASK_WARNING)
    return { ...base, tasks: [...fileTasks, ...mergedSessionTasks], warnings }
  }

  async persistSessionTask(
    cwd: string,
    id: string,
  ): Promise<DesktopScheduledTasksSnapshot> {
    const sessionTask = this.sessionTasks().find(task => task.id === id)
    if (!sessionTask) {
      return {
        ...(await this.snapshot(cwd)),
        error: `未找到临时定时任务：${id}`,
      }
    }

    const path = join(cwd, SCHEDULED_TASKS_RELATIVE_PATH)
    let existingTasks: DiskTask[]
    try {
      existingTasks = await this.readDiskTasks(path)
    } catch (error) {
      return {
        ...(await this.snapshot(cwd)),
        error: `无法保存本地定时任务：${error instanceof Error ? error.message : String(error)}`,
      }
    }
    const persistedTask: DiskTask = {
      id: sessionTask.id,
      cron: sessionTask.cron,
      prompt: sessionTask.prompt,
      createdAt: sessionTask.createdAt,
      ...(sessionTask.recurring ? { recurring: true } : {}),
    }

    await mkdir(join(cwd, '.claude'), { recursive: true })
    await writeFile(
      path,
      `${JSON.stringify({
        tasks: [
          ...existingTasks.filter(task => task.id !== sessionTask.id),
          persistedTask,
        ],
      }, null, 2)}\n`,
      'utf8',
    )
    this.removeSessionTasks([id])
    return this.snapshot(cwd)
  }

  private async readDiskTasks(path: string): Promise<DiskTask[]> {
    let raw: string
    try {
      raw = await readFile(path, 'utf8')
    } catch (error) {
      if (isMissingFile(error)) return []
      throw error
    }
    const parsed = JSON.parse(raw) as { tasks?: unknown }
    if (!Array.isArray(parsed.tasks)) return []
    return parsed.tasks
      .map(task => normalizeDiskTask(task as RawTask))
      .filter((task): task is DiskTask => Boolean(task))
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}
