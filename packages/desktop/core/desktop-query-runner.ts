import type { CanUseToolFn } from 'src/hooks/useCanUseTool.js'
import type { QueryEngine } from 'src/QueryEngine.js'
import type { AppState } from 'src/state/AppStateStore.js'
import { isInProcessTeammateTask } from 'src/tasks/InProcessTeammateTask/types.js'
import type { Command } from 'src/types/command.js'
import type { PermissionDecision as CorePermissionDecision } from 'src/types/permissions.js'
import type { Message } from 'src/types/message.js'
import { hasPermissionsToUseTool } from 'src/utils/permissions/permissions.js'
import { killInProcessTeammate } from 'src/utils/swarm/spawnInProcess.js'
import type { PermissionDecision } from '../shared/protocol.js'
import type { QueryRunInput } from './conversation-controller.js'
import { PermissionBroker } from './permission-broker.js'
import type {
  LeaderPermissionHandler,
} from 'src/utils/swarm/leaderPermissionBridge.js'

export function toCorePermissionDecision(
  decision: PermissionDecision,
  input: Record<string, unknown>,
): CorePermissionDecision {
  if (decision === 'allow_once' || decision === 'allow_session') {
    return { behavior: 'allow', updatedInput: input }
  }
  return {
    behavior: 'deny',
    message: 'Permission denied in SuperWork',
    decisionReason: { type: 'mode', mode: 'default' },
  }
}

// Tool name emitted by the model for the interactive multiple-choice tool.
// Kept as a local constant to avoid pulling the builtin-tools package into
// the desktop core bundle (the engine loads it lazily on its own).
const ASK_USER_QUESTION_TOOL_NAME = 'AskUserQuestion'

type AskUserQuestionPayload = {
  answers: Record<string, string>
  annotations?: Record<string, { preview?: string; notes?: string }>
}

/** Validates the payload sent back by the AskUserQuestion approval panel. */
export function parseAskUserQuestionPayload(
  payload: unknown,
): AskUserQuestionPayload | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined
  }
  const record = payload as Record<string, unknown>
  const rawAnswers = record.answers
  if (!rawAnswers || typeof rawAnswers !== 'object' || Array.isArray(rawAnswers)) {
    return undefined
  }
  const answers: Record<string, string> = {}
  for (const [question, answer] of Object.entries(rawAnswers)) {
    if (typeof answer === 'string' && answer.length > 0) {
      answers[question] = answer
    }
  }
  if (Object.keys(answers).length === 0) return undefined

  let annotations: AskUserQuestionPayload['annotations']
  const rawAnnotations = record.annotations
  if (rawAnnotations && typeof rawAnnotations === 'object' && !Array.isArray(rawAnnotations)) {
    annotations = {}
    for (const [question, note] of Object.entries(rawAnnotations)) {
      if (!note || typeof note !== 'object' || Array.isArray(note)) continue
      const { preview, notes } = note as Record<string, unknown>
      const entry: { preview?: string; notes?: string } = {}
      if (typeof preview === 'string' && preview) entry.preview = preview
      if (typeof notes === 'string' && notes) entry.notes = notes
      if (entry.preview || entry.notes) annotations[question] = entry
    }
    if (Object.keys(annotations).length === 0) annotations = undefined
  }

  return { answers, ...(annotations ? { annotations } : {}) }
}

/**
 * Merges an interactive approval payload back into the tool input, mirroring
 * what the TUI injects via updatedInput. Unknown tools pass through untouched.
 */
export function mergeInteractivePayload(
  toolName: string,
  input: Record<string, unknown>,
  payload: unknown,
): Record<string, unknown> {
  if (toolName !== ASK_USER_QUESTION_TOOL_NAME) return input
  const parsed = parseAskUserQuestionPayload(payload)
  if (!parsed) return input
  return {
    ...input,
    answers: parsed.answers,
    ...(parsed.annotations ? { annotations: parsed.annotations } : {}),
  }
}

/** Human-readable summary for the AskUserQuestion permission request. */
function askUserQuestionSummary(input: Record<string, unknown>): string {
  const questions = input.questions
  if (Array.isArray(questions) && questions.length > 0) {
    const first = questions[0]
    if (first && typeof first === 'object') {
      const text = (first as Record<string, unknown>).question
      if (typeof text === 'string' && text.trim()) {
        const oneLine = text.replace(/\s+/g, ' ').trim()
        const suffix = questions.length > 1 ? `（共 ${questions.length} 问）` : ''
        return `${oneLine}${suffix}`
      }
    }
  }
  return 'Answer questions?'
}

type EngineState = {
  engine: QueryEngine
  appState: AppState
  commands: Command[]
  teammateMirroredMessageKeys: Set<string>
  teammateMirroredStatuses: Map<string, string>
}

type KillTeammateFn = (
  taskId: string,
  setAppState: (updater: (prev: AppState) => AppState) => void,
) => boolean

export function cleanupInProcessTeammatesForSession(
  sessionId: string,
  appState: AppState,
  setAppState: (updater: (prev: AppState) => AppState) => void,
  killTeammate: KillTeammateFn = killInProcessTeammate,
): number {
  let killed = 0
  for (const [taskId, task] of Object.entries(appState.tasks)) {
    if (!isInProcessTeammateTask(task)) continue
    if (task.identity.parentSessionId !== sessionId) continue
    if (task.status !== 'running') continue
    if (killTeammate(taskId, setAppState)) killed += 1
  }
  return killed
}

export type DesktopSessionBootstrap = {
  setOriginalCwd: (cwd: string) => void
  switchSession: (
    sessionId: never,
    projectDir?: string | null,
  ) => unknown
}

export function activateDesktopSessionStorage(
  bootstrap: DesktopSessionBootstrap,
  session: Pick<QueryRunInput['session'], 'id' | 'cwd'>,
): void {
  bootstrap.setOriginalCwd(session.cwd)
  bootstrap.switchSession(session.id as never)
}

type DesktopCanUseToolOptions = {
  sessionId: string
  appState: AppState
  permissionBroker: PermissionBroker
  checkPermissions?: CanUseToolFn
}

export function createDesktopCanUseTool({
  sessionId,
  appState,
  permissionBroker,
  checkPermissions = hasPermissionsToUseTool,
}: DesktopCanUseToolOptions): CanUseToolFn {
  return async (tool, toolInput, toolUseContext, assistantMessage, toolUseId) => {
    const pipelineDecision = await checkPermissions(
      tool,
      toolInput,
      toolUseContext,
      assistantMessage,
      toolUseId,
    )
    if (pipelineDecision.behavior !== 'ask') return pipelineDecision

    // Tools requiring real user interaction (AskUserQuestion, ExitPlanMode…)
    // must not offer "allow for session": auto-allowing future calls would
    // execute them with empty interactive data (e.g. blank answers).
    const interactive = tool.requiresUserInteraction?.() === true
    const summary =
      tool.name === ASK_USER_QUESTION_TOOL_NAME
        ? askUserQuestionSummary(toolInput)
        : (pipelineDecision.message ?? tool.name)

    const { decision, payload } = await permissionBroker.request({
      sessionId,
      toolCallId: toolUseId,
      toolName: tool.name,
      summary,
      input: toolInput,
      allowSession: !interactive,
      permissionSuggestions: pipelineDecision.suggestions,
    })
    if (decision === 'allow_session') {
      const existing =
        appState.toolPermissionContext.alwaysAllowRules.session ?? []
      if (!existing.includes(tool.name)) {
        toolUseContext.setAppState(prev => ({
          ...prev,
          toolPermissionContext: {
            ...prev.toolPermissionContext,
            alwaysAllowRules: {
              ...prev.toolPermissionContext.alwaysAllowRules,
              session: [...existing, tool.name],
            },
          },
        }))
      }
    }
    const effectiveInput = mergeInteractivePayload(tool.name, toolInput, payload)
    return toCorePermissionDecision(decision, effectiveInput)
  }
}

export function createDesktopLeaderPermissionHandler({
  permissionBroker,
}: {
  permissionBroker: PermissionBroker
}): LeaderPermissionHandler {
  return async request => {
    const interactive = request.tool.requiresUserInteraction?.() === true
    const { decision, payload } = await permissionBroker.request({
      sessionId: request.identity.parentSessionId,
      toolCallId: request.toolUseID,
      toolName: request.tool.name,
      summary: request.description || request.permissionResult.message || request.tool.name,
      input: request.input,
      allowSession: !interactive,
      agentId: request.identity.agentId,
      agentName: request.identity.agentName,
      teamName: request.identity.teamName,
      permissionSuggestions: request.permissionResult.suggestions,
    })

    if (decision === 'allow_session') {
      const state = request.toolUseContext.getAppState()
      const existing = state.toolPermissionContext.alwaysAllowRules.session ?? []
      if (!existing.includes(request.tool.name)) {
        request.toolUseContext.setAppState(prev => ({
          ...prev,
          toolPermissionContext: {
            ...prev.toolPermissionContext,
            alwaysAllowRules: {
              ...prev.toolPermissionContext.alwaysAllowRules,
              session: [...existing, request.tool.name],
            },
          },
        }))
      }
    }

    return toCorePermissionDecision(
      decision,
      mergeInteractivePayload(request.tool.name, request.input, payload),
    )
  }
}

function parseSlashName(prompt: string): string | null {
  const trimmed = prompt.trim()
  if (!trimmed.startsWith('/')) return null
  const name = trimmed.slice(1).split(/\s+/, 1)[0]?.toLowerCase()
  return name || null
}

function commandDisplayName(command: Command): string {
  return command.userFacingName?.() || command.name
}

function mirrorTeammateMessages(state: EngineState): unknown[] {
  const events: unknown[] = []
  for (const [taskId, task] of Object.entries(state.appState.tasks)) {
    if (!isInProcessTeammateTask(task)) continue
    const statusKey = `${task.status}:${task.isIdle ? 'idle' : 'active'}`
    if (state.teammateMirroredStatuses.get(taskId) !== statusKey) {
      state.teammateMirroredStatuses.set(taskId, statusKey)
      events.push({
        type: 'assistant',
        message: {
          content: [{
            type: 'tool_use',
            id: `desktop-agent-status-${taskId}`,
            name: 'Agent',
            input: {
              name: task.identity.agentName,
              team_name: task.identity.teamName,
              subagent_type: task.selectedAgent?.agentType ?? 'general-purpose',
              desktop_status: task.status,
              desktop_idle: task.isIdle,
            },
          }],
        },
        uuid: `${task.identity.agentId}:desktop-status:${statusKey}`,
        agent_id: task.identity.agentId,
        agent_name: task.identity.agentName,
        team_name: task.identity.teamName,
      })
    }
    const messages = task.messages ?? []
    for (let index = 0; index < messages.length; index++) {
      const message = messages[index]
      if (!message || (message.type !== 'assistant' && message.type !== 'user')) continue
      const key = `${taskId}:${message.uuid ?? index}:${message.type}`
      if (state.teammateMirroredMessageKeys.has(key)) continue
      state.teammateMirroredMessageKeys.add(key)
      events.push({
        type: message.type,
        message: message.message,
        uuid: `${task.identity.agentId}:${message.uuid ?? index}`,
        agent_id: task.identity.agentId,
        agent_name: task.identity.agentName,
        team_name: task.identity.teamName,
      })
    }
  }
  return events
}

export function desktopSlashFallback(prompt: string, commands: readonly Command[]): string | null {
  const slashName = parseSlashName(prompt)
  if (slashName !== 'help') return null

  const visibleCommands = commands
    .filter(command => command.isHidden !== true)
    .filter(command => command.isEnabled?.() ?? true)
    .slice()
    .sort((a, b) => commandDisplayName(a).localeCompare(commandDisplayName(b)))

  const commandLines = visibleCommands.map(command => {
    const aliases = command.aliases?.length ? `（别名：${command.aliases.map(alias => `/${alias}`).join('、')}）` : ''
    return `- \`/${commandDisplayName(command)}\` — ${command.description}${aliases}`
  })

  return [
    '## Claude Code 指令',
    '',
    '这些指令可以直接从 SuperWork 输入框输入。配置类指令会打开对应设置页，其他指令会按 Claude Code 的原有命令链路执行。',
    '',
    ...commandLines,
  ].join('\n')
}

function assistantTextEvent(content: string): unknown {
  return {
    type: 'assistant',
    uuid: `desktop-slash-${Date.now()}`,
    message: {
      content: [{ type: 'text', text: content }],
    },
  }
}

export function subscribeInterrupt(signal: AbortSignal, interrupt: () => void): () => void {
  if (signal.aborted) {
    interrupt()
    return () => {}
  }
  signal.addEventListener('abort', interrupt, { once: true })
  return () => signal.removeEventListener('abort', interrupt)
}

export async function nextResultWithTimeout<T>(
  next: () => Promise<IteratorResult<T>>,
  timeoutMs: number,
  onTimeout: () => void,
  timeoutMessage: string,
): Promise<IteratorResult<T>> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<IteratorResult<T>>((_resolve, reject) => {
    timeout = setTimeout(() => {
      onTimeout()
      reject(new Error(timeoutMessage))
    }, timeoutMs)
  })

  try {
    return await Promise.race([next(), timeoutPromise])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

type NextWithMirrorOptions = {
  mirrorIntervalMs: number
  timeoutMs?: number
  onTimeout?: () => void
  timeoutMessage?: string
}

export async function* nextResultWithMirrorTicks<T>(
  next: () => Promise<IteratorResult<T>>,
  mirror: () => Iterable<unknown>,
  options: NextWithMirrorOptions,
): AsyncGenerator<unknown, IteratorResult<T>> {
  const nextPromise = next().then(result => ({ kind: 'next' as const, result }))
  const timeoutPromise = options.timeoutMs === undefined
    ? undefined
    : new Promise<{ kind: 'timeout' }>(resolve => {
        setTimeout(() => resolve({ kind: 'timeout' }), options.timeoutMs)
      })

  while (true) {
    const tickPromise = new Promise<{ kind: 'tick' }>(resolve => {
      setTimeout(() => resolve({ kind: 'tick' }), options.mirrorIntervalMs)
    })
    const winner = await Promise.race(
      timeoutPromise
        ? [nextPromise, tickPromise, timeoutPromise]
        : [nextPromise, tickPromise],
    )
    if (winner.kind === 'next') return winner.result
    if (winner.kind === 'timeout') {
      options.onTimeout?.()
      throw new Error(options.timeoutMessage ?? 'Timed out waiting for the model to start responding')
    }
    for (const event of mirror()) yield event
  }
}

/** Lazily creates one existing QueryEngine per desktop session. */
export class DesktopQueryRunner {
  private readonly engines = new Map<string, EngineState>()

  constructor(
    private readonly permissionBroker: PermissionBroker,
    private readonly loadInitialMessages: (sessionId: string) => unknown[] = () => [],
  ) {}

  cleanupSession(sessionId: string): number {
    const state = this.engines.get(sessionId)
    if (!state) return 0
    state.engine.interrupt()
    const killed = cleanupInProcessTeammatesForSession(
      sessionId,
      state.appState,
      updater => Object.assign(state.appState, updater(state.appState)),
    )
    this.engines.delete(sessionId)
    return killed
  }

  cleanupAll(): number {
    let killed = 0
    for (const sessionId of [...this.engines.keys()]) {
      killed += this.cleanupSession(sessionId)
    }
    return killed
  }

  async *run(input: QueryRunInput): AsyncGenerator<unknown> {
    console.error(`[desktop-core] query.start session=${input.session.id}`)
    const bootstrapModule = await import('src/bootstrap/state.js')
    activateDesktopSessionStorage(bootstrapModule, input.session)
    const state = await this.getOrCreateEngine(input)
    console.error(`[desktop-core] query.engine_ready session=${input.session.id}`)
    state.engine.resetAbortController()
    state.engine.setModel(input.session.model)
    state.appState.toolPermissionContext.mode = input.session.mode

    const fallback = desktopSlashFallback(input.prompt, state.commands)
    if (fallback) {
      yield assistantTextEvent(fallback)
      console.error(`[desktop-core] query.local_slash session=${input.session.id}`)
      return
    }

    const interrupt = () => {
      console.error(`[desktop-core] query.abort session=${input.session.id}`)
      state.engine.interrupt()
    }
    const unsubscribeInterrupt = subscribeInterrupt(input.signal, interrupt)
    try {
      console.error(`[desktop-core] query.interrupt_subscribed session=${input.session.id}`)
      const iterator = state.engine.submitMessage(input.prompt)[Symbol.asyncIterator]()
      let isFirstResult = true
      while (true) {
        const mirroredIterator = nextResultWithMirrorTicks(
          () => iterator.next(),
          () => mirrorTeammateMessages(state),
          {
            mirrorIntervalMs: 250,
            ...(isFirstResult ? {
              timeoutMs: 45_000,
              onTimeout: () => {
                console.error(`[desktop-core] query.first_event_timeout session=${input.session.id}`)
                state.engine.interrupt()
              },
              timeoutMessage: 'Timed out waiting for the model to start responding. Check provider base URL, token, model name, and network connectivity.',
            } : {}),
          },
        )[Symbol.asyncIterator]()
        let next: IteratorResult<unknown>
        while (true) {
          const mirrored = await mirroredIterator.next()
          if (mirrored.done) {
            next = mirrored.value
            break
          }
          yield mirrored.value
        }
        if (isFirstResult) {
          console.error(`[desktop-core] query.first_event session=${input.session.id}`)
        }
        isFirstResult = false
        if (next.done) break
        yield next.value
        for (const teammateEvent of mirrorTeammateMessages(state)) {
          yield teammateEvent
        }
      }
      for (const teammateEvent of mirrorTeammateMessages(state)) {
        yield teammateEvent
      }
      console.error(`[desktop-core] query.done session=${input.session.id}`)
    } catch (error) {
      console.error(
        `[desktop-core] query.error session=${input.session.id} message=${error instanceof Error ? error.message : String(error)}`,
      )
      throw error
    } finally {
      unsubscribeInterrupt()
    }
  }

  private async getOrCreateEngine(input: QueryRunInput): Promise<EngineState> {
    const existing = this.engines.get(input.session.id)
    if (existing) return existing

    console.error(`[desktop-core] query.create_engine session=${input.session.id}`)
    const [queryEngineModule, toolsModule, toolModule, commandModule, agentModule, stateModule, cacheModule] =
      await Promise.all([
        import('src/QueryEngine.js'),
        import('src/tools.js'),
        import('src/Tool.js'),
        import('src/commands.js'),
        import('@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js'),
        import('src/state/AppStateStore.js'),
        import('src/utils/fileStateCache.js'),
      ])

    const permissionContext = toolModule.getEmptyToolPermissionContext()
    permissionContext.mode = input.session.mode
    const appState = stateModule.getDefaultAppState()
    appState.toolPermissionContext = permissionContext
    const [commands, agentDefinitions] = await Promise.all([
      commandModule.getCommands(input.session.cwd),
      agentModule.getAgentDefinitionsWithOverrides(input.session.cwd),
    ])
    console.error(`[desktop-core] query.context_ready session=${input.session.id}`)
    appState.agentDefinitions = agentDefinitions

    const canUseTool = createDesktopCanUseTool({
      sessionId: input.session.id,
      appState,
      permissionBroker: this.permissionBroker,
    })

    const engine = new queryEngineModule.QueryEngine({
      cwd: input.session.cwd,
      tools: toolsModule.getTools(permissionContext),
      commands,
      mcpClients: [],
      agents: agentDefinitions.activeAgents,
      canUseTool,
      getAppState: () => appState,
      setAppState: updater => Object.assign(appState, updater(appState)),
      readFileCache: new cacheModule.FileStateCache(500, 50 * 1024 * 1024),
      includePartialMessages: true,
      replayUserMessages: true,
      userSpecifiedModel: input.session.model,
      initialMessages: this.loadInitialMessages(input.session.id) as unknown as Message[],
    })
    const state = {
      engine,
      appState,
      commands,
      teammateMirroredMessageKeys: new Set<string>(),
      teammateMirroredStatuses: new Map<string, string>(),
    }
    this.engines.set(input.session.id, state)
    return state
  }
}
