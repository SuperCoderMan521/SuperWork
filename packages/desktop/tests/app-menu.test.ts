import { describe, expect, test } from 'bun:test'
import { createApplicationMenuTemplate } from '../electron/app-menu.js'

describe('createApplicationMenuTemplate', () => {
  test('places Claude Code configuration under the File menu', () => {
    const template = createApplicationMenuTemplate({
      openSettings: () => {},
      quit: () => {},
      platform: 'win32',
    })

    expect(template[0]?.label).toBe('File')
    expect(JSON.stringify(template)).toContain('Claude Code 配置')
    expect(JSON.stringify(template)).toContain('CommandOrControl+,')
  })

  test('keeps standard edit roles so text fields support paste', () => {
    const template = createApplicationMenuTemplate({
      openSettings: () => {},
      quit: () => {},
      platform: 'win32',
    })

    expect(JSON.stringify(template)).toContain('"role":"paste"')
    expect(JSON.stringify(template)).toContain('"role":"copy"')
    expect(JSON.stringify(template)).toContain('"role":"cut"')
    expect(JSON.stringify(template)).toContain('"role":"selectAll"')
  })
})
