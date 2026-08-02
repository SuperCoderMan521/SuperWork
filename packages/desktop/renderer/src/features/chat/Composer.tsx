import { useEffect, useRef, useState } from 'react'
import type {
  DesktopConfigItem,
  PermissionMode,
} from '../../../../shared/protocol.js'
import { selectedSlashCommand, slashSuggestions } from './slashCommands.js'

type ComposerProps = {
  generating: boolean
  workspace: string
  mode?: PermissionMode
  skills?: DesktopConfigItem[]
  mcpServers?: DesktopConfigItem[]
  onSubmit: (text: string) => void
  onInterrupt: () => void
  onSelectWorkspace: () => void
  onOpenSkills?: () => void
  onOpenMcp?: () => void
  onModeChange?: (mode: PermissionMode) => void
  autoFocus?: boolean
}

function skillCommandName(skill: DesktopConfigItem): string {
  const name = skill.name.trim()
  if (/^[a-zA-Z0-9:_-]+$/.test(name)) return name
  const pathParts = skill.path?.split(/[\\/]/).filter(Boolean) ?? []
  const folderName = pathParts[pathParts.length - 1]?.trim()
  if (folderName && /^[a-zA-Z0-9:_-]+$/.test(folderName)) return folderName
  return name
}

export function buildPromptWithSelectedSkills(
  prompt: string,
  selectedSkills: readonly DesktopConfigItem[],
): string {
  if (selectedSkills.length === 0) return prompt
  const skillHints = selectedSkills
    .map(skill => `Use the /${skillCommandName(skill)} skill for this request.`)
    .join('\n')
  return `${skillHints}\n\n${prompt}`
}

export function Composer({
  generating,
  workspace,
  mode = 'default',
  skills = [],
  mcpServers = [],
  onSubmit,
  onInterrupt,
  onSelectWorkspace,
  onOpenSkills,
  onOpenMcp,
  onModeChange,
  autoFocus = true,
}: ComposerProps): React.ReactNode {
  const [text, setText] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [openMenu, setOpenMenu] = useState<'model' | 'skills' | 'mcp' | 'approval' | null>(null)
  const [localMode, setLocalMode] = useState<PermissionMode>(mode)
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([])
  const [skillQuery, setSkillQuery] = useState('')
  const [mcpQuery, setMcpQuery] = useState('')
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const suggestions = slashSuggestions(text)
  const selectedCommand = selectedSlashCommand(text)
  const filteredSkills = skills.filter(skill => {
    const query = skillQuery.trim().toLowerCase()
    if (!query) return true
    return [
      skill.name,
      skill.description,
      skill.path,
    ].some(value => value?.toLowerCase().includes(query))
  })
  const filteredMcpServers = mcpServers.filter(server => {
    const query = mcpQuery.trim().toLowerCase()
    if (!query) return true
    return [
      server.name,
      server.description,
      server.path,
    ].some(value => value?.toLowerCase().includes(query))
  })
  const selectedSkills = selectedSkillIds
    .map(id => skills.find(skill => skill.id === id && skill.enabled !== false))
    .filter((skill): skill is DesktopConfigItem => Boolean(skill))

  useEffect(() => {
    setHighlightedIndex(0)
  }, [text])

  useEffect(() => {
    setLocalMode(mode)
  }, [mode])

  useEffect(() => {
    const availableSkillIds = new Set(skills.filter(skill => skill.enabled !== false).map(skill => skill.id))
    setSelectedSkillIds(ids => {
      const next = ids.filter(id => availableSkillIds.has(id))
      if (next.length === ids.length && next.every((id, index) => id === ids[index])) return ids
      return next
    })
  }, [skills])

  useEffect(() => {
    if (!openMenu) return
    const closeOnPointerDown = (event: PointerEvent) => {
      if (toolbarRef.current?.contains(event.target as Node)) return
      setOpenMenu(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('pointerdown', closeOnPointerDown)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [openMenu])

  const submit = () => {
    const prompt = text.trim()
    if (!prompt || generating) return
    onSubmit(buildPromptWithSelectedSkills(prompt, selectedSkills))
    setText('')
    setSelectedSkillIds([])
  }

  const chooseSuggestion = (index: number) => {
    const suggestion = suggestions[index]
    if (!suggestion) return
    setText(suggestion.command)
  }

  const renderSkillMenu = () => (
    <div className="composer-skill-menu" role="menu">
      <label className="composer-skill-search">
        <input
          aria-label="搜索技能"
          placeholder="搜索技能"
          value={skillQuery}
          onChange={event => setSkillQuery(event.target.value)}
        />
        <span aria-hidden="true">⌕</span>
      </label>
      <div className="composer-skill-list">
        {filteredSkills.length === 0 ? (
          <p className="composer-skill-empty">未发现匹配技能</p>
        ) : filteredSkills.map(skill => {
          const selected = selectedSkillIds.includes(skill.id)
          return (
          <button
            type="button"
            key={skill.id}
            className={[
              selected ? 'is-selected' : '',
              skill.enabled === false ? 'is-disabled' : '',
            ].filter(Boolean).join(' ') || undefined}
            aria-pressed={selected}
            disabled={skill.enabled === false}
            onClick={() => {
              setSelectedSkillIds(ids => {
                if (ids.includes(skill.id)) return ids.filter(id => id !== skill.id)
                return [...ids, skill.id]
              })
            }}
          >
            <span className="composer-skill-avatar" aria-hidden="true">
              {(skill.name.trim()[0] ?? 'S').toUpperCase()}
            </span>
            <div>
              <strong>{skill.name}</strong>
              <small>
                {skill.description ?? skill.path ?? (skill.enabled === false ? '已禁用' : '可用')}
              </small>
            </div>
            {selected ? <em aria-hidden="true">✓</em> : null}
          </button>
          )
        })}
      </div>
      <button
        type="button"
        className="composer-skill-import"
        onClick={() => {
          setOpenMenu(null)
          onOpenSkills?.()
        }}
      >
        <span aria-hidden="true">⇪</span>
        导入技能
      </button>
    </div>
  )

  const renderMcpMenu = () => (
    <div className="composer-mcp-menu" role="menu">
      <label className="composer-mcp-search">
        <input
          aria-label="搜索应用"
          placeholder="搜索应用"
          value={mcpQuery}
          onChange={event => setMcpQuery(event.target.value)}
        />
        <span aria-hidden="true">⌕</span>
      </label>
      <div className="composer-mcp-list">
        {filteredMcpServers.length === 0 ? (
          <p className="composer-mcp-empty">未发现匹配应用</p>
        ) : filteredMcpServers.map(server => (
          <article
            key={server.id}
            className={server.enabled === false ? 'is-disabled' : undefined}
          >
            <span className="composer-mcp-avatar" aria-hidden="true">
              {(server.name.trim()[0] ?? 'M').toUpperCase()}
            </span>
            <div>
              <strong>{server.name}</strong>
              <small>
                {server.description ?? server.path ?? (server.enabled === false ? '已禁用' : '可用')}
              </small>
            </div>
          </article>
        ))}
      </div>
      <button
        type="button"
        className="composer-mcp-manage"
        onClick={onOpenMcp}
      >
        <span aria-hidden="true">⌘</span>
        管理应用连接
      </button>
    </div>
  )

  const selectClaudeCodeMode = (nextMode: PermissionMode) => {
    setLocalMode(nextMode)
    onModeChange?.(nextMode)
    setOpenMenu(null)
  }

  const renderModelMenu = () => (
    <div className="composer-model-menu" role="menu">
      <button
        type="button"
        className={localMode === 'plan' ? undefined : 'active'}
        onPointerDown={event => {
          event.preventDefault()
          selectClaudeCodeMode('default')
        }}
      >
        <strong>Ask</strong>
        <span>普通问答与默认 Claude Code 权限</span>
      </button>
      <button
        type="button"
        className={localMode === 'plan' ? 'active' : undefined}
        onPointerDown={event => {
          event.preventDefault()
          selectClaudeCodeMode('plan')
        }}
      >
        <strong>Plan</strong>
        <span>进入 Claude Code 计划模式，先规划再执行</span>
      </button>
    </div>
  )

  const permissionModes = [
    {
      mode: 'default' as const,
      title: '请求批准',
      description: '编辑外部文件和使用互联网时始终询问',
      icon: '♕',
      tone: 'normal',
    },
    {
      mode: 'auto' as const,
      title: '替我审批',
      description: '仅对检测到的风险操作请求批准',
      icon: '♧',
      tone: 'normal',
    },
    {
      mode: 'bypassPermissions' as const,
      title: '完全访问权限',
      description: '可不受限制地访问互联网和您电脑上的任何文件',
      icon: 'ⓘ',
      tone: 'danger',
    },
  ]
  const activePermissionMode = permissionModes.find(item => item.mode === localMode) ?? permissionModes[0]!
  const selectPermissionMode = (nextMode: PermissionMode) => {
    setLocalMode(nextMode)
    onModeChange?.(nextMode)
    setOpenMenu(null)
  }

  const renderApprovalMenu = () => (
    <div className="composer-approval-menu" role="menu">
      <header>
        <strong>应如何批准 ChatGPT 操作？</strong>
        <button type="button">了解更多</button>
      </header>
      {permissionModes.map(item => (
        <button
          key={item.mode}
          type="button"
          className={item.tone === 'danger' ? 'danger' : undefined}
          aria-pressed={localMode === item.mode}
          onPointerDown={event => {
            event.preventDefault()
            selectPermissionMode(item.mode)
          }}
        >
          <span className="approval-icon" aria-hidden="true">{item.icon}</span>
          <span>
            <strong>{item.title}</strong>
            <small>{item.description}</small>
          </span>
          {localMode === item.mode ? <em aria-hidden="true">✓</em> : null}
        </button>
      ))}
    </div>
  )

  return (
    <div className={generating ? 'composer-area composer-generating' : 'composer-area'}>
      {generating ? (
        <div className="composer-status composer-status-shimmer" aria-live="polite">
          正在生成，可以随时中断
        </div>
      ) : null}
      {selectedCommand ? (
        <div className="command-chip">
          <span>{selectedCommand.command}</span>
          <small>{selectedCommand.description}</small>
        </div>
      ) : null}
      {suggestions.length > 0 && !selectedCommand ? (
        <div className="slash-palette" role="listbox" aria-label="指令建议">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.command}
              type="button"
              role="option"
              aria-selected={highlightedIndex === index}
              className={highlightedIndex === index ? 'active' : undefined}
              onMouseEnter={() => setHighlightedIndex(index)}
              onClick={() => chooseSuggestion(index)}
            >
              <span className="slash-icon" aria-hidden="true">{suggestion.icon}</span>
              <span className="slash-title">
                <strong>{suggestion.title}</strong>
                <code>{suggestion.command}</code>
              </span>
              <small>{suggestion.description}</small>
            </button>
          ))}
        </div>
      ) : null}
      <section className="composer-shell" aria-label="对话输入区">
        {selectedSkills.length > 0 ? (
          <div className="composer-selected-skills" aria-label="Selected skills">
            {selectedSkills.map(skill => (
              <button
                type="button"
                key={skill.id}
                onClick={() => setSelectedSkillIds(ids => ids.filter(id => id !== skill.id))}
                title={`Remove ${skill.name}`}
              >
                <span aria-hidden="true">/</span>
                {skillCommandName(skill)}
                <em aria-hidden="true">×</em>
              </button>
            ))}
          </div>
        ) : null}
        <div className="composer-presets" aria-label="快捷场景">
          {[
            ['▧', '文档处理'],
            ['◒', '金融服务'],
            ['◌', '数据分析及可视化'],
            ['', '更多'],
          ].map(([icon, label]) => (
            <button key={label} type="button">
              {icon ? <span aria-hidden="true">{icon}</span> : null}
              {label}
            </button>
          ))}
        </div>
        <div className="composer">
          <textarea
            autoFocus={autoFocus}
            aria-label="输入问题"
            placeholder="今天帮你做些什么？@ 引用对话文件，/ 调用技能与指令"
            value={text}
            onChange={event => setText(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Escape' && generating) onInterrupt()
              if (suggestions.length > 0 && !selectedCommand) {
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setHighlightedIndex(index => (index + 1) % suggestions.length)
                  return
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setHighlightedIndex(index => (index - 1 + suggestions.length) % suggestions.length)
                  return
                }
                if (event.key === 'Tab') {
                  event.preventDefault()
                  chooseSuggestion(highlightedIndex)
                  return
                }
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  chooseSuggestion(highlightedIndex)
                  return
                }
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
          />
          <div className="composer-toolbar" ref={toolbarRef}>
            <div className="composer-tool-left">
              <div className="composer-tool-menu">
                <button
                  type="button"
                  className="composer-tool-button"
                  aria-expanded={openMenu === 'model'}
                  onClick={() => setOpenMenu(menu => menu === 'model' ? null : 'model')}
                >
                  ✦ 模型⌄
                </button>
                <div hidden={openMenu !== 'model'}>
                  {renderModelMenu()}
                </div>
              </div>
              <div className="composer-tool-menu">
                <button
                  type="button"
                  className="composer-tool-button"
                  aria-expanded={openMenu === 'skills'}
                  onClick={() => setOpenMenu(menu => menu === 'skills' ? null : 'skills')}
                >
                  ⌁ 技能⌄
                </button>
                <div hidden={openMenu !== 'skills'}>
                  {renderSkillMenu()}
                </div>
              </div>
              <div className="composer-tool-menu">
                <button
                  type="button"
                  className="composer-tool-button"
                  aria-expanded={openMenu === 'mcp'}
                  onClick={() => setOpenMenu(menu => menu === 'mcp' ? null : 'mcp')}
                >
                  ⌘ 连应用⌄
                </button>
                <div hidden={openMenu !== 'mcp'}>
                  {renderMcpMenu()}
                </div>
              </div>
              <div className="composer-tool-menu">
                <button
                  type="button"
                  className="composer-approval-trigger"
                  aria-expanded={openMenu === 'approval'}
                  onClick={() => setOpenMenu(menu => menu === 'approval' ? null : 'approval')}
                >
                  <span aria-hidden="true">{activePermissionMode.icon}</span>
                  {activePermissionMode.title}
                </button>
                <div hidden={openMenu !== 'approval'}>
                  {renderApprovalMenu()}
                </div>
              </div>
            </div>
            <div className="composer-tool-right">
              {generating ? (
                <button
                  className="stop-button icon-action"
                  type="button"
                  aria-label="中断生成"
                  title="中断生成"
                  onClick={onInterrupt}
                >
                  <span className="stop-glyph" aria-hidden="true" />
                </button>
              ) : (
                <button
                  className="send-button icon-action"
                  type="button"
                  aria-label="发送"
                  title="发送"
                  onClick={submit}
                  disabled={!text.trim()}
                >
                  ▲
                </button>
              )}
            </div>
          </div>
        </div>
        <button
          className="workspace-picker"
          type="button"
          onClick={onSelectWorkspace}
          title="选择工作区并新建对话"
        >
          <span aria-hidden="true">▱</span>
          <small>选择工作空间</small>
          <strong>{workspace}</strong>
        </button>
        <p className="composer-disclaimer">内容由 AI 生成，请核实重要信息</p>
      </section>
    </div>
  )
}
