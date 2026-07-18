import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { DiagnosticsDrawer } from '../renderer/src/features/diagnostics/DiagnosticsDrawer.js'

describe('DiagnosticsDrawer', () => {
  test('shows Core status, failure reason, log path, recent lines, and close affordances', () => {
    const html = renderToStaticMarkup(
      <DiagnosticsDrawer
        diagnostics={{
          coreStatus: 'failed',
          logPath: 'C:/Users/test/AppData/Roaming/SuperWork/logs/desktop.log',
          latestLines: 'ERROR spawn ENOENT',
          lastError: 'Desktop Core failed to start',
        }}
        onClose={() => {}}
        onRefresh={() => {}}
        onCopy={() => {}}
        onOpenDirectory={() => {}}
      />,
    )

    expect(html).toContain('Desktop Core failed to start')
    expect(html).toContain('desktop.log')
    expect(html).toContain('ERROR spawn ENOENT')
    expect(html).toContain('打开日志目录')
    expect(html).toContain('diagnostics-backdrop')
    expect(html).toContain('aria-label="关闭诊断日志"')
  })
})
