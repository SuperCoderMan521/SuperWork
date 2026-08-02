import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type {
  DesktopConfigSnapshot,
  DesktopEvent,
  DesktopAgentMailboxSnapshot,
  DesktopChannelWeixinRuntime,
  DesktopMemoryFile,
  DesktopModelConnectionResult,
  DesktopModelConfig,
  DesktopPerformanceRange,
  DesktopPerformanceSnapshot,
  DesktopScheduledTasksSnapshot,
  DesktopSessionSummary,
  DiagnosticsSnapshot,
  PermissionMode,
} from '../../../shared/protocol.js'
import { ConversationPane } from '../features/chat/ConversationPane.js'
import { Composer } from '../features/chat/Composer.js'
import { DiagnosticsDrawer } from '../features/diagnostics/DiagnosticsDrawer.js'
import {
  ConversationFilesPanel,
  filesFromTools,
} from '../features/files/ConversationFilesPanel.js'
import { SessionSidebar } from '../features/history/SessionSidebar.js'
import { ConfigCenter, type ConfigTab } from '../features/settings/ConfigCenter.js'
import { BrandName } from '../components/BrandName.js'
import { BuddyPanel } from '../features/buddy/BuddyPanel.js'
import { PerformanceCenter } from '../features/performance/PerformanceCenter.js'
import { ScheduledTasksCenter } from '../features/scheduled-tasks/ScheduledTasksCenter.js'
import type { BuddySnapshot } from '../../../shared/protocol.js'
import { buildAgentActivity } from '../features/agents/AgentActivityPanel.js'
import {
  deriveLocalArtifacts,
  type DesktopLocalArtifact,
} from '../features/artifacts/localArtifacts.js'
import {
  WorkspacePanel,
  type WorkspaceTab,
} from '../features/workspace/WorkspacePanel.js'
import { ResizableWorkspace } from './ResizableWorkspace.js'
import {
  createDesktopState,
  desktopReducer,
  type DesktopRendererState,
} from './reducer.js'

type View = 'chat' | 'settings' | 'performance' | 'scheduledTasks'
const PROJECT_DEFAULT_CWD = '.'
const LAST_WORKSPACE_KEY = 'superwork.lastWorkspace'
const LAST_APPROVAL_MODE_KEY = 'superwork.lastApprovalMode'
export const AGENT_MAILBOX_POLL_MS = 1500

function isPersistentApprovalMode(mode: PermissionMode): mode is 'default' | 'auto' | 'bypassPermissions' {
  return mode === 'default' || mode === 'auto' || mode === 'bypassPermissions'
}

function readStoredWorkspace(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(LAST_WORKSPACE_KEY)
  } catch {
    return null
  }
}

function rememberWorkspace(cwd: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LAST_WORKSPACE_KEY, cwd)
  } catch {
    // Ignore storage failures.
  }
}

function readStoredApprovalMode(): PermissionMode {
  if (typeof window === 'undefined') return 'default'
  try {
    const stored = window.localStorage.getItem(LAST_APPROVAL_MODE_KEY)
    return isPersistentApprovalMode(stored as PermissionMode)
      ? (stored as PermissionMode)
      : 'default'
  } catch {
    return 'default'
  }
}

function rememberApprovalMode(mode: PermissionMode): void {
  if (!isPersistentApprovalMode(mode) || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LAST_APPROVAL_MODE_KEY, mode)
  } catch {
    // Ignore storage failures.
  }
}

export function defaultWorkspaceForNewSession(
  currentSessionCwd: string | null | undefined,
  projectDefault = PROJECT_DEFAULT_CWD,
): string {
  return currentSessionCwd || projectDefault
}

export function defaultWorkspaceFromSources(
  selectedSessionCwd: string | null | undefined,
  storedWorkspace: string | null,
  latestSessionCwd: string | null | undefined,
  projectDefault = PROJECT_DEFAULT_CWD,
): string {
  return selectedSessionCwd ?? storedWorkspace ?? latestSessionCwd ?? projectDefault
}

export function settingsCwdForConfig(
  currentSessionCwd: string | null | undefined,
  defaultWorkspace: string,
): string {
  return currentSessionCwd || defaultWorkspace
}

function emptyChannelSnapshot(cwd: string): DesktopConfigSnapshot['channel'] {
  const stateDir = `${cwd.replace(/[\\/]+$/, '')}/.claude/channels/weixin`
  return {
    weixin: {
      connected: false,
      stateDir,
      accountPath: `${stateDir}/account.json`,
      accessPath: `${stateDir}/access.json`,
      cursorPath: `${stateDir}/cursor.txt`,
      allowedUsers: 0,
      pendingPairings: 0,
      cursorPresent: false,
    },
  }
}

function normalizeConfigCwd(cwd: string): string {
  return cwd.replace(/\\/g, '/').replace(/\/+$/g, '').toLowerCase()
}

export function sameConfigCwd(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  if (!left || !right) return false
  return normalizeConfigCwd(left) === normalizeConfigCwd(right)
}

export function selectSidebarSessions(
  state: DesktopRendererState,
): DesktopSessionSummary[] {
  const live = Object.values(state.sessions).map(session => ({
    id: session.id,
    title: session.title,
    cwd: session.cwd,
    updatedAt: session.updatedAt,
  }))
  const liveIds = new Set(live.map(session => session.id))
  return [
    ...live,
    ...state.sessionList.filter(session => !liveIds.has(session.id)),
  ].sort((left, right) => right.updatedAt - left.updatedAt)
}

function normalizeWorkspacePath(cwd: string): string {
  return cwd.replace(/[\\/]+$/, '')
}

export function initialSessionIdForWorkspace(
  sessions: DesktopSessionSummary[],
  storedWorkspace: string | null,
): string | null {
  if (!storedWorkspace) return sessions[0]?.id ?? null
  const normalizedStored = normalizeWorkspacePath(storedWorkspace)
  return sessions.find(
    session => normalizeWorkspacePath(session.cwd) === normalizedStored,
  )?.id ?? null
}

export function tabFromSlash(text: string): ConfigTab | null {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ')
  if (normalized === '/config') return 'model'
  if (normalized === '/config model') return 'model'
  if (normalized === '/config memory') return 'memory'
  if (normalized === '/config channel') return 'channel'
  if (normalized === '/config mcp') return 'mcp'
  if (normalized === '/config plugin' || normalized === '/config plugins') {
    return 'plugins'
  }
  if (normalized === '/config skill' || normalized === '/config skills') {
    return 'skills'
  }
  return null
}

type SessionSnapshotEvent = Extract<DesktopEvent, { type: 'session.snapshot' }>

export function shouldPollAgentMailbox(
  workspaceTab: WorkspaceTab,
  filePanelOpen: boolean,
  hasSelectedSession: boolean,
): boolean {
  return workspaceTab === 'agents' && filePanelOpen && hasSelectedSession
}

export function sessionIdFromPendingWorkspaceSnapshot(
  pendingWorkspace: string | null,
  event: SessionSnapshotEvent,
): string | null {
  if (!pendingWorkspace) return null
  return event.session.cwd === pendingWorkspace ? event.sessionId : null
}

export function App(): React.ReactNode {
  const [state, dispatch] = useReducer(
    desktopReducer,
    undefined,
    createDesktopState,
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState<DiagnosticsSnapshot | null>(null)
  const [view, setView] = useState<View>('chat')
  const [settingsTab, setSettingsTab] = useState<ConfigTab>('model')
  const [filePanelOpen, setFilePanelOpen] = useState(true)
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('files')
  const [config, setConfig] = useState<DesktopConfigSnapshot | null>(null)
  const [memoryFile, setMemoryFile] = useState<
    (DesktopMemoryFile & { content?: string }) | null
  >(null)
  const [compactSummary, setCompactSummary] = useState<string | null>(null)
  const [connectionTest, setConnectionTest] =
    useState<DesktopModelConnectionResult | null>(null)
  const [connectionTesting, setConnectionTesting] = useState(false)
  const [weixinLogin, setWeixinLogin] = useState<
    Extract<DesktopEvent, { type: 'channel.weixin.login' }> | null
  >(null)
  const [weixinRuntime, setWeixinRuntime] =
    useState<DesktopChannelWeixinRuntime | null>(null)
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null)
  const [artifactContent, setArtifactContent] = useState<string | null>(null)
  const [storedWorkspace, setStoredWorkspace] = useState<string | null>(() =>
    readStoredWorkspace(),
  )
  const [approvalMode, setApprovalMode] = useState<PermissionMode>(() =>
    readStoredApprovalMode(),
  )
  const [buddy, setBuddy] = useState<BuddySnapshot | null>(null)
  const [performance, setPerformance] = useState<DesktopPerformanceSnapshot | null>(null)
  const [agentMailbox, setAgentMailbox] = useState<DesktopAgentMailboxSnapshot | null>(null)
  const [performanceRange, setPerformanceRange] = useState<DesktopPerformanceRange>('30d')
  const [performanceLoading, setPerformanceLoading] = useState(false)
  const [performanceError, setPerformanceError] = useState<string | null>(null)
  const [scheduledTasks, setScheduledTasks] = useState<DesktopScheduledTasksSnapshot | null>(null)
  const [scheduledTasksLoading, setScheduledTasksLoading] = useState(false)
  const [scheduledTasksError, setScheduledTasksError] = useState<string | null>(null)
  const [skillImportOpen, setSkillImportOpen] = useState(false)
  const [skillImportPath, setSkillImportPath] = useState<string | null>(null)
  const [skillImportAutoInstall, setSkillImportAutoInstall] = useState(false)
  const [skillImportStatus, setSkillImportStatus] = useState<'idle' | 'importing' | 'done'>('idle')
  const [skillImportError, setSkillImportError] = useState<string | null>(null)
  const pendingWorkspaceSession = useRef<string | null>(null)
  const pendingPrompt = useRef<string | null>(null)
  const pendingArtifactPath = useRef<string | null>(null)

  useEffect(() => {
    const unsubscribe = window.desktopApi.subscribe(event => {
      if (event.type === 'buddy.snapshot') { setBuddy(event.state); return }
      if (event.type === 'performance.snapshot') { setPerformance(event.snapshot); setPerformanceLoading(false); setPerformanceError(null); return }
      if (event.type === 'agent.mailbox.snapshot') { setAgentMailbox(event.snapshot); return }
      if (event.type === 'scheduledTasks.snapshot') { setScheduledTasks(event.snapshot); setScheduledTasksLoading(false); setScheduledTasksError(null); return }
      if (event.type === 'command.failed' && !event.sessionId) {
        setPerformanceLoading(false)
        setPerformanceError(event.error.message)
        setScheduledTasksLoading(false)
        setScheduledTasksError(event.error.message)
        setSkillImportStatus('idle')
        setSkillImportError(event.error.message)
      }
      if (event.type === 'session.snapshot') {
        const createdSessionId = sessionIdFromPendingWorkspaceSnapshot(
          pendingWorkspaceSession.current,
          event,
        )
        if (createdSessionId) {
          pendingWorkspaceSession.current = null
          setSelectedId(createdSessionId)
          if (isPersistentApprovalMode(approvalMode) && event.session.mode !== approvalMode) {
            dispatch({
              type: 'renderer.localModeChanged',
              sessionId: createdSessionId,
              mode: approvalMode,
            })
            window.desktopApi.setMode(createdSessionId, approvalMode)
          }
          setSelectedFilePath(null)
          setFileContent(null)
          setStoredWorkspace(event.session.cwd)
          rememberWorkspace(event.session.cwd)
          const prompt = pendingPrompt.current
          if (prompt) {
            pendingPrompt.current = null
            window.desktopApi.submitPrompt(createdSessionId, prompt)
          }
        }
      }
      if (event.type === 'settings.opened') {
        setSettingsTab('model')
        setView('settings')
        return
      }
      if (event.type === 'config.snapshot' || event.type === 'config.saved' || event.type === 'skill.imported') {
        setConfig(event.config)
        if (event.type === 'skill.imported') {
          setSkillImportStatus('done')
          setSkillImportError(null)
        }
        return
      }
      if (event.type === 'config.tested') {
        setConnectionTesting(false)
        setConnectionTest(event.result)
        return
      }
      if (event.type === 'channel.weixin.login') {
        setWeixinLogin(event)
        return
      }
      if (event.type === 'channel.weixin.runtime') {
        setWeixinRuntime(event.runtime)
        return
      }
      if (event.type === 'memory.loaded') {
        setMemoryFile(event.file)
        setCompactSummary(null)
        return
      }
      if (event.type === 'memory.saved') {
        setMemoryFile(event.file)
        setCompactSummary('记忆已保存。')
        return
      }
      if (event.type === 'memory.compacted') {
        setMemoryFile(event.file)
        setCompactSummary(
          `已压缩：${event.originalCharacters} -> ${event.compactedCharacters} 字符。确认无误后点击“保存记忆”写回。`,
        )
        return
      }
      if (event.type === 'file.loaded' || event.type === 'file.saved') {
        if (pendingArtifactPath.current === event.path) {
          pendingArtifactPath.current = null
          setArtifactContent(event.content)
          return
        }
        setSelectedFilePath(event.path)
        setFileContent(event.content)
        setFilePanelOpen(true)
        return
      }
      dispatch(event)
    })
    window.desktopApi.listSessions(storedWorkspace ?? undefined)
    window.desktopApi.getBuddy()
    return unsubscribe
  }, [])

  const sessions = useMemo(() => selectSidebarSessions(state), [state])
  const effectiveSelectedId = selectedId ?? state.selectedSessionId
  const selected = effectiveSelectedId
    ? state.sessions[effectiveSelectedId]
    : undefined
  const coreStatus = state.coreReady
    ? 'ready'
    : state.lastError
      ? 'failed'
      : 'starting'
  const files = selected ? filesFromTools(selected.tools, selected.toolOrder) : []
  const localArtifacts = selected ? deriveLocalArtifacts(selected) : []
  const agentActivity = selected
    ? buildAgentActivity(selected.tools, selected.toolOrder, agentMailbox)
    : buildAgentActivity({}, [])
  const defaultWorkspace = defaultWorkspaceFromSources(
    selected?.cwd,
    storedWorkspace,
    sessions[0]?.cwd,
  )
  const settingsCwd = settingsCwdForConfig(selected?.cwd, defaultWorkspace)
  const activeConfig = sameConfigCwd(config?.cwd, settingsCwd) ? config : null

  useEffect(() => {
    if (selectedId || state.selectedSessionId) return
    const initialSessionId = initialSessionIdForWorkspace(
      sessions,
      storedWorkspace,
    )
    if (initialSessionId) setSelectedId(initialSessionId)
  }, [sessions, selectedId, state.selectedSessionId, storedWorkspace])

  useEffect(() => {
    if (!selected) return
    window.desktopApi.getAgentMailbox(selected.cwd)
  }, [selected?.id, selected?.toolOrder.length, selected?.generationState])

  useEffect(() => {
    if (!selected) return
    if (!shouldPollAgentMailbox(workspaceTab, filePanelOpen, true)) return
    const poll = () => window.desktopApi.getAgentMailbox(selected.cwd)
    poll()
    const interval = window.setInterval(poll, AGENT_MAILBOX_POLL_MS)
    return () => window.clearInterval(interval)
  }, [selected?.id, selected?.cwd, workspaceTab, filePanelOpen])

  const refreshDiagnostics = async () =>
    setDiagnostics(await window.desktopApi.getDiagnostics())

  const refreshConfig = () => {
    if (settingsCwd) window.desktopApi.getConfig(settingsCwd)
    if (settingsCwd) window.desktopApi.getWeixinChannel(settingsCwd)
  }

  useEffect(() => {
    refreshConfig()
  }, [settingsCwd])

  useEffect(() => {
    if (view !== 'settings') return
    refreshConfig()
  }, [view, settingsCwd])

  const openSettings = (tab: ConfigTab) => {
    setSettingsTab(tab)
    setView('settings')
    refreshConfig()
  }

  const openSkillImport = () => {
    setSkillImportOpen(true)
    setSkillImportPath(null)
    setSkillImportStatus('idle')
    setSkillImportError(null)
  }

  const chooseSkillSource = async (kind: 'zip' | 'folder') => {
    const sourcePath = await window.desktopApi.selectSkillSource(kind)
    if (!sourcePath) return
    setSkillImportPath(sourcePath)
    setSkillImportError(null)
  }

  const importSkill = () => {
    if (!skillImportPath || !settingsCwd) return
    setSkillImportStatus('importing')
    setSkillImportError(null)
    window.desktopApi.importSkill(
      settingsCwd,
      skillImportPath,
      skillImportAutoInstall,
    )
  }

  const requestPerformance = (range = performanceRange, force = false) => {
    setPerformanceLoading(true)
    setPerformanceError(null)
    window.desktopApi.getPerformance(defaultWorkspace, range, force)
  }

  const openPerformance = () => {
    setView('performance')
    requestPerformance()
  }

  const requestScheduledTasks = () => {
    setScheduledTasksLoading(true)
    setScheduledTasksError(null)
    window.desktopApi.getScheduledTasks(defaultWorkspace)
  }

  const persistScheduledTask = (id: string) => {
    setScheduledTasksLoading(true)
    setScheduledTasksError(null)
    window.desktopApi.persistScheduledTask(defaultWorkspace, id)
  }

  const openScheduledTasks = () => {
    setView('scheduledTasks')
    requestScheduledTasks()
  }

  const selectSession = (sessionId: string) => {
    setSelectedId(sessionId)
    setSelectedFilePath(null)
    setFileContent(null)
    const session = state.sessions[sessionId]
    if (session) {
      setStoredWorkspace(session.cwd)
      rememberWorkspace(session.cwd)
    } else {
      window.desktopApi.resumeSession(sessionId)
    }
  }

  const createSession = () => {
    const cwd = defaultWorkspaceForNewSession(defaultWorkspace, defaultWorkspace)
    pendingWorkspaceSession.current = cwd
    setStoredWorkspace(cwd)
    rememberWorkspace(cwd)
    window.desktopApi.createSession(cwd)
  }

  const createSessionFromPicker = async () => {
    const workspace = await window.desktopApi.selectWorkspace()
    if (!workspace) return
    pendingWorkspaceSession.current = workspace
    setStoredWorkspace(workspace)
    rememberWorkspace(workspace)
    window.desktopApi.createSession(workspace)
  }

  const deleteSession = (sessionId: string) => {
    if (!window.confirm('确定删除这个对话？此操作不可撤销。')) return
    window.desktopApi.deleteSession(sessionId)
    if (selectedId === sessionId) setSelectedId(null)
  }

  const interruptSelected = () => {
    if (!selected) return
    dispatch({
      type: 'renderer.localGenerationState',
      sessionId: selected.id,
      state: 'interrupting',
    })
    window.desktopApi.interruptGeneration(selected.id)
  }

  const changeSelectedMode = (mode: PermissionMode) => {
    if (isPersistentApprovalMode(mode)) {
      setApprovalMode(mode)
      rememberApprovalMode(mode)
    }
    if (!selected) return
    dispatch({
      type: 'renderer.localModeChanged',
      sessionId: selected.id,
      mode,
    })
    window.desktopApi.setMode(selected.id, mode)
  }

  const openFile = (path: string) => {
    if (!selected) return
    setWorkspaceTab('files')
    setSelectedFilePath(path)
    setFileContent(null)
    setFilePanelOpen(true)
    window.desktopApi.readFile(path, selected.cwd)
  }

  const openArtifact = (artifact: DesktopLocalArtifact) => {
    if (!selected) return
    setWorkspaceTab('artifacts')
    setFilePanelOpen(true)
    setSelectedArtifactId(artifact.id)
    if (artifact.source === 'message') {
      pendingArtifactPath.current = null
      setArtifactContent(artifact.content ?? null)
      return
    }
    setArtifactContent(null)
    if (artifact.path) {
      pendingArtifactPath.current = artifact.path
      window.desktopApi.readFile(artifact.path, selected.cwd)
    }
  }

  const openAgents = () => {
    setWorkspaceTab('agents')
    setFilePanelOpen(true)
    if (selected) window.desktopApi.getAgentMailbox(selected.cwd)
  }

  const submitPrompt = (text: string) => {
    const buddyCommand = text.trim().toLowerCase()
    if (buddyCommand === '/buddy' || buddyCommand === '/buddy hatch') {
      window.desktopApi.hatchBuddy()
      return
    }
    if (buddyCommand === '/buddy rehatch') { window.desktopApi.rehatchBuddy(); return }
    if (buddyCommand === '/buddy pet') { window.desktopApi.petBuddy(); return }
    if (buddyCommand === '/buddy off') { window.desktopApi.setBuddyMuted(true); return }
    if (buddyCommand === '/buddy on') { window.desktopApi.setBuddyMuted(false); return }
    const localTab = tabFromSlash(text)
    if (localTab) {
      openSettings(localTab)
      return
    }
    if (!selected) {
      const cwd = defaultWorkspaceForNewSession(defaultWorkspace, defaultWorkspace)
      pendingWorkspaceSession.current = cwd
      pendingPrompt.current = text
      setStoredWorkspace(cwd)
      rememberWorkspace(cwd)
      window.desktopApi.createSession(cwd)
      return
    }
    window.desktopApi.submitPrompt(selected.id, text)
  }

  const writeModelConfig = (modelConfig: DesktopModelConfig) => {
    if (!settingsCwd) return
    setConnectionTest(null)
    setConfig(previous => previous ? { ...previous, modelConfig } : {
      cwd: settingsCwd,
      skills: [],
      mcpServers: [],
      plugins: [],
      memoryFiles: [],
      autoMemory: { enabled: true, path: settingsCwd },
      modelConfig,
      channel: emptyChannelSnapshot(settingsCwd),
    })
    window.desktopApi.writeConfig(settingsCwd, modelConfig)
  }

  const testModelConfig = (modelConfig: DesktopModelConfig) => {
    if (!settingsCwd) return
    setConnectionTesting(true)
    setConnectionTest(null)
    window.desktopApi.testConfig(settingsCwd, modelConfig)
  }

  const createMemory = (path: string) => {
    setMemoryFile({
      id: path,
      label: path.split(/[\\/]/).filter(Boolean).at(-1) ?? path,
      path,
      scope: 'project',
      exists: false,
      content: '',
    })
    setCompactSummary(null)
  }

  const sidebar = (
    <SessionSidebar
      sessions={sessions}
      selectedId={effectiveSelectedId}
      onSelect={selectSession}
      onCreate={createSession}
      onDelete={deleteSession}
      coreStatus={coreStatus}
      onOpenDiagnostics={() => void refreshDiagnostics()}
      disableCreate={coreStatus !== 'ready'}
      onOpenSettings={openSettings}
      onOpenPerformance={openPerformance}
      onOpenScheduledTasks={openScheduledTasks}
      buddy={buddy}
      onHatchBuddy={() => window.desktopApi.hatchBuddy()}
      onRehatchBuddy={() => window.desktopApi.rehatchBuddy()}
      onPetBuddy={() => window.desktopApi.petBuddy()}
      onMuteBuddy={muted => window.desktopApi.setBuddyMuted(muted)}
    />
  )

  const welcome = (
    <main className="welcome welcome-chat">
      <div className="welcome-scroll">
        <section className="welcome-hero">
          <BrandName />
          <h1>从一个工作区开始</h1>
          <p>默认会话会使用当前工作区。你也可以随时切换目录，继续同一组文件和历史。</p>
          <div className="welcome-workspace">
            <span>默认文件夹</span>
            <strong>{defaultWorkspace === '.' ? '当前项目' : defaultWorkspace}</strong>
          </div>
        </section>
        <section className="welcome-features" aria-label="可做的事情">
          {[
            { title: '写 PPT', text: '整理提纲、生成页结构、补充演讲要点。' },
            { title: '整理日报', text: '把今天的进度、问题、计划自动汇总成日报。' },
            { title: '代码协作', text: '阅读、修改、写入文件，并在右侧直接看结果。' },
            { title: '分析项目', text: '归纳架构、查找问题、解释工具输出和差异。' },
          ].map(item => (
            <article key={item.title} className="welcome-card">
              <strong>{item.title}</strong>
              <p>{item.text}</p>
            </article>
          ))}
        </section>
      </div>
      <Composer
        generating={false}
        workspace={defaultWorkspace}
        mode={approvalMode}
        onSubmit={submitPrompt}
        onInterrupt={() => {}}
        onSelectWorkspace={() => void createSessionFromPicker()}
        onOpenSkills={openSkillImport}
        onModeChange={mode => {
          if (isPersistentApprovalMode(mode)) {
            setApprovalMode(mode)
            rememberApprovalMode(mode)
          }
        }}
      />
      {state.lastError ? (
        <div className="startup-error">
          <strong>Desktop Core 启动失败</strong>
          <p>{state.lastError}</p>
          <button type="button" onClick={() => void refreshDiagnostics()}>
            查看诊断日志
          </button>
        </div>
      ) : null}
    </main>
  )

  const chatView = (
    <ResizableWorkspace
      filePanelOpen={Boolean(selected) && filePanelOpen}
      onCloseFiles={() => setFilePanelOpen(false)}
      sidebar={sidebar}
      chat={
        selected ? (
          <ConversationPane
            session={selected}
            onSubmit={submitPrompt}
            onInterrupt={interruptSelected}
            onSelectWorkspace={() => void createSessionFromPicker()}
            onOpenFile={openFile}
            onOpenAgents={openAgents}
            onOpenSkills={openSkillImport}
            onOpenMcp={() => openSettings('mcp')}
            skills={activeConfig?.skills ?? []}
            mcpServers={activeConfig?.mcpServers ?? []}
            onModeChange={changeSelectedMode}
            artifacts={localArtifacts}
            onOpenArtifact={openArtifact}
          onResolvePermission={(permissionId, decision, payload) => {
            dispatch({
              type: 'renderer.permissionResolved',
              sessionId: selected.id,
              permissionId,
            })
            window.desktopApi.resolvePermission(permissionId, decision, payload)
          }}
          error={state.lastError}
          onDismissError={() => dispatch({ type: 'renderer.clearError' })}
          onOpenDiagnostics={() => void refreshDiagnostics()}
        />
        ) : (
          welcome
        )
      }
      files={
        selected ? (
          <WorkspacePanel
            fileCount={files.length}
            agentActivity={agentActivity}
            artifacts={localArtifacts}
            selectedArtifactId={selectedArtifactId}
            artifactContent={artifactContent}
            onSelectArtifact={openArtifact}
            onOpenFile={openFile}
            activeTab={workspaceTab}
            onTabChange={setWorkspaceTab}
            files={
              <ConversationFilesPanel
                files={files}
                selectedPath={selectedFilePath}
                fileContent={fileContent}
                onOpen={openFile}
                workspace={selected.cwd}
                onListWorkspaceEditors={refresh =>
                  window.desktopApi.listWorkspaceEditors(refresh)
                }
                onOpenWorkspaceInEditor={(editorId, workspace) =>
                  window.desktopApi.openWorkspaceInEditor(editorId, workspace)
                }
              />
            }
          />
        ) : null
      }
    />
  )

  return (
    <div className="desktop-shell">
      {view === 'settings' ? (
        <ConfigCenter
          selectedTitle={selected?.title ?? null}
          initialTab={settingsTab}
          model={selected?.model ?? 'default'}
          mode={selected?.mode ?? 'default'}
          cwd={settingsCwd}
          config={config}
          memoryFile={memoryFile}
          compactSummary={compactSummary}
          connectionTest={connectionTest}
          connectionTesting={connectionTesting}
          weixinLogin={weixinLogin}
          weixinRuntime={weixinRuntime}
          onBack={() => setView('chat')}
          onModelChange={model =>
            selected && window.desktopApi.setModel(selected.id, model)
          }
          onModeChange={changeSelectedMode}
          onModelConfigChange={writeModelConfig}
          onTestModelConfig={testModelConfig}
          onLoginWeixinChannel={() => {
            if (!settingsCwd) return
            setWeixinLogin(null)
            window.desktopApi.loginWeixinChannel(settingsCwd)
          }}
          onClearWeixinChannel={() => {
            if (!settingsCwd) return
            setWeixinLogin(null)
            window.desktopApi.clearWeixinChannel(settingsCwd)
          }}
          onStartWeixinChannel={() => {
            if (!settingsCwd) return
            window.desktopApi.startWeixinChannel(settingsCwd)
          }}
          onAutoMemoryChange={enabled =>
            settingsCwd && window.desktopApi.setAutoMemoryEnabled(settingsCwd, enabled)
          }
          onReadMemory={path => window.desktopApi.readMemory(path)}
          onCreateMemory={createMemory}
          onSaveMemory={(path, content) =>
            window.desktopApi.writeMemory(path, content)
          }
          onCompactMemory={(path, content) =>
            window.desktopApi.compactMemory(path, content)
          }
          onCollapseMemory={() => {
            setMemoryFile(null)
            setCompactSummary(null)
          }}
        />
      ) : view === 'performance' ? (
        <div className="performance-layout">
          {sidebar}
          <PerformanceCenter cwd={defaultWorkspace} range={performanceRange} snapshot={performance} loading={performanceLoading} error={performanceError} onBack={() => setView('chat')} onRefresh={() => requestPerformance(performanceRange, true)} onRangeChange={range => { setPerformanceRange(range); setPerformance(null); requestPerformance(range) }} />
        </div>
      ) : view === 'scheduledTasks' ? (
        <div className="performance-layout">
          {sidebar}
          <ScheduledTasksCenter
            cwd={defaultWorkspace}
            snapshot={
              scheduledTasksError
                ? scheduledTasks
                  ? { ...scheduledTasks, error: scheduledTasksError }
                  : {
                      cwd: defaultWorkspace,
                      path: `${defaultWorkspace.replace(/[\\/]+$/, '')}/.claude/scheduled_tasks.json`,
                      generatedAt: Date.now(),
                      tasks: [],
                      warnings: [],
                      error: scheduledTasksError,
                    }
                : scheduledTasks
            }
            loading={scheduledTasksLoading}
            onBack={() => setView('chat')}
            onPersist={persistScheduledTask}
            onRefresh={requestScheduledTasks}
          />
        </div>
      ) : (
        chatView
      )}
      {diagnostics ? (
        <DiagnosticsDrawer
          diagnostics={diagnostics}
          onClose={() => setDiagnostics(null)}
          onRefresh={() => void refreshDiagnostics()}
          onCopy={() => void navigator.clipboard.writeText(diagnostics.latestLines)}
          onOpenDirectory={() => void window.desktopApi.openLogFolder()}
        />
      ) : null}
      {skillImportOpen ? (
        <div
          className="skill-import-overlay"
          role="presentation"
          onDragOver={event => {
            event.preventDefault()
          }}
          onDrop={event => {
            event.preventDefault()
            const file = event.dataTransfer.files[0] as File & { path?: string }
            if (file?.path) {
              setSkillImportPath(file.path)
              setSkillImportError(null)
            }
          }}
        >
          <section className="skill-import-dialog" role="dialog" aria-modal="true" aria-labelledby="skill-import-title">
            <header>
              <h2 id="skill-import-title">导入技能</h2>
              <button type="button" aria-label="关闭导入技能" onClick={() => setSkillImportOpen(false)}>
                ×
              </button>
            </header>
            <div className="skill-import-dropzone">
              <div aria-hidden="true">▣</div>
              <strong>拖拽文件或点击上传</strong>
              <span>{skillImportPath ?? '支持 skills zip 或包含 SKILL.md 的文件夹'}</span>
              <div className="skill-import-pickers">
                <button type="button" onClick={() => void chooseSkillSource('zip')}>
                  选择 zip
                </button>
                <button type="button" onClick={() => void chooseSkillSource('folder')}>
                  选择文件夹
                </button>
              </div>
            </div>
            <label className="skill-import-checkbox">
              <input
                type="checkbox"
                checked={skillImportAutoInstall}
                onChange={event => setSkillImportAutoInstall(event.target.checked)}
              />
              非高风险自动安装
            </label>
            <div className="skill-import-requirements">
              <strong>文件要求</strong>
              <ul>
                <li>文件夹或者 .zip 需要包含 SKILL.md 文件</li>
                <li>SKILL.md 文件需包含 YAML 格式的技能名称和描述</li>
              </ul>
            </div>
            {skillImportError ? <p className="skill-import-error">{skillImportError}</p> : null}
            {skillImportStatus === 'done' ? <p className="skill-import-success">导入成功，Skills 列表已刷新。</p> : null}
            <footer>
              <button type="button" onClick={() => setSkillImportOpen(false)}>
                取消
              </button>
              <button
                type="button"
                disabled={!skillImportPath || skillImportStatus === 'importing'}
                onClick={importSkill}
              >
                {skillImportStatus === 'importing' ? '导入中…' : '导入'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  )
}
