import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BuddySnapshot } from '../../../../shared/protocol.js'

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
  useEffect(() => {
    if (!state?.petAt) return
    setPetting(true)
    const timer = window.setTimeout(() => setPetting(false), 1800)
    return () => window.clearTimeout(timer)
  }, [state?.petAt])

  const sprite = state?.companion?.sprite ?? ['🥚']

  return createPortal(
    <div className="buddy-float" data-expanded={expanded}>
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
      <button
        className={`buddy-float-sprite${petting ? ' buddy-sprite-petting' : ''}`}
        type="button"
        onClick={() => (state?.companion ? setExpanded(!expanded) : onHatch())}
        title={state?.companion ? (expanded ? '收起属性' : '展开属性') : '孵化伙伴'}
        aria-label={state?.companion ? (expanded ? '收起属性' : '展开属性') : '孵化伙伴'}
      >
        {petting ? <span className="buddy-hearts" aria-hidden="true">♥</span> : null}
        <span>{sprite.join('\n')}</span>
      </button>
    </div>,
    document.body,
  )
}
