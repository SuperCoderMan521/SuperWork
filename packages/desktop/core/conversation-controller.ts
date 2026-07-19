import { randomUUID } from 'node:crypto'
import type {
  DesktopEvent,
  DesktopPermissionRequest,
  DesktopSession,
  PermissionMode,
} from '../shared/protocol.js'
import { DesktopEventAdapter } from './event-adapter.js'

export type QueryRunInput = {
  session: DesktopSession
  prompt: string
  signal: AbortSignal
}

export type DesktopQueryRunner = (
  input: QueryRunInput,
) => AsyncIterable<unknown>

type ConversationControllerOptions = {
  runQuery: DesktopQueryRunner
  emit: (event: DesktopEvent) => void
  createId?: () => string
  now?: () => number
  firstEventTimeoutMs?: number
  defaultModel: string
  defaultMode: PermissionMode
  onInterrupt?: (sessionId: string) => void
}

type ActiveGeneration = {
  sessionId: string
  abortController: AbortController
}

function isFirstEventTimeout(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('Timed out waiting for the model to start responding')
}

/** Owns desktop session state while delegating model/tool work to query(). */
export class DesktopConversationController {
  private readonly sessions = new Map<string, DesktopSession>()
  private readonly createId: () => string
  private readonly now: () => number
  private readonly firstEventTimeoutMs: number
  private activeGeneration: ActiveGeneration | null = null

  constructor(private readonly options: ConversationControllerOptions) {
    this.createId = options.createId ?? randomUUID
    this.now = options.now ?? Date.now
    this.firstEventTimeoutMs = options.firstEventTimeoutMs ?? 45_000
  }

  createSession(cwd: string): DesktopSession {
    const id = this.createId()
    const session: DesktopSession = {
      id,
      title: 'New conversation',
      cwd,
      updatedAt: this.now(),
      model: this.options.defaultModel,
      mode: this.options.defaultMode,
      messages: [],
      tools: [],
      generationState: 'idle',
      sequence: 0,
    }
    this.sessions.set(id, session)
    this.emitSnapshot(session)
    return this.requireSession(id)
  }

  getSession(sessionId: string): DesktopSession | undefined {
    return this.sessions.get(sessionId)
  }

  restoreSession(snapshot: DesktopSession): DesktopSession {
    const session = structuredClone(snapshot)
    session.generationState = 'idle'
    this.sessions.set(session.id, session)
    this.emitSnapshot(session)
    return session
  }

  emitCurrentSnapshot(sessionId: string): void {
    this.emitSnapshot(this.requireSession(sessionId))
  }

  deleteSession(sessionId: string): boolean {
    if (this.activeGeneration?.sessionId === sessionId) this.interrupt(sessionId)
    return this.sessions.delete(sessionId)
  }

  async submitPrompt(sessionId: string, prompt: string): Promise<void> {
    const session = this.requireSession(sessionId)
    if (this.activeGeneration) {
      throw new Error('A desktop session is already generating')
    }

    const abortController = new AbortController()
    this.activeGeneration = { sessionId, abortController }
    const userMessage = {
      id: `${sessionId}-user-${session.sequence + 1}`,
      role: 'user' as const,
      content: prompt,
      createdAt: this.now(),
      displayOrder: session.sequence + 1,
    }
    session.messages.push(userMessage)
    session.updatedAt = this.now()
    this.emitSession(session, { type: 'message.added', message: userMessage })
    session.generationState = 'running'
    this.emitSession(session, { type: 'generation.state', state: 'running' })

    const adapter = new DesktopEventAdapter(
      sessionId,
      this.now,
      session.sequence,
      false,
    )

    try {
      const iterator = this.options.runQuery({
        session,
        prompt,
        signal: abortController.signal,
      })[Symbol.asyncIterator]()
      let firstEvent = true
      while (true) {
        const next = firstEvent
          ? await this.nextWithFirstEventTimeout(iterator, abortController)
          : await this.nextWithAbort(iterator, abortController.signal)
        firstEvent = false
        if (next.done) break
        const rawEvent = next.value
        for (const event of adapter.consume(rawEvent)) {
          session.sequence = event.sequence
          if (event.type === 'message.added') session.messages.push(event.message)
          if (event.type === 'tool.updated') this.updateTool(session, event.tool)
          if (event.type === 'generation.state') {
            session.generationState = event.state
          }
          this.options.emit(event)
        }
      }
      session.generationState = 'idle'
      this.emitSession(session, { type: 'generation.state', state: 'idle' })
    } catch (error) {
      if (abortController.signal.aborted && !isFirstEventTimeout(error)) {
        session.generationState = 'idle'
        this.emitSession(session, { type: 'generation.state', state: 'idle' })
      } else {
        session.generationState = 'failed'
        this.emitSession(session, { type: 'generation.state', state: 'failed' })
        throw error
      }
    } finally {
      this.activeGeneration = null
    }
  }

  interrupt(sessionId: string): boolean {
    const active = this.activeGeneration
    if (!active || active.sessionId !== sessionId || active.abortController.signal.aborted) {
      return false
    }
    const session = this.requireSession(sessionId)
    session.generationState = 'interrupting'
    this.emitSession(session, {
      type: 'generation.state',
      state: 'interrupting',
    })
    this.options.onInterrupt?.(sessionId)
    active.abortController.abort()
    return true
  }

  setModel(sessionId: string, model: string): void {
    const session = this.requireSession(sessionId)
    session.model = model
    this.emitSnapshot(session)
  }

  setMode(sessionId: string, mode: PermissionMode): void {
    const session = this.requireSession(sessionId)
    session.mode = mode
    this.emitSnapshot(session)
  }

  emitPermissionRequest(
    sessionId: string,
    request: DesktopPermissionRequest,
  ): void {
    const session = this.requireSession(sessionId)
    this.emitPermission(session, request)
  }

  private requireSession(sessionId: string): DesktopSession {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Desktop session not found: ${sessionId}`)
    return session
  }

  private emitSnapshot(session: DesktopSession): void {
    session.sequence += 1
    this.options.emit({
      type: 'session.snapshot',
      sessionId: session.id,
      sequence: session.sequence,
      session: structuredClone(session),
    })
  }

  private emitSession(
    session: DesktopSession,
    event:
      | { type: 'message.added'; message: DesktopSession['messages'][number] }
      | { type: 'generation.state'; state: DesktopSession['generationState'] },
  ): void {
    session.sequence += 1
    this.options.emit({
      ...event,
      sessionId: session.id,
      sequence: session.sequence,
    })
  }

  private updateTool(
    session: DesktopSession,
    tool: DesktopSession['tools'][number],
  ): void {
    const index = session.tools.findIndex(current => current.id === tool.id)
    if (index === -1) session.tools.push(tool)
    else session.tools[index] = tool
  }

  private emitPermission(
    session: DesktopSession,
    request: DesktopPermissionRequest,
  ): void {
    session.sequence += 1
    this.options.emit({
      type: 'permission.requested',
      sessionId: session.id,
      sequence: session.sequence,
      request,
    })
  }

  private async nextWithFirstEventTimeout(
    iterator: AsyncIterator<unknown>,
    abortController: AbortController,
  ): Promise<IteratorResult<unknown>> {
    let timeout: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise = new Promise<IteratorResult<unknown>>((_resolve, reject) => {
      timeout = setTimeout(() => {
        reject(
          new Error(
            'Timed out waiting for the model to start responding. Check provider base URL, token, model name, and network connectivity.',
          ),
        )
        abortController.abort()
      }, this.firstEventTimeoutMs)
    })
    try {
      return await Promise.race([
        this.nextWithAbort(iterator, abortController.signal),
        timeoutPromise,
      ])
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }

  private async nextWithAbort(
    iterator: AsyncIterator<unknown>,
    signal: AbortSignal,
  ): Promise<IteratorResult<unknown>> {
    if (signal.aborted) throw new DOMException('aborted', 'AbortError')

    let onAbort: (() => void) | undefined
    const abortPromise = new Promise<IteratorResult<unknown>>((_resolve, reject) => {
      onAbort = () => reject(new DOMException('aborted', 'AbortError'))
      signal.addEventListener('abort', onAbort, { once: true })
    })

    try {
      return await Promise.race([iterator.next(), abortPromise])
    } finally {
      if (onAbort) signal.removeEventListener('abort', onAbort)
    }
  }
}
