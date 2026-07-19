import { useEffect, useState } from 'react'
import { selectedSlashCommand, slashSuggestions } from './slashCommands.js'

type ComposerProps = {
  generating: boolean
  workspace: string
  onSubmit: (text: string) => void
  onInterrupt: () => void
  onSelectWorkspace: () => void
  autoFocus?: boolean
}

export function Composer({
  generating,
  workspace,
  onSubmit,
  onInterrupt,
  onSelectWorkspace,
  autoFocus = true,
}: ComposerProps): React.ReactNode {
  const [text, setText] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const suggestions = slashSuggestions(text)
  const selectedCommand = selectedSlashCommand(text)

  useEffect(() => {
    setHighlightedIndex(0)
  }, [text])

  const submit = () => {
    const prompt = text.trim()
    if (!prompt || generating) return
    onSubmit(prompt)
    setText('')
  }

  const chooseSuggestion = (index: number) => {
    const suggestion = suggestions[index]
    if (!suggestion) return
    setText(suggestion.command)
  }

  return (
    <div className="composer-area">
      {generating ? (
        <div className="composer-status">正在生成，可以随时中断</div>
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
              <strong>{suggestion.command}</strong>
              <span>{suggestion.title}</span>
              <small>{suggestion.description}</small>
            </button>
          ))}
        </div>
      ) : null}
      <div className="composer">
        <textarea
          autoFocus={autoFocus}
          aria-label="输入问题"
          placeholder="输入问题，或输入 / 使用 Claude Code 指令"
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
            ↑
          </button>
        )}
      </div>
      <button
        className="workspace-picker"
        type="button"
        onClick={onSelectWorkspace}
        title="选择工作区并新建对话"
      >
        <span aria-hidden="true">📁</span>
        <small>选择工作区</small>
        <strong>{workspace}</strong>
      </button>
    </div>
  )
}
