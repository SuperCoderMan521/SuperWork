import type {
  DesktopModelConfig,
  DesktopModelPricing,
  DesktopTokenUsage,
} from '../shared/protocol.js'

type RecordValue = Record<string, unknown>

export const EMPTY_DESKTOP_USAGE: DesktopTokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
}

function record(value: unknown): RecordValue | null {
  return typeof value === 'object' && value !== null ? value as RecordValue : null
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

export function tokenUsage(value: unknown): DesktopTokenUsage {
  const usage = record(value)
  return {
    inputTokens: number(usage?.input_tokens),
    outputTokens: number(usage?.output_tokens),
    cacheCreationInputTokens: number(usage?.cache_creation_input_tokens),
    cacheReadInputTokens: number(usage?.cache_read_input_tokens),
  }
}

export function mergeCallUsage(
  current: DesktopTokenUsage,
  next: DesktopTokenUsage,
): DesktopTokenUsage {
  return {
    inputTokens: next.inputTokens > 0 ? next.inputTokens : current.inputTokens,
    outputTokens: next.outputTokens > 0 ? next.outputTokens : current.outputTokens,
    cacheCreationInputTokens: next.cacheCreationInputTokens > 0
      ? next.cacheCreationInputTokens
      : current.cacheCreationInputTokens,
    cacheReadInputTokens: next.cacheReadInputTokens > 0
      ? next.cacheReadInputTokens
      : current.cacheReadInputTokens,
  }
}

export function addUsage(left: DesktopTokenUsage, right: DesktopTokenUsage): DesktopTokenUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheCreationInputTokens: left.cacheCreationInputTokens + right.cacheCreationInputTokens,
    cacheReadInputTokens: left.cacheReadInputTokens + right.cacheReadInputTokens,
  }
}

export function hasUsage(usage: DesktopTokenUsage): boolean {
  return usage.inputTokens > 0 || usage.outputTokens > 0 ||
    usage.cacheCreationInputTokens > 0 || usage.cacheReadInputTokens > 0
}

export function usageCostUsd(
  usage: DesktopTokenUsage,
  pricing?: DesktopModelPricing,
): number | undefined {
  if (!pricing) return undefined
  return (
    usage.inputTokens * pricing.perMillionInputTokens +
    usage.outputTokens * pricing.perMillionOutputTokens +
    usage.cacheCreationInputTokens * pricing.perMillionCacheCreationTokens +
    usage.cacheReadInputTokens * pricing.perMillionCacheReadTokens
  ) / 1_000_000
}

export function providerAndModel(config: DesktopModelConfig | undefined, fallbackModel: string): {
  provider: string
  model: string
} {
  return {
    provider: config?.provider?.trim() || 'anthropic',
    model: config?.model?.trim() || fallbackModel,
  }
}
