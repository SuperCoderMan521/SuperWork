import { useEffect, useState } from 'react'
import type {
  DesktopConfigItem,
  DesktopConfigSnapshot,
  DesktopChannelWeixinRuntime,
  DesktopEvent,
  DesktopMemoryFile,
  DesktopModelConnectionResult,
  DesktopModelConfig,
  PermissionMode,
} from '../../../../shared/protocol.js'
import { SessionSettings } from './SessionSettings.js'

export type ConfigTab = 'model' | 'skills' | 'mcp' | 'plugins' | 'memory' | 'channel'

function ItemList({
  empty,
  items,
}: {
  empty: string
  items: DesktopConfigItem[]
}): React.ReactNode {
  if (items.length === 0) return <p className="empty-hint">{empty}</p>
  return (
    <ul className="config-list">
      {items.map(item => (
        <li key={item.id}>
          <strong>{item.name}</strong>
          {item.description ? <span>{item.description}</span> : null}
          {item.path ? <code>{item.path}</code> : null}
        </li>
      ))}
    </ul>
  )
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

export function imageSrcFromWeixinQr(value: string | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('data:image/')) return trimmed
  if (isHttpUrl(trimmed)) return trimmed
  if (/^[a-zA-Z0-9+/=\r\n]+$/.test(trimmed) && trimmed.length > 80) {
    return `data:image/png;base64,${trimmed.replace(/\s+/g, '')}`
  }
  return null
}

function ChannelPanel({
  config,
  runtime,
  login,
  onLogin,
  onClear,
  onStart,
}: {
  config: DesktopConfigSnapshot | null
  runtime: DesktopChannelWeixinRuntime | null
  login: Extract<DesktopEvent, { type: 'channel.weixin.login' }> | null
  onLogin: () => void
  onClear: () => void
  onStart: () => void
}): React.ReactNode {
  const weixin = config?.channel.weixin
  const connected = weixin?.connected ?? false
  const qrImageSrc = imageSrcFromWeixinQr(login?.qrcodeUrl)
  const conversations = runtime?.conversations ?? []

  return (
    <section className="channel-settings">
      <header className="channel-hero">
        <div>
          <span>Channel</span>
          <h2>微信通道</h2>
          <p>把微信消息作为 Claude Code Channel 接入，适合手机上继续对话、远程审批工具调用。</p>
        </div>
        <strong className={connected ? 'channel-status connected' : 'channel-status'}>
          {connected ? '已连接' : '未连接'}
        </strong>
      </header>

      <section className="channel-card">
        <h3>认证配置</h3>
        <div className="channel-actions">
          <button type="button" onClick={onLogin}>
            扫码登录
          </button>
          <button type="button" onClick={onStart} disabled={!connected}>
            启动接收
          </button>
          <button type="button" onClick={onClear} disabled={!connected}>
            清除登录
          </button>
        </div>
        {login ? (
          <div className={`channel-login-status status-${login.status}`}>
            <strong>{login.message}</strong>
            {login.qrcodeUrl ? (
              <div className="channel-qr">
                {qrImageSrc ? (
                  <img src={qrImageSrc} alt="微信扫码登录二维码" />
                ) : (
                  <pre>{login.qrcodeUrl}</pre>
                )}
                {isHttpUrl(login.qrcodeUrl) ? (
                  <a href={login.qrcodeUrl} target="_blank" rel="noreferrer">
                    打开二维码链接
                  </a>
                ) : (
                  <span>二维码已生成，请使用微信扫码</span>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
        <dl className="channel-facts">
          <div>
            <dt>账号</dt>
            <dd>{weixin?.userId ?? '尚未登录'}</dd>
          </div>
          <div>
            <dt>Base URL</dt>
            <dd>{weixin?.baseUrl ?? 'https://ilinkai.weixin.qq.com'}</dd>
          </div>
          <div>
            <dt>保存时间</dt>
            <dd>{weixin?.savedAt ?? '暂无'}</dd>
          </div>
          <div>
            <dt>已授权用户</dt>
            <dd>{weixin?.allowedUsers ?? 0} 个</dd>
          </div>
        </dl>
        <code>{weixin?.accountPath ?? '~/.claude/channels/weixin/account.json'}</code>
      </section>

      <section className="channel-card">
        <h3>第一次打通</h3>
        <ol className="channel-steps">
          <li><code>ccb weixin login</code><span>扫码登录并写入本地 token。</span></li>
          <li><code>ccb --channels plugin:weixin@builtin</code><span>用微信通道启动 Claude Code。</span></li>
          <li><code>ccb weixin access pair &lt;code&gt;</code><span>微信用户第一次发消息后，用返回的配对码授权。</span></li>
        </ol>
      </section>

      <section className="channel-card">
        <h3>微信对话记录</h3>
        <p>
          当前版本会显示通道状态和本地会话游标；实时微信消息会通过 Claude Channel 进入主对话。后续可在这里接入
          channel notification 日志，按 chat_id 展示独立微信会话流。
        </p>
        <dl className="channel-facts">
          <div>
            <dt>状态目录</dt>
            <dd>{weixin?.stateDir ?? '~/.claude/channels/weixin'}</dd>
          </div>
          <div>
            <dt>游标文件</dt>
            <dd>{weixin?.cursorPresent ? '已产生' : '尚未产生'}</dd>
          </div>
          <div>
            <dt>待配对</dt>
            <dd>{weixin?.pendingPairings ?? 0} 个</dd>
          </div>
        </dl>
        <div className="channel-runtime">
          <strong>接收状态：{runtime?.status ?? 'stopped'}</strong>
          <span>{runtime?.message ?? '扫码登录后会自动启动接收；也可以手动点击“启动接收”。'}</span>
        </div>
        {conversations.length > 0 ? (
          <div className="channel-conversations">
            {conversations.map(conversation => (
              <article key={conversation.chatId} className="channel-conversation">
                <header>
                  <strong>{conversation.title}</strong>
                  <span>{new Date(conversation.updatedAt).toLocaleString()}</span>
                </header>
                <div className="channel-message-list">
                  {conversation.messages.slice(-5).map(message => (
                    <p key={message.id}>
                      <span>{message.direction === 'inbound' ? '微信' : '桌面'}</span>
                      {message.text}
                      {message.attachmentPath ? <code>{message.attachmentPath}</code> : null}
                    </p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-hint">暂无微信对话记录。若首次发送后收到配对码，请先完成授权。</p>
        )}
      </section>
    </section>
  )
}

export function ConfigCenter({
  selectedTitle,
  initialTab = 'model',
  model,
  mode,
  cwd,
  config,
  memoryFile,
  compactSummary,
  connectionTest,
  connectionTesting,
  weixinLogin,
  weixinRuntime = null,
  onBack,
  onModelChange,
  onModeChange,
  onModelConfigChange,
  onTestModelConfig,
  onLoginWeixinChannel,
  onClearWeixinChannel,
  onStartWeixinChannel = () => {},
  onAutoMemoryChange,
  onReadMemory,
  onCreateMemory,
  onSaveMemory,
  onCompactMemory,
  onCollapseMemory,
}: {
  selectedTitle: string | null
  initialTab?: ConfigTab
  model: string
  mode: PermissionMode
  cwd: string | null
  config: DesktopConfigSnapshot | null
  memoryFile: (DesktopMemoryFile & { content?: string }) | null
  compactSummary: string | null
  connectionTest: DesktopModelConnectionResult | null
  connectionTesting: boolean
  weixinLogin: Extract<DesktopEvent, { type: 'channel.weixin.login' }> | null
  weixinRuntime?: DesktopChannelWeixinRuntime | null
  onBack: () => void
  onModelChange: (model: string) => void
  onModeChange: (mode: PermissionMode) => void
  onModelConfigChange: (config: DesktopModelConfig) => void
  onTestModelConfig: (config: DesktopModelConfig) => void
  onLoginWeixinChannel: () => void
  onClearWeixinChannel: () => void
  onStartWeixinChannel?: () => void
  onAutoMemoryChange: (enabled: boolean) => void
  onReadMemory: (path: string) => void
  onCreateMemory: (path: string) => void
  onSaveMemory: (path: string, content: string) => void
  onCompactMemory: (path: string, content: string) => void
  onCollapseMemory: () => void
}): React.ReactNode {
  const [tab, setTab] = useState<ConfigTab>(initialTab)
  const [draft, setDraft] = useState('')
  const selectedMemory = memoryFile

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  useEffect(() => {
    setDraft(selectedMemory?.content ?? '')
  }, [selectedMemory?.path, selectedMemory?.content])

  const memoryFiles = config?.memoryFiles ?? []
  const autoMemoryFiles = memoryFiles.filter(file => file.scope === 'auto' || file.scope === 'team')
  const ruleMemoryFiles = memoryFiles.filter(file => file.scope === 'project' || file.scope === 'user')

  return (
    <main className="settings-page" aria-label="Claude Code 配置">
      <aside className="settings-sidebar">
        <button
          className="settings-back"
          type="button"
          aria-label="返回主对话"
          onClick={onBack}
        >
          ← 返回
        </button>
        <div>
          <h2>Claude Code 配置</h2>
          <p>{selectedTitle ?? '请选择一个会话'}</p>
        </div>
        <nav className="settings-tabs" aria-label="配置分类">
          {[
            ['model', '模型'],
            ['skills', 'Skills'],
            ['mcp', 'MCP'],
            ['plugins', 'Plugins'],
            ['memory', 'Memory'],
            ['channel', 'Channel'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={tab === value ? 'active' : undefined}
              onClick={() => setTab(value as ConfigTab)}
            >
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="settings-content">
        {tab === 'model' && cwd ? (
          <SessionSettings
            model={model}
            mode={mode}
            cwd={cwd}
            configPath={cwd ? `${cwd.replace(/[\\/]+$/, '')}/.claude/settings.json` : null}
            modelConfig={config?.modelConfig}
            onModelChange={onModelChange}
            onModeChange={onModeChange}
            onModelConfigChange={onModelConfigChange}
            onTestModelConfig={onTestModelConfig}
            connectionTest={connectionTest}
            connectionTesting={connectionTesting}
          />
        ) : null}
        {tab === 'skills' ? (
          <ItemList empty="未发现 Skills 配置。" items={config?.skills ?? []} />
        ) : null}
        {tab === 'mcp' ? (
          <ItemList empty="未发现 MCP server 配置。" items={config?.mcpServers ?? []} />
        ) : null}
        {tab === 'plugins' ? (
          <ItemList empty="未发现插件配置。" items={config?.plugins ?? []} />
        ) : null}
        {tab === 'channel' ? (
          <ChannelPanel
            config={config}
            runtime={weixinRuntime}
            login={weixinLogin}
            onLogin={onLoginWeixinChannel}
            onClear={onClearWeixinChannel}
            onStart={onStartWeixinChannel}
          />
        ) : null}
        {tab === 'memory' ? (
          <section className="memory-editor">
            <div className="auto-memory-card">
              <div>
                <strong>用户问答记忆</strong>
                <span>{config?.autoMemory.path ?? '自动记忆目录未加载'}</span>
              </div>
              <button
                type="button"
                aria-pressed={config?.autoMemory.enabled ?? true}
                onClick={() => onAutoMemoryChange(!(config?.autoMemory.enabled ?? true))}
              >
                Auto Memory {(config?.autoMemory.enabled ?? true) ? '已开启' : '已关闭'}
              </button>
            </div>
            <section className="memory-section">
              <h3>用户问答记忆</h3>
              {autoMemoryFiles.length === 0 ? (
                <p className="empty-hint">暂无自动生成的用户问答记忆。开启 Auto Memory 后，模型识别到长期偏好或项目背景时会写入这里。</p>
              ) : autoMemoryFiles.map(file => {
                const active = selectedMemory?.path === file.path
                return (
                  <div key={file.id} className="memory-row">
                    <button
                      type="button"
                      className={active ? 'active' : undefined}
                      onClick={() => {
                        if (active) onCollapseMemory()
                        else onReadMemory(file.path)
                      }}
                    >
                      <span className="memory-file-copy">
                        <strong>{file.relativePath ?? file.label}</strong>
                        {file.description ? <small>{file.description}</small> : null}
                      </span>
                      <span>{file.scope}</span>
                    </button>
                  </div>
                )
              })}
            </section>
            <section className="memory-section">
              <h3>CLAUDE.md 规则文件</h3>
              <p className="memory-section-hint">这些是项目/用户规则文件，需要手动创建和编辑，不是自动问答记忆。</p>
            {ruleMemoryFiles.map(file => {
              const active = selectedMemory?.path === file.path
              return (
                <div key={file.id} className="memory-row">
                  <button
                    type="button"
                    className={active ? 'active' : undefined}
                    onClick={() => {
                      if (active) onCollapseMemory()
                      else if (file.exists) onReadMemory(file.path)
                      else onCreateMemory(file.path)
                    }}
                  >
                    <span className="memory-file-copy">
                      <strong>{file.relativePath ?? file.label}</strong>
                      {file.description ? <small>{file.description}</small> : null}
                    </span>
                    <span>{file.exists ? file.scope : '未创建'}</span>
                  </button>
                  {!file.exists ? (
                    <button type="button" onClick={() => onCreateMemory(file.path)}>
                      创建
                    </button>
                  ) : null}
                </div>
              )
            })}
            </section>
            {selectedMemory ? (
              <>
                <button className="secondary-button" type="button" onClick={onCollapseMemory}>
                  收起编辑
                </button>
                <textarea
                  value={draft}
                  onChange={event => setDraft(event.target.value)}
                />
                <div className="memory-actions">
                  <button
                    type="button"
                    onClick={() => onSaveMemory(selectedMemory.path, draft)}
                  >
                    保存记忆
                  </button>
                  <button
                    type="button"
                    onClick={() => onCompactMemory(selectedMemory.path, draft)}
                  >
                    压缩记忆
                  </button>
                </div>
                {compactSummary ? <p className="compact-summary">{compactSummary}</p> : null}
              </>
            ) : (
              <p className="empty-hint">选择一个记忆文件查看或编辑。</p>
            )}
          </section>
        ) : null}
      </section>
    </main>
  )
}
