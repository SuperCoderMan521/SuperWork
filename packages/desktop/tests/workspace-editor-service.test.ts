import { describe, expect, test } from 'bun:test'
import {
  WorkspaceEditorService,
  type EditorCandidate,
} from '../electron/workspace-editor-service.js'

describe('WorkspaceEditorService', () => {
  test('merges valid candidates, removes duplicates, and preserves product order', async () => {
    const code = 'C:\\Apps\\VS Code\\Code.exe'
    const cursor = 'C:\\Apps\\Cursor\\Cursor.exe'
    const validPaths = new Set([code.toLowerCase(), cursor.toLowerCase()])
    const candidates: EditorCandidate[] = [
      { id: 'cursor', executable: cursor, source: 'registry' },
      { id: 'vscode', executable: code, source: 'known-path' },
      { id: 'vscode', executable: code, source: 'path' },
      { id: 'windsurf', executable: 'C:\\Missing\\Windsurf.exe', source: 'path' },
    ]
    const service = new WorkspaceEditorService({
      platform: 'win32',
      discoverCandidates: async () => candidates,
      fileExists: async path => validPaths.has(path.toLowerCase()),
      isDirectory: async () => true,
      launch: async () => {},
    })

    expect(await service.list({ refresh: true })).toEqual([
      { id: 'vscode', name: 'Visual Studio Code', icon: 'vscode' },
      { id: 'cursor', name: 'Cursor', icon: 'cursor' },
    ])
  })

  test('launches a supported editor with the workspace as one argument', async () => {
    const launches: Array<{ executable: string; args: string[] }> = []
    const service = new WorkspaceEditorService({
      platform: 'win32',
      discoverCandidates: async () => [
        { id: 'cursor', executable: 'C:\\Cursor.exe', source: 'registry' },
      ],
      fileExists: async () => true,
      isDirectory: async path => path === 'G:\\repo',
      launch: async (executable, args) => {
        launches.push({ executable, args })
      },
    })

    await service.open('cursor', 'G:\\repo')

    expect(launches).toEqual([
      { executable: 'C:\\Cursor.exe', args: ['G:\\repo'] },
    ])
  })

  test('rejects unknown editors and invalid workspace directories', async () => {
    const service = new WorkspaceEditorService({
      platform: 'win32',
      discoverCandidates: async () => [
        { id: 'vscode', executable: 'C:\\Code.exe', source: 'path' },
      ],
      fileExists: async () => true,
      isDirectory: async () => false,
      launch: async () => {},
    })

    await expect(service.open('unknown', 'G:\\repo')).rejects.toThrow(
      'Unsupported editor',
    )
    await expect(service.open('vscode', 'G:\\repo')).rejects.toThrow(
      'Workspace directory does not exist',
    )
  })
})
