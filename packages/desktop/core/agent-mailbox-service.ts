import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, parse } from 'node:path'
import type {
  DesktopAgentMailboxMessage,
  DesktopAgentMailboxSnapshot,
} from '../shared/protocol.js'

type DesktopAgentMailboxServiceOptions = {
  claudeConfigDir?: string
  now?: () => number
}

function defaultClaudeConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
}

function isMailboxMessage(value: unknown): value is DesktopAgentMailboxMessage {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record.from === 'string' &&
    typeof record.text === 'string' &&
    typeof record.timestamp === 'string' &&
    typeof record.read === 'boolean' &&
    (record.color === undefined || typeof record.color === 'string') &&
    (record.summary === undefined || typeof record.summary === 'string')
  )
}

async function safeDirectories(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true })
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort((left, right) => left.localeCompare(right))
  } catch {
    return []
  }
}

async function safeJsonFiles(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true })
    return entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(entry => entry.name)
      .sort((left, right) => left.localeCompare(right))
  } catch {
    return []
  }
}

export class DesktopAgentMailboxService {
  private readonly claudeConfigDir: string
  private readonly now: () => number

  constructor(options: DesktopAgentMailboxServiceOptions = {}) {
    this.claudeConfigDir = options.claudeConfigDir ?? defaultClaudeConfigDir()
    this.now = options.now ?? Date.now
  }

  async snapshot(): Promise<DesktopAgentMailboxSnapshot> {
    const teamsRoot = join(this.claudeConfigDir, 'teams')
    const teamNames = await safeDirectories(teamsRoot)
    const teams: DesktopAgentMailboxSnapshot['teams'] = []

    for (const teamName of teamNames) {
      const inboxRoot = join(teamsRoot, teamName, 'inboxes')
      const inboxFiles = await safeJsonFiles(inboxRoot)
      const inboxes: DesktopAgentMailboxSnapshot['teams'][number]['inboxes'] = []

      for (const fileName of inboxFiles) {
        const fullPath = join(inboxRoot, fileName)
        const info = await stat(fullPath).catch(() => null)
        if (!info || info.size > 4 * 1024 * 1024) continue
        const content = await readFile(fullPath, 'utf8').catch(() => null)
        if (content === null) continue

        try {
          const parsed = JSON.parse(content)
          if (!Array.isArray(parsed)) continue
          const messages = parsed.filter(isMailboxMessage)
          inboxes.push({
            agentName: parse(fileName).name,
            messages,
          })
        } catch {
          // Observability must not break the running team if an inbox is mid-write.
        }
      }

      teams.push({ name: teamName, inboxes })
    }

    return { generatedAt: this.now(), teams }
  }
}
