import { useState, useEffect } from 'react'
import type {
  CoreDiagnosticStatus,
  DesktopChannelWeixinConversation,
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
  onOpenSettings?: (tab: 'model' | 'skills' | 'mcp' | 'plugins' | 'memory' | 'channel') => void
  onOpenPerformance?: () => void
  onOpenScheduledTasks?: () => void
  buddy?: BuddySnapshot | null
  onHatchBuddy?: () => void
  onRehatchBuddy?: () => void
  onPetBuddy?: () => void
  onMuteBuddy?: (muted: boolean) => void
  weixinConversations?: DesktopChannelWeixinConversation[]
  selectedWeixinChatId?: string | null
  onSelectWeixin?: (chatId: string) => void
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
  onOpenScheduledTasks,
  buddy,
  onHatchBuddy,
  onRehatchBuddy,
  onPetBuddy,
  onMuteBuddy,
  weixinConversations = [],
  selectedWeixinChatId = null,
  onSelectWeixin,
}: SessionSidebarProps): React.ReactNode {
  const groups = groupSessionsByWorkspace(sessions)
  const { locale, toggleLocale } = useI18n()
  const [tab, setTab] = useState<'sessions' | 'weixin'>('sessions')
  const [fading, setFading] = useState(false)

  const switchTab = (next: 'sessions' | 'weixin') => {
    if (next === tab) return
    setFading(true)
    window.setTimeout(() => {
      setTab(next)
      setFading(false)
    }, 150)
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key === 'ArrowLeft' && tab === 'weixin') switchTab('sessions')
      else if (event.key === 'ArrowRight' && tab === 'sessions') switchTab('weixin')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [tab])

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="brand" aria-label="SuperWork">
          <BrandName />
        </div>
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
      </div>
      {onSelectWeixin ? (
        <div className="sidebar-tabs" role="tablist" aria-label="侧边栏视图切换" data-active-tab={tab}>
          <span className="sidebar-tab-indicator" aria-hidden="true" />
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'sessions'}
            data-active={tab === 'sessions'}
            onClick={() => switchTab('sessions')}
          >
            <span className="sidebar-tab-icon" aria-hidden="true">✓</span>
            对话
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'weixin'}
            data-active={tab === 'weixin'}
            onClick={() => switchTab('weixin')}
          >
            <span className="sidebar-tab-icon" aria-hidden="true">💬</span>
            微信
          </button>
        </div>
      ) : null}
      <nav className="session-nav" aria-label="对话历史" data-fading={fading}>
        {tab === 'sessions' ? (
          <>
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
          </>
        ) : (
          <>
            <h2>微信对话</h2>
            {weixinConversations.length === 0 ? (
              <p className="empty-hint">未连接微信通道或暂无对话</p>
            ) : (
              <ul>
                {weixinConversations.map(conv => (
                  <li key={conv.chatId} className="session-item">
                    <button
                      type="button"
                      className={conv.chatId === selectedWeixinChatId ? 'weixin-conversation' : 'weixin-conversation'}
                      data-active={conv.chatId === selectedWeixinChatId}
                      onClick={() => onSelectWeixin?.(conv.chatId)}
                    >
                      <strong>{conv.title}</strong>
                      <span>
                        {new Date(conv.updatedAt).toLocaleString()} · {conv.messages.length} 条
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </nav>
      {onHatchBuddy && onRehatchBuddy && onPetBuddy && onMuteBuddy ? <BuddyPanel state={buddy ?? null} onHatch={onHatchBuddy} onRehatch={onRehatchBuddy} onPet={onPetBuddy} onMute={onMuteBuddy} /> : null}
      <div className="sidebar-actions">
        {onOpenSettings || onOpenPerformance || onOpenScheduledTasks ? (
          <div className="settings-shortcuts" aria-label="配置入口">
            {onOpenPerformance ? <button className="performance-shortcut" type="button" onClick={onOpenPerformance} aria-label="打开性能中心"><span aria-hidden="true">◷</span> 性能</button> : null}
            {onOpenScheduledTasks ? <button type="button" onClick={onOpenScheduledTasks} aria-label="打开本地定时任务"><span aria-hidden="true">⏱</span> 定时</button> : null}
            {onOpenSettings ? <button type="button" onClick={() => onOpenSettings('model')} aria-label="打开模型配置">
              <span aria-hidden="true">⚙</span>
              模型
            </button> : null}
            {onOpenSettings ? <button type="button" onClick={() => onOpenSettings('skills')} aria-label="打开 Skills 配置">
              <span aria-hidden="true">✦</span>
              Skills
            </button> : null}
            {onOpenSettings ? <button type="button" onClick={() => onOpenSettings('mcp')} aria-label="打开 MCP 配置">
              <span aria-hidden="true">◎</span>
              MCP
            </button> : null}
            {onOpenSettings ? <button type="button" onClick={() => onOpenSettings('plugins')} aria-label="打开 Plugins 配置">
              <span aria-hidden="true">◫</span>
              Plugins
            </button> : null}
            {onOpenSettings ? <button type="button" onClick={() => onOpenSettings('memory')} aria-label="打开 Memory 配置">
              <span aria-hidden="true">◌</span>
              Memory
            </button> : null}
            {onOpenSettings ? <button type="button" onClick={() => onOpenSettings('channel')} aria-label="打开 Channel 配置">
              <span aria-hidden="true">☷</span>
              Channel
            </button> : null}
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
