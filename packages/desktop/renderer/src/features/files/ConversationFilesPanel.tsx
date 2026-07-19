import { useEffect, useMemo, useState } from 'react'
import type {
  DesktopFileEntry,
  DesktopToolCall,
} from '../../../../shared/protocol.js'
import {
  extractPathCandidates,
  looksLikeFilePath,
} from '../../../../shared/file-paths.js'
import { MarkdownMessage } from '../chat/MarkdownMessage.js'
import { buildEditDiff, type EditDiff } from '../chat/toolRendering.js'

export type ConversationFileEntry = DesktopFileEntry & {
  diff?: EditDiff
}

function stringFromInput(input: unknown, key: string): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined
  const value = (input as Record<string, unknown>)[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

function extension(path: string): string {
  const name = basename(path)
  const index = name.lastIndexOf('.')
  return index === -1 ? name.toLowerCase() : name.slice(index + 1).toLowerCase()
}

export function filesFromTools(
  tools: Record<string, DesktopToolCall>,
  order: string[],
): ConversationFileEntry[] {
  const seen = new Set<string>()
  const files: ConversationFileEntry[] = []
  for (const id of order) {
    const tool = tools[id]
    if (!tool) continue
    const diff = buildEditDiff(tool) ?? undefined
    const candidates = [
      stringFromInput(tool.input, 'file_path'),
      stringFromInput(tool.input, 'path'),
      diff?.path ?? undefined,
      ...extractPathCandidates(`${tool.summary}\n${tool.output ?? ''}`),
    ].filter((value): value is string => Boolean(value))
    for (const candidate of candidates) {
      if (!looksLikeFilePath(candidate)) continue
      const key = candidate.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      files.push({
        id: `${id}:${candidate}`,
        path: candidate,
        label: basename(candidate),
        source: 'tool',
        diff,
      })
    }
  }
  return files
}

function DiffPreview({ diff }: { diff: EditDiff }): React.ReactNode {
  return (
    <section className="file-diff">
      <header>
        <span>编辑差异</span>
        <strong>
          +{diff.additions} -{diff.deletions}
        </strong>
      </header>
      <pre>
        {diff.lines.map((line, index) => (
          <code
            key={`${line.kind}-${index}-${line.text}`}
            className={`diff-line diff-${line.kind}`}
          >
            {line.kind === 'add' ? '+' : '-'} {line.text}
          </code>
        ))}
      </pre>
    </section>
  )
}

function languageFromPath(path: string): string {
  const ext = extension(path)
  const aliases: Record<string, string> = {
    ts: 'ts',
    tsx: 'tsx',
    js: 'js',
    jsx: 'jsx',
    json: 'json',
    css: 'css',
    html: 'html',
    md: 'markdown',
    markdown: 'markdown',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    kt: 'kotlin',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'toml',
    dockerfile: 'dockerfile',
  }
  return aliases[ext] ?? (ext.replace(/[^a-z0-9_-]/g, '') || 'text')
}

function highlightCodeLine(line: string): React.ReactNode[] {
  const keywordPattern =
    /\b(import|export|const|let|var|function|return|if|else|for|while|class|type|interface|from|async|await|try|catch|new|true|false|null|undefined)\b/g
  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = keywordPattern.exec(line)) !== null) {
    if (match.index > lastIndex) nodes.push(line.slice(lastIndex, match.index))
    nodes.push(
      <span className="token-keyword" key={`${match[0]}-${match.index}`}>
        {match[0]}
      </span>,
    )
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < line.length) nodes.push(line.slice(lastIndex))
  return nodes
}

function FileViewer({
  path,
  content,
}: {
  path: string
  content: string | null
}): React.ReactNode {
  if (content === null) {
    return <div className="file-viewer file-viewer-empty">加载中…</div>
  }
  const language = languageFromPath(path)
  if (language === 'markdown') {
    return (
      <div className="file-viewer file-markdown">
        <MarkdownMessage content={content} />
      </div>
    )
  }
  if (language === 'html') {
    return (
      <div className="file-viewer file-html">
        <iframe title={path} sandbox="" srcDoc={content} />
      </div>
    )
  }
  return (
    <div className="file-viewer">
      <pre className={`file-code language-${language}`}>
        {content.split(/\r?\n/).map((line, index) => (
          <code key={`${index}-${line}`} className="file-code-line">
            <span className="line-number">{index + 1}</span>
            <span className="line-content">{highlightCodeLine(line)}</span>
          </code>
        ))}
      </pre>
    </div>
  )
}

export function ConversationFilesPanel({
  files,
  selectedPath,
  fileContent,
  onOpen,
}: {
  files: ConversationFileEntry[]
  selectedPath: string | null
  fileContent: string | null
  onOpen: (path: string) => void
}): React.ReactNode {
  const [draft, setDraft] = useState(fileContent ?? '')
  const selected = useMemo(
    () => files.find(file => file.path === selectedPath) ?? null,
    [files, selectedPath],
  )

  useEffect(() => {
    setDraft(fileContent ?? '')
  }, [fileContent, selectedPath])

  return (
    <aside className="files-panel files-panel-wide">
      <header>
        <h2>文件</h2>
        <span>{files.length}</span>
      </header>
      {files.length === 0 ? (
        <p className="empty-hint">当前对话还没有产生文件。</p>
      ) : (
        <ul>
          {files.map(file => (
            <li key={file.id}>
              <button
                type="button"
                className={file.path === selectedPath ? 'active' : undefined}
                onClick={() => onOpen(file.path)}
              >
                <strong>{file.label}</strong>
                <span>{file.path}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selectedPath ? (
        <section className="file-preview">
          <header>
            <h3>{selectedPath}</h3>
          </header>
          {selected?.diff ? <DiffPreview diff={selected.diff} /> : null}
          <FileViewer path={selectedPath} content={fileContent} />
          <textarea
            aria-label="文件内容"
            value={fileContent === null ? '加载中…' : draft}
            disabled={fileContent === null}
            onChange={event => setDraft(event.target.value)}
          />
        </section>
      ) : null}
    </aside>
  )
}
