import type { DesktopScheduledTasksSnapshot } from '../../../../shared/protocol.js'

type Props = {
  cwd: string
  snapshot: DesktopScheduledTasksSnapshot | null
  loading: boolean
  onPersist?: (id: string) => void
  onRefresh: () => void
  onBack: () => void
}

function formatDate(value: string | undefined): string {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN')
}

function taskTypeLabel(task: DesktopScheduledTasksSnapshot['tasks'][number]): string {
  return `${task.recurring ? '循环' : '一次性'} · ${task.durable ? '持久' : '临时'}`
}

export function ScheduledTasksCenter({
  cwd,
  snapshot,
  loading,
  onPersist,
  onRefresh,
  onBack,
}: Props): React.ReactNode {
  const tasks = snapshot?.tasks ?? []
  return (
    <main className="scheduled-tasks-shell">
      <header className="scheduled-tasks-header">
        <div>
          <button type="button" className="back-button" onClick={onBack}>← 对话</button>
          <h1>本地定时任务</h1>
          <p>{cwd} · 读取 .claude/scheduled_tasks.json</p>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading}>
          {loading ? '读取中…' : '↻ 刷新'}
        </button>
      </header>

      {snapshot?.error ? (
        <section className="scheduled-task-error">
          <strong>读取失败</strong>
          <p>{snapshot.error}</p>
        </section>
      ) : null}

      <section className={loading ? 'scheduled-tasks-content refreshing' : 'scheduled-tasks-content'}>
        <div className="scheduled-tasks-meta">
          <span>任务数</span>
          <strong>{tasks.length}</strong>
          <code>{snapshot?.path ?? `${cwd.replace(/[\\/]+$/, '')}/.claude/scheduled_tasks.json`}</code>
        </div>

        {tasks.length === 0 ? (
          <section className="scheduled-task-empty">
            <div aria-hidden="true">⏱</div>
            <strong>当前工作区暂无本地定时任务</strong>
            <p>这里只读取 durable 本地任务；会话内临时任务不会写入文件，关闭 Claude 后也不会保留。</p>
          </section>
        ) : (
          <div className="scheduled-task-list">
            {tasks.map(task => (
              <article key={task.id} className="scheduled-task-card">
                <header>
                  <div>
                    <strong>{task.id}</strong>
                    <span>{taskTypeLabel(task)}{task.permanent ? ' · 永久' : ''}</span>
                  </div>
                  <div className="scheduled-task-card-actions">
                    <code>{task.cron}</code>
                    {!task.durable && onPersist ? (
                      <button type="button" onClick={() => onPersist(task.id)}>
                        转为持久
                      </button>
                    ) : null}
                  </div>
                </header>
                <p>{task.prompt}</p>
                <dl>
                  <div><dt>创建时间</dt><dd>{formatDate(task.createdAt)}</dd></div>
                  <div><dt>上次执行</dt><dd>{formatDate(task.lastFiredAt)}</dd></div>
                  <div><dt>Agent</dt><dd>{task.agentId ?? '主会话'}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        )}

        {snapshot?.warnings.length ? (
          <section className="scheduled-task-warnings">
            {snapshot.warnings.map(warning => <p key={warning}>{warning}</p>)}
          </section>
        ) : null}
      </section>
    </main>
  )
}
