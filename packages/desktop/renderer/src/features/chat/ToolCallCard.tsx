import type { DesktopToolCall } from '../../../../shared/protocol.js'
import {
  buildEditDiff,
  isShellToolName,
  summarizeShellCommand,
  toolDisplayMeta,
} from './toolRendering.js'

function stateLabel(state: DesktopToolCall['state']): string {
  if (state === 'running') return '执行中'
  if (state === 'pending') return '等待中'
  if (state === 'success') return '完成'
  if (state === 'denied') return '已拒绝'
  if (state === 'interrupted') return '已中断'
  return '失败'
}

function inputPath(input: unknown): string | null {
  if (typeof input !== 'object' || input === null) return null
  const record = input as Record<string, unknown>
  const value = record.file_path ?? record.path
  return typeof value === 'string' ? value : null
}

function inputRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object'
    ? (input as Record<string, unknown>)
    : {}
}

function inputString(input: unknown, key: string): string | null {
  const value = inputRecord(input)[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function shellCommand(tool: DesktopToolCall): string | null {
  return isShellToolName(tool.name) ? inputString(tool.input, 'command') : null
}

function agentToolSummary(tool: DesktopToolCall): string | null {
  const normalized = tool.name.toLowerCase()
  if (normalized === 'agent') {
    return inputString(tool.input, 'name') ?? tool.summary ?? '启动子 Agent'
  }
  if (normalized === 'teamcreate' || normalized === 'teamdelete') {
    return inputString(tool.input, 'team_name') ?? inputString(tool.input, 'teamName') ?? tool.summary ?? null
  }
  if (normalized === 'taskcreate') {
    return inputString(tool.input, 'subject') ?? tool.summary ?? null
  }
  if (normalized === 'taskupdate') {
    const taskId = inputString(tool.input, 'taskId')
    const owner = inputString(tool.input, 'owner')
    const status = inputString(tool.input, 'status')
    return [taskId ? `#${taskId}` : null, owner ? `→ ${owner}` : null, status].filter(Boolean).join(' ') || tool.summary || null
  }
  if (normalized === 'sendmessage') {
    const to = inputString(tool.input, 'to')
    return to ? `→ ${to}` : tool.summary ?? null
  }
  return null
}

export function ToolCallCard({
  tool,
  onOpenFile,
  collapsed = true,
}: {
  tool: DesktopToolCall
  onOpenFile?: (path: string) => void
  collapsed?: boolean
}): React.ReactNode {
  const meta = toolDisplayMeta(tool.name)
  const diff = buildEditDiff(tool)
  const path = diff?.path ?? inputPath(tool.input)
  const command = shellCommand(tool)
  const commandSummary = command ? summarizeShellCommand(command) : null

  const header = (
    <>
        <span className="tool-icon" aria-hidden="true">
          {meta.icon}
        </span>
        <strong>{meta.label}</strong>
        {commandSummary ? (
          <span className="tool-command-summary" title={command ?? undefined}>
            {commandSummary}
          </span>
        ) : path && onOpenFile ? (
          <button
            className="tool-file-link"
            type="button"
            onClick={event => {
              event.preventDefault()
              onOpenFile(path)
            }}
          >
            {path}
          </button>
        ) : (
          <span>{(agentToolSummary(tool) ?? tool.summary) || tool.name}</span>
        )}
        {diff ? (
          <small className="diff-stat">
            +{diff.additions} / -{diff.deletions}
          </small>
        ) : null}
        <small>{stateLabel(tool.state)}</small>
    </>
  )
  const content = (
    <>
      {diff ? (
        <div className="diff-view">
          <header>
            {diff.path && onOpenFile ? (
              <button type="button" onClick={() => onOpenFile(diff.path!)}>
                {diff.path}
              </button>
            ) : (
              <span>{diff.path ?? '编辑差异'}</span>
            )}
            <strong>
              +{diff.additions} -{diff.deletions}
            </strong>
          </header>
          <pre>
            {diff.lines.map((line, index) => (
              <code
                key={`${line.kind}-${index}-${line.text}`}
                className={`diff-line diff-${line.kind}`}
              >
                {line.kind === 'add' ? '+' : '-'} {line.text}
              </code>
            ))}
          </pre>
        </div>
      ) : command ? (
        <details className="tool-command-detail">
          <summary>查看完整 Shell</summary>
          <pre>{command}</pre>
        </details>
      ) : tool.input !== undefined ? (
        <pre>{JSON.stringify(tool.input, null, 2)}</pre>
      ) : null}
      {tool.output ? <pre>{tool.output}</pre> : null}
    </>
  )

  if (!collapsed) {
    return (
      <article className={`tool-card tool-${tool.state} tool-card-expanded`}>
        <header className="tool-card-header">{header}</header>
        {content}
      </article>
    )
  }

  return (
    <details className={`tool-card tool-${tool.state}`}>
      <summary>{header}</summary>
      {content}
    </details>
  )
}
