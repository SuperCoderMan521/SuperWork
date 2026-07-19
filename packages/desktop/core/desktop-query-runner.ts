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

type EngineState = {
  engine: QueryEngine
  appState: AppState
  commands: Command[]
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

    const decision = await permissionBroker.request({
      sessionId,
      toolCallId: toolUseId,
      toolName: tool.name,
      summary: pipelineDecision.message ?? tool.name,
      input: toolInput,
      allowSession: true,
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
    return toCorePermissionDecision(decision, toolInput)
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
    const [queryEngineModule, toolsModule, toolModule, commandModule, agentModule, stateModule, cacheModule, bootstrapModule] =
      await Promise.all([
        import('src/QueryEngine.js'),
        import('src/tools.js'),
        import('src/Tool.js'),
        import('src/commands.js'),
        import('@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js'),
        import('src/state/AppStateStore.js'),
        import('src/utils/fileStateCache.js'),
        import('src/bootstrap/state.js'),
      ])

    bootstrapModule.switchSession(input.session.id as never, input.session.cwd)
    bootstrapModule.setOriginalCwd(input.session.cwd)

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
