import type { DesktopToolCall } from '../../../../shared/protocol.js'
import { buildEditDiff, toolDisplayMeta } from './toolRendering.js'

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

  const header = (
    <>
        <span className="tool-icon" aria-hidden="true">
          {meta.icon}
        </span>
        <strong>{meta.label}</strong>
        {path && onOpenFile ? (
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
          <span>{tool.summary || tool.name}</span>
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
