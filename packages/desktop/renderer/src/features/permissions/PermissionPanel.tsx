import type {
  DesktopPermissionRequest,
  PermissionDecision,
} from '../../../../shared/protocol.js'
import { useEffect, useRef, useState } from 'react'

const labels: Record<PermissionDecision, string> = {
  deny: '拒绝',
  allow_once: '允许一次',
  allow_session: '本会话允许',
}

type PermissionPanelProps = {
  request: DesktopPermissionRequest
  onResolve: (decision: PermissionDecision) => void
}

export function PermissionPanel({
  request,
  onResolve,
}: PermissionPanelProps): React.ReactNode {
  const submittedRef = useRef(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    submittedRef.current = false
    setSubmitting(false)
  }, [request.id])

  const resolveOnce = (decision: PermissionDecision) => {
    if (submittedRef.current) return
    submittedRef.current = true
    setSubmitting(true)
    onResolve(decision)
  }

  return (
    <section className="permission-panel" aria-label="工具权限请求">
      <div>
        <strong>{request.toolName} 请求权限</strong>
        <p>{request.summary}</p>
      </div>
      <form
        className="permission-actions"
        onSubmit={event => {
          event.preventDefault()
          const submitter = (event.nativeEvent as SubmitEvent)
            .submitter as HTMLButtonElement | null
          const decision = submitter?.value as PermissionDecision | undefined
          if (decision && request.decisions.includes(decision)) resolveOnce(decision)
        }}
      >
        {request.decisions.map(decision => (
          <button
            key={decision}
            className={decision === 'deny' ? 'secondary-button' : 'permission-button'}
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
        {submitting ? <span className="permission-submitting">处理中…</span> : null}
      </form>
    </section>
  )
}
