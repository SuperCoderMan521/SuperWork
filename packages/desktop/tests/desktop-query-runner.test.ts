import { describe, expect, test } from 'bun:test'
import type { Command } from 'src/types/command.js'
import {
  desktopSlashFallback,
  nextResultWithTimeout,
  subscribeInterrupt,
  toCorePermissionDecision,
} from '../core/desktop-query-runner.js'

function localJsxCommand(name: string, description: string): Command {
  return {
    type: 'local-jsx',
    name,
    description,
    load: async () => ({ call: async () => null }),
  }
}

function localCommand(name: string, description: string): Command {
  return {
    type: 'local',
    name,
    description,
    supportsNonInteractive: true,
    load: async () => ({ call: async () => ({ type: 'skip' }) }),
  }
}

describe('toCorePermissionDecision', () => {
  test('maps allow decisions to the existing permission shape', () => {
    const input = { command: 'bun test' }
    expect(toCorePermissionDecision('allow_once', input)).toEqual({
      behavior: 'allow',
      updatedInput: input,
    })
    expect(toCorePermissionDecision('allow_session', input)).toEqual({
      behavior: 'allow',
      updatedInput: input,
    })
  })

  test('maps denial to a core denial', () => {
    expect(toCorePermissionDecision('deny', {})).toEqual({
      behavior: 'deny',
      message: 'Permission denied in SuperWork',
      decisionReason: { type: 'mode', mode: 'default' },
    })
  })
})

describe('desktopSlashFallback', () => {
  test('renders desktop-visible help for /help local jsx command', () => {
    const markdown = desktopSlashFallback('/help', [
      localJsxCommand('help', 'Show help and available commands'),
      localCommand('compact', 'Compact conversation'),
    ])

    expect(markdown).toContain('Claude Code 指令')
    expect(markdown).toContain('/help')
    expect(markdown).toContain('/compact')
  })

  test('does not swallow normal non-help slash commands', () => {
    const markdown = desktopSlashFallback('/compact', [
      localCommand('compact', 'Compact conversation'),
    ])

    expect(markdown).toBeNull()
  })
})

describe('subscribeInterrupt', () => {
  test('runs interrupt immediately when the signal was already aborted', () => {
    const controller = new AbortController()
    controller.abort()
    let calls = 0

    const unsubscribe = subscribeInterrupt(controller.signal, () => {
      calls += 1
    })

    expect(calls).toBe(1)
    unsubscribe()
  })

  test('runs interrupt when the signal is aborted later', () => {
    const controller = new AbortController()
    let calls = 0

    const unsubscribe = subscribeInterrupt(controller.signal, () => {
      calls += 1
    })

    controller.abort()
    expect(calls).toBe(1)
    unsubscribe()
  })
})

describe('nextResultWithTimeout', () => {
  test('rejects and runs onTimeout when an iterator next call stalls', async () => {
    let timedOut = 0

    await expect(
      nextResultWithTimeout(
        () => new Promise<IteratorResult<unknown>>(() => {}),
        1,
        () => {
          timedOut += 1
        },
        '首包等待超时',
      ),
    ).rejects.toThrow('首包等待超时')

    expect(timedOut).toBe(1)
  })
})
