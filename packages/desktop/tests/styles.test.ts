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

  test('renders running grouped tools as a compact text row without a progress bar', () => {
    const groupRule = css.match(/\.tool-group-running > summary\s*\{[^}]+\}/)?.[0] ?? ''
    const groupShineRule = css.match(/\.tool-group-running > summary::before\s*\{[^}]+\}/)?.[0] ?? ''

    expect(groupRule).toContain('color: var(--muted)')
    expect(groupRule).toContain('background: transparent')
    expect(groupRule).not.toContain('linear-gradient')
    expect(groupShineRule).toContain('content: none')
    expect(css).toContain('.tool-group-running > summary strong')
    expect(css).toContain('animation: tool-text-shimmer')
    expect(css).toContain('@keyframes tool-text-shimmer')
  })

  test('centers the stop glyph independently of the text baseline', () => {
    const glyphRule = css.match(/\.stop-glyph\s*\{[^}]+\}/)?.[0] ?? ''

    expect(glyphRule).toContain('display: block')
    expect(glyphRule).toContain('width: 8px')
    expect(glyphRule).toContain('height: 8px')
  })
})
