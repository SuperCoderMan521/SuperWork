import type {
  DesktopCommand,
  DesktopEvent,
  DesktopModelConfig,
  DiagnosticsSnapshot,
  PermissionDecision,
  PermissionMode,
} from '../shared/protocol.js'
import type { WorkspaceEditor } from './workspace-editor-service.js'

export type DesktopEventListener = (event: DesktopEvent) => void
export type DesktopEventSubscriber = (
  listener: DesktopEventListener,
) => () => void

export type DesktopApi = {
  listSessions(): void
  createSession(cwd: string): void
  resumeSession(sessionId: string): void
  deleteSession(sessionId: string): void
  submitPrompt(sessionId: string, text: string): void
  interruptGeneration(sessionId: string): void
  resolvePermission(id: string, decision: PermissionDecision): void
  setModel(sessionId: string, model: string): void
  setMode(sessionId: string, mode: PermissionMode): void
  getConfig(cwd: string): void
  writeConfig(cwd: string, modelConfig: DesktopModelConfig): void
  testConfig(cwd: string, modelConfig: DesktopModelConfig): void
  readFile(path: string, cwd?: string): void
  writeFile(path: string, content: string, cwd?: string): void
  readMemory(path: string): void
  writeMemory(path: string, content: string): void
  compactMemory(path: string, content: string): void
  getBuddy(): void
  hatchBuddy(): void
  rehatchBuddy(): void
  petBuddy(): void
  setBuddyMuted(muted: boolean): void
  subscribe(listener: DesktopEventListener): () => void
  getDiagnostics(): Promise<DiagnosticsSnapshot>
  openLogFolder(): Promise<void>
  selectWorkspace(): Promise<string | null>
  listWorkspaceEditors(refresh?: boolean): Promise<WorkspaceEditor[]>
  openWorkspaceInEditor(editorId: string, workspace: string): Promise<void>
}

type DiagnosticsApi = {
  get: () => Promise<DiagnosticsSnapshot>
  openFolder: () => Promise<void>
  selectWorkspace?: () => Promise<string | null>
  listWorkspaceEditors?: (refresh: boolean) => Promise<WorkspaceEditor[]>
  openWorkspaceInEditor?: (editorId: string, workspace: string) => Promise<void>
}

const unavailableDiagnostics: DiagnosticsApi = {
  get: () => Promise.reject(new Error('Diagnostics API is unavailable')),
  openFolder: () => Promise.reject(new Error('Diagnostics API is unavailable')),
}

/** Creates the renderer API without exposing a generic IPC primitive. */
export function createDesktopApi(
  send: (command: DesktopCommand) => void,
  subscribe: DesktopEventSubscriber,
  createRequestId: () => string,
  diagnostics: DiagnosticsApi = unavailableDiagnostics,
): DesktopApi {
  const request = () => createRequestId()
  return Object.freeze({
    listSessions: () =>
      send({ type: 'session.list', requestId: request() }),
    createSession: cwd =>
      send({ type: 'session.create', requestId: request(), cwd }),
    resumeSession: sessionId =>
      send({ type: 'session.resume', requestId: request(), sessionId }),
    deleteSession: sessionId =>
      send({ type: 'session.delete', requestId: request(), sessionId }),
    submitPrompt: (sessionId, text) =>
      send({
        type: 'prompt.submit',
        requestId: request(),
        sessionId,
        text,
      }),
    interruptGeneration: sessionId =>
      send({
        type: 'generation.interrupt',
        requestId: request(),
        sessionId,
      }),
    resolvePermission: (permissionId, decision) =>
      send({
        type: 'permission.resolve',
        requestId: request(),
        permissionId,
        decision,
      }),
    setModel: (sessionId, model) =>
      send({ type: 'model.set', requestId: request(), sessionId, model }),
    setMode: (sessionId, mode) =>
      send({ type: 'mode.set', requestId: request(), sessionId, mode }),
    getConfig: cwd =>
      send({ type: 'config.get', requestId: request(), cwd }),
    writeConfig: (cwd, modelConfig) =>
      send({ type: 'config.write', requestId: request(), cwd, modelConfig }),
    testConfig: (cwd, modelConfig) =>
      send({ type: 'config.test', requestId: request(), cwd, modelConfig }),
    readFile: (path, cwd) =>
      send({ type: 'file.read', requestId: request(), path, cwd }),
    writeFile: (path, content, cwd) =>
      send({ type: 'file.write', requestId: request(), path, cwd, content }),
    readMemory: path =>
      send({ type: 'memory.read', requestId: request(), path }),
    writeMemory: (path, content) =>
      send({ type: 'memory.write', requestId: request(), path, content }),
    compactMemory: (path, content) =>
      send({ type: 'memory.compact', requestId: request(), path, content }),
    getBuddy: () => send({ type: 'buddy.get', requestId: request() }),
    hatchBuddy: () => send({ type: 'buddy.hatch', requestId: request() }),
    rehatchBuddy: () => send({ type: 'buddy.rehatch', requestId: request() }),
    petBuddy: () => send({ type: 'buddy.pet', requestId: request() }),
    setBuddyMuted: muted => send({ type: 'buddy.setMuted', requestId: request(), muted }),
    subscribe,
    getDiagnostics: diagnostics.get,
    openLogFolder: diagnostics.openFolder,
    selectWorkspace: diagnostics.selectWorkspace ?? (() => Promise.resolve(null)),
    listWorkspaceEditors: refresh =>
      diagnostics.listWorkspaceEditors?.(Boolean(refresh)) ?? Promise.resolve([]),
    openWorkspaceInEditor: (editorId, workspace) =>
      diagnostics.openWorkspaceInEditor?.(editorId, workspace) ??
      Promise.reject(new Error('Workspace editor API is unavailable')),
  })
}
