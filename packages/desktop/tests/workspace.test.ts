import { describe, expect, test } from 'bun:test'
import { DESKTOP_PROTOCOL_VERSION } from '../shared/protocol.js'

describe('desktop workspace', () => {
  test('exports desktop protocol version', () => {
    expect(DESKTOP_PROTOCOL_VERSION).toBe(1)
  })
})
