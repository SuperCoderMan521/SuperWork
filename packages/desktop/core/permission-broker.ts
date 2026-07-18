import { randomUUID } from 'node:crypto'
import type {
  DesktopPermissionRequest,
  PermissionDecision,
} from '../shared/protocol.js'

export type PermissionRequestInput = {
  sessionId: string
  toolCallId: string
  toolName: string
  summary: string
  input: unknown
  allowSession: boolean
}

type PendingPermission = {
  sessionId: string
  resolve: (decision: PermissionDecision) => void
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
  private readonly createId: () => string
  private readonly timeoutMs: number

  constructor(private readonly options: PermissionBrokerOptions) {
    this.createId = options.createId ?? randomUUID
    this.timeoutMs = options.timeoutMs ?? 5 * 60_000
  }

  get pendingCount(): number {
    return this.pending.size
  }

  request(input: PermissionRequestInput): Promise<PermissionDecision> {
    const id = this.createId()
    const decisions: PermissionDecision[] = input.allowSession
      ? ['deny', 'allow_once', 'allow_session']
      : ['deny', 'allow_once']

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
        },
        input.sessionId,
      )
    })
  }

  resolve(id: string, decision: PermissionDecision): boolean {
    const pending = this.pending.get(id)
    if (!pending) return false

    clearTimeout(pending.timeout)
    this.pending.delete(id)
    pending.resolve(decision)
    return true
  }

  cancelSession(sessionId: string): number {
    const ids = [...this.pending]
      .filter(([, pending]) => pending.sessionId === sessionId)
      .map(([id]) => id)

    for (const id of ids) this.resolve(id, 'deny')
    return ids.length
  }

  cancelAll(): number {
    const ids = [...this.pending.keys()]
    for (const id of ids) this.resolve(id, 'deny')
    return ids.length
  }
}
