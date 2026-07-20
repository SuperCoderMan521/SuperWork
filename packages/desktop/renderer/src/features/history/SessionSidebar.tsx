import type {
  CoreDiagnosticStatus,
  DesktopSessionSummary,
} from '../../../../shared/protocol.js'
import { BrandName } from '../../components/BrandName.js'
import { BuddyPanel } from '../buddy/BuddyPanel.js'
import type { BuddySnapshot } from '../../../../shared/protocol.js'
import { useI18n } from '../../i18n/I18nProvider.js'

type SessionSidebarProps = {
  sessions: DesktopSessionSummary[]
  selectedId: string | null
  onSelect: (sessionId: string) => void
  onCreate: () => void
  coreStatus?: CoreDiagnosticStatus
  onOpenDiagnostics?: () => void
  disableCreate?: boolean
  onDelete?: (sessionId: string) => void
  onOpenSettings?: (tab: 'model' | 'skills' | 'mcp' | 'plugins' | 'memory') => void
  onOpenPerformance?: () => void
  buddy?: BuddySnapshot | null
  onHatchBuddy?: () => void
  onRehatchBuddy?: () => void
  onPetBuddy?: () => void
  onMuteBuddy?: (muted: boolean) => void
}

export type SessionWorkspaceGroup = {
  label: string
  cwd: string
  sessions: DesktopSessionSummary[]
}

function statusLabel(status: CoreDiagnosticStatus): string {
  if (status === 'ready') return '已连接'
  if (status === 'failed') return '启动失败'
  if (status === 'restarting') return '重启中'
  if (status === 'stopped') return '已停止'
  return '启动中'
}

function workspaceLabel(cwd: string): string {
  const normalized = cwd.replace(/[\\/]+$/, '')
  const parts = normalized.split(/[\\/]/).filter(Boolean)
  return parts.at(-1) ?? normalized
}

export function groupSessionsByWorkspace(
  sessions: DesktopSessionSummary[],
): SessionWorkspaceGroup[] {
  const groups = new Map<string, DesktopSessionSummary[]>()
  for (const session of sessions) {
    const cwd = session.cwd || '.'
    const normalized = cwd.replace(/[\\/]+$/, '')
    const list = groups.get(normalized) ?? []
    list.push(session)
    groups.set(normalized, list)
  }

  return [...groups.entries()]
    .map(([cwd, groupedSessions]) => ({
      cwd,
      label: workspaceLabel(cwd),
      sessions: groupedSessions.sort((left, right) => right.updatedAt - left.updatedAt),
    }))
    .sort((left, right) => {
      const leftUpdated = left.sessions[0]?.updatedAt ?? 0
      const rightUpdated = right.sessions[0]?.updatedAt ?? 0
      if (rightUpdated !== leftUpdated) return rightUpdated - leftUpdated
      return left.label.localeCompare(right.label)
    })
}

export function SessionSidebar({
  sessions,
  selectedId,
  onSelect,
  onCreate,
  coreStatus = 'starting',
  onOpenDiagnostics,
  disableCreate = false,
  onDelete,
  onOpenSettings,
  onOpenPerformance,
  buddy,
  onHatchBuddy,
  onRehatchBuddy,
  onPetBuddy,
  onMuteBuddy,
}: SessionSidebarProps): React.ReactNode {
  const groups = groupSessionsByWorkspace(sessions)
  const { locale, toggleLocale } = useI18n()

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="brand" aria-label="SuperWork">
          <BrandName />
        </div>
      </div>
      <nav className="session-nav" aria-label="对话历史">
        <h2>对话</h2>
        {groups.length === 0 ? (
          <p className="empty-hint">还没有会话</p>
        ) : (
          <ul>
            {groups.map(group => (
              <li
                key={group.cwd}
                className={
                  group.sessions.some(session => session.id === selectedId)
                    ? 'workspace-group workspace-group-active'
                    : 'workspace-group'
                }
              >
                <details className="workspace-group-details">
                  <summary className="workspace-group-header" aria-label="展开或收起工作区历史">
                    <span className="workspace-group-icon" aria-hidden="true">
                      ⌂
                    </span>
                    <strong>{group.label}</strong>
                    <span className="workspace-group-chevron" aria-hidden="true">
                      ▾
                    </span>
                  </summary>
                  <ul>
                    {group.sessions.map(session => (
                      <li key={session.id} className="session-item">
                        <button
                          className={session.id === selectedId ? 'session active' : 'session'}
                          type="button"
                          onClick={() => onSelect(session.id)}
                        >
                          <strong>{session.title || '未命名会话'}</strong>
                          <span>{session.cwd}</span>
                        </button>
                        {onDelete ? (
                          <button
                            className="delete-session"
                            type="button"
                            aria-label={`删除 ${session.title}`}
                            title="删除对话"
                            onClick={event => {
                              event.stopPropagation()
                              onDelete(session.id)
                            }}
                          >
                            ×
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        )}
      </nav>
      {onHatchBuddy && onRehatchBuddy && onPetBuddy && onMuteBuddy ? <BuddyPanel state={buddy ?? null} onHatch={onHatchBuddy} onRehatch={onRehatchBuddy} onPet={onPetBuddy} onMute={onMuteBuddy} /> : null}
      <div className="sidebar-actions">
        {onOpenPerformance ? <button className="performance-shortcut" type="button" onClick={onOpenPerformance}><span aria-hidden="true">◷</span> 性能中心</button> : null}
        {onOpenSettings ? (
          <div className="settings-shortcuts" aria-label="配置入口">
            <button type="button" onClick={() => onOpenSettings('model')} aria-label="打开模型配置">
              <span aria-hidden="true">⚙</span>
              模型
            </button>
            <button type="button" onClick={() => onOpenSettings('skills')} aria-label="打开 Skills 配置">
              <span aria-hidden="true">✦</span>
              Skills
            </button>
            <button type="button" onClick={() => onOpenSettings('mcp')} aria-label="打开 MCP 配置">
              <span aria-hidden="true">◎</span>
              MCP
            </button>
            <button type="button" onClick={() => onOpenSettings('plugins')} aria-label="打开 Plugins 配置">
              <span aria-hidden="true">◫</span>
              Plugins
            </button>
            <button type="button" onClick={() => onOpenSettings('memory')} aria-label="打开 Memory 配置">
              <span aria-hidden="true">◌</span>
              Memory
            </button>
          </div>
        ) : null}
        <button
          className="new-session"
          type="button"
          onClick={onCreate}
          disabled={disableCreate}
          title={disableCreate ? '等待 Desktop Core 启动完成' : '选择工作文件夹并新建对话'}
        >
          <span aria-hidden="true">{disableCreate ? '…' : '+'}</span>{' '}
          {disableCreate ? 'Core 启动中' : '新任务'}
        </button>
        <button
          className="sidebar-footer"
          type="button"
          onClick={onOpenDiagnostics}
          title="查看诊断日志"
        >
          <span className={`status-dot status-${coreStatus}`} aria-hidden="true" />
          Core {statusLabel(coreStatus)} · 查看日志
        </button>
        <button className="language-toggle" type="button" onClick={toggleLocale} title={locale === 'zh-CN' ? 'Switch to English' : '切换为中文'} aria-label={locale === 'zh-CN' ? 'Switch to English' : '切换为中文'}>
          <span aria-hidden="true">文</span>{locale === 'zh-CN' ? ' EN' : ' 中'}
        </button>
      </div>
    </aside>
  )
}
