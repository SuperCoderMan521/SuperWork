import { describe, expect, test } from 'bun:test'
import {
  addUsage,
  mergeCallUsage,
  tokenUsage,
  usageCostUsd,
} from '../core/turn-usage.js'

describe('desktop turn usage', () => {
  test('merges stream usage and sums multiple model calls', () => {
    const first = mergeCallUsage(
      tokenUsage({ input_tokens: 100, cache_read_input_tokens: 900 }),
      tokenUsage({ output_tokens: 50 }),
    )
    const total = addUsage(first, tokenUsage({
      input_tokens: 20,
      output_tokens: 10,
      cache_creation_input_tokens: 200,
    }))
    expect(total).toEqual({
      inputTokens: 120,
      outputTokens: 60,
      cacheCreationInputTokens: 200,
      cacheReadInputTokens: 900,
    })
  })

  test('calculates cost from configured per-million token prices', () => {
    expect(usageCostUsd({
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      cacheCreationInputTokens: 200_000,
      cacheReadInputTokens: 500_000,
    }, {
      currency: 'USD',
      perMillionInputTokens: 3,
      perMillionOutputTokens: 15,
      perMillionCacheCreationTokens: 3.75,
      perMillionCacheReadTokens: 0.3,
    })).toBeCloseTo(5.4)
  })
})
