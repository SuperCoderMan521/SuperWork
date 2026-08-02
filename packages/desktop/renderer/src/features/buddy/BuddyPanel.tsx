import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BuddySnapshot } from '../../../../shared/protocol.js'

type Pos = { x: number; y: number }
type DragState = { startX: number; startY: number; originX: number; originY: number; moved: boolean }

export function BuddyPanel({ state, onHatch, onRehatch, onPet, onMute }: {
  state: BuddySnapshot | null
  onHatch: () => void
  onRehatch: () => void
  onPet: () => void
  onMute: (muted: boolean) => void
}): React.ReactNode {
  const labels: Record<string, string> = { duck: '鸭子', goose: '鹅', blob: '果冻', cat: '猫咪', dragon: '龙', octopus: '章鱼', owl: '猫头鹰', penguin: '企鹅', turtle: '乌龟', snail: '蜗牛', ghost: '幽灵', axolotl: '蝾螈', capybara: '水豚', cactus: '仙人掌', robot: '机器人', rabbit: '兔子', mushroom: '蘑菇', chonk: '胖胖' }
  const statLabels: Record<string, string> = { DEBUGGING: '调试力', PATIENCE: '耐心', CHAOS: '混乱度', WISDOM: '智慧', SNARK: '毒舌度' }
  const [expanded, setExpanded] = useState(false)
  const [petting, setPetting] = useState(false)
  const [pos, setPos] = useState<Pos | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<DragState | null>(null)

  useEffect(() => {
    if (!state?.petAt) return
    setPetting(true)
    const timer = window.setTimeout(() => setPetting(false), 1800)
    return () => window.clearTimeout(timer)
  }, [state?.petAt])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const d = dragRef.current
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      if (!d.moved && Math.abs(dx) + Math.abs(dy) > 4) {
        d.moved = true
        setDragging(true)
      }
      if (d.moved) {
        const nextX = d.originX + dx
        const nextY = d.originY + dy
        const maxX = window.innerWidth - 40
        const maxY = window.innerHeight - 40
        setPos({ x: Math.max(0, Math.min(maxX, nextX)), y: Math.max(0, Math.min(maxY, nextY)) })
      }
    }
    const onUp = () => {
      if (dragRef.current?.moved) {
        dragRef.current = null
        setDragging(false)
      } else {
        dragRef.current = null
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const onSpriteMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    const el = e.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    if (!pos) setPos({ x: rect.left, y: rect.top })
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: rect.left, originY: rect.top, moved: false }
    e.preventDefault()
  }

  const onSpriteClick = () => {
    if (dragRef.current?.moved) return
    if (state?.companion) setExpanded(!expanded)
    else onHatch()
  }

  const sprite = state?.companion?.sprite ?? ['🥚']

  const floatStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
    : {}

  return createPortal(
    <div className="buddy-float" data-expanded={expanded} style={floatStyle}>
      {expanded && state?.companion ? (
        <div className="buddy-float-panel">
          <button className="buddy-float-close" type="button" onClick={() => setExpanded(false)} title="收起" aria-label="收起">×</button>
          <div className="buddy-float-header">
            <h3>{state.companion.name}</h3>
            <span>{({ common: '普通', uncommon: '稀有', rare: '珍稀', epic: '史诗', legendary: '传说' } as Record<string, string>)[state.companion.rarity] ?? state.companion.rarity}</span>
          </div>
          <p className="buddy-float-species">{labels[state.companion.species] ?? state.companion.species}{state.companion.shiny ? ' ✨ 闪光' : ''}</p>
          <p className="buddy-float-personality">“{state.companion.personality}”</p>
          <div className="buddy-float-stats">{Object.entries(state.companion.stats).map(([name, value]) => <div key={name}><span>{statLabels[name] ?? name}</span><progress max="100" value={value} /><b>{value}</b></div>)}</div>
          {state.reaction ? <div className="buddy-float-reaction">{state.reaction}</div> : null}
          <div className="buddy-float-actions">
            <button className={petting ? 'buddy-pet-active' : undefined} type="button" onClick={onPet} title="抚摸" aria-label="抚摸">♡</button>
            <button type="button" onClick={onRehatch} title="重新孵化" aria-label="重新孵化">↻</button>
            <button type="button" onClick={() => onMute(!state.muted)} title={state.muted ? '取消静音' : '静音'} aria-label={state.muted ? '取消静音' : '静音'}>{state.muted ? '🔊' : '🔇'}</button>
          </div>
        </div>
      ) : null}
      <div
        className={`buddy-float-sprite${petting ? ' buddy-sprite-petting' : ''}${dragging ? ' buddy-sprite-dragging' : ''}`}
        role="button"
        tabIndex={0}
        onMouseDown={onSpriteMouseDown}
        onClick={onSpriteClick}
        title={state?.companion ? (expanded ? '收起属性' : '展开属性') : '孵化伙伴'}
        aria-label={state?.companion ? (expanded ? '收起属性' : '展开属性') : '孵化伙伴'}
      >
        {petting ? <span className="buddy-hearts" aria-hidden="true">♥</span> : null}
        <span>{sprite.join('\n')}</span>
      </div>
    </div>,
    document.body,
  )
}
