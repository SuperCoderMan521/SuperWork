import { describe, expect, test } from 'bun:test'
import config from '../vite.config.js'

describe('desktop Vite config', () => {
  test('uses relative assets for Electron file loading', () => {
    expect(config).toBeObject()
    expect('base' in config && config.base).toBe('./')
  })
})
