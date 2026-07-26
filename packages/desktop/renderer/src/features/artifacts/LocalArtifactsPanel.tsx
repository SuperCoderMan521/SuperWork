import { DiagramRenderer } from '../chat/DiagramRenderer.js'
import { MarkdownMessage } from '../chat/MarkdownMessage.js'
import type { DesktopLocalArtifact } from './localArtifacts.js'

type LocalArtifactsPanelProps = {
  artifacts: DesktopLocalArtifact[]
  selectedArtifactId: string | null
  artifactContent: string | null
  onSelectArtifact: (artifact: DesktopLocalArtifact) => void
  onOpenFile?: (path: string) => void
}

function copyText(value: string | undefined): void {
  if (!value) return
  void navigator.clipboard?.writeText(value)
}

function selectedArtifact(
  artifacts: DesktopLocalArtifact[],
  selectedArtifactId: string | null,
): DesktopLocalArtifact | null {
  if (artifacts.length === 0) return null
  return (
    artifacts.find(artifact => artifact.id === selectedArtifactId) ??
    artifacts[0] ??
    null
  )
}

function previewContent(
  artifact: DesktopLocalArtifact,
  artifactContent: string | null,
): string | null {
  return artifact.source === 'message'
    ? artifact.content ?? null
    : artifactContent
}

function isFullPreviewArtifact(artifact: DesktopLocalArtifact): boolean {
  return artifact.kind === 'html' || artifact.kind === 'svg'
}

function ArtifactPreview({
  artifact,
  content,
}: {
  artifact: DesktopLocalArtifact
  content: string | null
}): React.ReactNode {
  if (artifact.status === 'missing') {
    return <div className="local-artifact-empty">文件不存在：{artifact.path}</div>
  }
  if (artifact.status === 'error') {
    return <div className="local-artifact-empty">预览失败：{artifact.error ?? '未知错误'}</div>
  }
  if (content === null) {
    return <div className="local-artifact-empty">加载中…</div>
  }
  if (artifact.kind === 'markdown') {
    return (
      <div className="local-artifact-preview local-artifact-markdown">
        <MarkdownMessage content={content} />
      </div>
    )
  }
  if (artifact.kind === 'mermaid' || artifact.kind === 'plantuml') {
    return (
      <div className="local-artifact-preview local-artifact-diagram">
        <DiagramRenderer language={artifact.kind} content={content} />
      </div>
    )
  }
  if (artifact.kind === 'html' || artifact.kind === 'svg') {
    return (
      <div className="local-artifact-preview local-artifact-html">
        <iframe
          className="html-preview local-artifact-frame"
          title={artifact.title}
          sandbox="allow-scripts"
          srcDoc={content}
        />
      </div>
    )
  }
  return (
    <div className="local-artifact-preview">
      <pre>{content}</pre>
    </div>
  )
}

export function LocalArtifactsPanel({
  artifacts,
  selectedArtifactId,
  artifactContent,
  onSelectArtifact,
  onOpenFile,
}: LocalArtifactsPanelProps): React.ReactNode {
  const selected = selectedArtifact(artifacts, selectedArtifactId)
  const content = selected ? previewContent(selected, artifactContent) : null
  const fullPreview = selected ? isFullPreviewArtifact(selected) : false

  return (
    <aside className={fullPreview ? 'local-artifacts-panel local-artifacts-full-preview' : 'local-artifacts-panel'}>
      {artifacts.length === 0 ? (
        <div className="local-artifact-empty">
          <strong>还没有本地 Artifacts</strong>
          <p>生成 HTML、Markdown、Mermaid、PlantUML 或写入相关文件后会显示在这里。</p>
        </div>
      ) : fullPreview && selected ? (
        <ArtifactPreview artifact={selected} content={content} />
      ) : (
        <div className="local-artifacts-layout">
          <ul className="local-artifact-list">
            {artifacts.map(artifact => (
              <li key={artifact.id}>
                <button
                  type="button"
                  className={artifact.id === selected?.id ? 'active' : undefined}
                  onClick={() => onSelectArtifact(artifact)}
                >
                  <strong>{artifact.title}</strong>
                  <span>{artifact.kind}</span>
                </button>
              </li>
            ))}
          </ul>
          {selected ? (
            <section className="local-artifact-detail">
              <header>
                <div>
                  <h3>{selected.title}</h3>
                  <p>{selected.path ?? '来自当前对话'}</p>
                </div>
                <div className="local-artifact-actions">
                  {selected.path && onOpenFile ? (
                    <button type="button" onClick={() => onOpenFile(selected.path!)}>
                      打开
                    </button>
                  ) : null}
                  {selected.path ? (
                    <button type="button" onClick={() => copyText(selected.path)}>
                      复制路径
                    </button>
                  ) : null}
                  {content ? (
                    <button type="button" onClick={() => copyText(content)}>
                      复制内容
                    </button>
                  ) : null}
                </div>
              </header>
              <ArtifactPreview artifact={selected} content={content} />
            </section>
          ) : null}
        </div>
      )}
    </aside>
  )
}
