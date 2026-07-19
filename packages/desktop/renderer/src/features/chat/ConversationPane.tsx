import { useEffect, useRef } from 'react'
import type {
  DesktopMessage,
  DesktopToolCall,
  DesktopTurnUsageReport,
  PermissionDecision,
} from '../../../../shared/protocol.js'
import type { RendererSession } from '../../app/reducer.js'
import { PermissionPanel } from '../permissions/PermissionPanel.js'
import { Composer } from './Composer.js'
import { MessageRow } from './MessageRow.js'
import { ToolCallCard } from './ToolCallCard.js'
import { TurnUsageReport } from './TurnUsageReport.js'
import { buildEditDiff, toolDisplayMeta } from './toolRendering.js'

type ConversationPaneProps = {
  session: RendererSession
  onSubmit: (text: string) => void
  onInterrupt: () => void
  onSelectWorkspace: () => void
  onOpenFile?: (path: string) => void
  onResolvePermission?: (
    permissionId: string,
    decision: PermissionDecision,
  ) => void
  error?: string | null
  onDismissError?: () => void
  onOpenDiagnostics?: () => void
}

type MessageTimelineItem = {
  type: 'message'
  id: string
  timestamp: number
  displayOrder: number
  index: number
  message: DesktopMessage
}

type ToolTimelineItem = {
  type: 'tool'
  id: string
  timestamp: number
  displayOrder: number
  index: number
  tool: DesktopToolCall
}

type UsageTimelineItem = {
  type: 'usage'
  id: string
  timestamp: number
  displayOrder: number
  index: number
  report: DesktopTurnUsageReport
}

export type ConversationTimelineItem = MessageTimelineItem | ToolTimelineItem | UsageTimelineItem

export type ConversationTimelineGroup =
  | {
      type: 'single'
      key: string
      item: ConversationTimelineItem
    }
  | {
      type: 'tool-group'
      key: string
      name: string
      items: ToolTimelineItem[]
    }

export function getConversationTimeline(
  session: RendererSession,
): ConversationTimelineItem[] {
  const messages = session.messageOrder.map((id, index) => ({
    type: 'message' as const,
    id: `message:${id}`,
    timestamp: session.messages[id]?.createdAt ?? Number.MAX_SAFE_INTEGER,
    displayOrder:
      session.messages[id]?.displayOrder ?? Number.MAX_SAFE_INTEGER,
    index,
    message: session.messages[id]!,
  }))
  const tools = session.toolOrder.map((id, index) => ({
    type: 'tool' as const,
    id: `tool:${id}`,
    timestamp:
      session.tools[id]?.startedAt ??
      session.tools[id]?.completedAt ??
      Number.MAX_SAFE_INTEGER,
    displayOrder:
      session.tools[id]?.displayOrder ?? Number.MAX_SAFE_INTEGER,
    index: session.messageOrder.length + index,
    tool: session.tools[id]!,
  }))
  const reports = (session.turnUsageReports ?? []).map((report, index) => ({
    type: 'usage' as const,
    id: `usage:${report.id}`,
    timestamp: report.completedAt,
    displayOrder: report.displayOrder ?? Number.MAX_SAFE_INTEGER - session.turnUsageReports!.length + index,
    index: session.messageOrder.length + session.toolOrder.length + index,
    report,
  }))
  return [...messages, ...tools, ...reports]
    .filter(item => item.type === 'message' ? item.message : item.type === 'tool' ? item.tool : item.report)
    .sort(
      (left, right) =>
        left.displayOrder - right.displayOrder ||
        left.timestamp - right.timestamp ||
        left.index - right.index,
    )
}

export function groupConversationTimeline(
  timeline: ConversationTimelineItem[],
): ConversationTimelineGroup[] {
  const groups: ConversationTimelineGroup[] = []
  let index = 0
  while (index < timeline.length) {
    const item = timeline[index]
    if (item?.type !== 'tool') {
      if (item) groups.push({ type: 'single', key: item.id, item })
      index += 1
      continue
    }

    const run: ToolTimelineItem[] = [item]
    let nextIndex = index + 1
    while (
      timeline[nextIndex]?.type === 'tool' &&
      (timeline[nextIndex] as ToolTimelineItem).tool.name === item.tool.name
    ) {
      run.push(timeline[nextIndex] as ToolTimelineItem)
      nextIndex += 1
    }

    if (run.length > 1) {
      groups.push({
        type: 'tool-group',
        key: `tool-group:${item.tool.name}:${groups.length}`,
        name: item.tool.name,
        items: run,
      })
    } else {
      groups.push({ type: 'single', key: item.id, item })
    }
    index = nextIndex
  }
  return groups
}

function conversationToolIsVisible(
  _session: RendererSession,
  tool: DesktopToolCall,
): boolean {
  return tool.state === 'running' || tool.state === 'pending'
}

function getVisibleConversationTimeline(
  session: RendererSession,
): ConversationTimelineItem[] {
  return getConversationTimeline(session).filter(item =>
    item.type === 'message' || item.type === 'usage'
      ? true
      : conversationToolIsVisible(session, item.tool),
  )
}

function toolInputString(
  tool: DesktopToolCall,
  keys: readonly string[],
): string | null {
  if (typeof tool.input !== 'object' || tool.input === null) return null
  const input = tool.input as Record<string, unknown>
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function toolPath(tool: DesktopToolCall): string | null {
  return buildEditDiff(tool)?.path ?? toolInputString(tool, ['file_path', 'path'])
}

function toolOperationSummary(tool: DesktopToolCall): string {
  return (
    toolPath(tool) ??
    toolInputString(tool, ['command', 'query', 'pattern', 'glob', 'url']) ??
    tool.summary?.trim() ??
    toolDisplayMeta(tool.name).label
  )
}

function activeToolSummary(items: ToolTimelineItem[]): string {
  const active =
    [...items]
      .reverse()
      .find(item => item.tool.state === 'running' || item.tool.state === 'pending') ??
    items.at(-1)
  return active ? toolOperationSummary(active.tool) : ''
}

function ToolGroup({
  name,
  items,
  onOpenFile,
}: {
  name: string
  items: ToolTimelineItem[]
  onOpenFile?: (path: string) => void
}): React.ReactNode {
  const meta = toolDisplayMeta(name)
  return (
    <details className="tool-group tool-group-running">
      <summary>
        <span className="tool-icon" aria-hidden="true">
          {meta.icon}
        </span>
        <strong>{meta.label}</strong>
        <span className="tool-group-description" title={activeToolSummary(items)}>
          {activeToolSummary(items)}
        </span>
      </summary>
      {items.map(item => (
        <ToolCallCard
          key={item.id}
          tool={item.tool}
          onOpenFile={onOpenFile}
          collapsed={false}
        />
      ))}
    </details>
  )
}

export function ConversationPane({
  session,
  onSubmit,
  onInterrupt,
  onSelectWorkspace,
  onOpenFile,
  onResolvePermission,
  error,
  onDismissError,
  onOpenDiagnostics,
}: ConversationPaneProps): React.ReactNode {
  const listRef = useRef<HTMLElement | null>(null)
  const stickToBottom = useRef(true)
  const timeline = getVisibleConversationTimeline(session)
  const groups = groupConversationTimeline(timeline)
  const lastUserIndex = timeline.findLastIndex(
    item => item.type === 'message' && item.message.role === 'user',
  )
  const thinkingMetaMessageId = timeline.slice(lastUserIndex + 1).find(
    item => item.type === 'message' &&
      (item.message.kind === 'thinking' || item.message.kind === 'redacted_thinking'),
  )?.id
  const workspaceMissing = session.cwd.trim() === '.' || session.cwd.trim() === ''

  useEffect(() => {
    const list = listRef.current
    if (!list || !stickToBottom.current) return
    list.scrollTop = list.scrollHeight
  }, [session.messageOrder.length, session.toolOrder.length, session.generationState])

  return (
    <main className="conversation">
      <header className="conversation-header">
        <div>
          <h1>{session.title}</h1>
          <p>{session.cwd}</p>
        </div>
      </header>
      <section
        ref={listRef}
        className="message-list"
        aria-live="polite"
        onScroll={event => {
          const target = event.currentTarget
          const distance = target.scrollHeight - target.scrollTop - target.clientHeight
          stickToBottom.current = distance < 80
        }}
      >
        {workspaceMissing ? (
          <div className="workspace-required-banner" role="note">
            <div className="workspace-required-brand">
              <span className="brand-super">Super</span>
              <span className="brand-work">Work</span>
            </div>
            <div className="workspace-required-copy">
              <strong>需要选择文件空间后才能开始对话</strong>
              <span>点击右下角的工作空间按钮，选择当前项目目录。</span>
            </div>
            <button type="button" onClick={onSelectWorkspace}>
              选择文件空间
            </button>
          </div>
        ) : null}
        {groups.map(group => {
          if (group.type === 'tool-group') {
            return (
              <ToolGroup
                key={group.key}
                name={group.name}
                items={group.items}
                onOpenFile={onOpenFile}
              />
            )
          }
          const item = group.item
          return item.type === 'message' ? (
            <MessageRow
              key={group.key}
              message={item.message}
              showThinkingMeta={item.id === thinkingMetaMessageId}
            />
          ) : item.type === 'usage' ? (
            <TurnUsageReport key={group.key} report={item.report} />
          ) : (
            <ToolGroup
              key={group.key}
              name={item.tool.name}
              items={[item]}
              onOpenFile={onOpenFile}
            />
          )
        })}
      </section>
      {session.permissionOrder[0] && onResolvePermission ? (
        <PermissionPanel
          request={session.permissions[session.permissionOrder[0]]!}
          onResolve={decision =>
            onResolvePermission(session.permissionOrder[0]!, decision)
          }
        />
      ) : null}
      {error ? (
        <div className="query-error" role="alert">
          <span>请求失败：{error}</span>
          <div className="query-error-actions">
            <button type="button" onClick={onOpenDiagnostics}>
              查看日志
            </button>
            {onDismissError ? (
              <button type="button" onClick={onDismissError}>
                关闭
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <Composer
        generating={
          session.generationState === 'running' ||
          session.generationState === 'interrupting'
        }
        workspace={session.cwd}
        onSubmit={onSubmit}
        onInterrupt={onInterrupt}
        onSelectWorkspace={onSelectWorkspace}
      />
    </main>
  )
}
