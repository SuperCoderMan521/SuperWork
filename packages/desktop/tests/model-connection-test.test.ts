import { describe, expect, test } from 'bun:test'
import { testModelConnection } from '../core/model-connection-test.js'

describe('testModelConnection', () => {
  test('tests Anthropic-compatible endpoints with bearer and api-key headers', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = []
    const result = await testModelConnection(
      {
        provider: 'anthropic',
        baseUrl: 'https://api.example.test/anthropic',
        token: 'secret-token',
        model: 'deepseek-v4-flash',
      },
      async (url, init) => {
        requests.push({ url: String(url), init: init ?? {} })
        return new Response(JSON.stringify({ id: 'ok' }), { status: 200 })
      },
      () => 100,
      () => 140,
    )

    expect(result).toEqual({
      ok: true,
      provider: 'anthropic',
      model: 'deepseek-v4-flash',
      status: 200,
      latencyMs: 40,
      message: '连接成功',
    })
    expect(requests[0]?.url).toBe('https://api.example.test/anthropic/v1/messages')
    const headers = requests[0]?.init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer secret-token')
    expect(headers['x-api-key']).toBe('secret-token')
  })

  test('tests OpenAI-compatible endpoints with chat completions', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = []
    const result = await testModelConnection(
      {
        provider: 'openai',
        baseUrl: 'http://localhost:11434/v1',
        token: 'secret-token',
        model: 'qwen3-coder',
      },
      async (url, init) => {
        requests.push({ url: String(url), init: init ?? {} })
        return new Response(JSON.stringify({ id: 'ok' }), { status: 200 })
      },
      () => 10,
      () => 25,
    )

    expect(result.ok).toBe(true)
    expect(result.provider).toBe('openai')
    expect(result.latencyMs).toBe(15)
    expect(requests[0]?.url).toBe('http://localhost:11434/v1/chat/completions')
  })

  test('returns a clear failure without exposing the token', async () => {
    const result = await testModelConnection(
      {
        provider: 'anthropic',
        baseUrl: 'https://api.example.test',
        token: 'secret-token',
        model: 'bad-model',
      },
      async () =>
        new Response(JSON.stringify({ error: { message: 'invalid token secret-token' } }), {
          status: 401,
        }),
      () => 1,
      () => 2,
    )

    expect(result.ok).toBe(false)
    expect(result.status).toBe(401)
    expect(result.message).toContain('401')
    expect(result.message).not.toContain('secret-token')
  })
})
