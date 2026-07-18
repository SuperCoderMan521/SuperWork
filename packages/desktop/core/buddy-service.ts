import type { BuddySnapshot } from '../shared/protocol.js'

export class DesktopBuddyService {
  private reaction: string | null = null
  private petAt: number | null = null

  private async modules() {
    return Promise.all([
      import('src/buddy/companion.js'),
      import('src/buddy/companionReact.js'),
      import('src/buddy/sprites.js'),
      import('src/utils/config.js'),
    ])
  }

  async snapshot(): Promise<BuddySnapshot> {
    const [companionModule, , sprites, config] = await this.modules()
    const global = config.getGlobalConfig()
    const companion = companionModule.getCompanion()
    return {
      enabled: true,
      muted: Boolean(global.companionMuted),
      companion: companion
        ? {
            name: companion.name,
            personality: companion.personality,
            species: companion.species,
            rarity: companion.rarity,
            shiny: companion.shiny,
            hat: companion.hat,
            eye: companion.eye,
            stats: companion.stats,
            sprite: sprites.renderSprite(companion, 0),
          }
        : null,
      reaction: this.reaction,
      petAt: this.petAt,
    }
  }

  async hatch(rehatch = false): Promise<BuddySnapshot> {
    const [companionModule, , , config] = await this.modules()
    const current = config.getGlobalConfig().companion
    if (current && !rehatch) return this.snapshot()
    const seed = companionModule.generateSeed()
    const roll = companionModule.rollWithSeed(seed)
    const names: Record<string, string> = { duck: 'Waddles', goose: 'Goosberry', cat: 'Whiskers', dragon: 'Ember', robot: 'Byte', rabbit: 'Flops', chonk: 'Chonk' }
    const stored = {
      name: names[roll.bones.species] ?? 'Buddy',
      personality: `A ${roll.bones.species} companion with a curious coding soul.`,
      seed,
      hatchedAt: Date.now(),
    }
    config.saveGlobalConfig(value => ({ ...value, companion: stored, companionMuted: false }))
    return this.snapshot()
  }

  async pet(): Promise<BuddySnapshot> {
    const [, , , config] = await this.modules()
    config.saveGlobalConfig(value => ({ ...value, companionMuted: false }))
    this.petAt = Date.now()
    return this.snapshot()
  }

  async setMuted(muted: boolean): Promise<BuddySnapshot> {
    const [, , , config] = await this.modules()
    config.saveGlobalConfig(value => ({ ...value, companionMuted: muted }))
    return this.snapshot()
  }

  async react(messages: unknown[]): Promise<BuddySnapshot> {
    const [, reactionModule] = await this.modules()
    await new Promise<void>(resolve => {
      reactionModule.triggerCompanionReaction(messages as never[], value => {
        if (value) this.reaction = value
        resolve()
      })
      setTimeout(resolve, 10_500)
    })
    return this.snapshot()
  }
}
