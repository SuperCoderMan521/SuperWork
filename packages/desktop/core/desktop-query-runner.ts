import type { CanUseToolFn } from 'src/hooks/useCanUseTool.js'
import type { QueryEngine } from 'src/QueryEngine.js'
import type { AppState } from 'src/state/AppStateStore.js'
import type { Command } from 'src/types/command.js'
import type { PermissionDecision as CorePermissionDecision } from 'src/types/permissions.js'
import type { Message } from 'src/types/message.js'
import { hasPermissionsToUseTool } from 'src/utils/permissions/permissions.js'
import type { PermissionDecision } from '../shared/protocol.js'
import type { QueryRunInput } from './conversation-controller.js'
import { PermissionBroker } from './permission-broker.js'

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

function parseSlashName(prompt: string): string | null {
  const trimmed = prompt.trim()
  if (!trimmed.startsWith('/')) return null
  const name = trimmed.slice(1).split(/\s+/, 1)[0]?.toLowerCase()
  return name || null
}

function commandDisplayName(command: Command): string {
  return command.userFacingName?.() || command.name
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

/** Lazily creates one existing QueryEngine per desktop session. */
export class DesktopQueryRunner {
  private readonly engines = new Map<string, EngineState>()

  constructor(
    private readonly permissionBroker: PermissionBroker,
    private readonly loadInitialMessages: (sessionId: string) => unknown[] = () => [],
  ) {}

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
        const next = isFirstResult
          ? await nextResultWithTimeout(
              () => iterator.next(),
              45_000,
              () => {
                console.error(`[desktop-core] query.first_event_timeout session=${input.session.id}`)
                state.engine.interrupt()
              },
              'Timed out waiting for the model to start responding. Check provider base URL, token, model name, and network connectivity.',
            )
          : await iterator.next()
        if (isFirstResult) {
          console.error(`[desktop-core] query.first_event session=${input.session.id}`)
        }
        isFirstResult = false
        if (next.done) break
        yield next.value
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
    const state = { engine, appState, commands }
    this.engines.set(input.session.id, state)
    return state
  }
}
