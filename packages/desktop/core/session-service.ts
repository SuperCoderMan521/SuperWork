import type {
  DesktopMessage,
  DesktopSession,
  DesktopSessionSummary,
  PermissionMode,
} from '../shared/protocol.js'
import { join } from 'node:path'

export type ExistingSessionInfo = {
  sessionId: string
  summary: string
  lastModified: number
  customTitle?: string
  cwd?: string
  filePath?: string
}

export type ExistingSessionLister = (options: {
  dir?: string
  limit?: number
}) => Promise<ExistingSessionInfo[]>

export type ExistingMessageLoader = (
  session: ExistingSessionInfo,
) => Promise<unknown[]>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function messageText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value
    .filter(isRecord)
    .filter(block => block.type === 'text')
    .map(block => (typeof block.text === 'string' ? block.text : ''))
    .join('')
}

function toDesktopMessage(value: unknown, index: number, createdAt: number): DesktopMessage | null {
  if (!isRecord(value)) return null
  const type = value.type
  if (type !== 'user' && type !== 'assistant' && type !== 'system') return null
  const message = isRecord(value.message) ? value.message : value
  const content = messageText(message.content)
  if (!content) return null
  return {
    id: typeof value.uuid === 'string' ? value.uuid : `history-${index}`,
    role: type,
    content,
    createdAt,
  }
}

/** Presents existing transcript metadata without introducing another database. */
export class SessionService {
  private readonly knownSessions = new Map<string, ExistingSessionInfo>()
  private readonly rawHistory = new Map<string, unknown[]>()

  constructor(
    private readonly listExistingSessions: ExistingSessionLister,
    private readonly loadExistingMessages?: ExistingMessageLoader,
    private readonly projectDirForCwd: (cwd: string) => string = cwd => cwd,
  ) {}

  async list(cwd?: string, limit = 100): Promise<DesktopSessionSummary[]> {
    const sessions = await this.listExistingSessions({ dir: cwd, limit })
    for (const session of sessions) this.knownSessions.set(session.sessionId, session)
    return sessions.map(session => ({
      id: session.sessionId,
      title: session.customTitle ?? session.summary,
      cwd: session.cwd ?? cwd ?? '.',
      updatedAt: session.lastModified,
    }))
  }

  async resume(
    sessionId: string,
    model: string,
    mode: PermissionMode,
  ): Promise<DesktopSession> {
    const info = this.knownSessions.get(sessionId)
    if (!info) throw new Error(`Session not found: ${sessionId}`)
    if (!this.loadExistingMessages) {
      throw new Error('Session message loading is not configured')
    }
    const rawMessages = await this.loadExistingMessages(info)
    this.rawHistory.set(sessionId, rawMessages)
    const messages = rawMessages.flatMap((message, index) => {
      const mapped = toDesktopMessage(message, index, info.lastModified)
      return mapped ? [mapped] : []
    })
    return {
      id: sessionId,
      title: info.customTitle ?? info.summary,
      cwd: info.cwd ?? '.',
      updatedAt: info.lastModified,
      model,
      mode,
      messages,
      tools: [],
      generationState: 'idle',
      sequence: 0,
    }
  }

  summarySnapshot(
    sessionId: string,
    model: string,
    mode: PermissionMode,
  ): DesktopSession {
    const info = this.knownSessions.get(sessionId)
    if (!info) throw new Error(`Session not found: ${sessionId}`)
    return {
      id: sessionId,
      title: info.customTitle ?? info.summary,
      cwd: info.cwd ?? '.',
      updatedAt: info.lastModified,
      model,
      mode,
      messages: [],
      tools: [],
      generationState: 'idle',
      sequence: 0,
    }
  }

  rawMessages(sessionId: string): unknown[] {
    return this.rawHistory.get(sessionId) ?? []
  }

  transcriptPathForDelete(
    sessionId: string,
    fallback: (sessionId: string) => string,
  ): string {
    const info = this.knownSessions.get(sessionId)
    if (info?.filePath) return info.filePath
    if (info?.cwd) {
      return join(this.projectDirForCwd(info.cwd), `${sessionId}.jsonl`)
    }
    return fallback(sessionId)
  }
}
