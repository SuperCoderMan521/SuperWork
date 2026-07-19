import type { DesktopTurnUsageReport } from '../../../../shared/protocol.js'

function formatTokens(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
}

function billedTokens(report: DesktopTurnUsageReport): number {
  const usage = report.usage
  return usage.inputTokens + usage.outputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens
}

function cacheHitRate(report: DesktopTurnUsageReport): string {
  const usage = report.usage
  const promptTokens = usage.inputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens
  return promptTokens === 0 ? '--' : `${Math.round(usage.cacheReadInputTokens / promptTokens * 100)}%`
}

export function TurnUsageReport({ report }: { report: DesktopTurnUsageReport }): React.ReactNode {
  const usage = report.usage
  const cost = report.costUsd === undefined ? '费用未配置' : `$${report.costUsd.toFixed(4)}`
  const duration = `${(report.durationMs / 1000).toFixed(1)}s`
  const status = report.status === 'interrupted' ? '已中断' : report.status === 'failed' ? '执行失败' : null
  return (
    <details className="turn-usage-report">
      <summary>
        <span className="turn-usage-icon" aria-hidden="true">◷</span>
        <strong>本轮使用</strong>
        <span>{formatTokens(billedTokens(report))} tokens</span>
        <span>缓存 {cacheHitRate(report)}</span>
        <span>{cost}</span>
        <span>{duration}</span>
        {status ? <span className={`turn-usage-status usage-${report.status}`}>{status}</span> : null}
      </summary>
      <div className="turn-usage-details">
        <span>输入 Token</span><strong>{formatTokens(usage.inputTokens)}</strong>
        <span>输出 Token</span><strong>{formatTokens(usage.outputTokens)}</strong>
        <span>缓存读取</span><strong>{formatTokens(usage.cacheReadInputTokens)}</strong>
        <span>缓存写入</span><strong>{formatTokens(usage.cacheCreationInputTokens)}</strong>
        <span>缓存命中率</span><strong>{cacheHitRate(report)}</strong>
        <span>费用</span><strong>{cost}</strong>
        <span>耗时</span><strong>{duration}</strong>
        <span>模型</span><strong>{report.provider} / {report.model}</strong>
        <span>API 调用</span><strong>{report.apiCalls}</strong>
      </div>
    </details>
  )
}
