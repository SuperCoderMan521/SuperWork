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

  test('anchors the workspace editor menu below its trigger', () => {
    const menuRule = css.match(/\.workspace-editor-menu\s*\{[^}]+\}/)?.[0] ?? ''

    expect(menuRule).toContain('position: absolute')
    expect(menuRule).toContain('right: 0')
    expect(menuRule).toContain('z-index:')
  })

  test('uses the same compact shortcut grid for performance and settings entries', () => {
    const shortcutRule = css.match(/\.settings-shortcuts\s*\{[^}]+\}/)?.[0] ?? ''

    expect(shortcutRule).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))')
    expect(css).not.toContain('.performance-shortcut{width:100%;text-align:left}')
  })

  test('keeps permission actions horizontal when the file panel is open', () => {
    const panelRule = css.match(/\.permission-panel\s*\{[^}]+\}/)?.[0] ?? ''
    const actionRule = css.match(/\.permission-actions\s*\{[^}]+\}/)?.[0] ?? ''
    const buttonRule = css.match(/\.permission-actions button\s*\{[^}]+\}/)?.[0] ?? ''

    expect(panelRule).toContain('max-width: 760px')
    expect(panelRule).toContain('right: 28px')
    expect(actionRule).toContain('flex: 0 0 auto')
    expect(buttonRule).toContain('white-space: nowrap')
  })

  test('contains long permission summaries without widening the panel', () => {
    const panelRule = css.match(/\.permission-panel\s*\{[^}]+\}/)?.[0] ?? ''
    const contentRule = css.match(/\.permission-panel > div:first-child\s*\{[^}]+\}/)?.[0] ?? ''
    const summaryRule = css.match(/\.permission-panel p\s*\{[^}]+\}/)?.[0] ?? ''

    expect(panelRule).toContain('max-inline-size: calc(100vw - 332px)')
    expect(contentRule).toContain('max-width: 100%')
    expect(summaryRule).toContain('max-height:')
    expect(summaryRule).toContain('overflow: auto')
    expect(summaryRule).toContain('white-space: pre-wrap')
    expect(summaryRule).toContain('word-break: break-all')
  })

  test('styles local artifact cards and right workspace preview', () => {
    expect(css).toContain('.local-artifact-card')
    expect(css).toContain('.local-artifacts-panel')
    expect(css).toContain('.local-artifact-preview')
  })

  test('styles the local scheduled tasks center like other desktop centers', () => {
    expect(css).toContain('.scheduled-tasks-shell')
    expect(css).toContain('.scheduled-task-card')
    expect(css).toContain('.scheduled-task-empty')
  })
})
