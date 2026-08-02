import { useState } from 'react'
import {
  AgentActivityPanel,
  type AgentActivity,
} from '../agents/AgentActivityPanel.js'
import {
  LocalArtifactsPanel,
} from '../artifacts/LocalArtifactsPanel.js'
import type { DesktopLocalArtifact } from '../artifacts/localArtifacts.js'

export type WorkspaceTab = 'files' | 'agents' | 'artifacts'

function hasObservedAgentActivity(activity: AgentActivity): boolean {
  return (
    activity.agents.length > 0 ||
    activity.tasks.length > 0 ||
    activity.messages.length > 0
  )
}

export function WorkspacePanel({
  files,
  fileCount,
  agentActivity,
  artifacts = [],
  selectedArtifactId = null,
  artifactContent = null,
  activeTab: controlledActiveTab,
  onTabChange,
  onSelectArtifact = () => {},
  onOpenFile,
}: {
  files: React.ReactNode
  fileCount: number
  agentActivity: AgentActivity
  artifacts?: DesktopLocalArtifact[]
  selectedArtifactId?: string | null
  artifactContent?: string | null
  activeTab?: WorkspaceTab
  onTabChange?: (tab: WorkspaceTab) => void
  onSelectArtifact?: (artifact: DesktopLocalArtifact) => void
  onOpenFile?: (path: string) => void
}): React.ReactNode {
  const hasAgents = hasObservedAgentActivity(agentActivity)
  const [uncontrolledActiveTab, setUncontrolledActiveTab] = useState<WorkspaceTab>(
    fileCount === 0 && hasAgents ? 'agents' : 'files',
  )
  const requestedActiveTab = controlledActiveTab ?? uncontrolledActiveTab
  const activeTab =
    requestedActiveTab === 'agents' && !hasAgents ? 'files' : requestedActiveTab
  const selectTab = (tab: WorkspaceTab) => {
    onTabChange?.(tab)
    if (controlledActiveTab === undefined) setUncontrolledActiveTab(tab)
  }

  return (
    <aside className="workspace-panel">
      <header className="workspace-panel-header">
        <div className="workspace-tabs" role="tablist" aria-label="右侧工作区">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'files'}
            className={activeTab === 'files' ? 'active' : undefined}
            onClick={() => selectTab('files')}
          >
            文件 <span>{fileCount}</span>
          </button>
          {hasAgents ? (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'agents'}
              className={activeTab === 'agents' ? 'active' : undefined}
              onClick={() => selectTab('agents')}
            >
              Agent
              <i aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'artifacts'}
            className={activeTab === 'artifacts' ? 'active' : undefined}
            onClick={() => selectTab('artifacts')}
          >
            Artifacts <span>{artifacts.length}</span>
          </button>
        </div>
      </header>
      <div className="workspace-panel-body">
        {activeTab === 'agents' ? (
          <AgentActivityPanel activity={agentActivity} onOpenFile={onOpenFile} />
        ) : activeTab === 'artifacts' ? (
          <LocalArtifactsPanel
            artifacts={artifacts}
            selectedArtifactId={selectedArtifactId}
            artifactContent={artifactContent}
            onSelectArtifact={onSelectArtifact}
            onOpenFile={onOpenFile}
          />
        ) : (
          files
        )}
      </div>
    </aside>
  )
}
