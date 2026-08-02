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

  test('keeps the permission prompt inside the conversation layout', () => {
    const panelRule = css.match(/\.permission-panel\s*\{[^}]+\}/)?.[0] ?? ''
    const actionRule = css.match(/\.permission-actions\s*\{[^}]+\}/)?.[0] ?? ''
    const buttonRule = css.match(/\.permission-actions button\s*\{[^}]+\}/)?.[0] ?? ''

    expect(panelRule).toContain('position: relative')
    expect(panelRule).toContain('display: grid')
    expect(panelRule).toContain('margin: 0 28px 12px')
    expect(panelRule).not.toContain('position: fixed')
    expect(actionRule).toContain('flex-wrap: wrap')
    expect(actionRule).toContain('justify-content: flex-end')
    expect(buttonRule).toContain('white-space: nowrap')
  })

  test('contains long permission summaries without widening the panel', () => {
    const panelRule = css.match(/\.permission-panel\s*\{[^}]+\}/)?.[0] ?? ''
    const headerRule = css.match(/\.permission-header\s*\{[^}]+\}/)?.[0] ?? ''
    const summaryRule = css.match(/\.permission-summary\s*\{[^}]+\}/)?.[0] ?? ''
    const summaryPRule = css.match(/\.permission-summary p\s*\{[^}]+\}/)?.[0] ?? ''

    expect(panelRule).toContain('min-width: 0')
    expect(headerRule).toContain('min-width: 0')
    expect(summaryRule).toContain('max-height:')
    expect(summaryRule).toContain('overflow: hidden')
    expect(summaryPRule).toContain('white-space: pre-wrap')
    expect(summaryPRule).toContain('word-break: break-all')
  })

  test('keeps long shell command summaries from widening the conversation', () => {
    const groupRule = css.match(/\.tool-group\s*\{[^}]+\}/)?.[0] ?? ''
    const descriptionRule = css.match(/\.tool-group-description\s*\{[^}]+\}/)?.[0] ?? ''

    expect(groupRule).toContain('max-width:')
    expect(descriptionRule).toContain('max-width:')
    expect(descriptionRule).toContain('text-overflow: ellipsis')
    expect(css).toContain('.tool-command-summary')
    expect(css).toContain('.tool-command-detail')
  })

  test('lets short user message bubbles shrink to their content', () => {
    const userContentRule = css.match(/\.message-user \.message-content\s*\{[^}]+\}/)?.[0] ?? ''

    expect(userContentRule).toContain('justify-self: end')
    expect(userContentRule).toContain('width: fit-content')
    expect(userContentRule).toContain('max-width: 100%')
  })

  test('aligns assistant messages with the centered composer column', () => {
    const assistantRule = css.match(/\.message-assistant,\s*\.message-system,\s*\.message-error\s*\{[^}]+\}/)?.[0] ?? ''
    const assistantMetaRule = css.match(/\.message-assistant \.message-meta\s*\{[^}]+\}/)?.[0] ?? ''

    expect(assistantRule).toContain('width: min(962px')
    expect(assistantRule).toContain('margin-left: auto')
    expect(assistantRule).toContain('margin-right: auto')
    expect(assistantMetaRule).toContain('display: none')
  })

  test('renders slash suggestions as a Chinese command palette', () => {
    const paletteRule = css.match(/\.slash-palette\s*\{[^}]+\}/)?.[0] ?? ''
    const buttonRule = css.match(/\.slash-palette button\s*\{[^}]+\}/)?.[0] ?? ''

    expect(paletteRule).toContain('background: #2b2b2b')
    expect(buttonRule).toContain('grid-template-columns: 20px')
    expect(css).toContain('.slash-icon')
    expect(css).toContain('.slash-title')
    expect(css).toContain('text-align: right')
  })

  test('styles the floating plan progress card above the composer', () => {
    const floatRule = css.match(/\.plan-progress-float\s*\{[^}]+\}/)?.[0] ?? ''
    const cardRule = css.match(/\.plan-progress-card\s*\{[^}]+\}/)?.[0] ?? ''
    const pillRule = css.match(/\.plan-progress-pill\s*\{[^}]+\}/)?.[0] ?? ''

    expect(floatRule).toContain('justify-items: center')
    expect(floatRule).toContain('pointer-events: none')
    expect(cardRule).toContain('background: #272727')
    expect(cardRule).toContain('border-radius: 9px')
    expect(pillRule).toContain('border-radius: 999px')
    expect(pillRule).toContain('pointer-events: auto')
    expect(css).toContain('.plan-progress-step.is-active')
    expect(css).toContain('@keyframes plan-dot-pulse')
  })

  test('styles delegated agent records with expandable output blocks', () => {
    const cardRule = css.match(/\.agent-delegation-card\s*\{ display[^}]+\}/)?.[0] ?? ''
    const typeRule = css.match(/\.agent-delegation-type\s*\{[^}]+\}/)?.[0] ?? ''
    const blockRule = css.match(/\.agent-delegation-block p\s*\{[^}]+\}/)?.[0] ?? ''

    expect(css).toContain('.agent-delegation-list')
    expect(cardRule).toContain('rgba(28,24,23')
    expect(typeRule).toContain('border-radius: 999px')
    expect(blockRule).toContain('white-space: pre-wrap')
    expect(blockRule).toContain('max-height: 180px')
  })

  test('styles local artifact cards and right workspace preview', () => {
    const cardRule = css.match(/\.local-artifact-card\s*\{[^}]+\}/)?.[0] ?? ''
    const actionRule = css.match(/\.local-artifact-card-actions\s*\{[^}]+\}/)?.[0] ?? ''
    const buttonRule = css.match(/\.local-artifact-card-actions button\s*\{[^}]+\}/)?.[0] ?? ''

    expect(css).toContain('.local-artifact-card')
    expect(cardRule).toContain('background:')
    expect(cardRule).not.toContain('background: #fff')
    expect(cardRule).toContain('border:')
    expect(actionRule).toContain('background:')
    expect(buttonRule).toContain('border:')
    expect(buttonRule).not.toContain('background: #303238')
    expect(css).toContain('.local-artifacts-panel')
    expect(css).toContain('.local-artifact-preview')
    expect(css).toContain('.local-artifact-frame')
    expect(css).toContain('min-height: 640px')
    expect(css).toContain('.local-artifacts-full-preview')
    expect(css).toContain('.message-html-preview')
    expect(css).toContain('min-height: 520px')
  })

  test('styles the local scheduled tasks center like other desktop centers', () => {
    expect(css).toContain('.scheduled-tasks-shell')
    expect(css).toContain('.scheduled-task-card')
    expect(css).toContain('.scheduled-task-empty')
  })

  test('uses the rounded rich composer and warmer global font stack', () => {
    const rootRule = css.match(/:root\s*\{[^}]+\}/)?.[0] ?? ''
    const shellRule = css.match(/\.composer-shell\s*\{[^}]+\}/)?.[0] ?? ''
    const composerRule = css.match(/\.composer\s*\{[^}]+\}/)?.[0] ?? ''

    expect(rootRule).toContain('"Segoe UI"')
    expect(rootRule).toContain('"Microsoft YaHei UI"')
    expect(shellRule).toContain('width: min(962px')
    expect(shellRule).toContain('background: transparent')
    expect(composerRule).toContain('border-radius: 14px')
    expect(composerRule).toContain('overflow: visible')
    expect(composerRule).toContain('background: #2b2b2b')
    expect(css).toContain('.composer-presets')
    expect(css).toContain('.composer-shell .composer-presets { display: none; }')
    expect(css).toContain('.composer-toolbar')
    expect(css).toContain('.composer-mode-picker')
    expect(css).toContain('.composer-approval-trigger')
    expect(css).toContain('.composer-approval-menu')
    expect(css).toContain('.composer-disclaimer')
    expect(css).toContain('max-height: 320px')
    expect(css).toContain('.composer-skill-menu')
    expect(css).toContain('.composer-skill-search')
    expect(css).toContain('.composer-selected-skills')
    expect(css).toContain('.composer-skill-list button.is-selected')
    expect(css).toContain('.composer-skill-import')
    expect(css).toContain('.composer-mcp-menu')
    expect(css).toContain('.composer-mcp-search')
    expect(css).toContain('.composer-mcp-manage')
  })

  test('styles the skill import dialog and dropzone', () => {
    const overlayRule = css.match(/\.skill-import-overlay\s*\{[^}]+\}/)?.[0] ?? ''
    const dialogRule = css.match(/\.skill-import-dialog\s*\{[^}]+\}/)?.[0] ?? ''
    const dropzoneRule = css.match(/\.skill-import-dropzone\s*\{[^}]+\}/)?.[0] ?? ''

    expect(overlayRule).toContain('position: fixed')
    expect(overlayRule).toContain('place-items: center')
    expect(dialogRule).toContain('width: min(460px')
    expect(dropzoneRule).toContain('border: 1px dashed')
    expect(css).toContain('.skill-import-pickers')
    expect(css).toContain('.skill-import-requirements')
  })

  test('styles the Channel Weixin settings panel', () => {
    expect(css).toContain('.channel-settings')
    expect(css).toContain('.channel-hero')
    expect(css).toContain('.channel-status.connected')
    expect(css).toContain('.channel-actions')
    expect(css).toContain('.channel-login-status')
    expect(css).toContain('.channel-qr img')
    expect(css).toContain('.channel-facts')
    expect(css).toContain('.channel-steps')
  })
})
