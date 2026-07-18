import { marked } from 'marked'
import { useMemo, useState } from 'react'
import { DiagramRenderer } from './DiagramRenderer.js'

type MarkdownMessageProps = {
  content: string
}

type Segment =
  | { type: 'text'; content: string; key: string }
  | { type: 'code'; language: string; content: string; key: string }
  | { type: 'pending'; language: string; key: string }

marked.use({
  gfm: true,
  breaks: true,
})

function splitMarkdown(content: string): Segment[] {
  const segments: Segment[] = []
  let index = 0
  let textBuffer: string[] = []
  let codeBuffer: string[] | null = null
  let fenceMarker = ''
  let fenceLanguage = 'text'

  const pushTextContent = (text: string) => {
    if (text.trim().length === 0) return
    const barePlantUml = /@start[a-z]*[\s\S]*?@end[a-z]*/gi
    let lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = barePlantUml.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const before = text.slice(lastIndex, match.index)
        if (before.trim()) {
          segments.push({
            type: 'text',
            content: before,
            key: `text-${index++}`,
          })
        }
      }
      segments.push({
        type: 'code',
        language: 'plantuml',
        content: match[0],
        key: `code-${index++}`,
      })
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < text.length) {
      const after = text.slice(lastIndex)
      if (after.trim()) {
        segments.push({
          type: 'text',
          content: after,
          key: `text-${index++}`,
        })
      }
    }
  }

  const pushText = () => {
    if (textBuffer.length === 0) return
    const text = textBuffer.join('')
    textBuffer = []
    pushTextContent(text)
  }

  const pushCode = () => {
    if (!codeBuffer) return
    const code = codeBuffer.join('').replace(/\r?\n$/, '')
    segments.push({
      type: 'code',
      language: fenceLanguage || 'text',
      content: code,
      key: `code-${index++}`,
    })
    codeBuffer = null
    fenceMarker = ''
    fenceLanguage = 'text'
  }

  const lines = content.match(/[^\n]*(?:\n|$)/g) ?? []
  for (const line of lines) {
    if (line === '') continue
    if (codeBuffer) {
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line.trimEnd())
      if (close && close[1]?.startsWith(fenceMarker.at(0) ?? '`')) {
        pushCode()
      } else {
        codeBuffer.push(line)
      }
      continue
    }

    const open = /^ {0,3}(`{3,}|~{3,})\s*([A-Za-z0-9_-]+)?[^\n]*\n?$/.exec(line)
    if (open) {
      pushText()
      fenceMarker = open[1] ?? '```'
      fenceLanguage = open[2] ?? 'text'
      codeBuffer = []
    } else {
      textBuffer.push(line)
    }
  }

  pushText()
  if (codeBuffer) {
    segments.push({
      type: 'pending',
      language: fenceLanguage || 'text',
      key: `pending-${index++}`,
    })
  }

  return segments.length > 0
    ? segments
    : [{ type: 'text', content, key: 'text-0' }]
}

function sanitizeMarkdownHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/\s+(href|src)\s*=\s*"javascript:[^"]*"/gi, ' $1="#"')
    .replace(/\s+(href|src)\s*=\s*'javascript:[^']*'/gi, " $1='#'")
}

function markdownToHtml(content: string): string {
  const html = marked.parse(content, { async: false }) as string
  return sanitizeMarkdownHtml(html)
}

function MarkdownBlock({
  content,
  className = 'markdown-rendered-html',
}: {
  content: string
  className?: string
}): React.ReactNode {
  const html = useMemo(() => markdownToHtml(content), [content])
  return (
    <div
      className={className}
      // Markdown is sanitized above before being inserted into the Electron
      // renderer. This keeps normal Markdown HTML while stripping executable
      // handlers and script URLs.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function copyToClipboard(content: string) {
  void navigator.clipboard?.writeText(content)
}

function RichCodeBlock({
  language,
  content,
}: {
  language: string
  content: string
}): React.ReactNode {
  const [preview, setPreview] = useState(false)
  const normalized = language.toLowerCase()
  const isDiagram = normalized === 'mermaid' || normalized === 'plantuml'
  const isHtml = normalized === 'html'
  const isMarkdown = normalized === 'markdown' || normalized === 'md'

  return (
    <figure className={isDiagram ? 'code-block diagram-block' : 'code-block'}>
      <figcaption>
        <span>
          {isDiagram
            ? `${normalized} 图表`
            : isHtml
              ? 'HTML'
              : isMarkdown
                ? 'Markdown'
                : language}
        </span>
        <span className="code-actions">
          {isHtml || isMarkdown ? (
            <button type="button" onClick={() => setPreview(value => !value)}>
              {isHtml ? 'HTML 预览' : 'Markdown 预览'}
            </button>
          ) : null}
          <button
            type="button"
            aria-label="复制代码"
            title="复制代码"
            onClick={() => copyToClipboard(content)}
          >
            ⧉
          </button>
        </span>
      </figcaption>
      {isDiagram ? (
        <DiagramRenderer language={normalized as 'mermaid' | 'plantuml'} content={content} />
      ) : preview && isHtml ? (
        <iframe className="html-preview" title="HTML 预览" sandbox="" srcDoc={content} />
      ) : preview && isMarkdown ? (
        <MarkdownBlock content={content} className="markdown-preview markdown-rendered-html" />
      ) : (
        <pre>
          <code>{content}</code>
        </pre>
      )}
    </figure>
  )
}

export function MarkdownMessage({ content }: MarkdownMessageProps): React.ReactNode {
  return (
    <div className="markdown-body">
      {splitMarkdown(content).map(segment => {
        if (segment.type === 'text') {
          return <MarkdownBlock key={segment.key} content={segment.content} />
        }
        if (segment.type === 'pending') {
          return (
            <div key={segment.key} className="pending-rich-block">
              <span>内容生成中</span>
            </div>
          )
        }
        return (
          <RichCodeBlock
            key={segment.key}
            language={segment.language}
            content={segment.content}
          />
        )
      })}
    </div>
  )
}
