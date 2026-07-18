import { useEffect } from 'react'
import type { DiagnosticsSnapshot } from '../../../../shared/protocol.js'

type Props = {
  diagnostics: DiagnosticsSnapshot
  onClose: () => void
  onRefresh: () => void
  onCopy: () => void
  onOpenDirectory: () => void
}

const labels: Record<DiagnosticsSnapshot['coreStatus'], string> = {
  stopped: '已停止',
  starting: '启动中',
  ready: '已连接',
  restarting: '正在重启',
  failed: '启动失败',
}

export function DiagnosticsDrawer({
  diagnostics,
  onClose,
  onRefresh,
  onCopy,
  onOpenDirectory,
}: Props): React.ReactNode {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="diagnostics-layer">
      <button
        type="button"
        className="diagnostics-backdrop"
        aria-label="关闭诊断日志"
        onClick={onClose}
      />
      <aside className="diagnostics-drawer" aria-label="诊断日志">
        <header>
          <div>
            <h2>诊断日志</h2>
            <span className={`diagnostic-status status-${diagnostics.coreStatus}`}>
              Core {labels[diagnostics.coreStatus]}
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭诊断日志">
            ×
          </button>
        </header>
        {diagnostics.lastError ? (
          <div className="diagnostic-error">{diagnostics.lastError}</div>
        ) : null}
        <p className="log-path" title={diagnostics.logPath}>
          {diagnostics.logPath}
        </p>
        <pre>{diagnostics.latestLines || '日志为空'}</pre>
        <footer>
          <button type="button" onClick={onRefresh}>刷新</button>
          <button type="button" onClick={onCopy}>复制</button>
          <button type="button" onClick={onOpenDirectory}>打开日志目录</button>
          <button type="button" onClick={onClose}>关闭</button>
        </footer>
      </aside>
    </div>
  )
}
