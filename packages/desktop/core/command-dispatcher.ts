import type {
  DesktopConfigSnapshot,
  DesktopCommand,
  DesktopEvent,
  DesktopModelConnectionResult,
  DesktopModelConfig,
  DesktopPerformanceRange,
  DesktopPerformanceSnapshot,
  DesktopSession,
  DesktopSessionSummary,
  PermissionDecision,
  PermissionMode,
} from '../shared/protocol.js'
import type { DesktopBuddyService } from './buddy-service.js'

export interface DesktopConversationCommands {
  createSession(cwd: string): DesktopSession
  submitPrompt(sessionId: string, text: string): Promise<unknown>
  interrupt(sessionId: string): boolean
  setModel(sessionId: string, model: string): void
  setMode(sessionId: string, mode: PermissionMode): void
}

type CommandDispatcherOptions = {
  controller: DesktopConversationCommands
  listSessions: () => Promise<DesktopSessionSummary[]>
  resumeSession?: (sessionId: string) => Promise<void>
  deleteSession?: (sessionId: string) => Promise<void>
  emitSnapshot?: (sessionId: string) => void
  resolvePermission: (id: string, decision: PermissionDecision) => boolean
  getConfig?: (cwd: string) => Promise<DesktopConfigSnapshot>
  writeConfig?: (cwd: string, modelConfig: DesktopModelConfig) => Promise<DesktopConfigSnapshot>
  testConfig?: (modelConfig: DesktopModelConfig, cwd: string) => Promise<DesktopModelConnectionResult>
  readFile?: (path: string, cwd?: string) => Promise<string>
  writeFile?: (path: string, content: string, cwd?: string) => Promise<string>
  readMemory?: (path: string) => Promise<Extract<DesktopEvent, { type: 'memory.loaded' }>['file']>
  writeMemory?: (path: string, content: string) => Promise<Extract<DesktopEvent, { type: 'memory.saved' }>['file']>
  compactMemory?: (path: string, content: string) => Promise<Omit<Extract<DesktopEvent, { type: 'memory.compacted' }>, 'type' | 'requestId'>>
  emit: (event: DesktopEvent) => void
  shutdown: () => Promise<void>
  buddy?: DesktopBuddyService
  getPerformance?: (cwd: string, range: DesktopPerformanceRange, force?: boolean) => Promise<DesktopPerformanceSnapshot>
}

function unsupported(command: DesktopCommand['type']): never {
  throw new Error(`Desktop command is not configured: ${command}`)
}

function queryFailed(
  requestId: string,
  sessionId: string,
  error: unknown,
): DesktopEvent {
  return {
    type: 'command.failed',
    requestId,
    sessionId,
    error: {
      code: 'QUERY_FAILED',
      message: error instanceof Error ? error.message : 'Command failed',
      recoverable: true,
    },
  }
}

/** Routes validated protocol commands to small domain services. */
export class DesktopCommandDispatcher {
  constructor(private readonly options: CommandDispatcherOptions) {}

  async dispatch(command: DesktopCommand): Promise<void> {
    switch (command.type) {
      case 'session.list':
        this.options.emit({
          type: 'session.listed',
          requestId: command.requestId,
          sessions: await this.options.listSessions(),
        })
        return
      case 'session.create':
        this.options.controller.createSession(command.cwd)
        return
      case 'session.resume':
        if (!this.options.resumeSession) unsupported(command.type)
        void this.options.resumeSession(command.sessionId).catch(error => {
          this.options.emit(queryFailed(command.requestId, command.sessionId, error))
        })
        return
      case 'session.delete':
        await (this.options.deleteSession?.(command.sessionId) ??
          unsupported(command.type))
        return
      case 'session.snapshot':
        if (!this.options.emitSnapshot) unsupported(command.type)
        this.options.emitSnapshot(command.sessionId)
        return
      case 'prompt.submit':
        void this.options.controller
          .submitPrompt(command.sessionId, command.text)
          .catch(error => {
            this.options.emit(queryFailed(command.requestId, command.sessionId, error))
          })
        return
      case 'generation.interrupt':
        if (!this.options.controller.interrupt(command.sessionId)) {
          this.options.emit({
            type: 'command.failed',
            requestId: command.requestId,
            sessionId: command.sessionId,
            error: {
              code: 'QUERY_FAILED',
              message: 'No active generation to interrupt',
              recoverable: true,
            },
          })
        }
        return
      case 'permission.resolve':
        if (!this.options.resolvePermission(command.permissionId, command.decision)) {
          return
        }
        return
      case 'model.set':
        this.options.controller.setModel(command.sessionId, command.model)
        return
      case 'mode.set':
        this.options.controller.setMode(command.sessionId, command.mode)
        return
      case 'config.get':
        this.options.emit({
          type: 'config.snapshot',
          requestId: command.requestId,
          config: await (this.options.getConfig?.(command.cwd) ??
            unsupported(command.type)),
        })
        return
      case 'config.write':
        this.options.emit({
          type: 'config.saved',
          requestId: command.requestId,
          config: await (this.options.writeConfig?.(command.cwd, command.modelConfig) ??
            unsupported(command.type)),
        })
        return
      case 'config.test':
        this.options.emit({
          type: 'config.tested',
          requestId: command.requestId,
          result: await (this.options.testConfig?.(command.modelConfig, command.cwd) ??
            unsupported(command.type)),
        })
        return
      case 'file.read':
        this.options.emit({
          type: 'file.loaded',
          requestId: command.requestId,
          path: command.path,
          content: await (this.options.readFile?.(command.path, command.cwd) ??
            unsupported(command.type)),
        })
        return
      case 'file.write':
        this.options.emit({
          type: 'file.saved',
          requestId: command.requestId,
          path: command.path,
          content: await (this.options.writeFile?.(command.path, command.content, command.cwd) ??
            unsupported(command.type)),
        })
        return
      case 'memory.read':
        this.options.emit({
          type: 'memory.loaded',
          requestId: command.requestId,
          file: await (this.options.readMemory?.(command.path) ??
            unsupported(command.type)),
        })
        return
      case 'memory.write':
        this.options.emit({
          type: 'memory.saved',
          requestId: command.requestId,
          file: await (this.options.writeMemory?.(command.path, command.content) ??
            unsupported(command.type)),
        })
        return
      case 'memory.compact': {
        const result = await (this.options.compactMemory?.(command.path, command.content) ??
          unsupported(command.type))
        this.options.emit({
          type: 'memory.compacted',
          requestId: command.requestId,
          ...result,
        })
        return
      }
      case 'core.shutdown':
        await this.options.shutdown()
        return
      case 'buddy.get':
        this.options.emit({ type: 'buddy.snapshot', requestId: command.requestId, state: await (this.options.buddy?.snapshot() ?? unsupported(command.type)) })
        return
      case 'buddy.hatch':
        this.options.emit({ type: 'buddy.snapshot', requestId: command.requestId, state: await (this.options.buddy?.hatch() ?? unsupported(command.type)) })
        return
      case 'buddy.rehatch':
        this.options.emit({ type: 'buddy.snapshot', requestId: command.requestId, state: await (this.options.buddy?.hatch(true) ?? unsupported(command.type)) })
        return
      case 'buddy.pet':
        this.options.emit({ type: 'buddy.snapshot', requestId: command.requestId, state: await (this.options.buddy?.pet() ?? unsupported(command.type)) })
        return
      case 'buddy.setMuted':
        this.options.emit({ type: 'buddy.snapshot', requestId: command.requestId, state: await (this.options.buddy?.setMuted(command.muted) ?? unsupported(command.type)) })
        return
      case 'performance.get':
        this.options.emit({
          type: 'performance.snapshot',
          requestId: command.requestId,
          snapshot: await (this.options.getPerformance?.(command.cwd, command.range, command.force) ?? unsupported(command.type)),
        })
        return
    }
  }
}
