import type { DesktopPerformanceRange, DesktopPerformanceSnapshot } from '../../../../shared/protocol.js'

type Props = { cwd: string; range: DesktopPerformanceRange; snapshot: DesktopPerformanceSnapshot | null; loading: boolean; error: string | null; onRangeChange: (range: DesktopPerformanceRange) => void; onRefresh: () => void; onBack: () => void }
const number = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
const duration = (ms: number) => ms >= 3_600_000 ? `${(ms / 3_600_000).toFixed(1)}h` : ms >= 60_000 ? `${(ms / 60_000).toFixed(1)}m` : `${(ms / 1000).toFixed(1)}s`
const tokenTotal = (snapshot: DesktopPerformanceSnapshot) => Object.values(snapshot.summary.tokens).reduce((sum, value) => sum + value, 0)

export function PerformanceCenter({ cwd, range, snapshot, loading, error, onRangeChange, onRefresh, onBack }: Props): React.ReactNode {
  const summary = snapshot?.summary
  return <div className="performance-shell">
    <header className="performance-header">
      <div><button type="button" className="back-button" onClick={onBack}>← 对话</button><h1>性能中心</h1><p>{cwd} · 工作区历史</p></div>
      <div className="performance-actions"><select aria-label="统计范围" value={range} onChange={event => onRangeChange(event.target.value as DesktopPerformanceRange)}><option value="7d">最近 7 天</option><option value="30d">最近 30 天</option><option value="all">全部</option></select><button type="button" onClick={onRefresh}>↻ 刷新</button></div>
    </header>
    {error ? <section className="performance-state"><strong>性能数据加载失败</strong><p>{error}</p><button type="button" onClick={onRefresh}>重试</button></section> : null}
    {!snapshot && loading ? <section className="performance-state">正在分析本地会话…</section> : null}
    {!error && snapshot && snapshot.summary.sessions === 0 ? <section className="performance-state">当前范围没有会话数据。</section> : null}
    {snapshot && summary && summary.sessions > 0 ? <main className={loading ? 'performance-content refreshing' : 'performance-content'}>
      <section className="performance-cards">
        <article><span>总 TOKEN</span><strong>{number(tokenTotal(snapshot))}</strong><small>缓存命中 {summary.cacheHitRate === undefined ? '--' : `${(summary.cacheHitRate * 100).toFixed(1)}%`}</small></article>
        <article><span>估算费用</span><strong>{summary.estimatedCostUsd === undefined ? '--' : `$${summary.estimatedCostUsd.toFixed(4)}`}</strong><small>价格覆盖 {(summary.pricedTokenShare * 100).toFixed(0)}%</small></article>
        <article><span>总耗时</span><strong>{duration(summary.wallClockMs)}</strong><small>API {summary.apiDurationMs ? duration(summary.apiDurationMs) : '--'}</small></article>
        <article><span>失败 / 中断</span><strong>{summary.failedTurns} / {summary.interruptedTurns}</strong><small>{summary.sessions} 会话 · {summary.turns} 轮</small></article>
      </section>
      <section className="performance-grid">
        <article className="performance-panel"><h2>Token 与耗时趋势</h2><div className="performance-bars">{snapshot.trend.map(item => <div key={item.bucket} title={`${item.bucket}: ${item.tokens}`}><i style={{ height: `${Math.max(8, item.tokens / Math.max(...snapshot.trend.map(point => point.tokens), 1) * 100)}%` }} /><span>{item.bucket.slice(5)}</span></div>)}</div></article>
        <article className="performance-panel"><h2>Token 构成</h2><div className="token-composition">{Object.entries(summary.tokens).map(([key, value]) => <i key={key} className={`token-${key}`} style={{ width: `${value / Math.max(tokenTotal(snapshot), 1) * 100}%` }} />)}</div><p>输入 {number(summary.tokens.inputTokens)} · 输出 {number(summary.tokens.outputTokens)}<br />缓存读取 {number(summary.tokens.cacheReadInputTokens)} · 缓存写入 {number(summary.tokens.cacheCreationInputTokens)}</p></article>
        <article className="performance-panel"><h2>工具性能</h2><table><thead><tr><th>工具</th><th>次数</th><th>平均耗时</th></tr></thead><tbody>{snapshot.tools.slice(0, 10).map(tool => <tr key={tool.name}><td>{tool.name}</td><td>{tool.calls}</td><td>{tool.averageDurationMs === undefined ? '--' : duration(tool.averageDurationMs)}</td></tr>)}</tbody></table></article>
        <article className="performance-panel"><h2>模型分布</h2><table><thead><tr><th>模型</th><th>调用</th><th>Token</th></tr></thead><tbody>{snapshot.models.map(model => <tr key={model.model}><td>{model.model}</td><td>{model.apiCalls}</td><td>{number(Object.values(model.tokens).reduce((a, b) => a + b, 0))}</td></tr>)}</tbody></table></article>
        <article className="performance-panel performance-diagnostics"><h2>诊断状态</h2><p>Debug 日志 <b>{snapshot.diagnostics.debugLogAvailable ? '可用' : '未启用'}</b></p><p>Langfuse <b>{snapshot.diagnostics.langfuseConfigured ? '已配置' : '未配置'}</b></p><p>扫描 <b>{snapshot.scannedSessions} 会话 / {snapshot.scannedLines} 行</b></p></article>
      </section>
      {snapshot.warnings.length ? <aside className="performance-warnings">{snapshot.warnings.map(warning => <p key={warning}>{warning}</p>)}</aside> : null}
    </main> : null}
  </div>
}
