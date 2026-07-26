import type {
  DesktopMessage,
  DesktopToolCall,
} from '../../../../shared/protocol.js'

export type DesktopLocalArtifact = {
  id: string
  source: 'file' | 'message'
  title: string
  kind: 'html' | 'markdown' | 'mermaid' | 'plantuml' | 'svg' | 'text'
  status: 'ready' | 'missing' | 'error'
  path?: string
  content?: string
  messageId?: string
  toolCallId?: string
  createdAt: number
  displayOrder?: number
  error?: string
}

export type LocalArtifactSessionLike = {
  messages: Record<string, DesktopMessage>
  messageOrder: string[]
  tools: Record<string, DesktopToolCall>
  toolOrder: string[]
}

const ARTIFACT_EXTENSIONS = new Map<string, DesktopLocalArtifact['kind']>([
  ['html', 'html'],
  ['htm', 'html'],
  ['md', 'markdown'],
  ['markdown', 'markdown'],
  ['svg', 'svg'],
  ['mmd', 'mermaid'],
  ['mermaid', 'mermaid'],
  ['puml', 'plantuml'],
  ['plantuml', 'plantuml'],
])

const FENCE_LANGUAGES = new Map<string, DesktopLocalArtifact['kind']>([
  ['html', 'html'],
  ['htm', 'html'],
  ['md', 'markdown'],
  ['markdown', 'markdown'],
  ['mermaid', 'mermaid'],
  ['mmd', 'mermaid'],
  ['plantuml', 'plantuml'],
  ['puml', 'plantuml'],
  ['svg', 'svg'],
])

function inputPath(input: unknown): string | null {
  if (typeof input !== 'object' || input === null) return null
  const record = input as Record<string, unknown>
  const value = record.file_path ?? record.path
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

function extension(path: string): string {
  const name = basename(path)
  const index = name.lastIndexOf('.')
  return index === -1 ? '' : name.slice(index + 1).toLowerCase()
}

function kindFromPath(path: string): DesktopLocalArtifact['kind'] | null {
  return ARTIFACT_EXTENSIONS.get(extension(path)) ?? null
}

function kindFromFenceLanguage(language: string): DesktopLocalArtifact['kind'] | null {
  return FENCE_LANGUAGES.get(language.trim().toLowerCase()) ?? null
}

function isWriteTool(tool: DesktopToolCall): boolean {
  return tool.name.toLowerCase().includes('write')
}

function fileArtifactFromTool(
  tool: DesktopToolCall,
): DesktopLocalArtifact | null {
  if (!isWriteTool(tool)) return null
  const path = inputPath(tool.input)
  if (!path) return null
  const kind = kindFromPath(path)
  if (!kind) return null
  return {
    id: `file:${path.toLowerCase()}`,
    source: 'file',
    title: basename(path),
    kind,
    status: 'ready',
    path,
    toolCallId: tool.id,
    createdAt: tool.startedAt ?? tool.completedAt ?? Date.now(),
    displayOrder: tool.displayOrder,
  }
}

function messageArtifacts(message: DesktopMessage): DesktopLocalArtifact[] {
  if (message.role !== 'assistant' || message.kind === 'thinking') return []
  const artifacts: DesktopLocalArtifact[] = []
  const fencePattern = /^ {0,3}(`{3,}|~{3,})\s*([A-Za-z0-9_-]+)?[^\n]*\n([\s\S]*?)\n {0,3}\1\s*$/gm
  let match: RegExpExecArray | null
  let blockIndex = 0
  while ((match = fencePattern.exec(message.content)) !== null) {
    const language = match[2] ?? ''
    const kind = kindFromFenceLanguage(language)
    if (!kind) {
      blockIndex += 1
      continue
    }
    const content = (match[3] ?? '').replace(/\r\n/g, '\n')
    artifacts.push({
      id: `message:${message.id}:${blockIndex}`,
      source: 'message',
      title: `${kind} 片段`,
      kind,
      status: 'ready',
      content,
      messageId: message.id,
      createdAt: message.createdAt,
      displayOrder: message.displayOrder,
    })
    blockIndex += 1
  }
  return artifacts
}

export function deriveLocalArtifacts(
  session: LocalArtifactSessionLike,
): DesktopLocalArtifact[] {
  const artifacts: DesktopLocalArtifact[] = []
  const seen = new Set<string>()

  for (const messageId of session.messageOrder) {
    const message = session.messages[messageId]
    if (!message) continue
    for (const artifact of messageArtifacts(message)) {
      if (seen.has(artifact.id)) continue
      seen.add(artifact.id)
      artifacts.push(artifact)
    }
  }

  for (const toolId of session.toolOrder) {
    const tool = session.tools[toolId]
    if (!tool) continue
    const artifact = fileArtifactFromTool(tool)
    if (!artifact || seen.has(artifact.id)) continue
    seen.add(artifact.id)
    artifacts.push(artifact)
  }

  return artifacts.sort(
    (left, right) =>
      (left.displayOrder ?? Number.MAX_SAFE_INTEGER) -
        (right.displayOrder ?? Number.MAX_SAFE_INTEGER) ||
      left.createdAt - right.createdAt ||
      left.id.localeCompare(right.id),
  )
}
