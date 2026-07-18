import { describe, expect, test } from 'bun:test'
import { JsonLineDecoder, encodeJsonLine } from '../electron/json-lines.js'

describe('JsonLineDecoder', () => {
  test('decodes a line split across chunks', () => {
    const decoder = new JsonLineDecoder()
    expect(decoder.push('{"type":"core.')).toEqual([])
    expect(decoder.push('ready"}\n')).toEqual([{ type: 'core.ready' }])
  })

  test('decodes multiple lines in order', () => {
    const decoder = new JsonLineDecoder()
    expect(decoder.push('{"value":1}\n{"value":2}\n')).toEqual([
      { value: 1 },
      { value: 2 },
    ])
  })

  test('reports malformed json with the line number', () => {
    const decoder = new JsonLineDecoder()
    expect(() => decoder.push('{bad}\n')).toThrow('line 1')
  })
})

describe('encodeJsonLine', () => {
  test('encodes exactly one newline-terminated value', () => {
    expect(encodeJsonLine({ command: 'ping' })).toBe('{"command":"ping"}\n')
  })
})
