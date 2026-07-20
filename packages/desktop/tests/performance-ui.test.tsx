import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { PerformanceCenter } from '../renderer/src/features/performance/PerformanceCenter.js'

test('renders workspace history performance metrics', () => {
  const html = renderToStaticMarkup(<PerformanceCenter cwd="G:/project" range="30d" loading={false} error={null} onRangeChange={() => {}} onRefresh={() => {}} onBack={() => {}} snapshot={{
    cwd: 'G:/project', range: '30d', generatedAt: 1, scannedSessions: 2, scannedLines: 20, skippedLines: 1, truncated: false,
    summary: { sessions: 2, turns: 8, messages: 30, apiCalls: 10, tokens: { inputTokens: 100, outputTokens: 50, cacheCreationInputTokens: 20, cacheReadInputTokens: 400 }, cacheHitRate: 400 / 520, estimatedCostUsd: 1.25, pricedTokenShare: 1, wallClockMs: 120000, apiDurationMs: 90000, failedTurns: 1, interruptedTurns: 2 },
    trend: [{ bucket: '2026-07-19', tokens: 570, wallClockMs: 120000, sessions: 2, failures: 1 }],
    models: [{ model: 'sonnet', tokens: { inputTokens: 100, outputTokens: 50, cacheCreationInputTokens: 20, cacheReadInputTokens: 400 }, apiCalls: 10, estimatedCostUsd: 1.25 }],
    tools: [{ name: 'Read', calls: 4, completed: 4, failed: 0, averageDurationMs: 120 }],
    diagnostics: { debugLogAvailable: true, langfuseConfigured: false }, warnings: ['已跳过 1 行无效记录。'],
  }} />)
  expect(html).toContain('性能中心')
  expect(html).toContain('570')
  expect(html).toContain('$1.2500')
  expect(html).toContain('Read')
  expect(html).toContain('缓存命中')
  expect(html).toContain('已跳过 1 行')
})
