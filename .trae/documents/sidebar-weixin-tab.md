# Sidebar 微信对话 Tab — 复用 ConversationPane 只读展示微信对话记录

## Context

**问题**：当前微信 channel 的对话记录只能在 Settings → Channel tab 里看到，且展示极其简陋（[ConfigCenter.tsx:174-196](file:///g:/ai/own/cc-v2/claude-code/claude-code-main/packages/desktop/renderer/src/features/settings/ConfigCenter.tsx#L174-L196) 只用 `<p>` 列最近 5 条纯文本，无 markdown 渲染、无附件提示、无时间线）。用户希望在 sidebar 顶部开一个 tab，与"对话"并列，专门展示微信对话记录，并复用正常的对话框组件（ConversationPane）来渲染。

**数据已就绪**：`weixinRuntime.conversations[]`（[App.tsx:235-236](file:///g:/ai/own/cc-v2/claude-code/claude-code-main/packages/desktop/renderer/src/app/App.tsx#L235-L236)）已含完整双向消息（inbound = 微信用户发，outbound = Claude 回，桥接实现后 outbound 已自动生成）。

**目标**：SessionSidebar 顶部加 `对话 | 微信` tab 切换；切到"微信"时列出 weixinRuntime 的所有 chatId 会话；选中后主区域用 ConversationPane（只读模式）渲染该微信会话的完整对话记录，附件以路径提示形式拼到消息内容里。

**已确认决策**（用户选择）：
- 位置：Sidebar 顶部 tab 切换
- 交互：只读展示（隐藏 Composer + PermissionPanel）
- 附件：路径提示拼到 content

## 设计要点

### 1. 数据适配器（新建纯函数）

`DesktopChannelWeixinMessage` → `DesktopMessage` 映射：

| Weixin 字段 | DesktopMessage 字段 |
|---|---|
| `direction: 'inbound'` | `role: 'user'` |
| `direction: 'outbound'` | `role: 'assistant'` |
| `text` + attachmentPath | `content`（附件拼提示）、`kind: 'text'` |
| `createdAt` | `createdAt` |
| `id` | `id` |

构造伪 `RendererSession`：`tools={}`, `toolOrder=[]`, `permissions={}`, `generationState: 'idle'`, `id: weixin-${chatId}`，title 用 conv.title。

### 2. 互斥选中

- `selectedWeixinChatId` 与 `selectedId`（desktop session）互斥
- 选 desktop session → `setSelectedWeixinChatId(null)`
- 选 weixin chatId → `setSelectedId(null)`
- 渲染优先级：weixin 选中 > desktop 选中 > welcome

### 3. Sidebar tab 结构

```
<aside className="sidebar">
  <div className="sidebar-top">品牌</div>
  <div className="sidebar-tabs" role="tablist">    ← 新增
    <button role="tab" data-active={tab==='sessions'}>对话</button>
    <button role="tab" data-active={tab==='weixin'}>微信</button>
  </div>
  <nav className="session-nav">                    ← 根据 tab 切换内容
    {tab==='sessions' ? <会话列表> : <微信会话列表>}
  </nav>
  <BuddyPanel/>
  <div className="sidebar-actions">...</div>
</aside>
```

tab 状态为 SessionSidebar 内部 state（`useState<'sessions'|'weixin'>('sessions')`），默认 'sessions'。

### 4. ConversationPane 只读模式

加 `readOnly?: boolean` prop：
- `readOnly=true` → 不渲染 `<Composer>`（[L461-476](file:///g:/ai/own/cc-v2/claude-code/claude-code-main/packages/desktop/renderer/src/features/chat/ConversationPane.tsx#L461-L476)）和 `<PermissionPanel>`（[L437-444](file:///g:/ai/own/cc-v2/claude-code/claude-code-main/packages/desktop/renderer/src/features/chat/ConversationPane.tsx#L437-L444)）
- header 副标题显示 chatId + "微信对话（只读）" 标识
- 其他渲染逻辑（MessageRow、MarkdownMessage、工具组、时间线）完全复用

## 文件改动清单

### 1. 新建 [packages/desktop/renderer/src/features/chat/weixinAdapter.ts](file:///g:/ai/own/cc-v2/claude-code/claude-code-main/packages/desktop/renderer/src/features/chat/weixinAdapter.ts)

```ts
import type { DesktopChannelWeixinConversation } from '../../../../shared/protocol.js'
import type { RendererSession } from '../../app/reducer.js'

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
```

### 2. 改 [packages/desktop/renderer/src/features/chat/ConversationPane.tsx](file:///g:/ai/own/cc-v2/claude-code/claude-code-main/packages/desktop/renderer/src/features/chat/ConversationPane.tsx)

- `ConversationPaneProps` 加 `readOnly?: boolean`
- header 的 `<p>` 副标题：readOnly 时显示 `{session.cwd} · 微信对话（只读）`
- `{session.permissionOrder[0] && onResolvePermission ? ...}` 块前加 `!readOnly &&`
- `<Composer .../>` 块前加 `!readOnly &&`

### 3. 改 [packages/desktop/renderer/src/features/history/SessionSidebar.tsx](file:///g:/ai/own/cc-v2/claude-code/claude-code-main/packages/desktop/renderer/src/features/history/SessionSidebar.tsx)

- 新增 props：`weixinConversations?: DesktopChannelWeixinConversation[]`、`selectedWeixinChatId?: string | null`、`onSelectWeixin?: (chatId: string) => void`
- 内部 `const [tab, setTab] = useState<'sessions'|'weixin'>('sessions')`
- sidebar-top 后插入 `<div className="sidebar-tabs">` 两个按钮
- session-nav 内容根据 tab 切换：
  - `sessions`：原有 workspace group 列表
  - `weixin`：列 `weixinConversations`，每项显示 title + updatedAt + 消息数，点击 `onSelectWeixin?.(conv.chatId)`，active 态由 `selectedWeixinChatId` 判断
  - weixin 为空时显示 `<p className="empty-hint">暂无微信对话</p>`

### 4. 改 [packages/desktop/renderer/src/app/App.tsx](file:///g:/ai/own/cc-v2/claude-code/claude-code-main/packages/desktop/renderer/src/app/App.tsx)

- 新增 state `const [selectedWeixinChatId, setSelectedWeixinChatId] = useState<string | null>(null)`
- `selectSession` 内追加 `setSelectedWeixinChatId(null)`
- 新增 `selectWeixin = (chatId: string) => { setSelectedWeixinChatId(chatId); setSelectedId(null); setSelectedFilePath(null); setFileContent(null) }`
- `selectedWeixinConv = selectedWeixinChatId ? weixinRuntime?.conversations.find(c => c.chatId === selectedWeixinChatId) : null`（用 useMemo）
- sidebar 传入 `weixinConversations={weixinRuntime?.conversations ?? []}`、`selectedWeixinChatId`、`onSelectWeixin={selectWeixin}`
- chatView 的 `chat` prop 内渲染逻辑：
  ```tsx
  chat={
    selectedWeixinConv ? (
      <ConversationPane
        session={weixinConversationToRendererSession(selectedWeixinConv)}
        readOnly
        onSubmit={() => {}}
        onInterrupt={() => {}}
        onSelectWorkspace={() => {}}
      />
    ) : selected ? (
      <ConversationPane ... />  // 原有
    ) : (
      welcome
    )
  }
  ```
- weixin 选中时 `filePanelOpen` 强制 false（右侧文件面板不适用）：`filePanelOpen={Boolean(selected) && filePanelOpen}` 已是此逻辑（selectedWeixinConv 时 selected 为 undefined），无需改

### 5. 改 [packages/desktop/renderer/src/styles.css](file:///g:/ai/own/cc-v2/claude-code/claude-code-main/packages/desktop/renderer/src/styles.css)

在 `.sidebar-top`（L35）后追加：
```css
.sidebar-tabs { display: flex; gap: 4px; padding: 0 4px; border-bottom: 1px solid var(--border); }
.sidebar-tabs button { flex: 1; padding: 8px 0; background: transparent; border: 0; color: var(--muted); font-size: 12px; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; }
.sidebar-tabs button[data-active="true"] { color: #f1f2f4; border-bottom-color: #d77757; }
.weixin-conversation { width: 100%; padding: 10px 12px; background: transparent; border: 0; border-left: 2px solid transparent; text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 2px; }
.weixin-conversation[data-active="true"] { background: #1a1b1e; border-left-color: #d77757; }
.weixin-conversation strong { font-size: 12px; color: #f1f2f4; }
.weixin-conversation span { font-size: 11px; color: var(--muted); }
```

## 边界处理

- `weixinRuntime` 为 null → weixin tab 显示空提示"未连接微信通道"
- 选中的 weixin conversation 在 runtime 更新后被 LRU 淘汰（30 会话上限）→ `selectedWeixinConv` 变 undefined → 自动回退到 welcome
- readOnly 模式下 `onSubmit/onInterrupt/onSelectWorkspace` 传空函数（ConversationPane 类型必填，但 readOnly 时不渲染 Composer 不会调用）
- MessageRow 的 `roleMeta('user')` 显示"你"（[MessageRow.tsx:10](file:///g:/ai/own/cc-v2/claude-code/claude-code-main/packages/desktop/renderer/src/features/chat/MessageRow.tsx#L10)）——微信 inbound 显示"你"语义略怪但可接受（代表"对方"），后续可扩展 roleMeta 支持 weixin 标识

## 验证方案

### 类型检查
```bash
cd packages/desktop && bun run typecheck
```

### 端到端验证
1. `cd packages/desktop && bun run dev`（需 CI 环境变量清除 + DeepSeek 凭据注入，详见上轮 dev 实测）
2. 微信扫码登录 + 启动 channel
3. 用已授权微信账号发消息 → 等 Claude 回复
4. **验证 sidebar 顶部出现"对话 | 微信"两个 tab**
5. 点"微信"tab → 列出所有微信会话（按 chatId）
6. 点击某会话 → 主区域用 ConversationPane 渲染完整对话（inbound 显示为 user 气泡，outbound 显示为 assistant/SuperWork 气泡，markdown 正常渲染）
7. **验证无 Composer 输入框、无权限面板**（只读）
8. 验证附件消息内容含"[附件：image，已保存至：...]"提示
9. 切回"对话"tab → 恢复 desktop session 列表，选中桌面会话 → 微信选中态自动清空
10. 再切回"微信"tab → 之前选中的会话高亮仍在（tab 切换不丢失选中）

### 回归验证
- 原有 desktop session 对话流程不受影响（选会话、输入、生成、工具展示）
- Settings → Channel tab 的简陋展示保留（不删除，作为配置入口）
