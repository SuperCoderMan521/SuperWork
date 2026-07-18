import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ConfigCenter } from '../renderer/src/features/settings/ConfigCenter.js'
import { SessionSettings } from '../renderer/src/features/settings/SessionSettings.js'

const config = {
  cwd: 'G:/project',
  skills: [{ id: 'skill-1', name: 'review', enabled: true, path: 'G:/project/.agents/skills/review' }],
  mcpServers: [{ id: 'mcp-1', name: 'filesystem', enabled: true, path: 'G:/project/.mcp.json' }],
  plugins: [{ id: 'plugin-1', name: 'browser', enabled: true, path: 'C:/Users/test/.codex/plugins/browser' }],
  memoryFiles: [
    {
      id: 'project-root',
      label: 'Project CLAUDE.md',
      path: 'G:/project/CLAUDE.md',
      scope: 'project' as const,
      exists: false,
    },
  ],
  modelConfig: {
    provider: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    token: 'sk-test',
    model: 'qwen3-coder',
  },
}

describe('SessionSettings', () => {
  test('renders model, permission mode and provider execution config controls', () => {
    const html = renderToStaticMarkup(
      <SessionSettings
        model="sonnet"
        mode="default"
        cwd="G:/project"
        configPath="G:/project/.claudecode/setting.json"
        modelConfig={config.modelConfig}
        onModelChange={() => {}}
        onModeChange={() => {}}
        onModelConfigChange={() => {}}
        onTestModelConfig={() => {}}
        connectionTest={{
          ok: true,
          provider: 'openai',
          model: 'qwen3-coder',
          status: 200,
          latencyMs: 12,
          message: '连接成功',
        }}
      />,
    )

    expect(html).toContain('sonnet')
    expect(html).toContain('项目路径')
    expect(html).toContain('G:/project')
    expect(html).toContain('配置文件')
    expect(html).toContain('G:/project/.claudecode/setting.json')
    expect(html).toContain('Base URL')
    expect(html).toContain('Token')
    expect(html).toContain('MODEL')
    expect(html).toContain('测试连接')
    expect(html).toContain('连接成功')
    expect(html).toContain('qwen3-coder')
    expect(html).toContain('Plan')
    expect(html).toContain('Accept edits')
  })
})

describe('ConfigCenter', () => {
  test('renders as an in-app page with back and left refresh controls', () => {
    const html = renderToStaticMarkup(
      <ConfigCenter
        selectedTitle="Analyze API"
        initialTab="mcp"
        model="sonnet"
        mode="default"
        cwd="G:/project"
        config={config}
        memoryFile={null}
        compactSummary={null}
        connectionTest={null}
        connectionTesting={false}
        onBack={() => {}}
        onModelChange={() => {}}
        onModeChange={() => {}}
        onModelConfigChange={() => {}}
        onTestModelConfig={() => {}}
        onRefresh={() => {}}
        onReadMemory={() => {}}
        onCreateMemory={() => {}}
        onSaveMemory={() => {}}
        onCompactMemory={() => {}}
        onCollapseMemory={() => {}}
      />,
    )

    expect(html).toContain('settings-page')
    expect(html).toContain('aria-label="返回主对话"')
    expect(html).toContain('aria-label="刷新配置"')
    expect(html).toContain('filesystem')
  })

  test('renders memory create and collapse controls', () => {
    const html = renderToStaticMarkup(
      <ConfigCenter
        selectedTitle="Analyze API"
        initialTab="memory"
        model="sonnet"
        mode="default"
        cwd="G:/project"
        config={config}
        memoryFile={{
          ...config.memoryFiles[0],
          exists: false,
          content: '',
        }}
        compactSummary={null}
        connectionTest={null}
        connectionTesting={false}
        onBack={() => {}}
        onModelChange={() => {}}
        onModeChange={() => {}}
        onModelConfigChange={() => {}}
        onTestModelConfig={() => {}}
        onRefresh={() => {}}
        onReadMemory={() => {}}
        onCreateMemory={() => {}}
        onSaveMemory={() => {}}
        onCompactMemory={() => {}}
        onCollapseMemory={() => {}}
      />,
    )

    expect(html).toContain('创建')
    expect(html).toContain('收起编辑')
    expect(html).toContain('保存记忆')
  })
})
