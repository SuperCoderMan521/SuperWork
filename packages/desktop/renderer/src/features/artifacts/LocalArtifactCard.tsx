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
      <div
        className="local-artifact-card-actions"
        role="group"
        aria-label="本地工件操作"
      >
        {onOpenArtifact ? (
          <button
            type="button"
            onClick={() => onOpenArtifact(artifact)}
            title={`预览 ${artifact.title}`}
          >
            预览
          </button>
        ) : null}
        {artifact.path && onOpenFile ? (
          <button
            type="button"
            onClick={() => onOpenFile(artifact.path!)}
            title={`打开 ${artifact.title}`}
          >
            打开
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => copyText(artifact.path ?? artifact.content)}
          title="复制内容"
        >
          复制
        </button>
      </div>
    </article>
  )
}
