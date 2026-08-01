import { describe, expect, test } from 'bun:test'
import type { Command } from 'src/types/command.js'
import type { CanUseToolFn } from 'src/hooks/useCanUseTool.js'
import { getEmptyToolPermissionContext } from 'src/Tool.js'
import type { AppState } from 'src/state/AppStateStore.js'
import { getDefaultAppState } from 'src/state/AppStateStore.js'
import {
  createDesktopCanUseTool,
  desktopSlashFallback,
  mergeInteractivePayload,
  nextResultWithTimeout,
  parseAskUserQuestionPayload,
  subscribeInterrupt,
  toCorePermissionDecision,
} from '../core/desktop-query-runner.js'
import { PermissionBroker } from '../core/permission-broker.js'

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

describe('createDesktopCanUseTool', () => {
  test('reuses allow_session rules before showing another desktop permission prompt', async () => {
    const appState = getDefaultAppState()
    appState.toolPermissionContext = {
      ...getEmptyToolPermissionContext(),
      alwaysAllowRules: { session: ['Read'] },
    }
    const requests: string[] = []
    const broker = new PermissionBroker({
      emit: request => requests.push(request.id),
    })
    const checkPermissions: CanUseToolFn = async () => ({
      behavior: 'allow',
      updatedInput: { file_path: 'README.md' },
      decisionReason: {
        type: 'rule',
        rule: {
          source: 'session',
          ruleBehavior: 'allow',
          ruleValue: { toolName: 'Read' },
        },
      },
    })
    const canUseTool = createDesktopCanUseTool({
      sessionId: 'session-1',
      appState,
      permissionBroker: broker,
      checkPermissions,
    })

    const result = await canUseTool(
      {
        name: 'Read',
        inputSchema: { parse: (input: Record<string, unknown>) => input },
      } as never,
      { file_path: 'README.md' },
      {
        getAppState: () => appState,
        setAppState: (updater: (prev: AppState) => AppState) =>
          Object.assign(appState, updater(appState)),
      } as never,
      {} as never,
      'tool-1',
    )

    expect(result.behavior).toBe('allow')
    expect(requests).toEqual([])
  })

  test('stores a session allow rule after the desktop permission prompt is approved for the session', async () => {
    const appState = getDefaultAppState()
    appState.toolPermissionContext = getEmptyToolPermissionContext()
    const broker = new PermissionBroker({
      createId: () => 'permission-1',
      emit: request => {
        queueMicrotask(() => broker.resolve(request.id, 'allow_session'))
      },
    })
    const checkPermissions: CanUseToolFn = async () => ({
      behavior: 'ask',
      message: 'Read requires approval',
    })
    const canUseTool = createDesktopCanUseTool({
      sessionId: 'session-1',
      appState,
      permissionBroker: broker,
      checkPermissions,
    })

    const result = await canUseTool(
      {
        name: 'Read',
        inputSchema: { parse: (input: Record<string, unknown>) => input },
      } as never,
      { file_path: 'README.md' },
      {
        getAppState: () => appState,
        setAppState: (updater: (prev: AppState) => AppState) =>
          Object.assign(appState, updater(appState)),
      } as never,
      {} as never,
      'tool-1',
    )

    expect(result.behavior).toBe('allow')
    expect(appState.toolPermissionContext.alwaysAllowRules.session).toEqual([
      'Read',
    ])
  })

  test('does not offer allow_session for tools requiring user interaction', async () => {
    const appState = getDefaultAppState()
    appState.toolPermissionContext = getEmptyToolPermissionContext()
    const decisionsSeen: string[][] = []
    const broker = new PermissionBroker({
      createId: () => 'permission-ask',
      emit: request => {
        decisionsSeen.push(request.decisions)
        queueMicrotask(() => broker.resolve(request.id, 'allow_once'))
      },
    })
    const checkPermissions: CanUseToolFn = async () => ({
      behavior: 'ask',
      message: 'Answer questions?',
    })
    const canUseTool = createDesktopCanUseTool({
      sessionId: 'session-1',
      appState,
      permissionBroker: broker,
      checkPermissions,
    })

    await canUseTool(
      {
        name: 'AskUserQuestion',
        requiresUserInteraction: () => true,
        inputSchema: { parse: (input: Record<string, unknown>) => input },
      } as never,
      { questions: [] },
      {
        getAppState: () => appState,
        setAppState: (updater: (prev: AppState) => AppState) =>
          Object.assign(appState, updater(appState)),
      } as never,
      {} as never,
      'tool-ask',
    )

    expect(decisionsSeen).toEqual([['deny', 'allow_once']])
    expect(
      appState.toolPermissionContext.alwaysAllowRules.session ?? [],
    ).toEqual([])
  })

  test('merges AskUserQuestion answers from the approval payload into updatedInput', async () => {
    const appState = getDefaultAppState()
    appState.toolPermissionContext = getEmptyToolPermissionContext()
    const input = {
      questions: [
        {
          question: 'Which library should we use?',
          header: 'Library',
          options: [
            { label: 'date-fns', description: 'Lightweight' },
            { label: 'dayjs', description: 'Moment-compatible' },
          ],
          multiSelect: false,
        },
      ],
    }
    const broker = new PermissionBroker({
      createId: () => 'permission-ask',
      emit: request => {
        queueMicrotask(() =>
          broker.resolve(request.id, 'allow_once', {
            answers: { 'Which library should we use?': 'date-fns' },
            annotations: {
              'Which library should we use?': { notes: 'smaller bundle' },
            },
          }),
        )
      },
    })
    const checkPermissions: CanUseToolFn = async () => ({
      behavior: 'ask',
      message: 'Answer questions?',
    })
    const canUseTool = createDesktopCanUseTool({
      sessionId: 'session-1',
      appState,
      permissionBroker: broker,
      checkPermissions,
    })

    const result = await canUseTool(
      {
        name: 'AskUserQuestion',
        requiresUserInteraction: () => true,
        inputSchema: { parse: (value: Record<string, unknown>) => value },
      } as never,
      input,
      {
        getAppState: () => appState,
        setAppState: (updater: (prev: AppState) => AppState) =>
          Object.assign(appState, updater(appState)),
      } as never,
      {} as never,
      'tool-ask',
    )

    expect(result.behavior).toBe('allow')
    if (result.behavior !== 'allow') throw new Error('unreachable')
    expect(result.updatedInput).toEqual({
      ...input,
      answers: { 'Which library should we use?': 'date-fns' },
      annotations: {
        'Which library should we use?': { notes: 'smaller bundle' },
      },
    })
  })

  test('keeps the original input when AskUserQuestion is allowed without a payload', async () => {
    const appState = getDefaultAppState()
    appState.toolPermissionContext = getEmptyToolPermissionContext()
    const input = { questions: [{ question: 'Proceed?' }] }
    const broker = new PermissionBroker({
      createId: () => 'permission-ask',
      emit: request => {
        queueMicrotask(() => broker.resolve(request.id, 'allow_once'))
      },
    })
    const checkPermissions: CanUseToolFn = async () => ({
      behavior: 'ask',
      message: 'Answer questions?',
    })
    const canUseTool = createDesktopCanUseTool({
      sessionId: 'session-1',
      appState,
      permissionBroker: broker,
      checkPermissions,
    })

    const result = await canUseTool(
      {
        name: 'AskUserQuestion',
        requiresUserInteraction: () => true,
        inputSchema: { parse: (value: Record<string, unknown>) => value },
      } as never,
      input,
      {
        getAppState: () => appState,
        setAppState: (updater: (prev: AppState) => AppState) =>
          Object.assign(appState, updater(appState)),
      } as never,
      {} as never,
      'tool-ask',
    )

    expect(result.behavior).toBe('allow')
    if (result.behavior !== 'allow') throw new Error('unreachable')
    expect(result.updatedInput).toEqual(input)
  })
})

describe('parseAskUserQuestionPayload', () => {
  test('parses valid answers and annotations', () => {
    expect(
      parseAskUserQuestionPayload({
        answers: { Q1: 'A', Q2: 'B, C' },
        annotations: { Q1: { preview: 'p', notes: 'n' } },
      }),
    ).toEqual({
      answers: { Q1: 'A', Q2: 'B, C' },
      annotations: { Q1: { preview: 'p', notes: 'n' } },
    })
  })

  test('rejects payloads without usable answers', () => {
    expect(parseAskUserQuestionPayload(undefined)).toBeUndefined()
    expect(parseAskUserQuestionPayload(null)).toBeUndefined()
    expect(parseAskUserQuestionPayload({})).toBeUndefined()
    expect(parseAskUserQuestionPayload({ answers: 'nope' })).toBeUndefined()
    expect(parseAskUserQuestionPayload({ answers: {} })).toBeUndefined()
    expect(
      parseAskUserQuestionPayload({ answers: { Q1: 42 } }),
    ).toBeUndefined()
  })

  test('drops empty annotations', () => {
    expect(
      parseAskUserQuestionPayload({ answers: { Q1: 'A' }, annotations: {} }),
    ).toEqual({ answers: { Q1: 'A' } })
  })
})

describe('mergeInteractivePayload', () => {
  test('passes through unknown tools untouched', () => {
    const input = { command: 'ls' }
    expect(
      mergeInteractivePayload('Bash', input, { answers: { Q: 'A' } }),
    ).toBe(input)
  })

  test('injects answers for AskUserQuestion', () => {
    const input = { questions: [{ question: 'Q1' }] }
    expect(
      mergeInteractivePayload('AskUserQuestion', input, {
        answers: { Q1: 'A' },
      }),
    ).toEqual({ questions: [{ question: 'Q1' }], answers: { Q1: 'A' } })
  })

  test('ignores malformed payloads', () => {
    const input = { questions: [{ question: 'Q1' }] }
    expect(
      mergeInteractivePayload('AskUserQuestion', input, { answers: {} }),
    ).toBe(input)
  })
})
