import { describe, expect, test } from 'bun:test'
import { DesktopCommandDispatcher } from '../core/command-dispatcher.js'
import type { DesktopEvent } from '../shared/protocol.js'

describe('DesktopCommandDispatcher', () => {
  test('routes workspace performance snapshots', async () => {
    const events: DesktopEvent[] = []
    const dispatcher = new DesktopCommandDispatcher({
      controller: { createSession: () => { throw new Error('unused') }, submitPrompt: async () => {}, interrupt: () => false, setModel: () => {}, setMode: () => {} },
      listSessions: async () => [], resolvePermission: () => false, emit: event => events.push(event), shutdown: async () => {},
      getPerformance: async (cwd, range, force) => ({ cwd, range, generatedAt: 1, scannedSessions: force ? 2 : 1, scannedLines: 0, skippedLines: 0, truncated: false, summary: { sessions: 0, turns: 0, messages: 0, apiCalls: 0, tokens: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 }, pricedTokenShare: 0, wallClockMs: 0, failedTurns: 0, interruptedTurns: 0 }, trend: [], models: [], tools: [], diagnostics: { debugLogAvailable: false, langfuseConfigured: false }, warnings: [] }),
    })
    await dispatcher.dispatch({ type: 'performance.get', requestId: 'perf-1', cwd: 'G:/project', range: '30d', force: true })
    expect(events[0]).toMatchObject({ type: 'performance.snapshot', requestId: 'perf-1', snapshot: { cwd: 'G:/project', range: '30d', scannedSessions: 2 } })
  })
  test('lists existing sessions', async () => {
    const events: DesktopEvent[] = []
    const dispatcher = new DesktopCommandDispatcher({
      controller: {
        createSession: () => {
          throw new Error('not used')
        },
        submitPrompt: async () => {},
        interrupt: () => false,
        setModel: () => {},
        setMode: () => {},
      },
      listSessions: async () => [
        { id: 'session-1', title: 'History', cwd: 'G:/project', updatedAt: 1 },
      ],
      resolvePermission: () => false,
      emit: event => events.push(event),
      shutdown: async () => {},
    })

    await dispatcher.dispatch({ type: 'session.list', requestId: 'request-1' })

    expect(events).toEqual([
      {
        type: 'session.listed',
        requestId: 'request-1',
        sessions: [{ id: 'session-1', title: 'History', cwd: 'G:/project', updatedAt: 1 }],
      },
    ])
  })

  test('routes prompt and interruption commands', async () => {
    const calls: string[] = []
    const dispatcher = new DesktopCommandDispatcher({
      controller: {
        createSession: () => {
          throw new Error('not used')
        },
        submitPrompt: async (sessionId, text) => calls.push(`prompt:${sessionId}:${text}`),
        interrupt: sessionId => {
          calls.push(`interrupt:${sessionId}`)
          return true
        },
        setModel: () => {},
        setMode: () => {},
      },
      listSessions: async () => [],
      resolvePermission: () => false,
      emit: () => {},
      shutdown: async () => {},
    })

    await dispatcher.dispatch({
      type: 'prompt.submit',
      requestId: 'request-1',
      sessionId: 'session-1',
      text: 'hello',
    })
    await dispatcher.dispatch({
      type: 'generation.interrupt',
      requestId: 'request-2',
      sessionId: 'session-1',
    })

    expect(calls).toEqual(['prompt:session-1:hello', 'interrupt:session-1'])
  })

  test('does not block interruption while a prompt is running', async () => {
    let release: (() => void) | undefined
    const calls: string[] = []
    const dispatcher = new DesktopCommandDispatcher({
      controller: {
        createSession: () => { throw new Error('not used') },
        submitPrompt: () => new Promise<void>(resolve => { release = resolve }),
        interrupt: sessionId => { calls.push(`interrupt:${sessionId}`); return true },
        setModel: () => {},
        setMode: () => {},
      },
      listSessions: async () => [],
      resolvePermission: () => false,
      emit: () => {},
      shutdown: async () => {},
    })

    await dispatcher.dispatch({
      type: 'prompt.submit', requestId: 'request-1', sessionId: 'session-1', text: 'wait',
    })
    await dispatcher.dispatch({
      type: 'generation.interrupt', requestId: 'request-2', sessionId: 'session-1',
    })

    expect(calls).toEqual(['interrupt:session-1'])
    release?.()
  })

  test('does not block interruption while a session resume is loading', async () => {
    let release: (() => void) | undefined
    const calls: string[] = []
    const dispatcher = new DesktopCommandDispatcher({
      controller: {
        createSession: () => { throw new Error('not used') },
        submitPrompt: async () => {},
        interrupt: sessionId => { calls.push(`interrupt:${sessionId}`); return true },
        setModel: () => {},
        setMode: () => {},
      },
      listSessions: async () => [],
      resumeSession: sessionId => new Promise<void>(resolve => {
        calls.push(`resume:${sessionId}`)
        release = resolve
      }),
      resolvePermission: () => false,
      emit: () => {},
      shutdown: async () => {},
    })

    await dispatcher.dispatch({
      type: 'session.resume', requestId: 'request-1', sessionId: 'history-1',
    })
    await dispatcher.dispatch({
      type: 'generation.interrupt', requestId: 'request-2', sessionId: 'session-1',
    })

    expect(calls).toEqual(['resume:history-1', 'interrupt:session-1'])
    release?.()
  })

  test('reports asynchronous resume failures against the requested session', async () => {
    const events: DesktopEvent[] = []
    const dispatcher = new DesktopCommandDispatcher({
      controller: {
        createSession: () => { throw new Error('not used') },
        submitPrompt: async () => {},
        interrupt: () => false,
        setModel: () => {},
        setMode: () => {},
      },
      listSessions: async () => [],
      resumeSession: async () => { throw new Error('history failed') },
      resolvePermission: () => false,
      emit: event => events.push(event),
      shutdown: async () => {},
    })

    await dispatcher.dispatch({
      type: 'session.resume',
      requestId: 'request-1',
      sessionId: 'history-1',
    })
    await Promise.resolve()

    expect(events[0]).toMatchObject({
      type: 'command.failed',
      requestId: 'request-1',
      sessionId: 'history-1',
      error: { code: 'QUERY_FAILED', message: 'history failed' },
    })
  })

  test('reports prompt failures against the source session', async () => {
    const events: DesktopEvent[] = []
    const dispatcher = new DesktopCommandDispatcher({
      controller: {
        createSession: () => { throw new Error('not used') },
        submitPrompt: async () => { throw new Error('network stalled') },
        interrupt: () => false,
        setModel: () => {},
        setMode: () => {},
      },
      listSessions: async () => [],
      resolvePermission: () => false,
      emit: event => events.push(event),
      shutdown: async () => {},
    })

    await dispatcher.dispatch({
      type: 'prompt.submit',
      requestId: 'request-1',
      sessionId: 'session-1',
      text: 'nihao',
    })
    await Promise.resolve()

    expect(events[0]).toMatchObject({
      type: 'command.failed',
      requestId: 'request-1',
      sessionId: 'session-1',
      error: { code: 'QUERY_FAILED', message: 'network stalled' },
    })
  })

  test('reports an interrupt that cannot reach an active generation', async () => {
    const events: DesktopEvent[] = []
    const dispatcher = new DesktopCommandDispatcher({
      controller: {
        createSession: () => { throw new Error('not used') },
        submitPrompt: async () => {},
        interrupt: () => false,
        setModel: () => {},
        setMode: () => {},
      },
      listSessions: async () => [],
      resolvePermission: () => false,
      emit: event => events.push(event),
      shutdown: async () => {},
    })

    await dispatcher.dispatch({
      type: 'generation.interrupt',
      requestId: 'request-2',
      sessionId: 'session-1',
    })

    expect(events[0]).toMatchObject({
      type: 'command.failed',
      requestId: 'request-2',
      sessionId: 'session-1',
      error: { code: 'QUERY_FAILED' },
    })
  })

  test('ignores stale permission resolutions instead of surfacing an error', async () => {
    const events: DesktopEvent[] = []
    const dispatcher = new DesktopCommandDispatcher({
      controller: {
        createSession: () => { throw new Error('not used') },
        submitPrompt: async () => {},
        interrupt: () => false,
        setModel: () => {},
        setMode: () => {},
      },
      listSessions: async () => [],
      resolvePermission: () => false,
      emit: event => events.push(event),
      shutdown: async () => {},
    })

    await dispatcher.dispatch({
      type: 'permission.resolve',
      requestId: 'request-permission',
      permissionId: 'missing-request',
      decision: 'allow_once',
    })

    expect(events).toEqual([])
  })

  test('writes files through the desktop configuration service boundary', async () => {
    const events: DesktopEvent[] = []
    const dispatcher = new DesktopCommandDispatcher({
      controller: {
        createSession: () => { throw new Error('not used') },
        submitPrompt: async () => {},
        interrupt: () => false,
        setModel: () => {},
        setMode: () => {},
      },
      listSessions: async () => [],
      resolvePermission: () => false,
      emit: event => events.push(event),
      shutdown: async () => {},
      writeFile: async (path, content, cwd) => `${cwd}:${path}:${content}`,
    })

    await dispatcher.dispatch({
      type: 'file.write',
      requestId: 'request-write',
      path: 'src/app.ts',
      cwd: 'G:/project',
      content: 'export const ok = true',
    })

    expect(events).toEqual([
      {
        type: 'file.saved',
        requestId: 'request-write',
        path: 'src/app.ts',
        content: 'G:/project:src/app.ts:export const ok = true',
      },
    ])
  })

  test('writes model configuration and emits a saved snapshot', async () => {
    const events: DesktopEvent[] = []
    const dispatcher = new DesktopCommandDispatcher({
      controller: {
        createSession: () => { throw new Error('not used') },
        submitPrompt: async () => {},
        interrupt: () => false,
        setModel: () => {},
        setMode: () => {},
      },
      listSessions: async () => [],
      resolvePermission: () => false,
      emit: event => events.push(event),
      shutdown: async () => {},
      writeConfig: async (cwd, modelConfig) => ({
        cwd,
        skills: [],
        mcpServers: [],
        plugins: [],
        memoryFiles: [],
        modelConfig,
      }),
    })

    await dispatcher.dispatch({
      type: 'config.write',
      requestId: 'request-config',
      cwd: 'G:/project',
      modelConfig: {
        provider: 'openai',
        baseUrl: 'http://localhost:11434/v1',
        token: 'sk-test',
        model: 'qwen3-coder',
      },
    })

    expect(events).toEqual([
      {
        type: 'config.saved',
        requestId: 'request-config',
        config: {
          cwd: 'G:/project',
          skills: [],
          mcpServers: [],
          plugins: [],
          memoryFiles: [],
          modelConfig: {
            provider: 'openai',
            baseUrl: 'http://localhost:11434/v1',
            token: 'sk-test',
            model: 'qwen3-coder',
          },
        },
      },
    ])
  })

  test('tests model configuration and emits the result', async () => {
    const events: DesktopEvent[] = []
    const dispatcher = new DesktopCommandDispatcher({
      controller: {
        createSession: () => { throw new Error('not used') },
        submitPrompt: async () => {},
        interrupt: () => false,
        setModel: () => {},
        setMode: () => {},
      },
      listSessions: async () => [],
      resolvePermission: () => false,
      emit: event => events.push(event),
      shutdown: async () => {},
      testConfig: async modelConfig => ({
        ok: true,
        provider: modelConfig.provider ?? 'anthropic',
        model: modelConfig.model,
        status: 200,
        latencyMs: 10,
        message: '连接成功',
      }),
    })

    await dispatcher.dispatch({
      type: 'config.test',
      requestId: 'request-test',
      cwd: 'G:/project',
      modelConfig: {
        provider: 'anthropic',
        baseUrl: 'https://api.example.test/anthropic',
        token: 'sk-test',
        model: 'deepseek-v4-flash',
      },
    })

    expect(events).toEqual([
      {
        type: 'config.tested',
        requestId: 'request-test',
        result: {
          ok: true,
          provider: 'anthropic',
          model: 'deepseek-v4-flash',
          status: 200,
          latencyMs: 10,
          message: '连接成功',
        },
      },
    ])
  })
})
