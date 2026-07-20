import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type {
  DesktopConfigSnapshot,
  DesktopEvent,
  DesktopMemoryFile,
  DesktopModelConnectionResult,
  DesktopModelConfig,
  DesktopPerformanceRange,
  DesktopPerformanceSnapshot,
  DesktopSessionSummary,
  DiagnosticsSnapshot,
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
import type { BuddySnapshot } from '../../../shared/protocol.js'
import { ResizableWorkspace } from './ResizableWorkspace.js'
import {
  createDesktopState,
  desktopReducer,
  type DesktopRendererState,
} from './reducer.js'

type View = 'chat' | 'settings' | 'performance'
const PROJECT_DEFAULT_CWD = '.'
const LAST_WORKSPACE_KEY = 'superwork.lastWorkspace'

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

export function defaultWorkspaceForNewSession(
  currentSessionCwd: string | null | undefined,
  projectDefault = PROJECT_DEFAULT_CWD,
): string {
  return currentSessionCwd || projectDefault
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

export function tabFromSlash(text: string): ConfigTab | null {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ')
  if (normalized === '/config') return 'model'
  if (normalized === '/config model') return 'model'
  if (normalized === '/config memory') return 'memory'
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
  const [config, setConfig] = useState<DesktopConfigSnapshot | null>(null)
  const [memoryFile, setMemoryFile] = useState<
    (DesktopMemoryFile & { content?: string }) | null
  >(null)
  const [compactSummary, setCompactSummary] = useState<string | null>(null)
  const [connectionTest, setConnectionTest] =
    useState<DesktopModelConnectionResult | null>(null)
  const [connectionTesting, setConnectionTesting] = useState(false)
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [storedWorkspace, setStoredWorkspace] = useState<string | null>(() =>
    readStoredWorkspace(),
  )
  const [buddy, setBuddy] = useState<BuddySnapshot | null>(null)
  const [performance, setPerformance] = useState<DesktopPerformanceSnapshot | null>(null)
  const [performanceRange, setPerformanceRange] = useState<DesktopPerformanceRange>('30d')
  const [performanceLoading, setPerformanceLoading] = useState(false)
  const [performanceError, setPerformanceError] = useState<string | null>(null)
  const pendingWorkspaceSession = useRef<string | null>(null)
  const pendingPrompt = useRef<string | null>(null)

  useEffect(() => {
    const unsubscribe = window.desktopApi.subscribe(event => {
      if (event.type === 'buddy.snapshot') { setBuddy(event.state); return }
      if (event.type === 'performance.snapshot') { setPerformance(event.snapshot); setPerformanceLoading(false); setPerformanceError(null); return }
      if (event.type === 'command.failed' && !event.sessionId) { setPerformanceLoading(false); setPerformanceError(event.error.message) }
      if (event.type === 'session.snapshot') {
        const createdSessionId = sessionIdFromPendingWorkspaceSnapshot(
          pendingWorkspaceSession.current,
          event,
        )
        if (createdSessionId) {
          pendingWorkspaceSession.current = null
          setSelectedId(createdSessionId)
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
      if (event.type === 'config.snapshot' || event.type === 'config.saved') {
        setConfig(event.config)
        return
      }
      if (event.type === 'config.tested') {
        setConnectionTesting(false)
        setConnectionTest(event.result)
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
        setSelectedFilePath(event.path)
        setFileContent(event.content)
        setFilePanelOpen(true)
        return
      }
      dispatch(event)
    })
    window.desktopApi.listSessions()
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
  const defaultWorkspace =
    selected?.cwd ?? sessions[0]?.cwd ?? storedWorkspace ?? PROJECT_DEFAULT_CWD

  useEffect(() => {
    if (selectedId || state.selectedSessionId) return
    const latestSession = sessions[0]
    if (latestSession) setSelectedId(latestSession.id)
  }, [sessions, selectedId, state.selectedSessionId])

  const refreshDiagnostics = async () =>
    setDiagnostics(await window.desktopApi.getDiagnostics())

  const refreshConfig = () => {
    const cwd = selected?.cwd ?? defaultWorkspace
    if (cwd) window.desktopApi.getConfig(cwd)
  }

  const openSettings = (tab: ConfigTab) => {
    setSettingsTab(tab)
    setView('settings')
    refreshConfig()
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

  const openFile = (path: string) => {
    if (!selected) return
    setSelectedFilePath(path)
    setFileContent(null)
    setFilePanelOpen(true)
    window.desktopApi.readFile(path, selected.cwd)
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
    if (!selected) return
    setConnectionTest(null)
    setConfig(previous => previous ? { ...previous, modelConfig } : previous)
    window.desktopApi.writeConfig(selected.cwd, modelConfig)
  }

  const testModelConfig = (modelConfig: DesktopModelConfig) => {
    if (!selected) return
    setConnectionTesting(true)
    setConnectionTest(null)
    window.desktopApi.testConfig(selected.cwd, modelConfig)
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
        onSubmit={submitPrompt}
        onInterrupt={() => {}}
        onSelectWorkspace={() => void createSessionFromPicker()}
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
          onResolvePermission={(permissionId, decision) =>
            window.desktopApi.resolvePermission(permissionId, decision)
          }
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
          cwd={selected?.cwd ?? null}
          config={config}
          memoryFile={memoryFile}
          compactSummary={compactSummary}
          connectionTest={connectionTest}
          connectionTesting={connectionTesting}
          onBack={() => setView('chat')}
          onModelChange={model =>
            selected && window.desktopApi.setModel(selected.id, model)
          }
          onModeChange={mode =>
            selected && window.desktopApi.setMode(selected.id, mode)
          }
          onModelConfigChange={writeModelConfig}
          onTestModelConfig={testModelConfig}
          onRefresh={refreshConfig}
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
    </div>
  )
}
