import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

describe('desktop branding', () => {
  test('uses SuperWork as product and artifact name', () => {
    const packageJson = JSON.parse(
      readFileSync(join(import.meta.dir, '../package.json'), 'utf8'),
    ) as { productName?: string }
    const builderConfig = readFileSync(
      join(import.meta.dir, '../electron-builder.yml'),
      'utf8',
    )

    expect(packageJson.productName).toBe('SuperWork')
    expect(builderConfig).toContain('appId: win.claude-code-best.superwork')
    expect(builderConfig).toContain('productName: SuperWork')
    expect(builderConfig).toContain('artifactName: SuperWork-${version}-${arch}.${ext}')
  })
})
