import { execFile } from 'node:child_process'
import { access, readdir, stat } from 'node:fs/promises'
import { basename, join, normalize } from 'node:path'
import { promisify } from 'node:util'
import { spawn } from 'node:child_process'

const execFileAsync = promisify(execFile)

export const workspaceEditorIds = [
  'vscode',
  'cursor',
  'windsurf',
  'trae',
  'zed',
  'sublime',
  'notepad-plus-plus',
  'idea',
  'webstorm',
  'pycharm',
  'goland',
  'rider',
  'clion',
  'phpstorm',
  'rubymine',
  'datagrip',
  'android-studio',
] as const

export type WorkspaceEditorId = (typeof workspaceEditorIds)[number]

export type WorkspaceEditor = {
  id: WorkspaceEditorId
  name: string
  icon: string
}

export type EditorCandidate = {
  id: WorkspaceEditorId
  executable: string
  source: 'registry' | 'known-path' | 'path' | 'jetbrains'
}

type WorkspaceEditorServiceOptions = {
  platform?: NodeJS.Platform
  discoverCandidates?: () => Promise<EditorCandidate[]>
  fileExists?: (path: string) => Promise<boolean>
  isDirectory?: (path: string) => Promise<boolean>
  launch?: (executable: string, args: string[]) => Promise<void>
  cacheMs?: number
}

const definitions: ReadonlyArray<{
  id: WorkspaceEditorId
  name: string
  commands: string[]
  appPaths: string[]
  relativePaths: string[]
}> = [
  { id: 'vscode', name: 'Visual Studio Code', commands: ['code.cmd', 'code.exe'], appPaths: ['Code.exe'], relativePaths: ['Programs\\Microsoft VS Code\\Code.exe', 'Microsoft VS Code\\Code.exe'] },
  { id: 'cursor', name: 'Cursor', commands: ['cursor.cmd', 'cursor.exe'], appPaths: ['Cursor.exe'], relativePaths: ['Programs\\cursor\\Cursor.exe', 'Cursor\\Cursor.exe'] },
  { id: 'windsurf', name: 'Windsurf', commands: ['windsurf.cmd', 'Windsurf.exe'], appPaths: ['Windsurf.exe'], relativePaths: ['Programs\\Windsurf\\Windsurf.exe', 'Windsurf\\Windsurf.exe'] },
  { id: 'trae', name: 'Trae', commands: ['trae.cmd', 'Trae.exe'], appPaths: ['Trae.exe'], relativePaths: ['Programs\\Trae\\Trae.exe', 'Trae\\Trae.exe'] },
  { id: 'zed', name: 'Zed', commands: ['zed.exe'], appPaths: ['zed.exe'], relativePaths: ['Programs\\Zed\\zed.exe', 'Zed\\zed.exe'] },
  { id: 'sublime', name: 'Sublime Text', commands: ['subl.exe', 'sublime_text.exe'], appPaths: ['sublime_text.exe'], relativePaths: ['Sublime Text\\sublime_text.exe'] },
  { id: 'notepad-plus-plus', name: 'Notepad++', commands: ['notepad++.exe'], appPaths: ['notepad++.exe'], relativePaths: ['Notepad++\\notepad++.exe'] },
  { id: 'idea', name: 'IntelliJ IDEA', commands: ['idea64.exe'], appPaths: ['idea64.exe'], relativePaths: [] },
  { id: 'webstorm', name: 'JetBrains WebStorm', commands: ['webstorm64.exe'], appPaths: ['webstorm64.exe'], relativePaths: [] },
  { id: 'pycharm', name: 'JetBrains PyCharm', commands: ['pycharm64.exe'], appPaths: ['pycharm64.exe'], relativePaths: [] },
  { id: 'goland', name: 'JetBrains GoLand', commands: ['goland64.exe'], appPaths: ['goland64.exe'], relativePaths: [] },
  { id: 'rider', name: 'JetBrains Rider', commands: ['rider64.exe'], appPaths: ['rider64.exe'], relativePaths: [] },
  { id: 'clion', name: 'JetBrains CLion', commands: ['clion64.exe'], appPaths: ['clion64.exe'], relativePaths: [] },
  { id: 'phpstorm', name: 'JetBrains PhpStorm', commands: ['phpstorm64.exe'], appPaths: ['phpstorm64.exe'], relativePaths: [] },
  { id: 'rubymine', name: 'JetBrains RubyMine', commands: ['rubymine64.exe'], appPaths: ['rubymine64.exe'], relativePaths: [] },
  { id: 'datagrip', name: 'JetBrains DataGrip', commands: ['datagrip64.exe'], appPaths: ['datagrip64.exe'], relativePaths: [] },
  { id: 'android-studio', name: 'Android Studio', commands: ['studio64.exe'], appPaths: ['studio64.exe'], relativePaths: ['Android\\Android Studio\\bin\\studio64.exe'] },
]

const definitionById = new Map(definitions.map(definition => [definition.id, definition]))

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

async function queryExecutable(command: string, args: string[]): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(command, args, {
      windowsHide: true,
      encoding: 'utf8',
    })
    return stdout
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

async function registryCandidates(): Promise<EditorCandidate[]> {
  const roots = [
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths',
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths',
  ]
  const outputs = await Promise.all(
    roots.map(root => queryExecutable('reg.exe', ['query', root, '/s'])),
  )
  const executableToDefinition = new Map(
    definitions.flatMap(definition =>
      definition.appPaths.map(name => [name.toLowerCase(), definition] as const),
    ),
  )
  const candidates: EditorCandidate[] = []
  for (const line of outputs.flat()) {
    const match = line.match(/REG_SZ\s+(.+?\.exe)\s*$/i)
    if (!match?.[1]) continue
    const executable = match[1].trim().replace(/^"|"$/g, '')
    const definition = executableToDefinition.get(basename(executable).toLowerCase())
    if (definition) candidates.push({ id: definition.id, executable, source: 'registry' })
  }
  return candidates
}

async function pathCandidates(): Promise<EditorCandidate[]> {
  const results = await Promise.all(
    definitions.flatMap(definition =>
      definition.commands.map(async command => ({
        definition,
        executables: await queryExecutable('where.exe', [command]),
      })),
    ),
  )
  return results.flatMap(({ definition, executables }) =>
    executables.map(executable => ({
      id: definition.id,
      executable,
      source: 'path' as const,
    })),
  )
}

function knownPathCandidates(): EditorCandidate[] {
  const roots = [
    process.env.LOCALAPPDATA,
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
  ].filter((root): root is string => Boolean(root))
  return definitions.flatMap(definition =>
    roots.flatMap(root =>
      definition.relativePaths.map(relativePath => ({
        id: definition.id,
        executable: join(root, relativePath),
        source: 'known-path' as const,
      })),
    ),
  )
}

async function scanForExecutables(root: string, depth: number): Promise<string[]> {
  if (depth < 0) return []
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const results: string[] = []
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) results.push(...await scanForExecutables(path, depth - 1))
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('64.exe')) results.push(path)
  }
  return results
}

async function jetBrainsCandidates(): Promise<EditorCandidate[]> {
  const roots = [
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'JetBrains', 'Toolbox', 'apps') : null,
    process.env.ProgramFiles ? join(process.env.ProgramFiles, 'JetBrains') : null,
  ].filter((root): root is string => Boolean(root))
  const candidates: EditorCandidate[] = []
  for (const root of roots) {
    for (const executable of await scanForExecutables(root, 5)) {
      const name = executable.split(/[\\/]/).at(-1)?.toLowerCase()
      const definition = definitions.find(item => item.commands.some(command => command.toLowerCase() === name))
      if (definition) candidates.push({ id: definition.id, executable, source: 'jetbrains' })
    }
  }
  return candidates
}

async function discoverWindowsEditors(): Promise<EditorCandidate[]> {
  const [registry, path, jetBrains] = await Promise.all([
    registryCandidates(),
    pathCandidates(),
    jetBrainsCandidates(),
  ])
  return [...registry, ...knownPathCandidates(), ...path, ...jetBrains]
}

async function launchDetached(executable: string, args: string[]): Promise<void> {
  const child = spawn(executable, args, {
    detached: true,
    shell: false,
    stdio: 'ignore',
    windowsHide: false,
  })
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve)
    child.once('error', reject)
  })
  child.unref()
}

export class WorkspaceEditorService {
  private readonly platform: NodeJS.Platform
  private readonly discoverCandidates: () => Promise<EditorCandidate[]>
  private readonly fileExists: (path: string) => Promise<boolean>
  private readonly isDirectory: (path: string) => Promise<boolean>
  private readonly launch: (executable: string, args: string[]) => Promise<void>
  private readonly cacheMs: number
  private cache: { at: number; editors: WorkspaceEditor[]; paths: Map<WorkspaceEditorId, string> } | null = null

  constructor(options: WorkspaceEditorServiceOptions = {}) {
    this.platform = options.platform ?? process.platform
    this.discoverCandidates = options.discoverCandidates ?? discoverWindowsEditors
    this.fileExists = options.fileExists ?? exists
    this.isDirectory = options.isDirectory ?? directoryExists
    this.launch = options.launch ?? launchDetached
    this.cacheMs = options.cacheMs ?? 15_000
  }

  async list(options: { refresh?: boolean } = {}): Promise<WorkspaceEditor[]> {
    if (!options.refresh && this.cache && Date.now() - this.cache.at < this.cacheMs) {
      return this.cache.editors
    }
    if (this.platform !== 'win32') return []
    const paths = new Map<WorkspaceEditorId, string>()
    for (const candidate of await this.discoverCandidates()) {
      if (paths.has(candidate.id) || !await this.fileExists(candidate.executable)) continue
      paths.set(candidate.id, normalize(candidate.executable))
    }
    const editors = definitions
      .filter(definition => paths.has(definition.id))
      .map(definition => ({ id: definition.id, name: definition.name, icon: definition.id }))
    this.cache = { at: Date.now(), editors, paths }
    return editors
  }

  async open(editorId: string, workspace: string): Promise<void> {
    if (!definitionById.has(editorId as WorkspaceEditorId)) {
      throw new Error(`Unsupported editor: ${editorId}`)
    }
    if (!await this.isDirectory(workspace)) {
      throw new Error('Workspace directory does not exist')
    }
    await this.list()
    const executable = this.cache?.paths.get(editorId as WorkspaceEditorId)
    if (!executable) throw new Error('Editor is not installed or is no longer available')
    await this.launch(executable, [normalize(workspace)])
  }
}
