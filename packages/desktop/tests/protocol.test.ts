import { describe, expect, test } from 'bun:test'
import {
  DesktopCommandSchema,
  DesktopEventSchema,
} from '../shared/schemas.js'

describe('DesktopCommandSchema', () => {
  test('accepts a prompt submission', () => {
    expect(
      DesktopCommandSchema.safeParse({
        type: 'prompt.submit',
        requestId: 'request-1',
        sessionId: 'session-1',
        text: 'Explain this project',
      }).success,
    ).toBe(true)
  })

  test('rejects an empty request id', () => {
    expect(
      DesktopCommandSchema.safeParse({
        type: 'session.list',
        requestId: '',
      }).success,
    ).toBe(false)
  })

  test('accepts model configuration writes', () => {
    expect(
      DesktopCommandSchema.safeParse({
        type: 'config.write',
        requestId: 'request-2',
        cwd: 'G:/project',
        modelConfig: {
          provider: 'openai',
          baseUrl: 'http://localhost:11434/v1',
          token: 'sk-test',
          model: 'qwen3-coder',
        },
      }).success,
    ).toBe(true)
  })

  test('accepts model connection tests', () => {
    expect(
      DesktopCommandSchema.safeParse({
        type: 'config.test',
        requestId: 'request-connection',
        cwd: 'G:/project',
        modelConfig: {
          provider: 'anthropic',
          baseUrl: 'https://api.example.test/anthropic',
          token: 'sk-test',
          model: 'deepseek-v4-flash',
        },
      }).success,
    ).toBe(true)
  })

  test('accepts workspace performance requests and rejects invalid ranges', () => {
    expect(DesktopCommandSchema.safeParse({
      type: 'performance.get', requestId: 'perf-1', cwd: 'G:/project', range: '30d', force: true,
    }).success).toBe(true)
    expect(DesktopCommandSchema.safeParse({
      type: 'performance.get', requestId: 'perf-2', cwd: 'G:/project', range: 'year',
    }).success).toBe(false)
  })
})

describe('DesktopEventSchema', () => {
  test('accepts a sequenced message delta', () => {
    expect(
      DesktopEventSchema.safeParse({
        type: 'message.delta',
        sessionId: 'session-1',
        sequence: 2,
        messageId: 'message-1',
        delta: 'hello',
      }).success,
    ).toBe(true)
  })

  test('rejects an unsupported protocol version', () => {
    expect(
      DesktopEventSchema.safeParse({
        type: 'core.ready',
        protocolVersion: 2,
      }).success,
    ).toBe(false)
  })

  test('accepts a menu request to open settings', () => {
    expect(
      DesktopEventSchema.safeParse({
        type: 'settings.opened',
      }).success,
    ).toBe(true)
  })

  test('accepts config saved events', () => {
    expect(
      DesktopEventSchema.safeParse({
        type: 'config.saved',
        requestId: 'request-2',
        config: {
          cwd: 'G:/project',
          skills: [],
          mcpServers: [],
          plugins: [],
          memoryFiles: [],
          modelConfig: {
            provider: 'openai',
            baseUrl: 'http://localhost:11434/v1',
            token: 'sk-test',
            model: 'qwen3-coder',
          },
        },
      }).success,
    ).toBe(true)
  })

  test('accepts config connection test results', () => {
    expect(
      DesktopEventSchema.safeParse({
        type: 'config.tested',
        requestId: 'request-connection',
        result: {
          ok: true,
          provider: 'anthropic',
          model: 'deepseek-v4-flash',
          status: 200,
          latencyMs: 42,
          message: '连接成功',
        },
      }).success,
    ).toBe(true)
  })

  test('accepts performance snapshots', () => {
    expect(DesktopEventSchema.safeParse({
      type: 'performance.snapshot', requestId: 'perf-1', snapshot: {
        cwd: 'G:/project', range: '30d', generatedAt: 100, scannedSessions: 1,
        scannedLines: 4, skippedLines: 0, truncated: false,
        summary: {
          sessions: 1, turns: 1, messages: 2, apiCalls: 1,
          tokens: { inputTokens: 10, outputTokens: 4, cacheCreationInputTokens: 2, cacheReadInputTokens: 20 },
          cacheHitRate: 0.625, estimatedCostUsd: 0.001, pricedTokenShare: 1,
          wallClockMs: 1000, apiDurationMs: 800, failedTurns: 0, interruptedTurns: 0,
        },
        trend: [], models: [], tools: [],
        diagnostics: { debugLogAvailable: false, langfuseConfigured: false }, warnings: [],
      },
    }).success).toBe(true)
  })
})
