import { useEffect, useMemo, useRef, useState } from 'react'
import type { WorkspaceEditor } from '../../../../electron/workspace-editor-service.js'
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

export function WorkspaceEditorMenu({
  status,
  editors,
  openingId,
  error,
  onOpen,
  onRefresh,
}: {
  status: 'loading' | 'ready' | 'opening' | 'error'
  editors: WorkspaceEditor[]
  openingId: string | null
  error: string | null
  onOpen: (editorId: string) => void
  onRefresh: () => void
}): React.ReactNode {
  return (
    <div className="workspace-editor-menu" role="menu">
      <div className="workspace-editor-menu-title">打开工作区</div>
      {status === 'loading' && editors.length === 0 ? (
        <div className="workspace-editor-menu-status">正在检测编辑器…</div>
      ) : editors.length === 0 ? (
        <div className="workspace-editor-menu-status">未检测到支持的编辑器</div>
      ) : (
        editors.map(editor => (
          <button
            key={editor.id}
            type="button"
            role="menuitem"
            disabled={status === 'opening'}
            onClick={() => onOpen(editor.id)}
          >
            <span className={`workspace-editor-icon editor-icon-${editor.icon}`} aria-hidden="true" />
            <span>{editor.name}</span>
            {openingId === editor.id ? <small>正在打开…</small> : null}
          </button>
        ))
      )}
      {error ? <div className="workspace-editor-error">{error}</div> : null}
      <button className="workspace-editor-refresh" type="button" onClick={onRefresh}>
        重新检测
      </button>
    </div>
  )
}

export function ConversationFilesPanel({
  files,
  selectedPath,
  fileContent,
  onOpen,
  workspace,
  onListWorkspaceEditors,
  onOpenWorkspaceInEditor,
}: {
  files: ConversationFileEntry[]
  selectedPath: string | null
  fileContent: string | null
  onOpen: (path: string) => void
  workspace?: string
  onListWorkspaceEditors?: (refresh: boolean) => Promise<WorkspaceEditor[]>
  onOpenWorkspaceInEditor?: (editorId: string, workspace: string) => Promise<void>
}): React.ReactNode {
  const [draft, setDraft] = useState(fileContent ?? '')
  const selected = useMemo(
    () => files.find(file => file.path === selectedPath) ?? null,
    [files, selectedPath],
  )
  const editorMenuRef = useRef<HTMLDivElement>(null)
  const [editorMenuOpen, setEditorMenuOpen] = useState(false)
  const [editorStatus, setEditorStatus] = useState<'loading' | 'ready' | 'opening' | 'error'>('loading')
  const [editors, setEditors] = useState<WorkspaceEditor[]>([])
  const [openingEditorId, setOpeningEditorId] = useState<string | null>(null)
  const [editorError, setEditorError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(fileContent ?? '')
  }, [fileContent, selectedPath])

  useEffect(() => {
    if (!editorMenuOpen) return
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!editorMenuRef.current?.contains(event.target as Node)) setEditorMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEditorMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOnPointerDown)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [editorMenuOpen])

  const refreshEditors = async () => {
    if (!onListWorkspaceEditors) return
    setEditorStatus('loading')
    setEditorError(null)
    try {
      setEditors(await onListWorkspaceEditors(true))
      setEditorStatus('ready')
    } catch (error) {
      setEditorStatus('error')
      setEditorError(error instanceof Error ? error.message : String(error))
    }
  }

  const toggleEditorMenu = () => {
    const nextOpen = !editorMenuOpen
    setEditorMenuOpen(nextOpen)
    if (nextOpen) void refreshEditors()
  }

  const openWorkspace = async (editorId: string) => {
    if (!workspace || !onOpenWorkspaceInEditor) return
    setEditorStatus('opening')
    setOpeningEditorId(editorId)
    setEditorError(null)
    try {
      await onOpenWorkspaceInEditor(editorId, workspace)
      setEditorMenuOpen(false)
      setEditorStatus('ready')
    } catch (error) {
      setEditorStatus('error')
      setEditorError(error instanceof Error ? error.message : String(error))
    } finally {
      setOpeningEditorId(null)
    }
  }

  return (
    <aside className="files-panel files-panel-wide">
      <header>
        <h2>文件</h2>
        <div className="files-panel-actions">
          <span>{files.length}</span>
          {workspace && onListWorkspaceEditors && onOpenWorkspaceInEditor ? (
            <div className="workspace-editor-picker" ref={editorMenuRef}>
              <button
                className="workspace-editor-trigger"
                type="button"
                aria-haspopup="menu"
                aria-expanded={editorMenuOpen}
                onClick={toggleEditorMenu}
              >
                在编辑器中打开 <span aria-hidden="true">⌄</span>
              </button>
              {editorMenuOpen ? (
                <WorkspaceEditorMenu
                  status={editorStatus}
                  editors={editors}
                  openingId={openingEditorId}
                  error={editorError}
                  onOpen={editorId => void openWorkspace(editorId)}
                  onRefresh={() => void refreshEditors()}
                />
              ) : null}
            </div>
          ) : null}
        </div>
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
