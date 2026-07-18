import { useEffect, useState } from 'react'
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
  const [open, setOpen] = useState(false)
  const [petting, setPetting] = useState(false)
  useEffect(() => {
    if (!state?.petAt) return
    setPetting(true)
    const timer = window.setTimeout(() => setPetting(false), 1800)
    return () => window.clearTimeout(timer)
  }, [state?.petAt])
  if (!open) return <button className="buddy-toggle" type="button" onClick={() => setOpen(true)} title="打开伙伴" aria-label="打开伙伴">🐾 <span>伙伴</span></button>
  if (!state?.companion) return <section className="buddy-panel"><button className="buddy-collapse" type="button" onClick={() => setOpen(false)} title="收起伙伴" aria-label="收起伙伴">×</button><h2>伙伴</h2><p>你的编码伙伴还没有孵化。</p><button className="buddy-hatch" type="button" onClick={onHatch} title="孵化伙伴" aria-label="孵化伙伴">🥚</button></section>
  const companion = state.companion
  return <section className="buddy-panel">
    <button className="buddy-collapse" type="button" onClick={() => setOpen(false)} title="收起伙伴" aria-label="收起伙伴">×</button>
    <div className="buddy-panel-header"><h2>{companion.name}</h2><span>{({ common: '普通', uncommon: '稀有', rare: '珍稀', epic: '史诗', legendary: '传说' } as Record<string, string>)[companion.rarity] ?? companion.rarity}</span></div>
    <div className={`buddy-sprite${petting ? ' buddy-sprite-petting' : ''}`} aria-label={`${companion.name} sprite`}>
      {petting ? <span className="buddy-hearts" aria-hidden="true">♥　♥　♥</span> : null}
      <span>{companion.sprite.join('\n')}</span>
    </div>
    <p className="buddy-species">{labels[companion.species] ?? companion.species}{companion.shiny ? ' ✨ 闪光' : ''}</p>
    <p className="buddy-personality">“{companion.personality}”</p>
    <div className="buddy-stats">{Object.entries(companion.stats).map(([name, value]) => <div key={name}><span>{statLabels[name] ?? name}</span><progress max="100" value={value} /><b>{value}</b></div>)}</div>
    {state.reaction ? <div className="buddy-reaction">{state.reaction}</div> : null}
    <div className="buddy-actions"><button className={petting ? 'buddy-pet-active' : undefined} type="button" onClick={onPet} title="抚摸" aria-label="抚摸">♡</button><button type="button" onClick={onRehatch} title="重新孵化" aria-label="重新孵化">↻</button><button type="button" onClick={() => onMute(!state.muted)} title={state.muted ? '取消静音' : '静音'} aria-label={state.muted ? '取消静音' : '静音'}>{state.muted ? '🔊' : '🔇'}</button></div>
  </section>
}
