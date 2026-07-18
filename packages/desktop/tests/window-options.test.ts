import { describe, expect, test } from 'bun:test'
import { createWindowOptions } from '../electron/window-options.js'

describe('createWindowOptions', () => {
  test('isolates and sandboxes the renderer', () => {
    const options = createWindowOptions('G:/desktop/preload.js')
    expect(options.webPreferences).toEqual({
      preload: 'G:/desktop/preload.js',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    })
  })
})
