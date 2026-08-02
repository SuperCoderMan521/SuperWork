import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  ConfigCenter,
  imageSrcFromWeixinQr,
} from '../renderer/src/features/settings/ConfigCenter.js'
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
    {
      id: 'auto-memory',
      label: 'MEMORY.md',
      path: 'C:/Users/test/.claude/projects/project/memory/MEMORY.md',
      scope: 'auto' as const,
      exists: true,
      relativePath: 'MEMORY.md',
      description: '自动记忆索引',
    },
  ],
  autoMemory: {
    enabled: true,
    path: 'C:/Users/test/.claude/projects/project/memory/',
  },
  modelConfig: {
    provider: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    token: 'sk-test',
    model: 'qwen3-coder',
  },
  channel: {
    weixin: {
      connected: true,
      stateDir: 'C:/Users/test/.claude/channels/weixin',
      accountPath: 'C:/Users/test/.claude/channels/weixin/account.json',
      accessPath: 'C:/Users/test/.claude/channels/weixin/access.json',
      cursorPath: 'C:/Users/test/.claude/channels/weixin/cursor.txt',
      baseUrl: 'https://ilinkai.weixin.qq.com',
      userId: 'wx-user-1',
      savedAt: '2026-08-02T00:00:00.000Z',
      allowedUsers: 2,
      pendingPairings: 0,
      cursorPresent: true,
    },
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
    expect(html).toContain('Token 价格')
    expect(html).toContain('输入价格')
    expect(html).toContain('缓存读取价格')
    expect(html).toContain('测试连接')
    expect(html).toContain('连接成功')
    expect(html).toContain('qwen3-coder')
    expect(html).toContain('Plan')
    expect(html).toContain('Accept edits')
  })
})

describe('ConfigCenter', () => {
  test('normalizes Weixin QR image payloads for browser display', () => {
    expect(imageSrcFromWeixinQr('a'.repeat(120))).toBe(`data:image/png;base64,${'a'.repeat(120)}`)
    expect(imageSrcFromWeixinQr('data:image/png;base64,abc')).toBe('data:image/png;base64,abc')
    expect(imageSrcFromWeixinQr('https://example.test/qr.png')).toBe('https://example.test/qr.png')
  })

  test('renders as an in-app page with back control', () => {
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
        weixinLogin={null}
        onBack={() => {}}
        onModelChange={() => {}}
        onModeChange={() => {}}
        onModelConfigChange={() => {}}
        onTestModelConfig={() => {}}
        onLoginWeixinChannel={() => {}}
        onClearWeixinChannel={() => {}}
        onAutoMemoryChange={() => {}}
        onReadMemory={() => {}}
        onCreateMemory={() => {}}
        onSaveMemory={() => {}}
        onCompactMemory={() => {}}
        onCollapseMemory={() => {}}
      />,
    )

    expect(html).toContain('settings-page')
    expect(html).toContain('aria-label="返回主对话"')
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
        weixinLogin={null}
        onBack={() => {}}
        onModelChange={() => {}}
        onModeChange={() => {}}
        onModelConfigChange={() => {}}
        onTestModelConfig={() => {}}
        onLoginWeixinChannel={() => {}}
        onClearWeixinChannel={() => {}}
        onAutoMemoryChange={() => {}}
        onReadMemory={() => {}}
        onCreateMemory={() => {}}
        onSaveMemory={() => {}}
        onCompactMemory={() => {}}
        onCollapseMemory={() => {}}
      />,
    )

    expect(html).toContain('创建')
    expect(html).toContain('用户问答记忆')
    expect(html).toContain('Auto Memory 已开启')
    expect(html).toContain('MEMORY.md')
    expect(html).toContain('CLAUDE.md 规则文件')
    expect(html).toContain('收起编辑')
    expect(html).toContain('保存记忆')
  })

  test('renders channel tab with Weixin authentication and conversation guidance', () => {
    const html = renderToStaticMarkup(
      <ConfigCenter
        selectedTitle="Analyze API"
        initialTab="channel"
        model="sonnet"
        mode="default"
        cwd="G:/project"
        config={config}
        memoryFile={null}
        compactSummary={null}
        connectionTest={null}
        connectionTesting={false}
        weixinLogin={null}
        onBack={() => {}}
        onModelChange={() => {}}
        onModeChange={() => {}}
        onModelConfigChange={() => {}}
        onTestModelConfig={() => {}}
        onLoginWeixinChannel={() => {}}
        onClearWeixinChannel={() => {}}
        onAutoMemoryChange={() => {}}
        onReadMemory={() => {}}
        onCreateMemory={() => {}}
        onSaveMemory={() => {}}
        onCompactMemory={() => {}}
        onCollapseMemory={() => {}}
      />,
    )

    expect(html).toContain('Channel')
    expect(html).toContain('微信')
    expect(html).toContain('已连接')
    expect(html).toContain('ccb weixin login')
    expect(html).toContain('扫码登录')
    expect(html).toContain('清除登录')
    expect(html).toContain('plugin:weixin@builtin')
    expect(html).toContain('wx-user-1')
  })
})
