import { describe, expect, test } from 'bun:test'
import { aggregatePerformanceRecords } from '../core/performance-service.js'

describe('aggregatePerformanceRecords', () => {
  test('aggregates workspace usage, tools, failures and trends without message content', () => {
    const snapshot = aggregatePerformanceRecords('G:/project', '30d', [{ sessionId: 's1', records: [
      { type: 'user', timestamp: '2026-07-19T10:00:00Z', message: { content: 'secret prompt' } },
      { type: 'assistant', timestamp: '2026-07-19T10:00:01Z', message: { model: 'sonnet', usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 20 }, content: [{ type: 'tool_use', id: 't1', name: 'Read' }] } },
      { type: 'user', timestamp: '2026-07-19T10:00:03Z', message: { content: [{ type: 'tool_result', tool_use_id: 't1' }] } },
      { type: 'result', timestamp: '2026-07-19T10:00:04Z', is_error: true },
    ] }], { now: Date.parse('2026-07-20T00:00:00Z') })

    expect(snapshot.summary).toMatchObject({ sessions: 1, turns: 1, messages: 4, apiCalls: 1, failedTurns: 1, wallClockMs: 4000 })
    expect(snapshot.summary.tokens).toEqual({ inputTokens: 10, outputTokens: 5, cacheCreationInputTokens: 0, cacheReadInputTokens: 20 })
    expect(snapshot.summary.cacheHitRate).toBe(20 / 30)
    expect(snapshot.tools[0]).toMatchObject({ name: 'Read', calls: 1, completed: 1, averageDurationMs: 2000 })
    expect(snapshot.trend[0]?.bucket).toBe('2026-07-19')
    expect(JSON.stringify(snapshot)).not.toContain('secret prompt')
  })
})
