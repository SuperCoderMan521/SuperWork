import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { DesktopModelConfig, DesktopPerformanceRange, DesktopPerformanceSnapshot, DesktopTokenUsage } from '../shared/protocol.js'
import { addUsage, EMPTY_DESKTOP_USAGE, tokenUsage, usageCostUsd } from './turn-usage.js'

type RecordValue = Record<string, unknown>
export type PerformanceTranscript = { sessionId: string; records: unknown[]; skippedLines?: number }
type AggregateOptions = { now?: number; modelConfig?: DesktopModelConfig; debug?: DesktopPerformanceSnapshot['diagnostics']; scannedLines?: number; skippedLines?: number; truncated?: boolean }

const object = (value: unknown): RecordValue | null => typeof value === 'object' && value !== null ? value as RecordValue : null
const timestamp = (value: unknown): number | null => {
  const result = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isFinite(result) && result >= 0 ? result : null
}
const usageFromRecord = (record: RecordValue): DesktopTokenUsage => {
  const message = object(record.message)
  return tokenUsage(message?.usage ?? record.usage)
}
const totalTokens = (usage: DesktopTokenUsage) => usage.inputTokens + usage.outputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens
const contentBlocks = (record: RecordValue): RecordValue[] => {
  const message = object(record.message)
  const content = message?.content ?? record.content
  return Array.isArray(content) ? content.map(object).filter((item): item is RecordValue => item !== null) : []
}
const cutoffFor = (range: DesktopPerformanceRange, now: number) => range === 'all' ? 0 : now - (range === '7d' ? 7 : 30) * 86_400_000
const bucketFor = (time: number, range: DesktopPerformanceRange) => range === 'all' ? new Date(time).toISOString().slice(0, 7) : new Date(time).toISOString().slice(0, 10)

export function aggregatePerformanceRecords(
  cwd: string,
  range: DesktopPerformanceRange,
  transcripts: PerformanceTranscript[],
  options: AggregateOptions = {},
): DesktopPerformanceSnapshot {
  const now = options.now ?? Date.now()
  const cutoff = cutoffFor(range, now)
  let tokens = { ...EMPTY_DESKTOP_USAGE }
  let turns = 0, messages = 0, apiCalls = 0, failedTurns = 0, interruptedTurns = 0, wallClockMs = 0, apiDurationMs = 0
  const modelMap = new Map<string, { tokens: DesktopTokenUsage; apiCalls: number }>()
  const toolMap = new Map<string, { calls: number; completed: number; failed: number; durations: number[] }>()
  const trendMap = new Map<string, { tokens: number; wallClockMs: number; sessions: Set<string>; failures: number }>()
  let sessions = 0
  for (const transcript of transcripts) {
    const records = transcript.records.map(object).filter((item): item is RecordValue => item !== null)
      .filter(item => (timestamp(item.timestamp) ?? now) >= cutoff)
    if (!records.length) continue
    sessions++
    const times = records.map(item => timestamp(item.timestamp)).filter((item): item is number => item !== null)
    const first = times.length ? Math.min(...times) : now
    const last = times.length ? Math.max(...times) : first
    const sessionWall = Math.max(0, last - first)
    wallClockMs += sessionWall
    const sessionBucket = bucketFor(last, range)
    const trend = trendMap.get(sessionBucket) ?? { tokens: 0, wallClockMs: 0, sessions: new Set<string>(), failures: 0 }
    trend.wallClockMs += sessionWall; trend.sessions.add(transcript.sessionId); trendMap.set(sessionBucket, trend)
    const pendingTools = new Map<string, { name: string; time: number | null }>()
    for (const record of records) {
      messages++
      const blocks = contentBlocks(record)
      if (record.type === 'user' && !blocks.some(block => block.type === 'tool_result') && record.isMeta !== true) turns++
      const usage = usageFromRecord(record)
      if (totalTokens(usage) > 0) {
        tokens = addUsage(tokens, usage); apiCalls++
        const message = object(record.message)
        const model = typeof message?.model === 'string' ? message.model : typeof record.model === 'string' ? record.model : 'unknown'
        const current = modelMap.get(model) ?? { tokens: { ...EMPTY_DESKTOP_USAGE }, apiCalls: 0 }
        current.tokens = addUsage(current.tokens, usage); current.apiCalls++; modelMap.set(model, current)
        trend.tokens += totalTokens(usage)
      }
      const recordTime = timestamp(record.timestamp)
      for (const block of blocks) {
        if (block.type === 'tool_use' && typeof block.name === 'string') {
          const current = toolMap.get(block.name) ?? { calls: 0, completed: 0, failed: 0, durations: [] }
          current.calls++; toolMap.set(block.name, current)
          if (typeof block.id === 'string') pendingTools.set(block.id, { name: block.name, time: recordTime })
        } else if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
          const pending = pendingTools.get(block.tool_use_id)
          if (!pending) continue
          const current = toolMap.get(pending.name)!
          const failed = block.is_error === true
          if (failed) current.failed++; else current.completed++
          if (pending.time !== null && recordTime !== null) current.durations.push(Math.max(0, recordTime - pending.time))
          pendingTools.delete(block.tool_use_id)
        }
      }
      if (record.is_error === true || record.subtype === 'error_during_execution') { failedTurns++; trend.failures++ }
      if (record.subtype === 'interrupted' || record.stop_reason === 'interrupted') interruptedTurns++
      if (typeof record.duration_api_ms === 'number' && record.duration_api_ms >= 0) apiDurationMs += record.duration_api_ms
    }
  }
  const promptTokens = tokens.inputTokens + tokens.cacheCreationInputTokens + tokens.cacheReadInputTokens
  const configModel = options.modelConfig?.model
  const models = [...modelMap.entries()].map(([model, value]) => ({
    model, tokens: value.tokens, apiCalls: value.apiCalls,
    estimatedCostUsd: configModel && model.includes(configModel) ? usageCostUsd(value.tokens, options.modelConfig?.pricing) : undefined,
  })).sort((a, b) => totalTokens(b.tokens) - totalTokens(a.tokens))
  const pricedTokens = models.filter(model => model.estimatedCostUsd !== undefined).reduce((sum, model) => sum + totalTokens(model.tokens), 0)
  const estimatedCostUsd = models.some(model => model.estimatedCostUsd !== undefined) ? models.reduce((sum, model) => sum + (model.estimatedCostUsd ?? 0), 0) : undefined
  return {
    cwd, range, generatedAt: now, scannedSessions: transcripts.length,
    scannedLines: options.scannedLines ?? transcripts.reduce((sum, item) => sum + item.records.length, 0),
    skippedLines: options.skippedLines ?? transcripts.reduce((sum, item) => sum + (item.skippedLines ?? 0), 0),
    truncated: options.truncated ?? false,
    summary: { sessions, turns, messages, apiCalls, tokens, cacheHitRate: promptTokens ? tokens.cacheReadInputTokens / promptTokens : undefined, estimatedCostUsd, pricedTokenShare: totalTokens(tokens) ? pricedTokens / totalTokens(tokens) : 0, wallClockMs, apiDurationMs: apiDurationMs || undefined, failedTurns, interruptedTurns },
    trend: [...trendMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([bucket, value]) => ({ bucket, tokens: value.tokens, wallClockMs: value.wallClockMs, sessions: value.sessions.size, failures: value.failures })),
    models,
    tools: [...toolMap.entries()].map(([name, value]) => ({ name, calls: value.calls, completed: value.completed, failed: value.failed, averageDurationMs: value.durations.length ? value.durations.reduce((a, b) => a + b, 0) / value.durations.length : undefined })).sort((a, b) => b.calls - a.calls),
    diagnostics: options.debug ?? { debugLogAvailable: false, langfuseConfigured: Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY) },
    warnings: [...((options.truncated ?? false) ? ['扫描达到安全上限，结果为部分数据。'] : []), ...((options.skippedLines ?? 0) > 0 ? [`已跳过 ${options.skippedLines} 行无效记录。`] : []), ...(estimatedCostUsd === undefined && totalTokens(tokens) > 0 ? ['模型价格未配置，无法估算费用。'] : [])],
  }
}

export class DesktopPerformanceService {
  private readonly cache = new Map<string, { expires: number; value: DesktopPerformanceSnapshot }>()
  constructor(private readonly projectDirForCwd: (cwd: string) => string, private readonly getModelConfig: (cwd: string) => Promise<DesktopModelConfig | undefined>, private readonly now = Date.now) {}

  async snapshot(cwd: string, range: DesktopPerformanceRange, force = false): Promise<DesktopPerformanceSnapshot> {
    const key = `${cwd}\0${range}`
    const cached = this.cache.get(key)
    if (!force && cached && cached.expires > this.now()) return cached.value
    const dir = this.projectDirForCwd(cwd)
    const names = (await readdir(dir).catch(() => [])).filter(name => name.endsWith('.jsonl')).slice(-500)
    let scannedLines = 0, skippedLines = 0, truncated = false
    const transcripts: PerformanceTranscript[] = []
    for (const name of names) {
      const lines = (await readFile(join(dir, name), 'utf8')).split(/\r?\n/).filter(Boolean)
      const selected = lines.length > 20_000 ? lines.slice(-20_000) : lines
      if (lines.length > selected.length) truncated = true
      const records: unknown[] = []
      for (const line of selected) {
        if (scannedLines >= 250_000) { truncated = true; break }
        scannedLines++
        try { records.push(JSON.parse(line)) } catch { skippedLines++ }
      }
      transcripts.push({ sessionId: name.slice(0, -6), records })
      if (scannedLines >= 250_000) break
    }
    const debugPath = join(process.env.CLAUDE_CONFIG_DIR || join(process.env.USERPROFILE || '', '.claude'), 'debug', 'latest')
    const debugStat = await stat(debugPath).catch(() => null)
    const value = aggregatePerformanceRecords(cwd, range, transcripts, { now: this.now(), modelConfig: await this.getModelConfig(cwd), scannedLines, skippedLines, truncated, debug: { debugLogAvailable: Boolean(debugStat), debugLogPath: debugStat ? debugPath : undefined, debugLogUpdatedAt: debugStat?.mtimeMs, debugLogSizeBytes: debugStat?.size, langfuseConfigured: Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY) } })
    this.cache.set(key, { expires: this.now() + 30_000, value })
    return value
  }
}
