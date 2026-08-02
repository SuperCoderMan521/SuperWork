import { randomUUID } from 'node:crypto'
import type {
  DesktopPermissionRequest,
  PermissionDecision,
} from '../shared/protocol.js'

type DesktopPermissionSuggestion = NonNullable<
  DesktopPermissionRequest['permissionSuggestions']
>[number]

export type PermissionRequestInput = {
  sessionId: string
  toolCallId: string
  toolName: string
  summary: string
  input: unknown
  allowSession: boolean
  agentId?: string
  agentName?: string
  teamName?: string
  permissionSuggestions?: unknown[]
}

/** The user's answer to a permission request, with optional interactive data. */
export type PermissionResolution = {
  decision: PermissionDecision
  payload?: unknown
}

type PendingPermission = {
  sessionId: string
  resolve: (resolution: PermissionResolution) => void
  timeout: ReturnType<typeof setTimeout>
}

type PermissionBrokerOptions = {
  emit: (request: DesktopPermissionRequest, sessionId: string) => void
  createId?: () => string
  timeoutMs?: number
}

/** Bridges the Core's awaited permission checks to serializable UI events. */
export class PermissionBroker {
  private readonly pending = new Map<string, PendingPermission>()
  private readonly closedSessions = new Set<string>()
  private readonly createId: () => string
  private readonly timeoutMs: number
  private closedAll = false

  constructor(private readonly options: PermissionBrokerOptions) {
    this.createId = options.createId ?? randomUUID
    this.timeoutMs = options.timeoutMs ?? 5 * 60_000
  }

  get pendingCount(): number {
    return this.pending.size
  }

  request(input: PermissionRequestInput): Promise<PermissionResolution> {
    if (this.closedAll || this.closedSessions.has(input.sessionId)) {
      return Promise.resolve({ decision: 'deny' })
    }

    const id = this.createId()
    const decisions: PermissionDecision[] = input.allowSession
      ? ['deny', 'allow_once', 'allow_session']
      : ['deny', 'allow_once']
    const permissionSuggestions = serializablePermissionSuggestions(
      input.permissionSuggestions,
    )

    return new Promise(resolve => {
      const timeout = setTimeout(() => this.resolve(id, 'deny'), this.timeoutMs)
      this.pending.set(id, { sessionId: input.sessionId, resolve, timeout })
      this.options.emit(
        {
          id,
          toolCallId: input.toolCallId,
          toolName: input.toolName,
          summary: input.summary,
          input: input.input,
          decisions,
          ...(input.agentId ? { agentId: input.agentId } : {}),
          ...(input.agentName ? { agentName: input.agentName } : {}),
          ...(input.teamName ? { teamName: input.teamName } : {}),
          ...(permissionSuggestions.length ? { permissionSuggestions } : {}),
        },
        input.sessionId,
      )
    })
  }

  resolve(id: string, decision: PermissionDecision, payload?: unknown): boolean {
    const pending = this.pending.get(id)
    if (!pending) return false

    clearTimeout(pending.timeout)
    this.pending.delete(id)
    pending.resolve(payload === undefined ? { decision } : { decision, payload })
    return true
  }

  cancelSession(sessionId: string): number {
    const ids = [...this.pending]
      .filter(([, pending]) => pending.sessionId === sessionId)
      .map(([id]) => id)

    for (const id of ids) this.resolve(id, 'deny')
    return ids.length
  }

  closeSession(sessionId: string): number {
    this.closedSessions.add(sessionId)
    return this.cancelSession(sessionId)
  }

  cancelAll(): number {
    const ids = [...this.pending.keys()]
    for (const id of ids) this.resolve(id, 'deny')
    return ids.length
  }

  closeAll(): number {
    this.closedAll = true
    return this.cancelAll()
  }
}

function serializablePermissionSuggestions(
  suggestions: unknown[] | undefined,
): DesktopPermissionSuggestion[] {
  if (!suggestions) return []
  return suggestions.filter(
    (suggestion): suggestion is DesktopPermissionSuggestion => {
      return (
        !!suggestion &&
        typeof suggestion === 'object' &&
        !Array.isArray(suggestion) &&
        typeof (suggestion as Record<string, unknown>).type === 'string'
      )
    },
  )
}
