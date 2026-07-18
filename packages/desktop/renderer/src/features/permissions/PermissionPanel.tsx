import type {
  DesktopPermissionRequest,
  PermissionDecision,
} from '../../../../shared/protocol.js'

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
  return (
    <section className="permission-panel" aria-label="工具权限请求">
      <div>
        <strong>{request.toolName} 请求权限</strong>
        <p>{request.summary}</p>
      </div>
      <div className="permission-actions">
        {request.decisions.map(decision => (
          <button
            key={decision}
            className={decision === 'deny' ? 'secondary-button' : 'permission-button'}
            type="button"
            onClick={() => onResolve(decision)}
          >
            {labels[decision]}
          </button>
        ))}
      </div>
    </section>
  )
}
