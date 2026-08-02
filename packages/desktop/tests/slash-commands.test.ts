import { describe, expect, test } from 'bun:test'
import {
  selectedSlashCommand,
  slashSuggestions,
} from '../renderer/src/features/chat/slashCommands.js'

describe('slash command suggestions', () => {
  test('suggests cascading commands for slash input', () => {
    expect(slashSuggestions('/m').map(item => item.command)).toContain('/mcp list')
  })

  test('includes the broader Claude Code command catalog', () => {
    const commands = slashSuggestions('/').map(item => item.command)

    expect(commands).toContain('/add-dir')
    expect(commands).toContain('/status')
    expect(commands).toContain('/provider')
    expect(commands).toContain('/workflows')
  })

  test('recognizes a selected command for command block rendering', () => {
    expect(selectedSlashCommand('/skill list')?.title).toBe('Skill 列表')
    expect(selectedSlashCommand('/status')?.description).toContain('状态')
    expect(selectedSlashCommand('hello')).toBeNull()
  })

  test('provides Chinese labels and icons for the slash palette', () => {
    const branch = selectedSlashCommand('/branch')

    expect(branch?.title).toBe('创建分支')
    expect(branch?.description).toContain('当前对话')
    expect(branch?.icon).toBeTruthy()
  })
})
