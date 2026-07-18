import { useCallback, useState } from 'react'

type DragTarget = 'left' | 'right'

type ResizableWorkspaceProps = {
  sidebar: React.ReactNode
  chat: React.ReactNode
  files: React.ReactNode
  filePanelOpen: boolean
  onCloseFiles: () => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function ResizableWorkspace({
  sidebar,
  chat,
  files,
  filePanelOpen,
  onCloseFiles,
}: ResizableWorkspaceProps): React.ReactNode {
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [fileWidth, setFileWidth] = useState(360)

  const startDrag = useCallback(
    (target: DragTarget) => (event: React.PointerEvent<HTMLButtonElement>) => {
      const startX = event.clientX
      const startSidebar = sidebarWidth
      const startFile = fileWidth
      event.currentTarget.setPointerCapture(event.pointerId)

      const move = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX
        if (target === 'left') {
          setSidebarWidth(clamp(startSidebar + delta, 190, 380))
        } else {
          setFileWidth(clamp(startFile - delta, 300, 720))
        }
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }

      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [fileWidth, sidebarWidth],
  )

  return (
    <section
      className={filePanelOpen ? 'desktop-layout' : 'desktop-layout files-closed'}
      style={{
        gridTemplateColumns: filePanelOpen
          ? `${sidebarWidth}px 6px minmax(0, 1fr) 6px ${fileWidth}px`
          : `${sidebarWidth}px 6px minmax(0, 1fr)`,
      }}
    >
      <div className="layout-pane layout-sidebar">{sidebar}</div>
      <button
        className="splitter splitter-left"
        type="button"
        aria-label="调整左侧宽度"
        onPointerDown={startDrag('left')}
      />
      <div className="layout-pane layout-chat">{chat}</div>
      {filePanelOpen ? (
        <>
          <button
            className="splitter splitter-right"
            type="button"
            aria-label="调整文件区宽度"
            onPointerDown={startDrag('right')}
          />
          <div className="layout-pane layout-files">
            <button
              className="close-files"
              type="button"
              aria-label="关闭文件区"
              title="关闭文件区"
              onClick={onCloseFiles}
            >
              ×
            </button>
            {files}
          </div>
        </>
      ) : null}
    </section>
  )
}
