import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { extractPathCandidates, looksLikeFilePath } from '../shared/file-paths.js'
import type {
  DesktopConfigItem,
  DesktopConfigSnapshot,
  DesktopChannelWeixinSnapshot,
  DesktopFileEntry,
  DesktopMemoryFile,
  DesktopModelConfig,
  DesktopToolCall,
} from '../shared/protocol.js'

const execFileAsync = promisify(execFile)

function claudeHome(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
}

function desktopConfigPrimaryPath(cwd: string): string {
  return join(cwd, '.claudecode', 'setting.json')
}

function userClaudeSkillsDir(): string {
  return join(claudeHome(), 'skills')
}

function weixinStateDir(): string {
  return process.env.WEIXIN_STATE_DIR || join(claudeHome(), 'channels', 'weixin')
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
    pricing: record.pricing && typeof record.pricing === 'object'
      ? record.pricing as DesktopModelConfig['pricing']
      : undefined,
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

function frontmatterValue(content: string, key: string): string | undefined {
  const frontmatter = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  const body = frontmatter?.[1]
  if (!body) return undefined
  const match = body.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm'))
  const value = match?.[1]?.trim().replace(/^['"]|['"]$/g, '')
  return value && value.length > 0 ? value : undefined
}

async function listSkillDirectoryItems(
  directories: Array<{ path: string; description: string }>,
): Promise<DesktopConfigItem[]> {
  const skills: DesktopConfigItem[] = []
  const seen = new Set<string>()

  async function scan(root: string, description: string, depth = 0): Promise<void> {
    if (depth > 4) return
    const items = await readdir(root, { withFileTypes: true }).catch(() => [])
    const hasSkillFile = items.some(item => item.isFile() && item.name.toLowerCase() === 'skill.md')
    if (hasSkillFile) {
      const skillFile = join(root, 'SKILL.md')
      const content = await readFile(skillFile, 'utf8').catch(() => '')
      const name = frontmatterValue(content, 'name') ??
        root.split(/[\\/]/).filter(Boolean).at(-1) ??
        root
      if (!seen.has(root)) {
        seen.add(root)
        skills.push({
          id: root,
          name,
          description: frontmatterValue(content, 'description') ?? description,
          enabled: true,
          path: root,
        })
      }
      return
    }
    for (const item of items.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!item.isDirectory()) continue
      await scan(join(root, item.name), description, depth + 1)
    }
  }

  for (const directory of directories) {
    await scan(directory.path, directory.description)
  }
  return skills
}

function safeSkillDirectoryName(name: string): string {
  const normalized = name
    .trim()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'imported-skill'
}

async function findSkillRoot(root: string, depth = 0): Promise<string | null> {
  if (depth > 4) return null
  const items = await readdir(root, { withFileTypes: true }).catch(() => [])
  if (items.some(item => item.isFile() && item.name.toLowerCase() === 'skill.md')) {
    return root
  }
  for (const item of items.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!item.isDirectory()) continue
    const match = await findSkillRoot(join(root, item.name), depth + 1)
    if (match) return match
  }
  return null
}

async function nextAvailableDirectory(parent: string, preferredName: string): Promise<string> {
  let candidate = join(parent, preferredName)
  let index = 2
  while (existsSync(candidate)) {
    candidate = join(parent, `${preferredName}-${index}`)
    index += 1
  }
  return candidate
}

async function expandZipArchive(sourcePath: string, destination: string): Promise<void> {
  if (process.platform === 'win32') {
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      'Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force',
      sourcePath,
      destination,
    ])
    return
  }
  await execFileAsync('unzip', ['-q', sourcePath, '-d', destination])
}

function stringFromRecord(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

async function readPluginManifest(
  pluginRoot: string,
): Promise<Record<string, unknown> | null> {
  for (const manifestPath of [
    join(pluginRoot, '.claude-plugin', 'plugin.json'),
    join(pluginRoot, 'plugin.json'),
  ]) {
    try {
      return JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>
    } catch {
      // Try the next supported manifest location.
    }
  }
  return null
}

async function listPluginDirectoryItems(
  directories: Array<{ path: string; description: string }>,
): Promise<DesktopConfigItem[]> {
  const plugins: DesktopConfigItem[] = []
  for (const directory of directories) {
    const items = await readdir(directory.path, { withFileTypes: true }).catch(() => [])
    items.sort((left, right) => left.name.localeCompare(right.name))
    for (const item of items) {
      if (!item.isDirectory()) continue
      const pluginRoot = join(directory.path, item.name)
      const manifest = await readPluginManifest(pluginRoot)
      if (!manifest) continue
      const name = stringFromRecord(manifest, 'name') ?? item.name
      plugins.push({
        id: pluginRoot,
        name,
        description: stringFromRecord(manifest, 'description') ?? directory.description,
        enabled: true,
        path: pluginRoot,
      })
    }
  }
  return plugins
}

async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function readWeixinChannelSnapshot(): Promise<DesktopChannelWeixinSnapshot> {
  const stateDir = weixinStateDir()
  const accountPath = join(stateDir, 'account.json')
  const accessPath = join(stateDir, 'access.json')
  const cursorPath = join(stateDir, 'cursor.txt')
  const pendingPath = join(stateDir, 'pending-pairings.json')
  const account = await readJsonObject(accountPath)
  const access = await readJsonObject(accessPath)
  const pending = await readJsonObject(pendingPath)
  const allowFrom = Array.isArray(access.allowFrom)
    ? access.allowFrom.filter(value => typeof value === 'string')
    : []

  return {
    connected: typeof account.token === 'string' && account.token.length > 0,
    stateDir,
    accountPath,
    accessPath,
    cursorPath,
    baseUrl: typeof account.baseUrl === 'string' ? account.baseUrl : undefined,
    userId: typeof account.userId === 'string' ? account.userId : undefined,
    savedAt: typeof account.savedAt === 'string' ? account.savedAt : undefined,
    allowedUsers: allowFrom.length,
    pendingPairings: Object.keys(pending).length,
    cursorPresent: existsSync(cursorPath),
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
  if (modelConfig.pricing) trimmed.pricing = { ...modelConfig.pricing }
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
    join(homedir(), '.codex', 'settings.json'),
    join(homedir(), '.codex', 'mcp.json'),
    join(homedir(), '.agents', 'settings.json'),
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
      description: '当前项目的主要开发规则与上下文',
    },
    {
      id: 'project-dot-claude',
      label: '.claude/CLAUDE.md',
      path: join(cwd, '.claude', 'CLAUDE.md'),
      scope: 'project',
      exists: existsSync(join(cwd, '.claude', 'CLAUDE.md')),
      description: '当前项目的 Claude Code 专用规则',
    },
    {
      id: 'user-claude',
      label: 'User CLAUDE.md',
      path: join(claudeHome(), 'CLAUDE.md'),
      scope: 'user',
      exists: existsSync(join(claudeHome(), 'CLAUDE.md')),
      description: '适用于所有项目的用户级规则',
    },
  ]
  return files
}

const MEMORY_TYPE_DESCRIPTIONS = {
  user: '用户信息、目标与偏好',
  feedback: '用户对工作方式的反馈与约束',
  project: '无法直接从代码推导的项目背景和长期事项',
  reference: '外部系统与资料入口',
} as const

export async function discoverAutoMemoryFiles(memoryDir: string): Promise<DesktopMemoryFile[]> {
  const files: DesktopMemoryFile[] = []
  async function scan(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        await scan(path)
        continue
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue
      const relativePath = relative(memoryDir, path).split(sep).join('/')
      const content = await readFile(path, 'utf8').catch(() => '')
      const frontmatter = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
      const type = frontmatter?.[1]?.match(/^type:\s*(user|feedback|project|reference)\s*$/m)?.[1]
      let description = entry.name.toLowerCase() === 'memory.md'
        ? '自动记忆索引'
        : type ? MEMORY_TYPE_DESCRIPTIONS[type as keyof typeof MEMORY_TYPE_DESCRIPTIONS] : '未分类记忆文件'
      const team = relativePath.startsWith('team/')
      if (team) description = `团队共享记忆 · ${description}`
      files.push({
        id: path,
        label: entry.name,
        path,
        scope: team ? 'team' : 'auto',
        exists: true,
        description,
        relativePath,
        depth: relativePath.split('/').length - 1,
      })
    }
  }
  await scan(memoryDir)
  return files
}

type DesktopConfigServiceOptions = {
  getAutoMemoryPath?: () => string | Promise<string>
}

export class DesktopConfigService {
  private readonly getAutoMemoryPath: () => string | Promise<string>

  constructor(options: DesktopConfigServiceOptions = {}) {
    this.getAutoMemoryPath = options.getAutoMemoryPath ?? (async () => {
      const module = await import('../../../src/memdir/paths.js')
      return module.getAutoMemPath()
    })
  }

  async snapshot(cwd: string): Promise<DesktopConfigSnapshot> {
    const autoMemoryPath = await this.getAutoMemoryPath()
    const [skills, mcpServers, plugins, modelConfig, autoMemoryFiles, weixin] = await Promise.all([
      listSkillDirectoryItems([
        { path: join(cwd, '.agents', 'skills'), description: 'Project skill' },
        { path: join(cwd, '.claude', 'skills'), description: 'Project Claude skill' },
        { path: join(cwd, '.claudecode', 'skills'), description: 'Project ClaudeCode skill' },
        { path: join(cwd, '.codex', 'skills'), description: 'Project Codex skill' },
        { path: join(claudeHome(), 'skills'), description: 'User Claude skill' },
        { path: join(claudeHome(), '..', '.codex', 'skills'), description: 'User Codex skill' },
        { path: join(homedir(), '.codex', 'skills'), description: 'User Codex skill' },
        { path: join(homedir(), '.agents', 'skills'), description: 'User agent skill' },
      ]),
      discoverMcpServers(cwd),
      listPluginDirectoryItems([
        { path: join(cwd, '.claudecode', 'plugins'), description: 'Project plugin' },
        { path: join(claudeHome(), 'plugins'), description: 'Claude Code plugin' },
        { path: join(claudeHome(), '..', '.codex', 'plugins'), description: 'Codex plugin' },
      ]),
      this.readModelConfig(cwd),
      discoverAutoMemoryFiles(autoMemoryPath),
      readWeixinChannelSnapshot(),
    ])
    const autoMemoryEnabled = await this.readAutoMemoryEnabled(cwd)
    return {
      cwd,
      skills,
      mcpServers,
      plugins,
      memoryFiles: [...memoryFilesForCwd(cwd), ...autoMemoryFiles],
      autoMemory: {
        enabled: autoMemoryEnabled,
        path: autoMemoryPath,
      },
      modelConfig,
      channel: {
        weixin,
      },
    }
  }

  async setAutoMemoryEnabled(
    cwd: string,
    enabled: boolean,
  ): Promise<DesktopConfigSnapshot> {
    const settingsPath = desktopConfigPrimaryPath(cwd)
    const settings = await readJsonObject(settingsPath)
    settings.autoMemoryEnabled = enabled
    await writeJsonObject(settingsPath, settings)
    for (const legacyPath of desktopConfigLegacyPaths(cwd)) {
      const legacy = await readJsonObject(legacyPath)
      legacy.autoMemoryEnabled = enabled
      await writeJsonObject(legacyPath, legacy)
    }
    return this.snapshot(cwd)
  }

  async startWeixinLogin(
    cwd: string,
    onStatus: (event: {
      status: 'starting' | 'qr' | 'waiting' | 'connected' | 'failed'
      message: string
      qrcodeUrl?: string
      qrcodeId?: string
    }) => void,
  ): Promise<DesktopConfigSnapshot> {
    const {
      DEFAULT_BASE_URL,
      saveAccount,
      startLogin,
      waitForLogin,
    } = await import('@claude-code-best/weixin')
    const { toDataURL } = await import('qrcode')
    onStatus({ status: 'starting', message: '正在请求微信扫码登录二维码…' })
    const qr = await startLogin(DEFAULT_BASE_URL)
    const qrImageUrl = qr.qrcodeUrl
      ? await toDataURL(qr.qrcodeUrl, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 220,
        })
      : undefined
    onStatus({
      status: 'qr',
      message: '请使用微信扫码确认登录。',
      qrcodeUrl: qrImageUrl ?? qr.qrcodeUrl,
      qrcodeId: qr.qrcodeId,
    })
    onStatus({
      status: 'waiting',
      message: '已生成二维码，等待微信确认…',
      qrcodeUrl: qrImageUrl ?? qr.qrcodeUrl,
      qrcodeId: qr.qrcodeId,
    })
    const result = await waitForLogin({
      qrcodeId: qr.qrcodeId,
      apiBaseUrl: DEFAULT_BASE_URL,
    })
    if (!result.connected || !result.token) {
      onStatus({ status: 'failed', message: result.message || '微信登录失败。' })
      throw new Error(result.message || 'Weixin login failed')
    }
    saveAccount({
      token: result.token,
      baseUrl: result.baseUrl || DEFAULT_BASE_URL,
      userId: result.userId,
      savedAt: new Date().toISOString(),
    })
    onStatus({
      status: 'connected',
      message: '微信登录成功，已保存本地认证配置。',
    })
    return this.snapshot(cwd)
  }

  async clearWeixinLogin(cwd: string): Promise<DesktopConfigSnapshot> {
    const { clearAccount } = await import('@claude-code-best/weixin')
    clearAccount()
    return this.snapshot(cwd)
  }

  private async readAutoMemoryEnabled(cwd: string): Promise<boolean> {
    const settingsPaths = [
      desktopConfigPrimaryPath(cwd),
      ...desktopConfigLegacyPaths(cwd),
      join(claudeHome(), 'settings.json'),
      join(claudeHome(), 'settings.local.json'),
    ]
    for (const settingsPath of settingsPaths) {
      const loaded = await readJsonObject(settingsPath)
      if (typeof loaded.autoMemoryEnabled === 'boolean') {
        return loaded.autoMemoryEnabled
      }
    }
    return true
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

  async modelConfig(cwd: string): Promise<DesktopModelConfig> {
    return this.readModelConfig(cwd)
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

  async importSkill(cwd: string, sourcePath: string): Promise<DesktopConfigSnapshot> {
    const resolvedSource = resolve(sourcePath)
    const sourceStat = await stat(resolvedSource)
    const skillsDir = userClaudeSkillsDir()
    await mkdir(skillsDir, { recursive: true })

    let cleanupPath: string | null = null
    let candidateRoot = resolvedSource
    try {
      if (sourceStat.isFile()) {
        if (extname(resolvedSource).toLowerCase() !== '.zip') {
          throw new Error('请选择包含 SKILL.md 的文件夹，或 .zip 技能包')
        }
        cleanupPath = await mkdtemp(join(claudeHome(), 'skill-import-'))
        await expandZipArchive(resolvedSource, cleanupPath)
        const extractedSkill = await findSkillRoot(cleanupPath)
        if (!extractedSkill) {
          throw new Error('压缩包中没有找到 SKILL.md')
        }
        candidateRoot = extractedSkill
      } else if (!sourceStat.isDirectory()) {
        throw new Error('请选择包含 SKILL.md 的文件夹，或 .zip 技能包')
      }

      const skillRoot = sourceStat.isDirectory()
        ? await findSkillRoot(candidateRoot)
        : candidateRoot
      if (!skillRoot) {
        throw new Error('技能目录中没有找到 SKILL.md')
      }
      const skillContent = await readFile(join(skillRoot, 'SKILL.md'), 'utf8')
      const skillName = frontmatterValue(skillContent, 'name') ?? basename(skillRoot)
      const destination = await nextAvailableDirectory(
        skillsDir,
        safeSkillDirectoryName(skillName),
      )
      await cp(skillRoot, destination, { recursive: true, errorOnExist: true })
      return this.snapshot(cwd)
    } finally {
      if (cleanupPath) {
        await rm(cleanupPath, { recursive: true, force: true }).catch(() => {})
      }
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
