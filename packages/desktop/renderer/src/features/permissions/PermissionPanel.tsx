import type {
  DesktopPermissionRequest,
  PermissionDecision,
} from '../../../../shared/protocol.js'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ASK_USER_QUESTION_TOOL_NAME,
  AskUserQuestionPanel,
  parseAskUserQuestions,
} from './AskUserQuestionPanel.js'

const labels: Record<PermissionDecision, string> = {
  deny: '拒绝',
  allow_once: '允许一次',
  allow_session: '本会话允许',
}

/** Collapsed preview height (px). Keeps the panel compact by default. */
const COLLAPSED_HEIGHT = 64

/** Persisted user preference: whether to expand permission summaries by default. */
const EXPAND_PREF_KEY = 'superwork.permission.expandDefault'
function readExpandPref(): boolean {
  try {
    return localStorage.getItem(EXPAND_PREF_KEY) === '1'
  } catch {
    return false
  }
}
function writeExpandPref(value: boolean): void {
  try {
    localStorage.setItem(EXPAND_PREF_KEY, value ? '1' : '0')
  } catch {
    /* ignore storage errors */
  }
}

type PermissionPanelProps = {
  request: DesktopPermissionRequest
  onResolve: (decision: PermissionDecision, payload?: unknown) => void
}

type PermissionDetail = {
  action: string
  path?: string
  previewLabel?: string
  preview?: string
  rawInput: string
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  return value as Record<string, unknown>
}

function stringField(
  input: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

function prettyInput(input: unknown): string {
  try {
    return JSON.stringify(input, null, 2)
  } catch {
    return String(input)
  }
}

function permissionDetail(request: DesktopPermissionRequest): PermissionDetail {
  const input = asRecord(request.input)
  const rawInput = prettyInput(request.input)
  if (!input) {
    return { action: request.summary, rawInput }
  }

  switch (request.toolName) {
    case 'Write':
      return {
        action: '写入文件',
        path: stringField(input, 'file_path', 'path'),
        previewLabel: '内容预览',
        preview: stringField(input, 'content'),
        rawInput,
      }
    case 'Edit':
    case 'MultiEdit':
      return {
        action: '修改文件',
        path: stringField(input, 'file_path', 'path'),
        previewLabel: '变更预览',
        preview:
          stringField(input, 'new_string') ??
          stringField(input, 'edits') ??
          request.summary,
        rawInput,
      }
    case 'Read':
      return {
        action: '读取文件',
        path: stringField(input, 'file_path', 'path'),
        rawInput,
      }
    case 'Bash':
    case 'PowerShell':
      return {
        action: request.toolName === 'Bash' ? '执行 Shell 命令' : '执行 PowerShell 命令',
        previewLabel: '命令',
        preview: stringField(input, 'command'),
        rawInput,
      }
    default:
      return { action: request.summary, rawInput }
  }
}

function permissionSuggestionLabel(suggestion: unknown): string | undefined {
  const record = asRecord(suggestion)
  if (!record) return undefined
  if (
    record.type === 'setMode' &&
    record.mode === 'acceptEdits' &&
    record.destination === 'session'
  ) {
    return '批准后，本会话自动接受文件编辑'
  }
  if (record.type === 'setMode' && typeof record.mode === 'string') {
    return `批准后，将权限模式切换为 ${record.mode}`
  }
  if (record.type === 'addRules') {
    return '批准后，将添加匹配的工具允许规则'
  }
  if (record.type === 'addDirectories') {
    return '批准后，将添加工作目录权限'
  }
  return undefined
}

function permissionSuggestionLabels(
  request: DesktopPermissionRequest,
): string[] {
  const suggestions = request.permissionSuggestions ?? []
  const labels = suggestions
    .map(permissionSuggestionLabel)
    .filter((label): label is string => Boolean(label))
  return [...new Set(labels)]
}

/**
 * Hookless dispatcher: interactive tools (AskUserQuestion) get a dedicated
 * dialog; everything else falls through to the generic allow/deny panel.
 */
export function PermissionPanel(
  props: PermissionPanelProps,
): React.ReactNode {
  if (props.request.toolName === ASK_USER_QUESTION_TOOL_NAME) {
    const questions = parseAskUserQuestions(props.request.input)
    if (questions && questions.length > 0) {
      return (
        <AskUserQuestionPanel
          questions={questions}
          onResolve={props.onResolve}
        />
      )
    }
  }
  return <GenericPermissionPanel {...props} />
}

function GenericPermissionPanel({
  request,
  onResolve,
}: PermissionPanelProps): React.ReactNode {
  const submittedRef = useRef(false)
  const [submitting, setSubmitting] = useState(false)

  // Collapse state — remembers user's global preference across requests.
  const [expanded, setExpanded] = useState<boolean>(readExpandPref)

  // Whether the content overflows the collapsed preview (drives toggle visibility).
  const [overflowable, setOverflowable] = useState(false)

  // Dynamic max-height for smooth expand/collapse animation.
  const [maxHeight, setMaxHeight] = useState<number>(COLLAPSED_HEIGHT)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    submittedRef.current = false
    setSubmitting(false)
  }, [request.id])

  // Measure content height to determine if a toggle is needed, and to animate
  // expansion to the exact content height (avoids guessing a fixed max).
  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return
    const full = el.scrollHeight
    setOverflowable(full > COLLAPSED_HEIGHT + 4)
    setMaxHeight(expanded ? full : COLLAPSED_HEIGHT)
  }, [expanded, request.summary])

  const toggleExpanded = () => {
    const next = !expanded
    setExpanded(next)
    writeExpandPref(next)
  }

  const resolveOnce = (decision: PermissionDecision) => {
    if (submittedRef.current) return
    submittedRef.current = true
    setSubmitting(true)
    onResolve(decision)
  }

  const detail = permissionDetail(request)
  const suggestionLabels = permissionSuggestionLabels(request)

  return (
    <section className="permission-panel" aria-label="工具权限请求">
      <div className="permission-header">
        <strong>{request.toolName} 请求权限</strong>
        {request.agentName ? (
          <span className="permission-agent-source">
            {request.agentName}
            {request.teamName ? ` · ${request.teamName}` : ''}
          </span>
        ) : null}
        {overflowable ? (
          <button
            type="button"
            className="permission-toggle"
            onClick={toggleExpanded}
            aria-expanded={expanded}
            aria-label={expanded ? '收起详情' : '展开详情'}
          >
            <span className="permission-toggle-label">
              {expanded ? '收起' : '展开'}
            </span>
            <svg
              className="permission-chevron"
              data-expanded={expanded}
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M3 4.5L6 7.5L9 4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : null}
      </div>

      <div
        className="permission-summary"
        data-expanded={expanded}
        data-overflowable={overflowable}
        style={{ maxHeight: `${maxHeight}px` }}
      >
        <div ref={contentRef} className="permission-detail">
          <div className="permission-detail-main">
            <span>{detail.action}</span>
            {detail.path ? <code>{detail.path}</code> : null}
          </div>
          {detail.preview ? (
            <div className="permission-preview">
              <span>{detail.previewLabel ?? '预览'}</span>
              <pre><code>{detail.preview}</code></pre>
            </div>
          ) : (
            <p>{request.summary}</p>
          )}
          {suggestionLabels.length > 0 ? (
            <div className="permission-suggestions">
              {suggestionLabels.map(label => (
                <span key={label}>{label}</span>
              ))}
            </div>
          ) : null}
          <details className="permission-raw-request">
            <summary>查看原始请求</summary>
            <pre><code>{detail.rawInput}</code></pre>
          </details>
        </div>
      </div>

      <form
        className="permission-actions"
        onSubmit={event => {
          event.preventDefault()
          const submitter = (event.nativeEvent as SubmitEvent)
            .submitter as HTMLButtonElement | null
          const decision = submitter?.value as PermissionDecision | undefined
          if (decision && request.decisions.includes(decision))
            resolveOnce(decision)
        }}
      >
        {request.decisions.map(decision => (
          <button
            key={decision}
            className={
              decision === 'deny' ? 'secondary-button' : 'permission-button'
            }
            type="submit"
            name="decision"
            value={decision}
            disabled={submitting}
            onPointerDown={event => {
              if (event.button !== 0) return
              event.preventDefault()
              resolveOnce(decision)
            }}
          >
            {labels[decision]}
          </button>
        ))}
        {submitting ? (
          <span className="permission-submitting">处理中…</span>
        ) : null}
      </form>
    </section>
  )
}
