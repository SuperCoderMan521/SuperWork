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
  const contentRef = useRef<HTMLParagraphElement>(null)

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

  return (
    <section className="permission-panel" aria-label="工具权限请求">
      <div className="permission-header">
        <strong>{request.toolName} 请求权限</strong>
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
        <p ref={contentRef}>{request.summary}</p>
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
