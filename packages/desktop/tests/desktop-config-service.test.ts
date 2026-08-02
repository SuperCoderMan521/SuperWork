import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import {
  DesktopConfigService,
  compactMemoryContent,
  extractFileEntriesFromTools,
} from '../core/desktop-config-service.js'
import type { DesktopToolCall } from '../shared/protocol.js'

describe('compactMemoryContent', () => {
  test('keeps headings and bullets while reducing repeated whitespace', () => {
    const content = [
      '# Memory',
      '',
      '',
      '- Always run typecheck',
      '',
      'Long paragraph that can be summarized.',
    ].join('\n')

    const compacted = compactMemoryContent(content)

    expect(compacted).toContain('# Memory')
    expect(compacted).toContain('- Always run typecheck')
    expect(compacted).not.toContain('\n\n\n')
    expect(compacted.length).toBeLessThan(content.length)
  })
})

describe('extractFileEntriesFromTools', () => {
  test('extracts paths from tool input, summary and output', () => {
    const tools: DesktopToolCall[] = [
      {
        id: 'tool-1',
        name: 'FileWriteTool',
        state: 'success',
        summary: 'src/new-file.ts',
        input: { file_path: 'src/new-file.ts' },
      },
      {
        id: 'tool-2',
        name: 'BashTool',
        state: 'success',
        summary: 'generated',
        output: 'created docs/plan.md',
      },
    ]

    expect(extractFileEntriesFromTools(tools).map(file => file.path)).toEqual([
      'src/new-file.ts',
      'docs/plan.md',
    ])
  })

  test('extracts bare shell artifacts from output text', () => {
    const tools: DesktopToolCall[] = [
      {
        id: 'tool-1',
        name: 'BashTool',
        state: 'success',
        summary: 'build completed',
        output: 'Generated app.bundle.js and index.html',
      },
    ]

    expect(extractFileEntriesFromTools(tools).map(file => file.path)).toEqual([
      'app.bundle.js',
      'index.html',
    ])
  })
})

describe('DesktopConfigService skill import', () => {
  test('copies a skill folder into the Claude skills directory and refreshes the snapshot', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'superwork-skill-import-cwd-'))
    const claudeDir = await mkdtemp(join(tmpdir(), 'superwork-claude-home-'))
    const source = await mkdtemp(join(tmpdir(), 'superwork-skill-source-'))
    const previousClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
    process.env.CLAUDE_CONFIG_DIR = claudeDir
    try {
      await writeFile(
        join(source, 'SKILL.md'),
        [
          '---',
          'name: imported-review',
          'description: Imported review skill',
          '---',
          '',
          '# Imported Review',
        ].join('\n'),
        'utf8',
      )
      const service = new DesktopConfigService({ getAutoMemoryPath: () => join(cwd, 'MEMORY.md') })

      const snapshot = await service.importSkill(cwd, source)

      expect(await readFile(join(claudeDir, 'skills', 'imported-review', 'SKILL.md'), 'utf8'))
        .toContain('Imported Review')
      expect(snapshot.skills.some(skill =>
        skill.name === 'imported-review' &&
        skill.path === join(claudeDir, 'skills', 'imported-review')
      )).toBe(true)
    } finally {
      if (previousClaudeConfigDir === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR
      } else {
        process.env.CLAUDE_CONFIG_DIR = previousClaudeConfigDir
      }
      await rm(cwd, { recursive: true, force: true })
      await rm(claudeDir, { recursive: true, force: true })
      await rm(source, { recursive: true, force: true })
    }
  })
})

describe('DesktopConfigService.writeConfig', () => {
  test('persists OpenAI-compatible model config where Claude Code reads it', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'superwork-config-'))
    try {
      const service = new DesktopConfigService({
        getAutoMemoryPath: () => join(cwd, 'missing-memory'),
      })

      await service.writeConfig(cwd, {
        provider: 'openai',
        baseUrl: 'https://example.test/v1',
        token: 'test-token',
        model: 'glm-test',
      })

      const settings = JSON.parse(
        await readFile(join(cwd, '.claudecode', 'setting.json'), 'utf8'),
      ) as Record<string, unknown>
      const legacySettings = JSON.parse(
        await readFile(join(cwd, '.claude', 'settings.local.json'), 'utf8'),
      ) as Record<string, unknown>
      const env = settings.env as Record<string, unknown>

      expect(settings.modelType).toBe('openai')
      expect(settings.model).toBe('glm-test')
      expect(env.CLAUDE_CODE_USE_OPENAI).toBe('1')
      expect(env.OPENAI_BASE_URL).toBe('https://example.test/v1')
      expect(env.OPENAI_API_KEY).toBe('test-token')
      expect(env.OPENAI_MODEL).toBe('glm-test')
      expect(settings.desktop).toEqual({
        modelConfig: {
          provider: 'openai',
          baseUrl: 'https://example.test/v1',
          token: 'test-token',
          model: 'glm-test',
        },
      })
      expect(legacySettings.desktop).toEqual(settings.desktop)
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test('persists Anthropic-compatible model config where Claude Code reads it', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'superwork-config-'))
    try {
      const service = new DesktopConfigService({
        getAutoMemoryPath: () => join(cwd, 'missing-memory'),
      })

      await service.writeConfig(cwd, {
        provider: 'anthropic',
        baseUrl: 'https://api.example.test/anthropic',
        token: 'anthropic-token',
        model: 'claude-test',
      })

      const settings = JSON.parse(
        await readFile(join(cwd, '.claudecode', 'setting.json'), 'utf8'),
      ) as Record<string, unknown>
      const env = settings.env as Record<string, unknown>

      expect(settings.modelType).toBeUndefined()
      expect(settings.model).toBe('claude-test')
      expect(env.ANTHROPIC_BASE_URL).toBe('https://api.example.test/anthropic')
      expect(env.ANTHROPIC_API_KEY).toBe('anthropic-token')
      expect(env.ANTHROPIC_AUTH_TOKEN).toBe('anthropic-token')
      expect(env.ANTHROPIC_MODEL).toBe('claude-test')
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test('persists auto memory enabled setting where Claude Code reads it', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'superwork-memory-config-'))
    const previousClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
    process.env.CLAUDE_CONFIG_DIR = join(cwd, 'home', '.claude')
    try {
      const service = new DesktopConfigService({
        getAutoMemoryPath: () => join(cwd, 'home', '.claude', 'projects', 'demo', 'memory'),
      })

      const snapshot = await service.setAutoMemoryEnabled(cwd, false)

      expect(snapshot.autoMemory.enabled).toBe(false)
      expect(snapshot.autoMemory.path).toContain('memory')
      const settings = JSON.parse(
        await readFile(join(cwd, '.claudecode', 'setting.json'), 'utf8'),
      ) as Record<string, unknown>
      expect(settings.autoMemoryEnabled).toBe(false)
    } finally {
      if (previousClaudeConfigDir === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR
      } else {
        process.env.CLAUDE_CONFIG_DIR = previousClaudeConfigDir
      }
      await rm(cwd, { recursive: true, force: true })
    }
  })
})

describe('DesktopConfigService.snapshot plugin discovery', () => {
  test('lists real skill directories instead of parent category folders', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'superwork-skill-config-'))
    const previousClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
    process.env.CLAUDE_CONFIG_DIR = join(cwd, 'home', '.claude')
    try {
      await mkdir(join(cwd, '.codex', 'skills', '.system', 'reviewer'), { recursive: true })
      await mkdir(join(cwd, '.codex', 'skills', '.system', 'empty-folder'), { recursive: true })
      await writeFile(
        join(cwd, '.codex', 'skills', '.system', 'reviewer', 'SKILL.md'),
        [
          '---',
          'name: reviewer',
          'description: Review code changes carefully',
          '---',
          '',
          '# Reviewer',
        ].join('\n'),
        'utf8',
      )

      const service = new DesktopConfigService({
        getAutoMemoryPath: () => join(cwd, 'missing-memory'),
      })

      const snapshot = await service.snapshot(cwd)

      expect(snapshot.skills.map(skill => skill.name)).toContain('reviewer')
      expect(snapshot.skills.map(skill => skill.name)).not.toContain('.system')
      expect(snapshot.skills.find(skill => skill.name === 'reviewer')?.description)
        .toBe('Review code changes carefully')
    } finally {
      if (previousClaudeConfigDir === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR
      } else {
        process.env.CLAUDE_CONFIG_DIR = previousClaudeConfigDir
      }
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test('only lists directories that contain a Claude Code plugin manifest', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'superwork-plugin-config-'))
    const previousClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
    process.env.CLAUDE_CONFIG_DIR = join(cwd, 'home', '.claude')
    try {
      await mkdir(join(cwd, '.claudecode', 'plugins', 'real-plugin', '.claude-plugin'), { recursive: true })
      await mkdir(join(cwd, '.claudecode', 'plugins', 'config-folder'), { recursive: true })
      await mkdir(join(cwd, '.claudecode', 'skills', 'not-a-plugin'), { recursive: true })
      await writeFile(
        join(cwd, '.claudecode', 'plugins', 'real-plugin', '.claude-plugin', 'plugin.json'),
        JSON.stringify({
          name: 'real-plugin',
          description: 'A real Claude Code plugin',
          version: '1.0.0',
        }),
        'utf8',
      )
      await writeFile(
        join(cwd, '.claudecode', 'plugins', 'settings.json'),
        '{}',
        'utf8',
      )
      await writeFile(
        join(cwd, '.claudecode', 'plugins', 'config-folder', 'settings.json'),
        '{}',
        'utf8',
      )

      const service = new DesktopConfigService({
        getAutoMemoryPath: () => join(cwd, 'missing-memory'),
      })

      const snapshot = await service.snapshot(cwd)

      expect(snapshot.plugins.map(plugin => plugin.name)).toEqual(['real-plugin'])
      expect(snapshot.plugins[0]?.description).toBe('A real Claude Code plugin')
      expect(snapshot.plugins[0]?.path).toBe(join(cwd, '.claudecode', 'plugins', 'real-plugin'))
    } finally {
      if (previousClaudeConfigDir === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR
      } else {
        process.env.CLAUDE_CONFIG_DIR = previousClaudeConfigDir
      }
      await rm(cwd, { recursive: true, force: true })
    }
  })
})
