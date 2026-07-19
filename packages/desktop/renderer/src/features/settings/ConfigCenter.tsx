import { useEffect, useState } from 'react'
import type {
  DesktopConfigItem,
  DesktopConfigSnapshot,
  DesktopMemoryFile,
  DesktopModelConnectionResult,
  DesktopModelConfig,
  PermissionMode,
} from '../../../../shared/protocol.js'
import { SessionSettings } from './SessionSettings.js'

export type ConfigTab = 'model' | 'skills' | 'mcp' | 'plugins' | 'memory'

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
  onBack,
  onModelChange,
  onModeChange,
  onModelConfigChange,
  onTestModelConfig,
  onRefresh,
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
  onBack: () => void
  onModelChange: (model: string) => void
  onModeChange: (mode: PermissionMode) => void
  onModelConfigChange: (config: DesktopModelConfig) => void
  onTestModelConfig: (config: DesktopModelConfig) => void
  onRefresh: () => void
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
        <button
          className="refresh-icon"
          type="button"
          aria-label="刷新配置"
          onClick={onRefresh}
          disabled={!cwd}
        >
          ↻
        </button>
        <nav className="settings-tabs" aria-label="配置分类">
          {[
            ['model', '模型'],
            ['skills', 'Skills'],
            ['mcp', 'MCP'],
            ['plugins', 'Plugins'],
            ['memory', 'Memory'],
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
        {tab === 'memory' ? (
          <section className="memory-editor">
            {memoryFiles.map(file => {
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
