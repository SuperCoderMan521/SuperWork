import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { PermissionPanel } from '../renderer/src/features/permissions/PermissionPanel.js'

describe('PermissionPanel', () => {
  test('renders only decisions offered by Core', () => {
    const html = renderToStaticMarkup(
      <PermissionPanel
        request={{
          id: 'permission-1',
          toolCallId: 'tool-1',
          toolName: 'Bash',
          summary: 'bun test',
          input: { command: 'bun test' },
          decisions: ['deny', 'allow_once'],
        }}
        onResolve={() => {}}
      />,
    )
    expect(html).toContain('Bash 请求权限')
    expect(html).toContain('允许一次')
    expect(html).not.toContain('本会话允许')
    expect(html).toContain('<form class="permission-actions"')
    expect(html).toContain('name="decision"')
  })

  test('identifies the worker that requested permission', () => {
    const html = renderToStaticMarkup(
      <PermissionPanel
        request={{
          id: 'permission-worker',
          toolCallId: 'tool-worker',
          toolName: 'Bash',
          summary: 'bun test',
          input: { command: 'bun test' },
          decisions: ['deny', 'allow_once'],
          agentId: 'researcher@alpha',
          agentName: 'researcher',
          teamName: 'alpha',
        }}
        onResolve={() => {}}
      />,
    )

    expect(html).toContain('researcher')
    expect(html).toContain('alpha')
  })

  test('renders mailbox write permission as structured details', () => {
    const html = renderToStaticMarkup(
      <PermissionPanel
        request={{
          id: 'perm-1785574452710-kjd9bim',
          toolCallId: 'call_00_yffYMicm1I60DmYCexFY3893',
          toolName: 'Write',
          summary: 'Write a file to the local filesystem.',
          input: {
            file_path: 'K:\\ai\\12\\seckill-node\\package.json',
            content:
              '{\n "name": "seckill-node",\n "version": "1.0.0"\n}\n',
          },
          decisions: ['deny', 'allow_once', 'allow_session'],
          agentId: 'architect-lead',
          agentName: 'architect-lead',
          permissionSuggestions: [
            { type: 'setMode', mode: 'acceptEdits', destination: 'session' },
          ],
        }}
        onResolve={() => {}}
      />,
    )

    expect(html).toContain('architect-lead')
    expect(html).toContain('Write 请求权限')
    expect(html).toContain('K:\\ai\\12\\seckill-node\\package.json')
    expect(html).toContain('seckill-node')
    expect(html).toContain('本会话自动接受文件编辑')
    expect(html).toContain('查看原始请求')
  })
})
