import { describe, expect, test } from 'bun:test'
import { createDesktopApi } from '../electron/desktop-api.js'
import type { DesktopCommand } from '../shared/protocol.js'

describe('createDesktopApi', () => {
  test('exposes only named desktop operations', () => {
    const api = createDesktopApi(
      () => {},
      () => () => {},
      () => 'request-1',
      {
        selectWorkspace: () => Promise.resolve(null),
        listWorkspaceEditors: () => Promise.resolve([]),
        openWorkspaceInEditor: () => Promise.resolve(),
        get: () =>
          Promise.resolve({
            coreStatus: 'ready',
            logPath: '',
            latestLines: '',
            lastError: null,
          }),
        openFolder: () => Promise.resolve(),
      },
    )
    expect(Object.keys(api).sort()).toEqual([
      'compactMemory',
      'createSession',
      'deleteSession',
      'getBuddy',
      'getConfig',
      'getDiagnostics',
      'getPerformance',
      'hatchBuddy',
      'interruptGeneration',
      'listSessions',
      'listWorkspaceEditors',
      'openLogFolder',
      'openWorkspaceInEditor',
      'petBuddy',
      'readFile',
      'readMemory',
      'rehatchBuddy',
      'resolvePermission',
      'resumeSession',
      'selectWorkspace',
      'setBuddyMuted',
      'setMode',
      'setModel',
      'submitPrompt',
      'subscribe',
      'testConfig',
      'writeConfig',
      'writeFile',
      'writeMemory',
    ])
  })

  test('builds a typed prompt command', () => {
    const commands: DesktopCommand[] = []
    const api = createDesktopApi(
      command => commands.push(command),
      () => () => {},
      () => 'request-1',
    )

    api.submitPrompt('session-1', 'hello')

    expect(commands).toEqual([
      {
        type: 'prompt.submit',
        requestId: 'request-1',
        sessionId: 'session-1',
        text: 'hello',
      },
    ])
  })

  test('builds a typed performance command', () => {
    const commands: DesktopCommand[] = []
    const api = createDesktopApi(command => commands.push(command), () => () => {}, () => 'request-1')
    api.getPerformance('G:/project', '30d', true)
    expect(commands).toEqual([{ type: 'performance.get', requestId: 'request-1', cwd: 'G:/project', range: '30d', force: true }])
  })

  test('builds typed configuration commands', () => {
    const commands: DesktopCommand[] = []
    const api = createDesktopApi(
      command => commands.push(command),
      () => () => {},
      () => 'request-1',
    )

    api.getConfig('G:/project')
    api.writeConfig('G:/project', {
      provider: 'openai',
      baseUrl: 'http://localhost:11434/v1',
      token: 'sk-test',
      model: 'qwen3-coder',
    })
    api.testConfig('G:/project', {
      provider: 'openai',
      baseUrl: 'http://localhost:11434/v1',
      token: 'sk-test',
      model: 'qwen3-coder',
    })
    api.readFile('src/app.ts')
    api.writeFile('src/app.ts', 'export const ok = true', 'G:/project')
    api.readMemory('G:/project/CLAUDE.md')
    api.writeMemory('G:/project/CLAUDE.md', '# notes')
    api.compactMemory('G:/project/CLAUDE.md', '# notes')

    expect(commands.map(command => command.type)).toEqual([
      'config.get',
      'config.write',
      'config.test',
      'file.read',
      'file.write',
      'memory.read',
      'memory.write',
      'memory.compact',
    ])
  })

  test('delegates workspace selection to diagnostics helpers', async () => {
    const api = createDesktopApi(
      () => {},
      () => () => {},
      () => 'request-1',
      {
        selectWorkspace: () => Promise.resolve('G:/project'),
        listWorkspaceEditors: () => Promise.resolve([
          { id: 'vscode', name: 'Visual Studio Code', icon: 'vscode' },
        ]),
        openWorkspaceInEditor: () => Promise.resolve(),
        get: () =>
          Promise.resolve({
            coreStatus: 'ready',
            logPath: '',
            latestLines: '',
            lastError: null,
          }),
        openFolder: () => Promise.resolve(),
      },
    )

    await expect(api.selectWorkspace()).resolves.toBe('G:/project')
    await expect(api.listWorkspaceEditors(true)).resolves.toEqual([
      { id: 'vscode', name: 'Visual Studio Code', icon: 'vscode' },
    ])
    await expect(api.openWorkspaceInEditor('vscode', 'G:/project')).resolves.toBeUndefined()
  })
})
