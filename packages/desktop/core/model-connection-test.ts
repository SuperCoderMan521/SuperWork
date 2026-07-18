import type {
  DesktopModelConfig,
  DesktopModelConnectionResult,
} from '../shared/protocol.js'

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

const DEFAULT_TIMEOUT_MS = 15_000

function trim(value: string | undefined): string {
  return value?.trim() ?? ''
}

function providerFromConfig(modelConfig: DesktopModelConfig): string {
  return trim(modelConfig.provider).toLowerCase() || 'anthropic'
}

function joinEndpoint(baseUrl: string, suffix: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, '')
  const normalizedSuffix = suffix.replace(/^\/+/, '')
  return `${normalizedBase}/${normalizedSuffix}`
}

function compactErrorMessage(text: string, token: string): string {
  const compact = text.replace(/\s+/g, ' ').trim().slice(0, 240)
  return token ? compact.split(token).join('[redacted]') : compact
}

async function responseMessage(response: Response, token: string): Promise<string> {
  const text = await response.text().catch(() => '')
  const detail = compactErrorMessage(text, token)
  return detail
    ? `连接失败：HTTP ${response.status} ${detail}`
    : `连接失败：HTTP ${response.status}`
}

function requestForConfig(
  modelConfig: DesktopModelConfig,
): { provider: string; url: string; init: RequestInit } | { provider: string; error: string } {
  const provider = providerFromConfig(modelConfig)
  const baseUrl = trim(modelConfig.baseUrl)
  const token = trim(modelConfig.token)
  const model = trim(modelConfig.model)

  if (!baseUrl) return { provider, error: 'Base URL 不能为空' }
  if (!model) return { provider, error: 'MODEL 不能为空' }

  if (provider === 'openai' || provider === 'grok') {
    return {
      provider,
      url: joinEndpoint(baseUrl, 'chat/completions'),
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          stream: false,
        }),
      },
    }
  }

  if (provider === 'gemini') {
    const url = joinEndpoint(baseUrl, `models/${encodeURIComponent(model)}:generateContent`)
    return {
      provider,
      url: token ? `${url}?key=${encodeURIComponent(token)}` : url,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'ping' }] }],
          generationConfig: { maxOutputTokens: 1 },
        }),
      },
    }
  }

  return {
    provider,
    url: joinEndpoint(baseUrl, 'v1/messages'),
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        ...(token
          ? { Authorization: `Bearer ${token}`, 'x-api-key': token }
          : {}),
      },
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    },
  }
}

export async function testModelConnection(
  modelConfig: DesktopModelConfig,
  fetchImpl: FetchLike = fetch,
  startTime: () => number = Date.now,
  endTime: () => number = Date.now,
): Promise<DesktopModelConnectionResult> {
  const request = requestForConfig(modelConfig)
  const model = trim(modelConfig.model) || undefined
  if ('error' in request) {
    return {
      ok: false,
      provider: request.provider,
      model,
      latencyMs: 0,
      message: request.error,
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  const startedAt = startTime()
  try {
    const response = await fetchImpl(request.url, {
      ...request.init,
      signal: controller.signal,
    })
    const latencyMs = Math.max(0, endTime() - startedAt)
    if (response.ok) {
      return {
        ok: true,
        provider: request.provider,
        model,
        status: response.status,
        latencyMs,
        message: '连接成功',
      }
    }
    return {
      ok: false,
      provider: request.provider,
      model,
      status: response.status,
      latencyMs,
      message: await responseMessage(response, trim(modelConfig.token)),
    }
  } catch (error) {
    const latencyMs = Math.max(0, endTime() - startedAt)
    return {
      ok: false,
      provider: request.provider,
      model,
      latencyMs,
      message:
        error instanceof Error && error.name === 'AbortError'
          ? `连接超时：${DEFAULT_TIMEOUT_MS / 1000}s`
          : `连接失败：${error instanceof Error ? error.message : '未知错误'}`,
    }
  } finally {
    clearTimeout(timeout)
  }
}
