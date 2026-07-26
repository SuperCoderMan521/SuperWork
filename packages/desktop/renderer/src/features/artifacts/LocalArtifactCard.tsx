import type { DesktopLocalArtifact } from './localArtifacts.js'

type LocalArtifactCardProps = {
  artifact: DesktopLocalArtifact
  onOpenArtifact?: (artifact: DesktopLocalArtifact) => void
  onOpenFile?: (path: string) => void
}

function copyText(value: string | undefined): void {
  if (!value) return
  void navigator.clipboard?.writeText(value)
}

export function LocalArtifactCard({
  artifact,
  onOpenArtifact,
  onOpenFile,
}: LocalArtifactCardProps): React.ReactNode {
  return (
    <article className={`local-artifact-card local-artifact-${artifact.kind}`}>
      <div className="local-artifact-card-main">
        <span className="local-artifact-card-icon" aria-hidden="true">
          ◈
        </span>
        <div>
          <strong>Local Artifact</strong>
          <p>{artifact.title}</p>
        </div>
      </div>
      <div className="local-artifact-card-meta">
        <span>{artifact.kind}</span>
        <span>{artifact.source === 'file' ? '本地文件' : '当前对话'}</span>
      </div>
      <div className="local-artifact-card-actions">
        {onOpenArtifact ? (
          <button type="button" onClick={() => onOpenArtifact(artifact)}>
            预览
          </button>
        ) : null}
        {artifact.path && onOpenFile ? (
          <button type="button" onClick={() => onOpenFile(artifact.path!)}>
            打开
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => copyText(artifact.path ?? artifact.content)}
        >
          复制
        </button>
      </div>
    </article>
  )
}
