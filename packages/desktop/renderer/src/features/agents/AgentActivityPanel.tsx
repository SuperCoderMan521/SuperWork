import type {
  DesktopAgentMailboxSnapshot,
  DesktopToolCall,
} from '../../../../shared/protocol.js'

export type AgentTaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'blocked'
  | 'failed'

export type ObservedAgent = {
  name: string
  type?: string
  teamName?: string
  status: 'idle' | 'running' | 'completed' | 'failed' | 'waiting'
  currentTasks: string[]
  completedTasks: number
}

export type ObservedTask = {
  id: string
  subject: string
  description?: string
  status: AgentTaskStatus
  owner?: string
  updatedAt?: number
}

export type ObservedAgentMessage = {
  from: string
  to: string
  text: string
  summary?: string
  timestamp?: number
  kind: 'message' | 'assignment' | 'system'
}

export type AgentActivity = {
  teamName: string | null
  agents: ObservedAgent[]
  tasks: ObservedTask[]
  messages: ObservedAgentMessage[]
  summary: {
    runningAgents: number
    completedAgents: number
    failedAgents: number
    pendingTasks: number
    runningTasks: number
    completedTasks: number
    blockedTasks: number
    messageCount: number
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function parseJsonRecord(value: string | undefined): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return asRecord(parsed)
  } catch {
    return {}
  }
}

function normalizeStatus(value: string | undefined): AgentTaskStatus {
  if (value === 'in_progress' || value === 'completed' || value === 'blocked' || value === 'failed') return value
  return 'pending'
}

function taskIdFromCreate(tool: DesktopToolCall, fallbackIndex: number): string {
  const output = parseJsonRecord(tool.output)
  return (
    stringField(output, 'taskId') ??
    stringField(output, 'id') ??
    stringField(asRecord(tool.input), 'taskId') ??
    `task-${fallbackIndex + 1}`
  )
}

function displayAgentName(tool: DesktopToolCall, fallbackIndex: number): string {
  const input = asRecord(tool.input)
  return (
    stringField(input, 'name') ??
    stringField(input, 'agent_name') ??
    stringField(input, 'to') ??
    tool.summary ??
    `agent-${fallbackIndex + 1}`
  )
}

function textFromMessage(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return (
      stringField(record, 'summary') ??
      stringField(record, 'text') ??
      stringField(record, 'message') ??
      JSON.stringify(value)
    )
  }
  return ''
}

function labelForStatus(status: AgentTaskStatus): string {
  if (status === 'in_progress') return '运行中'
  if (status === 'completed') return '已完成'
  if (status === 'blocked') return '阻塞'
  if (status === 'failed') return '失败'
  return '待处理'
}

function agentLabel(status: ObservedAgent['status']): string {
  if (status === 'running') return '运行中'
  if (status === 'completed') return '已完成'
  if (status === 'failed') return '失败'
  if (status === 'waiting') return '等待'
  return '空闲'
}

function taskStatusFromToolState(tool: DesktopToolCall): ObservedAgent['status'] {
  if (tool.state === 'running' || tool.state === 'pending') return 'running'
  if (tool.state === 'success') return 'completed'
  if (tool.state === 'error') return 'failed'
  return 'idle'
}

export function buildAgentActivity(
  tools: Record<string, DesktopToolCall>,
  order: string[],
  mailbox?: DesktopAgentMailboxSnapshot | null,
): AgentActivity {
  let teamName: string | null = null
  const agents = new Map<string, ObservedAgent>()
  const tasks = new Map<string, ObservedTask>()
  const messages: ObservedAgentMessage[] = []

  for (const [index, id] of order.entries()) {
    const tool = tools[id]
    if (!tool) continue
    const input = asRecord(tool.input)
    const name = tool.name.toLowerCase()

    if (name === 'teamcreate') {
      teamName = stringField(input, 'team_name') ?? stringField(input, 'teamName') ?? tool.summary ?? teamName
    }

    if (name === 'agent') {
      const agentName = displayAgentName(tool, agents.size)
      const status = taskStatusFromToolState(tool)
      const agentTeamName: string | undefined =
        stringField(input, 'team_name') ?? teamName ?? undefined
      if (!teamName && agentTeamName) teamName = agentTeamName
      agents.set(agentName, {
        ...(agents.get(agentName) ?? {
          name: agentName,
          currentTasks: [],
          completedTasks: 0,
          status,
        }),
        name: agentName,
        type: stringField(input, 'subagent_type') ?? stringField(input, 'agent_type'),
        teamName: agentTeamName,
        status,
      })
    }

    if (name === 'taskcreate') {
      const taskId = taskIdFromCreate(tool, index)
      tasks.set(taskId, {
        id: taskId,
        subject: stringField(input, 'subject') ?? tool.summary ?? taskId,
        description: stringField(input, 'description'),
        status: 'pending',
        updatedAt: tool.startedAt,
      })
    }

    if (name === 'taskupdate') {
      const taskId = stringField(input, 'taskId') ?? stringField(input, 'task_id') ?? stringField(input, 'id')
      if (taskId) {
        const previous = tasks.get(taskId) ?? {
          id: taskId,
          subject: tool.summary ?? taskId,
          status: 'pending' as AgentTaskStatus,
        }
        const status = normalizeStatus(stringField(input, 'status')) || previous.status
        const owner = stringField(input, 'owner') ?? previous.owner
        tasks.set(taskId, {
          ...previous,
          owner,
          status,
          updatedAt: tool.startedAt ?? previous.updatedAt,
        })
        if (owner) {
          const agent = agents.get(owner) ?? {
            name: owner,
            status: 'idle' as const,
            currentTasks: [],
            completedTasks: 0,
          }
          agents.set(owner, {
            ...agent,
            teamName: agent.teamName ?? teamName ?? undefined,
            status: status === 'completed' ? 'idle' : status === 'failed' ? 'failed' : 'running',
          })
          messages.push({
            from: 'team-lead',
            to: owner,
            text: `分配任务：${previous.subject}`,
            summary: previous.subject,
            timestamp: tool.startedAt,
            kind: 'assignment',
          })
        }
      }
    }

    if (name === 'sendmessage') {
      const to = stringField(input, 'to') ?? 'unknown'
      const explicitFrom = stringField(input, 'from')
      const recentAgent = Array.from(agents.values()).find(agent => agent.status === 'running')
      const from = explicitFrom ?? (to === 'team-lead' ? recentAgent?.name : undefined) ?? 'team-lead'
      messages.push({
        from,
        to,
        text: textFromMessage(input.message),
        summary: tool.summary,
        timestamp: tool.startedAt,
        kind: 'message',
      })
    }
  }

  if (mailbox) {
    for (const team of mailbox.teams) {
      if (!teamName) teamName = team.name
      for (const inbox of team.inboxes) {
        const recipient = inbox.agentName
        if (recipient !== 'team-lead' && !agents.has(recipient)) {
          agents.set(recipient, {
            name: recipient,
            teamName: team.name,
            status: 'idle',
            currentTasks: [],
            completedTasks: 0,
          })
        }

        for (const mailboxMessage of inbox.messages) {
          const parsed = parseJsonRecord(mailboxMessage.text)
          const protocolType = stringField(parsed, 'type')
          const isAssignment = protocolType === 'task_assignment'
          const text = isAssignment
            ? `分配任务：${stringField(parsed, 'subject') ?? stringField(parsed, 'taskId') ?? mailboxMessage.summary ?? '未命名任务'}`
            : mailboxMessage.text
          const sender = mailboxMessage.from
          if (sender !== 'team-lead' && !agents.has(sender)) {
            agents.set(sender, {
              name: sender,
              teamName: team.name,
              status: 'idle',
              currentTasks: [],
              completedTasks: 0,
            })
          }
          messages.push({
            from: sender,
            to: recipient,
            text,
            summary: mailboxMessage.summary,
            timestamp: Date.parse(mailboxMessage.timestamp) || undefined,
            kind: isAssignment ? 'assignment' : protocolType ? 'system' : 'message',
          })
        }
      }
    }
  }

  const taskList = Array.from(tasks.values())
  for (const agent of agents.values()) {
    const owned = taskList.filter(task => task.owner === agent.name)
    agent.currentTasks = owned
      .filter(task => task.status !== 'completed')
      .map(task => task.subject)
    agent.completedTasks = owned.filter(task => task.status === 'completed').length
    if (agent.status === 'running' && agent.currentTasks.length === 0) {
      agent.currentTasks = []
    }
  }

  const agentList = Array.from(agents.values())
  return {
    teamName,
    agents: agentList,
    tasks: taskList,
    messages: messages
      .filter(message => message.text.length > 0)
      .sort((left, right) => (left.timestamp ?? 0) - (right.timestamp ?? 0))
      .slice(-12),
    summary: {
      runningAgents: agentList.filter(agent => agent.status === 'running').length,
      completedAgents: agentList.filter(agent => agent.status === 'completed').length,
      failedAgents: agentList.filter(agent => agent.status === 'failed').length,
      pendingTasks: taskList.filter(task => task.status === 'pending').length,
      runningTasks: taskList.filter(task => task.status === 'in_progress').length,
      completedTasks: taskList.filter(task => task.status === 'completed').length,
      blockedTasks: taskList.filter(task => task.status === 'blocked').length,
      messageCount: messages.length,
    },
  }
}

export function AgentActivityPanel({
  activity,
}: {
  activity: AgentActivity
}): React.ReactNode {
  const hasActivity =
    activity.agents.length > 0 ||
    activity.tasks.length > 0 ||
    activity.messages.length > 0

  return (
    <aside className="agent-observer-panel">
      <header className="agent-observer-header">
        <div>
          <p>Agent 观测</p>
          <h2>{activity.teamName ?? '当前会话'}</h2>
        </div>
        <span className={activity.summary.runningAgents > 0 ? 'agent-live-dot is-live' : 'agent-live-dot'} />
      </header>

      {!hasActivity ? (
        <section className="agent-empty-state">
          <div aria-hidden="true">✦</div>
          <h3>暂无多 Agent 活动</h3>
          <p>当 CC 调用 Agent、TeamCreate、TaskCreate 或 SendMessage 后，这里会自动显示任务拆分、执行者和通信状态。</p>
        </section>
      ) : (
        <>
          <section className="agent-stat-grid" aria-label="Agent 状态摘要">
            <div><strong>{activity.tasks.length}</strong><span>任务</span></div>
            <div><strong>{activity.summary.runningTasks}</strong><span>运行中</span></div>
            <div><strong>{activity.summary.completedTasks}</strong><span>完成</span></div>
            <div><strong>{activity.messages.length}</strong><span>消息</span></div>
          </section>

          <section className="agent-section">
            <div className="agent-section-title">
              <h3>任务执行</h3>
              <span>{activity.summary.runningTasks} 运行中</span>
            </div>
            <div className="agent-task-list">
              {activity.tasks.length === 0 ? (
                <p className="agent-muted">暂无拆分任务</p>
              ) : activity.tasks.map(task => (
                <article key={task.id} className={`agent-task-card task-${task.status}`}>
                  <div className="task-status-line">
                    <span className="task-status-dot" />
                    <strong>{task.subject}</strong>
                    <em>{labelForStatus(task.status)}</em>
                  </div>
                  {task.description ? <p>{task.description}</p> : null}
                  <div className="task-meta">
                    <span>执行者</span>
                    <b>{task.owner ?? '未分配'}</b>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="agent-section">
            <div className="agent-section-title">
              <h3>执行者</h3>
              <span>{activity.agents.length} 个</span>
            </div>
            <div className="agent-list">
              {activity.agents.length === 0 ? (
                <p className="agent-muted">暂无 Agent</p>
              ) : activity.agents.map(agent => (
                <article key={agent.name} className={`agent-card agent-${agent.status}`}>
                  <div>
                    <strong>{agent.name}</strong>
                    <span>{agent.type ?? 'agent'} · {agentLabel(agent.status)}</span>
                  </div>
                  <p>{agent.currentTasks[0] ?? (agent.completedTasks > 0 ? `已完成 ${agent.completedTasks} 个任务` : '等待任务')}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="agent-section">
            <div className="agent-section-title">
              <h3>通信</h3>
              <span>最近 {activity.messages.length} 条</span>
            </div>
            <div className="agent-message-list">
              {activity.messages.length === 0 ? (
                <p className="agent-muted">暂无通信消息</p>
              ) : activity.messages.map((message, index) => (
                <article key={`${message.from}-${message.to}-${message.timestamp ?? index}`} className={`agent-message message-${message.kind}`}>
                  <span>{message.from} → {message.to}</span>
                  <p>{message.text}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </aside>
  )
}
