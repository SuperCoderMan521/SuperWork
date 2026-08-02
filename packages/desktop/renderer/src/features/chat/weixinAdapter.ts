import type { DesktopChannelWeixinConversation } from '../../../../shared/protocol.js'
import type { RendererSession } from '../../app/reducer.js'

/**
 * 把微信 channel 会话适配成只读的伪 RendererSession，
 * 让 ConversationPane 能复用渲染微信双向对话记录。
 *
 * - inbound（微信用户发的）→ role: 'user'
 * - outbound（Claude 回的）→ role: 'assistant'
 * - 附件以路径提示拼到 content 里
 */
export function weixinConversationToRendererSession(
  conv: DesktopChannelWeixinConversation,
): RendererSession {
  const messages: RendererSession['messages'] = {}
  const messageOrder: string[] = []
  conv.messages.forEach((msg, index) => {
    const content = msg.attachmentPath
      ? `${msg.text}\n\n[附件：${msg.attachmentType ?? '文件'}，已保存至：${msg.attachmentPath}]`
      : msg.text
    messages[msg.id] = {
      id: msg.id,
      role: msg.direction === 'inbound' ? 'user' : 'assistant',
      kind: 'text',
      content,
      createdAt: msg.createdAt,
      displayOrder: index + 1,
    }
    messageOrder.push(msg.id)
  })
  return {
    id: `weixin-${conv.chatId}`,
    title: conv.title,
    cwd: '.',
    updatedAt: conv.updatedAt,
    model: 'default',
    mode: 'default',
    messages,
    messageOrder,
    tools: {},
    toolOrder: [],
    turnUsageReports: [],
    permissions: {},
    permissionOrder: [],
    generationState: 'idle',
    sequence: 0,
    needsSnapshot: false,
  }
}
