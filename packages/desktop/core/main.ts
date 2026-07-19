import { encodeJsonLine } from '../electron/json-lines.js'
import type { DesktopEvent } from '../shared/protocol.js'
import { DesktopCommandDispatcher } from './command-dispatcher.js'
import { DesktopConversationController } from './conversation-controller.js'
import { DesktopConfigService } from './desktop-config-service.js'
import { DesktopQueryRunner } from './desktop-query-runner.js'
import { runCoreProtocol } from './entry.js'
import { testModelConnection } from './model-connection-test.js'
import { PermissionBroker } from './permission-broker.js'
import { SessionService } from './session-service.js'
import { DesktopBuddyService } from './buddy-service.js'

/**
 * Writes a leveled log line to stderr so it never pollutes the JSON Lines
 * protocol stream on stdout. The Electron sidecar captures stderr and
 * `diagnostics-service` routes the line to the right logger level.
 */
function logCore(level: 'info' | 'error', message: string): void {
  process.stderr.write(`[${level.toUpperCase()}] [desktop-core] ${message}\n`)
}

async function* stdinChunks(): AsyncGenerator<string> {
  const decoder = new TextDecoder()
  for await (const chunk of Bun.stdin.stream() as unknown as AsyncIterable<Uint8Array>) {
    yield decoder.decode(chunk, { stream: true })
  }
  const final = decoder.decode()
  if (final) yield final
}

async function main(): Promise<void> {
  logCore('info', 'startup begin')
  const emit = (event: DesktopEvent) => {
    process.stdout.write(encodeJsonLine(event))
  }

  const { init } = await import('src/entrypoints/init.js')
  await init()
  logCore('info', 'startup init_complete')

  const { applyConfigEnvironmentVariables } = await import('src/utils/managedEnv.js')
  applyConfigEnvironmentVariables()
  logCore('info', 'startup config_env_applied')

  const [modelModule, providerModule, sessionModule, storageModule, bootstrapModule] =
    await Promise.all([
      import('src/utils/model/model.js'),
      import('src/utils/model/providers.js'),
      import('src/utils/listSessionsImpl.js'),
      import('src/utils/sessionStorage.js'),
      import('src/bootstrap/state.js'),
    ])
  const sessionService = new SessionService(
    sessionModule.listSessionsImpl,
    async info => {
      if (info.cwd) bootstrapModule.setOriginalCwd(info.cwd)
      const path = storageModule.getTranscriptPathForSession(info.sessionId)
      const logs = await storageModule.loadAllLogsFromSessionFile(path, info.cwd)
      const longest = logs.sort(
        (left, right) => right.messages.length - left.messages.length,
      )[0]
      return longest?.messages ?? []
    },
    cwd => storageModule.getProjectDir(cwd),
  )
  const defaultModel = modelModule.getMainLoopModel()
  logCore(
    'info',
    `startup model_ready provider=${providerModule.getAPIProvider()} model=${defaultModel} baseUrlSet=${Boolean(
      process.env.ANTHROPIC_BASE_URL ||
        process.env.OPENAI_BASE_URL ||
        process.env.GEMINI_BASE_URL ||
        process.env.GROK_BASE_URL,
    )} tokenSet=${Boolean(
      process.env.ANTHROPIC_API_KEY ||
        process.env.ANTHROPIC_AUTH_TOKEN ||
        process.env.CLAUDE_CODE_OAUTH_TOKEN ||
        process.env.OPENAI_API_KEY ||
        process.env.GEMINI_API_KEY ||
        process.env.GROK_API_KEY ||
        process.env.XAI_API_KEY,
    )}`,
  )

  let controller: DesktopConversationController | undefined
  const permissionBroker = new PermissionBroker({
    emit: (request, sessionId) =>
      controller?.emitPermissionRequest(sessionId, request),
  })
  const queryRunner = new DesktopQueryRunner(
    permissionBroker,
    sessionId => sessionService.rawMessages(sessionId),
  )
  const configService = new DesktopConfigService()
  const buddy = new DesktopBuddyService()
  controller = new DesktopConversationController({
    runQuery: input => queryRunner.run(input),
    emit,
    defaultModel,
    defaultMode: 'default',
    getModelConfig: cwd => configService.modelConfig(cwd),
    onInterrupt: sessionId => {
      permissionBroker.cancelSession(sessionId)
    },
  })

  const dispatcher = new DesktopCommandDispatcher({
    controller,
    listSessions: () => sessionService.list(),
    resumeSession: async sessionId => {
      controller?.restoreSession(
        sessionService.summarySnapshot(sessionId, defaultModel, 'default'),
      )
      const snapshot = await sessionService.resume(
        sessionId,
        defaultModel,
        'default',
      )
      controller?.restoreSession(snapshot)
    },
    deleteSession: async sessionId => {
      controller?.deleteSession(sessionId)
      const transcriptPath = sessionService.transcriptPathForDelete(
        sessionId,
        storageModule.getTranscriptPathForSession,
      )
      await Bun.file(transcriptPath).delete().catch(() => {})
      emit({ type: 'session.deleted', sessionId })
    },
    emitSnapshot: sessionId => controller?.emitCurrentSnapshot(sessionId),
    resolvePermission: (id, decision) => permissionBroker.resolve(id, decision),
    getConfig: cwd => configService.snapshot(cwd),
    writeConfig: async (cwd, modelConfig) => {
      const snapshot = await configService.writeConfig(cwd, modelConfig)
      applyConfigEnvironmentVariables()
      return snapshot
    },
    testConfig: modelConfig => testModelConnection(modelConfig),
    readFile: (path, cwd) => configService.readFile(path, cwd),
    writeFile: (path, content, cwd) => configService.writeFile(path, content, cwd),
    readMemory: path => configService.readMemory(path),
    writeMemory: (path, content) => configService.writeMemory(path, content),
    compactMemory: (path, content) => configService.compactMemory(path, content),
    emit,
    shutdown: async () => {
      permissionBroker.cancelAll()
      await storageModule.flushSessionStorage()
    },
    buddy,
  })

  logCore('info', 'startup services_ready, entering protocol pump')
  await runCoreProtocol({
    input: stdinChunks(),
    emit,
    dispatch: command => dispatcher.dispatch(command),
  })
}

void main().catch(error => {
  console.error('[desktop-core] fatal:', error)
  process.exitCode = 1
})
