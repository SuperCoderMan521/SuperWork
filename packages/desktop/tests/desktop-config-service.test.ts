import { mkdtemp, readFile, rm } from 'node:fs/promises'
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

describe('DesktopConfigService.writeConfig', () => {
  test('persists OpenAI-compatible model config where Claude Code reads it', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'superwork-config-'))
    try {
      const service = new DesktopConfigService()

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
      const service = new DesktopConfigService()

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
})
