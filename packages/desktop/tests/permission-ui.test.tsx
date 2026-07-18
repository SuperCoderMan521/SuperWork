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
  })
})
