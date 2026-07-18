import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

const css = readFileSync(join(import.meta.dir, '../renderer/src/styles.css'), 'utf8')

describe('desktop styles', () => {
  test('renders running tool state as white text with a top shine instead of a gradient fill', () => {
    const runningRule = css.match(/\.tool-running summary,\s*\.tool-pending summary\s*\{[^}]+\}/)?.[0] ?? ''

    expect(runningRule).toContain('color: #fff')
    expect(runningRule).not.toContain('linear-gradient')
    expect(css).toContain('.tool-running summary::before')
    expect(css).toContain('animation: running-shine')
  })
})
