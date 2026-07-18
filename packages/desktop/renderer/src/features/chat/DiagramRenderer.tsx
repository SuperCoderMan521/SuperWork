import mermaid from 'mermaid'
import { useEffect, useId, useRef, useState } from 'react'
import { renderPlantUmlToSvg } from './plantumlLocalRenderer.js'

type DiagramRendererProps = {
  language: 'mermaid' | 'plantuml'
  content: string
}

type RenderState = 'rendering' | 'ready' | 'error'

let mermaidReady = false

function initializeMermaid() {
  if (mermaidReady) return
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'dark',
    themeVariables: {
      background: '#101113',
      mainBkg: '#1c1d20',
      primaryColor: '#252930',
      primaryTextColor: '#e6e7e9',
      lineColor: '#8c9098',
      fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    },
  })
  mermaidReady = true
}

function diagramErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function DiagramRenderer({
  language,
  content,
}: DiagramRendererProps): React.ReactNode {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const renderTargetRef = useRef<HTMLDivElement | null>(null)
  const [state, setState] = useState<RenderState>('rendering')
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    let cancelled = false
    const target = renderTargetRef.current
    if (target) target.innerHTML = ''
    setState('rendering')
    setError(null)

    if (language === 'plantuml') {
      try {
        const svg = renderPlantUmlToSvg(content)
        if (!cancelled && renderTargetRef.current) {
          renderTargetRef.current.innerHTML = svg
        }
        if (!cancelled) setState('ready')
      } catch (error_) {
        if (!cancelled) {
          setError(diagramErrorMessage(error_))
          setState('error')
        }
      }
      return () => {
        cancelled = true
      }
    }

    async function renderMermaid() {
      try {
        initializeMermaid()
        await mermaid.parse(content)
        const renderId = `superwork-mermaid-${reactId}-${Date.now()}`
        const result = await mermaid.render(renderId, content)
        if (cancelled) return
        if (renderTargetRef.current) {
          renderTargetRef.current.innerHTML = result.svg
        }
        setState('ready')
      } catch (error_) {
        if (cancelled) return
        setError(diagramErrorMessage(error_))
        setState('error')
      }
    }

    void renderMermaid()
    return () => {
      cancelled = true
    }
  }, [content, language, reactId])

  return (
    <div
      className={`diagram-render ${
        language === 'plantuml' ? 'plantuml-render-target' : 'mermaid-render-target'
      }`}
    >
      <div className="diagram-toolbar" aria-label="图表查看工具">
        <span>{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          aria-label="缩小图表"
          onClick={() => setZoom(value => Math.max(0.5, Number((value - 0.1).toFixed(2))))}
        >
          −
        </button>
        <button
          type="button"
          aria-label="放大图表"
          onClick={() => setZoom(value => Math.min(2.5, Number((value + 0.1).toFixed(2))))}
        >
          +
        </button>
        <button
          type="button"
          aria-label="适应宽度"
          onClick={() => setZoom(1)}
        >
          适宽
        </button>
      </div>
      {state === 'rendering' ? (
        <div className="pending-rich-block">
          <span>图表渲染中</span>
        </div>
      ) : null}
      {state === 'error' ? (
        <div className="diagram-error">
          <p>{language === 'plantuml' ? 'PlantUML' : 'Mermaid'} 渲染失败：{error}</p>
          <pre>{content}</pre>
        </div>
      ) : null}
      <div className="diagram-viewport">
        <div
          ref={renderTargetRef}
          className="diagram-svg"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            width: `${100 / zoom}%`,
          }}
        />
      </div>
      {language === 'plantuml' && state === 'ready' ? (
        <details className="diagram-source">
          <summary>PlantUML 源码</summary>
          <pre>{content}</pre>
        </details>
      ) : null}
    </div>
  )
}
