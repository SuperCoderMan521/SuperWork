import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { extractPathCandidates, looksLikeFilePath } from '../shared/file-paths.js'
import type {
  DesktopConfigItem,
  DesktopConfigSnapshot,
  DesktopFileEntry,
  DesktopMemoryFile,
  DesktopModelConfig,
  DesktopToolCall,
} from '../shared/protocol.js'

function claudeHome(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
}

function desktopConfigPrimaryPath(cwd: string): string {
  return join(cwd, '.claudecode', 'setting.json')
}

function desktopConfigLegacyPaths(cwd: string): string[] {
  return [
    join(cwd, '.claude', 'settings.local.json'),
    join(cwd, '.claude', 'settings.json'),
  ]
}

function modelConfigFromSettings(settings: Record<string, unknown>): DesktopModelConfig {
  const desktop = settings.desktop
  const stored = desktop && typeof desktop === 'object'
    ? (desktop as Record<string, unknown>).modelConfig
    : undefined
  const record = stored && typeof stored === 'object' ? stored as Record<string, unknown> : {}
  const env = settings.env && typeof settings.env === 'object'
    ? settings.env as Record<string, unknown>
    : {}
  const provider = typeof record.provider === 'string'
    ? record.provider
    : typeof settings.modelType === 'string'
      ? settings.modelType
      : env.CLAUDE_CODE_USE_OPENAI ? 'openai'
        : env.CLAUDE_CODE_USE_GEMINI ? 'gemini'
          : env.CLAUDE_CODE_USE_GROK ? 'grok' : 'anthropic'
  const prefix = provider.toLowerCase()
  const envValue = (...keys: string[]) => keys.map(key => env[key]).find(value => typeof value === 'string') as string | undefined
  return {
    provider,
    baseUrl: typeof record.baseUrl === 'string' ? record.baseUrl : envValue(
      prefix === 'openai' ? 'OPENAI_BASE_URL' : prefix === 'gemini' ? 'GEMINI_BASE_URL' : prefix === 'grok' ? 'GROK_BASE_URL' : 'ANTHROPIC_BASE_URL',
    ),
    token: typeof record.token === 'string' ? record.token : envValue(
      prefix === 'openai' ? 'OPENAI_API_KEY' : prefix === 'gemini' ? 'GEMINI_API_KEY' : prefix === 'grok' ? 'GROK_API_KEY' : 'ANTHROPIC_AUTH_TOKEN',
      'ANTHROPIC_API_KEY',
    ),
    model: typeof record.model === 'string' ? record.model : typeof settings.model === 'string' ? settings.model : envValue(
      prefix === 'openai' ? 'OPENAI_MODEL' : prefix === 'gemini' ? 'GEMINI_MODEL' : prefix === 'grok' ? 'GROK_MODEL' : 'ANTHROPIC_MODEL',
    ),
  }
}

function uniqueByPath(entries: DesktopFileEntry[]): DesktopFileEntry[] {
  const seen = new Set<string>()
  return entries.filter(entry => {
    const key = entry.path.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function stringFromInput(input: unknown, key: string): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined
  const value = (input as Record<string, unknown>)[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function extractFileEntriesFromTools(
  tools: DesktopToolCall[],
): DesktopFileEntry[] {
  const entries: DesktopFileEntry[] = []
  for (const tool of tools) {
    const directPath =
      stringFromInput(tool.input, 'file_path') ||
      stringFromInput(tool.input, 'path')
    if (directPath && looksLikeFilePath(directPath)) {
      entries.push({
        id: `tool:${tool.id}:input`,
        path: directPath,
        label: basename(directPath),
        source: 'tool',
      })
    }
    for (const text of [tool.summary, tool.output ?? '']) {
      for (const match of extractPathCandidates(text)) {
        if (!looksLikeFilePath(match)) continue
        entries.push({
          id: `tool:${tool.id}:${match}`,
          path: match,
          label: basename(match),
          source: 'tool',
        })
      }
    }
  }
  return uniqueByPath(entries)
}

export function compactMemoryContent(content: string): string {
  const lines = content
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter((line, index, all) => line.trim() || all[index - 1]?.trim())
  const important = lines.filter(line =>
    line.startsWith('#') ||
    line.startsWith('- ') ||
    line.startsWith('* ') ||
    /^\d+\.\s/.test(line),
  )
  const body = important.length >= 2 ? important : lines
  const compacted = body.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return compacted.length > 12_000
    ? `${compacted.slice(0, 12_000).trim()}\n\n<!-- compacted: truncated -->`
    : compacted
}

async function listDirectoryItems(
  directory: string,
  description: string,
): Promise<DesktopConfigItem[]> {
  try {
    const items = await readdir(directory, { withFileTypes: true })
    return items
      .filter(item => item.isDirectory() || item.isFile())
      .slice(0, 100)
      .map(item => ({
        id: join(directory, item.name),
        name: item.name,
        description,
        enabled: true,
        path: join(directory, item.name),
      }))
  } catch {
    return []
  }
}

async function listExistingDirectoryItems(
  directories: Array<{ path: string; description: string }>,
): Promise<DesktopConfigItem[]> {
  const nested = await Promise.all(
    directories.map(directory =>
      listDirectoryItems(directory.path, directory.description),
    ),
  )
  return nested.flat()
}

async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function writeJsonObject(path: string, value: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function cleanModelConfig(modelConfig: DesktopModelConfig): DesktopModelConfig {
  const trimmed: DesktopModelConfig = {}
  for (const key of ['provider', 'baseUrl', 'token', 'model'] as const) {
    const value = modelConfig[key]?.trim()
    if (value) trimmed[key] = value
  }
  return trimmed
}

function deleteKeys(target: Record<string, unknown>, keys: string[]): void {
  for (const key of keys) delete target[key]
}

function applyModelConfigToClaudeSettings(
  settings: Record<string, unknown>,
  modelConfig: DesktopModelConfig,
): void {
  const env =
    typeof settings.env === 'object' && settings.env !== null
      ? { ...(settings.env as Record<string, unknown>) }
      : {}
  const provider = modelConfig.provider?.toLowerCase()

  deleteKeys(env, [
    'CLAUDE_CODE_USE_OPENAI',
    'CLAUDE_CODE_USE_GEMINI',
    'CLAUDE_CODE_USE_GROK',
    'OPENAI_BASE_URL',
    'OPENAI_API_KEY',
    'OPENAI_MODEL',
    'GEMINI_BASE_URL',
    'GEMINI_API_KEY',
    'GEMINI_MODEL',
    'GROK_BASE_URL',
    'GROK_API_KEY',
    'XAI_API_KEY',
    'GROK_MODEL',
    'ANTHROPIC_BASE_URL',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'CLAUDE_CODE_OAUTH_TOKEN',
    'ANTHROPIC_MODEL',
  ])

  if (provider === 'openai') {
    settings.modelType = 'openai'
    env.CLAUDE_CODE_USE_OPENAI = '1'
    if (modelConfig.baseUrl) env.OPENAI_BASE_URL = modelConfig.baseUrl
    if (modelConfig.token) env.OPENAI_API_KEY = modelConfig.token
    if (modelConfig.model) env.OPENAI_MODEL = modelConfig.model
  } else if (provider === 'gemini') {
    settings.modelType = 'gemini'
    env.CLAUDE_CODE_USE_GEMINI = '1'
    if (modelConfig.baseUrl) env.GEMINI_BASE_URL = modelConfig.baseUrl
    if (modelConfig.token) env.GEMINI_API_KEY = modelConfig.token
    if (modelConfig.model) env.GEMINI_MODEL = modelConfig.model
  } else if (provider === 'grok') {
    settings.modelType = 'grok'
    env.CLAUDE_CODE_USE_GROK = '1'
    if (modelConfig.baseUrl) env.GROK_BASE_URL = modelConfig.baseUrl
    if (modelConfig.token) env.GROK_API_KEY = modelConfig.token
    if (modelConfig.model) env.GROK_MODEL = modelConfig.model
  } else if (provider === 'anthropic' || !provider) {
    delete settings.modelType
    if (modelConfig.baseUrl) env.ANTHROPIC_BASE_URL = modelConfig.baseUrl
    if (modelConfig.token) {
      env.ANTHROPIC_API_KEY = modelConfig.token
      env.ANTHROPIC_AUTH_TOKEN = modelConfig.token
    }
    if (modelConfig.model) env.ANTHROPIC_MODEL = modelConfig.model
  } else {
    settings.modelType = provider
  }

  if (modelConfig.model) {
    settings.model = modelConfig.model
  } else {
    delete settings.model
  }
  settings.env = env
}

async function discoverMcpServers(cwd: string): Promise<DesktopConfigItem[]> {
  const files = [
    join(cwd, '.claudecode', 'setting.json'),
    join(cwd, '.claudecode', 'settings.json'),
    join(cwd, '.mcp.json'),
    join(cwd, '.claude', 'settings.json'),
    join(cwd, '.claude', 'settings.local.json'),
    join(claudeHome(), 'settings.json'),
  ]
  const servers: DesktopConfigItem[] = []
  for (const file of files) {
    const json = await readJsonObject(file)
    const mcpServers = json.mcpServers
    if (typeof mcpServers !== 'object' || mcpServers === null) continue
    for (const name of Object.keys(mcpServers)) {
      servers.push({
        id: `${file}:${name}`,
        name,
        description: file,
        enabled: true,
        path: file,
      })
    }
  }
  return servers
}

export function memoryFilesForCwd(cwd: string): DesktopMemoryFile[] {
  const files: DesktopMemoryFile[] = [
    {
      id: 'project-root',
      label: 'Project CLAUDE.md',
      path: join(cwd, 'CLAUDE.md'),
      scope: 'project',
      exists: existsSync(join(cwd, 'CLAUDE.md')),
    },
    {
      id: 'project-dot-claude',
      label: '.claude/CLAUDE.md',
      path: join(cwd, '.claude', 'CLAUDE.md'),
      scope: 'project',
      exists: existsSync(join(cwd, '.claude', 'CLAUDE.md')),
    },
    {
      id: 'user-claude',
      label: 'User CLAUDE.md',
      path: join(claudeHome(), 'CLAUDE.md'),
      scope: 'user',
      exists: existsSync(join(claudeHome(), 'CLAUDE.md')),
    },
    {
      id: 'auto-memory',
      label: 'Auto MEMORY.md',
      path: join(claudeHome(), 'memory', 'MEMORY.md'),
      scope: 'auto',
      exists: existsSync(join(claudeHome(), 'memory', 'MEMORY.md')),
    },
  ]
  return files
}

export class DesktopConfigService {
  async snapshot(cwd: string): Promise<DesktopConfigSnapshot> {
    const [skills, mcpServers, plugins, modelConfig] = await Promise.all([
      listExistingDirectoryItems([
        { path: join(cwd, '.agents', 'skills'), description: 'Project skill' },
        { path: join(cwd, '.claude', 'skills'), description: 'Project Claude skill' },
        { path: join(cwd, '.claudecode', 'skills'), description: 'Project ClaudeCode skill' },
        { path: join(cwd, '.codex', 'skills'), description: 'Project Codex skill' },
        { path: join(claudeHome(), 'skills'), description: 'User Claude skill' },
        { path: join(claudeHome(), '..', '.codex', 'skills'), description: 'User Codex skill' },
      ]),
      discoverMcpServers(cwd),
      listExistingDirectoryItems([
        { path: join(cwd, '.claudecode', 'plugins'), description: 'Project plugin' },
        { path: join(cwd, '.claudecode', 'skills'), description: 'Project skill' },
        { path: join(claudeHome(), 'plugins'), description: 'Claude Code plugin' },
        { path: join(claudeHome(), '..', '.codex', 'plugins'), description: 'Codex plugin' },
      ]),
      this.readModelConfig(cwd),
    ])
    return {
      cwd,
      skills,
      mcpServers,
      plugins,
      memoryFiles: memoryFilesForCwd(cwd),
      modelConfig,
    }
  }

  async writeConfig(
    cwd: string,
    modelConfig: DesktopModelConfig,
  ): Promise<DesktopConfigSnapshot> {
    const settingsPath = desktopConfigPrimaryPath(cwd)
    const settings = await readJsonObject(settingsPath)
    const cleanedModelConfig = cleanModelConfig(modelConfig)
    const desktop = typeof settings.desktop === 'object' && settings.desktop !== null
      ? (settings.desktop as Record<string, unknown>)
      : {}
    settings.desktop = {
      ...desktop,
      modelConfig: cleanedModelConfig,
    }
    applyModelConfigToClaudeSettings(settings, cleanedModelConfig)
    await writeJsonObject(settingsPath, settings)
    for (const legacyPath of desktopConfigLegacyPaths(cwd)) {
      await writeJsonObject(legacyPath, settings)
    }
    return this.snapshot(cwd)
  }

  private async readModelConfig(cwd: string): Promise<DesktopModelConfig> {
    const settingsPaths = [
      desktopConfigPrimaryPath(cwd),
      ...desktopConfigLegacyPaths(cwd),
      join(claudeHome(), 'settings.json'),
      join(claudeHome(), 'settings.local.json'),
    ]
    let settings: Record<string, unknown> = {}
    for (const settingsPath of settingsPaths) {
      const loaded = await readJsonObject(settingsPath)
      if (Object.keys(loaded).length > 0) settings = { ...settings, ...loaded, env: {
        ...(settings.env && typeof settings.env === 'object' ? settings.env : {}),
        ...(loaded.env && typeof loaded.env === 'object' ? loaded.env : {}),
      } }
    }
    return modelConfigFromSettings(settings)
  }

  async readFile(path: string, cwd = process.cwd()): Promise<string> {
    const resolved = isAbsolute(path) ? path : resolve(cwd, path)
    return readFile(resolved, 'utf8')
  }

  async writeFile(path: string, content: string, cwd = process.cwd()): Promise<string> {
    const resolved = isAbsolute(path) ? path : resolve(cwd, path)
    await mkdir(dirname(resolved), { recursive: true })
    if (existsSync(resolved)) {
      await writeFile(`${resolved}.bak`, await readFile(resolved, 'utf8'))
    }
    await writeFile(resolved, content, 'utf8')
    return content
  }

  async readMemory(path: string): Promise<DesktopMemoryFile & { content: string }> {
    const content = await readFile(path, 'utf8').catch(() => '')
    return this.memoryFileFromPath(path, content)
  }

  async writeMemory(
    path: string,
    content: string,
  ): Promise<DesktopMemoryFile & { content: string }> {
    await mkdir(dirname(path), { recursive: true })
    if (existsSync(path)) {
      await writeFile(`${path}.bak`, await readFile(path, 'utf8'))
    }
    await writeFile(path, content, 'utf8')
    return this.memoryFileFromPath(path, content)
  }

  async compactMemory(
    path: string,
    content: string,
  ): Promise<{
    file: DesktopMemoryFile & { content: string }
    originalCharacters: number
    compactedCharacters: number
  }> {
    const compacted = compactMemoryContent(content)
    return {
      file: this.memoryFileFromPath(path, compacted),
      originalCharacters: content.length,
      compactedCharacters: compacted.length,
    }
  }

  private memoryFileFromPath(
    path: string,
    content: string,
  ): DesktopMemoryFile & { content: string } {
    return {
      id: path,
      label: basename(path),
      path,
      scope: path.includes(claudeHome()) ? 'user' : 'project',
      exists: existsSync(path),
      content,
    }
  }
}
