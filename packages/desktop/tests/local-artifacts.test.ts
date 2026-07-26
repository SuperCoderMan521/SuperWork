import { describe, expect, test } from 'bun:test'
import { deriveLocalArtifacts } from '../renderer/src/features/artifacts/localArtifacts.js'

describe('deriveLocalArtifacts', () => {
  test('detects artifact file paths from write tools', () => {
    const artifacts = deriveLocalArtifacts({
      messages: {},
      messageOrder: [],
      tools: {
        'tool-1': {
          id: 'tool-1',
          name: 'Write',
          state: 'success',
          summary: 'dashboard.html',
          input: { file_path: 'G:/tmp/dashboard.html' },
          displayOrder: 3,
        },
      },
      toolOrder: ['tool-1'],
    })

    expect(artifacts.map(item => item.path)).toEqual(['G:/tmp/dashboard.html'])
    expect(artifacts[0]?.kind).toBe('html')
    expect(artifacts[0]?.title).toBe('dashboard.html')
  })

  test('detects complete fenced artifacts from assistant messages', () => {
    const artifacts = deriveLocalArtifacts({
      messages: {
        'msg-1': {
          id: 'msg-1',
          role: 'assistant',
          kind: 'text',
          content: '```mermaid\ngraph TD; A-->B\n```',
          createdAt: 10,
          displayOrder: 10,
        },
      },
      messageOrder: ['msg-1'],
      tools: {},
      toolOrder: [],
    })

    expect(artifacts).toMatchObject([
      {
        source: 'message',
        kind: 'mermaid',
        content: 'graph TD; A-->B',
        messageId: 'msg-1',
      },
    ])
  })

  test('ignores incomplete fenced blocks and cloud artifact links', () => {
    const artifacts = deriveLocalArtifacts({
      messages: {
        'msg-1': {
          id: 'msg-1',
          role: 'assistant',
          kind: 'text',
          content: '```html\n<div>',
          createdAt: 10,
        },
      },
      messageOrder: ['msg-1'],
      tools: {
        'tool-1': {
          id: 'tool-1',
          name: 'artifact',
          state: 'success',
          summary: 'cloud',
          output:
            'Artifact uploaded: https://x.test/7d/a.html (id: a, expires: 2026-06-27T10:00:00.000Z)',
        },
      },
      toolOrder: ['tool-1'],
    })

    expect(artifacts).toEqual([])
  })
})
