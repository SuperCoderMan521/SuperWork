import type { DesktopMessage } from '../../../../shared/protocol.js'
import { BrandName } from '../../components/BrandName.js'
import { MarkdownMessage } from './MarkdownMessage.js'
import { selectedSlashCommand } from './slashCommands.js'

function roleMeta(role: DesktopMessage['role']): {
  label: string
  icon: string
} {
  if (role === 'user') return { label: '你', icon: 'U' }
  if (role === 'assistant') return { label: 'SuperWork', icon: 'S' }
  if (role === 'error') return { label: '错误', icon: '!' }
  return { label: '系统', icon: 'S' }
}

function MessageMeta({ role }: { role: DesktopMessage['role'] }): React.ReactNode {
  const meta = roleMeta(role)
  return (
    <div className="message-meta">
      <span
        className={`message-avatar message-avatar-${role}`}
        aria-hidden="true"
      >
        {meta.icon}
      </span>
      {role === 'assistant' ? (
        <BrandName compact />
      ) : (
        <span className="message-label">{meta.label}</span>
      )}
    </div>
  )
}

function SlashCommandContent({ content }: { content: string }): React.ReactNode {
  const command = selectedSlashCommand(content.trim())
  if (!command) {
    return (
      <div className="message-content">
        <MarkdownMessage content={content} />
      </div>
    )
  }

  return (
    <div className="message-content command-message">
      <div className="command-message-icon" aria-hidden="true">⌘</div>
      <div className="command-message-body">
        <span>Claude Code 指令</span>
        <strong>{command.command}</strong>
        <small>{command.description}</small>
      </div>
    </div>
  )
}

export function MessageRow({
  message,
}: {
  message: DesktopMessage
}): React.ReactNode {
  if (message.kind === 'thinking' || message.kind === 'redacted_thinking') {
    return (
      <article
        className={`message message-${message.role} message-kind-${message.kind}`}
      >
        <MessageMeta role={message.role} />
        <details className={`thinking-block thinking-${message.role}`}>
          <summary>思考过程</summary>
          <div>{message.content || '此思考内容已隐藏'}</div>
        </details>
      </article>
    )
  }

  return (
    <article
      className={`message message-${message.role} message-kind-${message.kind ?? 'text'}`}
    >
      <MessageMeta role={message.role} />
      {message.role === 'user' && message.content.trim().startsWith('/') ? (
        <SlashCommandContent content={message.content} />
      ) : (
        <div className="message-content">
          <MarkdownMessage content={message.content} />
        </div>
      )}
    </article>
  )
}
