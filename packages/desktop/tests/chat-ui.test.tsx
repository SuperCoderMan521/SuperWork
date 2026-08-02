import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ResizableWorkspace } from '../renderer/src/app/ResizableWorkspace.js'
import type { RendererSession } from '../renderer/src/app/reducer.js'
import {
  ConversationPane,
  getConversationTimeline,
  groupConversationTimeline,
} from '../renderer/src/features/chat/ConversationPane.js'
import {
  Composer,
  buildPromptWithSelectedSkills,
} from '../renderer/src/features/chat/Composer.js'
import { MarkdownMessage } from '../renderer/src/features/chat/MarkdownMessage.js'
import {
  PlanProgressOverlay,
  derivePlanProgress,
} from '../renderer/src/features/chat/PlanProgressOverlay.js'
import { renderPlantUmlToSvg } from '../renderer/src/features/chat/plantumlLocalRenderer.js'
import {
  buildEditDiff,
  toolDisplayMeta,
} from '../renderer/src/features/chat/toolRendering.js'
import {
  ConversationFilesPanel,
  WorkspaceEditorMenu,
  filesFromTools,
} from '../renderer/src/features/files/ConversationFilesPanel.js'
import {
  AgentActivityPanel,
  buildAgentActivity,
} from '../renderer/src/features/agents/AgentActivityPanel.js'
import type { DesktopLocalArtifact } from '../renderer/src/features/artifacts/localArtifacts.js'
import { WorkspacePanel } from '../renderer/src/features/workspace/WorkspacePanel.js'
import {
  SessionSidebar,
  groupSessionsByWorkspace,
} from '../renderer/src/features/history/SessionSidebar.js'

const session: RendererSession = {
  id: 'session-1',
  title: 'Analyze API',
  cwd: 'G:/project',
  updatedAt: 100,
  model: 'sonnet',
  mode: 'default',
  messages: {
    'message-1': {
      id: 'message-1',
      role: 'assistant',
      content: 'Hello',
      createdAt: 100,
    },
  },
  messageOrder: ['message-1'],
  tools: {
    'tool-1': {
      id: 'tool-1',
      name: 'Read',
      state: 'success',
      summary: 'src/query.ts',
      input: { file_path: 'src/query.ts' },
      startedAt: 200,
    },
  },
  toolOrder: ['tool-1'],
  permissions: {},
  permissionOrder: [],
  generationState: 'idle',
  sequence: 1,
  needsSnapshot: false,
}

describe('desktop chat UI', () => {
  test('marks the composer with animated generation affordances', () => {
    const html = renderToStaticMarkup(
      <Composer
        generating={true}
        workspace="G:/project"
        onSubmit={() => {}}
        onInterrupt={() => {}}
        onSelectWorkspace={() => {}}
      />,
    )

    expect(html).toContain('composer-generating')
    expect(html).toContain('composer-status-shimmer')
    expect(html).toContain('aria-live="polite"')
  })

  test('renders session history in the sidebar with workspace paths', () => {
    const html = renderToStaticMarkup(
      <SessionSidebar
        sessions={[session]}
        selectedId="session-1"
        onSelect={() => {}}
        onCreate={() => {}}
      />,
    )
    expect(html).toContain('Analyze API')
    expect(html).toContain('G:/project')
    expect(html).toContain('新任务')
    expect(html).toContain('Super')
    expect(html).toContain('Work')
  })

  test('groups sidebar sessions by workspace folder', () => {
    const groups = groupSessionsByWorkspace([
      { id: 's1', title: 'First', cwd: 'G:/work/project-a', updatedAt: 100 },
      { id: 's2', title: 'Second', cwd: 'G:/work/project-b', updatedAt: 300 },
      { id: 's3', title: 'Third', cwd: 'G:/work/project-a', updatedAt: 200 },
    ])

    expect(groups.map(group => group.label)).toEqual(['project-b', 'project-a'])
    expect(groups[1]?.sessions.map(item => item.id)).toEqual(['s3', 's1'])
  })

  test('renders grouped session history with folder labels', () => {
    const html = renderToStaticMarkup(
      <SessionSidebar
        sessions={[
          { ...session, id: 'session-a', cwd: 'G:/work/project-a', title: 'Ask A', updatedAt: 100 },
          { ...session, id: 'session-b', cwd: 'G:/work/project-b', title: 'Ask B', updatedAt: 200 },
        ]}
        selectedId="session-a"
        onSelect={() => {}}
        onCreate={() => {}}
      />,
    )

    expect(html).toContain('workspace-group')
    expect(html).toContain('workspace-group-details')
    expect(html).toContain('aria-label="展开或收起工作区历史"')
    expect(html).toContain('workspace-group-active')
    expect(html).toContain('project-a')
    expect(html).toContain('project-b')
    expect(html).toContain('Ask A')
    expect(html).toContain('Ask B')
  })

  test('disables new conversation while Core is starting', () => {
    const html = renderToStaticMarkup(
      <SessionSidebar
        sessions={[]}
        selectedId={null}
        onSelect={() => {}}
        onCreate={() => {}}
        disableCreate={true}
      />,
    )
    expect(html).toContain('Core 启动中')
    expect(html).toContain('disabled')
  })

  test('renders resizable shell with splitters and a closeable file panel', () => {
    const html = renderToStaticMarkup(
      <ResizableWorkspace
        sidebar={<aside>left</aside>}
        chat={<main>chat</main>}
        files={<aside>files</aside>}
        filePanelOpen={true}
        onCloseFiles={() => {}}
      />,
    )
    expect(html).toContain('desktop-layout')
    expect(html).toContain('aria-label="调整左侧宽度"')
    expect(html).toContain('aria-label="调整文件区宽度"')
    expect(html).toContain('aria-label="关闭文件区"')
  })

  test('renders messages, tools, workspace picker and icon composer actions', () => {
    const html = renderToStaticMarkup(
      <ConversationPane
        session={{ ...session, generationState: 'running' }}
        onSubmit={() => {}}
        onInterrupt={() => {}}
        onSelectWorkspace={() => {}}
        onOpenFile={() => {}}
        onOpenAgents={() => {}}
      />,
    )
    expect(html).toContain('Hello')
    expect(html).not.toContain('src/query.ts')
    expect(html).toContain('输入问题')
    expect(html).toContain('选择工作区')
    expect(html).toContain('aria-label="中断生成"')
  })

  test('renders the rich composer toolbar with skills mcp and auto approval controls', () => {
    const html = renderToStaticMarkup(
      <Composer
        generating={false}
        workspace="G:/project"
        mode="default"
        skills={[
          { id: 'skill-1', name: 'review', enabled: true, path: 'G:/project/.agents/skills/review' },
        ]}
        mcpServers={[
          { id: 'mcp-1', name: 'filesystem', enabled: true, path: 'G:/project/.mcp.json' },
        ]}
        onSubmit={() => {}}
        onInterrupt={() => {}}
        onSelectWorkspace={() => {}}
        onModeChange={() => {}}
      />,
    )

    expect(html).toContain('composer-shell')
    expect(html).toContain('今天帮你做些什么')
    expect(html).toContain('模型')
    expect(html).toContain('Ask')
    expect(html).toContain('Plan')
    expect(html).not.toContain('Craft')
    expect(html).toContain('技能')
    expect(html).toContain('搜索技能')
    expect(html).toContain('review')
    expect(html).toContain('composer-skill-avatar')
    expect(html).toContain('导入技能')
    expect(html).toContain('连应用')
    expect(html).toContain('搜索应用')
    expect(html).toContain('filesystem')
    expect(html).toContain('composer-mcp-avatar')
    expect(html).toContain('管理应用连接')
    expect(html).toContain('composer-approval-menu')
    expect(html).toContain('请求批准')
    expect(html).toContain('替我审批')
    expect(html).toContain('完全访问权限')
    expect(html).toContain('仅对检测到的风险操作请求批准')
    expect(html).not.toContain('全部默认自动审核')
    expect(html).not.toContain('composer-approval-toggle')
    expect(html).not.toContain('<option value="default"')
    expect(html).not.toContain('<option value="plan"')
    expect(html).not.toContain('不再询问')
    expect(html).toContain('选择工作空间')
    expect(html).toContain('内容由 AI 生成，请核实重要信息')
    expect(html).not.toContain('⟳ 自动⌄')
    expect(html).not.toContain('aria-label="添加"')
    expect(html).not.toContain('aria-label="增强"')
    expect(html).not.toContain('aria-label="语音"')
  })

  test('prefixes submitted prompts with selected skill usage hints', () => {
    const prompt = buildPromptWithSelectedSkills('写一篇文章', [
      {
        id: 'skill-1',
        name: 'review',
        enabled: true,
        path: 'G:/project/.agents/skills/review',
      },
      {
        id: 'skill-2',
        name: 'Viral Writer',
        enabled: true,
        path: 'C:/Users/Administrator/.claude/skills/Viral_Writer_Skill',
      },
    ])

    expect(prompt).toBe([
      'Use the /review skill for this request.',
      'Use the /Viral_Writer_Skill skill for this request.',
      '',
      '写一篇文章',
    ].join('\n'))
  })

  test('derives live plan progress from plan mode and tool activity', () => {
    const planSession: RendererSession = {
      ...session,
      mode: 'plan',
      generationState: 'running',
      tools: {
        read: {
          id: 'read',
          name: 'Read',
          state: 'running',
          summary: 'src/query.ts',
          startedAt: 200,
        },
      },
      toolOrder: ['read'],
    }

    const progress = derivePlanProgress(planSession)

    expect(progress.visible).toBe(true)
    expect(progress.currentStep).toBe(2)
    expect(progress.totalSteps).toBe(4)
    expect(progress.steps.map(step => step.label)).toEqual([
      '进入 Plan 模式',
      '读取上下文与相关文件',
      '写入或更新计划文件',
      '提交计划等待批准',
    ])
  })

  test('renders a click-to-open floating plan progress overlay above composer', () => {
    const planSession: RendererSession = {
      ...session,
      mode: 'plan',
      generationState: 'running',
      tools: {
        read: {
          id: 'read',
          name: 'Read',
          state: 'running',
          summary: 'src/query.ts',
          startedAt: 200,
        },
      },
      toolOrder: ['read'],
    }
    const html = renderToStaticMarkup(
      <PlanProgressOverlay session={planSession} defaultOpen={true} />,
    )

    expect(html).toContain('plan-progress-float')
    expect(html).toContain('plan-progress-card')
    expect(html).toContain('进入 Plan 模式')
    expect(html).toContain('读取上下文与相关文件')
    expect(html).toContain('第 2 / 4 步')
    expect(html).toContain('aria-expanded="true"')
  })

  test('maps approval menu selections to concrete permission modes', () => {
    const autoHtml = renderToStaticMarkup(
      <Composer
        generating={false}
        workspace="G:/project"
        mode="auto"
        onSubmit={() => {}}
        onInterrupt={() => {}}
        onSelectWorkspace={() => {}}
        onModeChange={() => {}}
      />,
    )
    const bypassHtml = renderToStaticMarkup(
      <Composer
        generating={false}
        workspace="G:/project"
        mode="bypassPermissions"
        onSubmit={() => {}}
        onInterrupt={() => {}}
        onSelectWorkspace={() => {}}
        onModeChange={() => {}}
      />,
    )

    expect(autoHtml).toContain('composer-approval-trigger')
    expect(autoHtml).toContain('替我审批')
    expect(autoHtml).toContain('aria-pressed="true"')
    expect(bypassHtml).toContain('完全访问权限')
    expect(bypassHtml).toContain('aria-pressed="true"')
  })

  test('renders a collapsed turn usage report after a completed answer', () => {
    const html = renderToStaticMarkup(
      <ConversationPane
        session={{
          ...session,
          turnUsageReports: [{
            id: 'usage-1',
            anchorMessageId: 'message-1',
            status: 'completed',
            provider: 'anthropic',
            model: 'sonnet',
            usage: {
              inputTokens: 1240,
              outputTokens: 386,
              cacheCreationInputTokens: 1120,
              cacheReadInputTokens: 8420,
            },
            apiCalls: 2,
            costUsd: 0.0184,
            durationMs: 12600,
            completedAt: 300,
            displayOrder: 300,
          }],
        }}
        onSubmit={() => {}}
        onInterrupt={() => {}}
        onSelectWorkspace={() => {}}
      />,
    )
    expect(html).toContain('turn-usage-report')
    expect(html).toContain('本轮使用')
    expect(html).toContain('11,166 tokens')
    expect(html).toContain('缓存 78%')
    expect(html).toContain('$0.0184')
    expect(html).toContain('12.6s')
  })

  test('shows a workspace-required hint when the session has no real workspace', () => {
    const html = renderToStaticMarkup(
      <ConversationPane
        session={{
          ...session,
          cwd: '.',
        }}
        onSubmit={() => {}}
        onInterrupt={() => {}}
        onSelectWorkspace={() => {}}
        onOpenFile={() => {}}
        onOpenAgents={() => {}}
      />,
    )

    expect(html).toContain('需要选择文件空间后才能开始对话')
    expect(html).toContain('选择文件空间')
    expect(html).toContain('workspace-required-banner')
  })

  test('renders user slash commands as command tool messages', () => {
    const html = renderToStaticMarkup(
      <ConversationPane
        session={{
          ...session,
          messages: {
            branch: {
              id: 'branch',
              role: 'user',
              content: '/branch',
              createdAt: 100,
            },
            agents: {
              id: 'agents',
              role: 'user',
              content: '/agents',
              createdAt: 101,
            },
          },
          messageOrder: ['branch', 'agents'],
          tools: {},
          toolOrder: [],
        }}
        onSubmit={() => {}}
        onInterrupt={() => {}}
        onSelectWorkspace={() => {}}
        onOpenFile={() => {}}
        onOpenAgents={() => {}}
      />,
    )

    expect(html).toContain('command-message')
    expect(html).toContain('Claude Code 指令')
    expect(html).toContain('/branch')
    expect(html).toContain('/agents')
  })

  test('renders thinking blocks on the assistant side', () => {
    const html = renderToStaticMarkup(
      <ConversationPane
        session={{
          ...session,
          messages: {
            thinking: {
              id: 'thinking',
              role: 'assistant',
              kind: 'thinking',
              content: 'analyzing',
              createdAt: 100,
            },
          },
          messageOrder: ['thinking'],
          tools: {},
          toolOrder: [],
        }}
        onSubmit={() => {}}
        onInterrupt={() => {}}
        onSelectWorkspace={() => {}}
        onOpenFile={() => {}}
      />,
    )
    expect(html).toContain('message-meta')
    expect(html).toContain('brand-name')
    expect(html).toContain('message-kind-thinking')
    expect(html).toContain('thinking-block thinking-assistant')
    expect(html).toContain('思考过程')
  })

  test('renders local artifact cards after matching assistant messages', () => {
    const artifactSession: RendererSession = {
      ...session,
      messages: {
        'message-1': {
          id: 'message-1',
          role: 'assistant',
          kind: 'text',
          content: '```html\n<h1>Dashboard</h1>\n```',
          createdAt: 100,
          displayOrder: 1,
        },
      },
      messageOrder: ['message-1'],
      tools: {},
      toolOrder: [],
    }
    const artifacts: DesktopLocalArtifact[] = [
      {
        id: 'message:message-1:0',
        source: 'message',
        title: 'html 片段',
        kind: 'html',
        status: 'ready',
        content: '<h1>Dashboard</h1>',
        messageId: 'message-1',
        createdAt: 100,
        displayOrder: 1,
      },
    ]
    const html = renderToStaticMarkup(
      <ConversationPane
        session={artifactSession}
        artifacts={artifacts}
        onOpenArtifact={() => {}}
        onSubmit={() => {}}
        onInterrupt={() => {}}
        onSelectWorkspace={() => {}}
      />,
    )

    expect(html).toContain('html 片段')
    expect(html).toContain('预览')
  })

  test('shows generation and query failure feedback', () => {
    const html = renderToStaticMarkup(
      <ConversationPane
        session={{ ...session, generationState: 'running' }}
        error="network unavailable"
        onSubmit={() => {}}
        onInterrupt={() => {}}
        onSelectWorkspace={() => {}}
        onOpenFile={() => {}}
      />,
    )
    expect(html).toContain('正在生成')
    expect(html).toContain('请求失败')
    expect(html).toContain('查看日志')
    expect(html).toContain('aria-label="中断生成"')
  })

  test('keeps tools in the conversation timeline instead of appending them last', () => {
    const timeline = getConversationTimeline({
      ...session,
      messages: {
        first: { id: 'first', role: 'user', content: 'one', createdAt: 100 },
        second: { id: 'second', role: 'assistant', content: 'two', createdAt: 300 },
      },
      messageOrder: ['first', 'second'],
      tools: {
        tool: { id: 'tool', name: 'Read', state: 'success', summary: 'file', startedAt: 200 },
      },
      toolOrder: ['tool'],
    })

    expect(timeline.map(item => item.id)).toEqual([
      'message:first',
      'tool:tool',
      'message:second',
    ])
  })

  test('uses stable display order before timestamps for messages and tools', () => {
    const timeline = getConversationTimeline({
      ...session,
      messages: {
        first: {
          id: 'first',
          role: 'assistant',
          content: 'first',
          createdAt: 100,
          displayOrder: 1,
        },
        second: {
          id: 'second',
          role: 'assistant',
          content: 'second',
          createdAt: 100,
          displayOrder: 3,
        },
      },
      messageOrder: ['first', 'second'],
      tools: {
        tool: {
          id: 'tool',
          name: 'Read',
          state: 'running',
          summary: 'a.ts',
          startedAt: 100,
          displayOrder: 2,
        },
      },
      toolOrder: ['tool'],
    })

    expect(timeline.map(item => item.id)).toEqual([
      'message:first',
      'tool:tool',
      'message:second',
    ])
  })

  test('groups adjacent tool calls with the same tool name', () => {
    const timeline = getConversationTimeline({
      ...session,
      messages: {},
      messageOrder: [],
      tools: {
        read1: { id: 'read1', name: 'Read', state: 'success', summary: 'a', startedAt: 1 },
        read2: { id: 'read2', name: 'Read', state: 'success', summary: 'b', startedAt: 2 },
        edit1: { id: 'edit1', name: 'Edit', state: 'success', summary: 'c', startedAt: 3 },
      },
      toolOrder: ['read1', 'read2', 'edit1'],
    })

    const groups = groupConversationTimeline(timeline)

    expect(groups[0]?.type).toBe('tool-group')
    if (groups[0]?.type !== 'tool-group') throw new Error('expected tool group')
    expect(groups[0].name).toBe('Read')
    expect(groups[0].items.map(item => item.tool.id)).toEqual(['read1', 'read2'])
    expect(groups[1]?.type).toBe('single')
    if (groups[1]?.type !== 'single') throw new Error('expected single item')
    expect(groups[1].item.id).toBe('tool:edit1')
  })

  test('keeps completed tool records visible after generation finishes', () => {
    const html = renderToStaticMarkup(
      <ConversationPane
        session={{
          ...session,
          generationState: 'idle',
          messages: {},
          messageOrder: [],
          tools: {
            edit1: {
              id: 'edit1',
              name: 'Edit',
              state: 'success',
              summary: 'src/app.ts',
              input: { file_path: 'src/app.ts' },
              startedAt: 1,
              completedAt: 2,
            },
          },
          toolOrder: ['edit1'],
        }}
        onSubmit={() => {}}
        onInterrupt={() => {}}
        onSelectWorkspace={() => {}}
        onOpenFile={() => {}}
      />,
    )

    expect(html).toContain('tool-card')
    expect(html).toContain('src/app.ts')
  })

  test('keeps completed multi-agent tool frames visible in the conversation', () => {
    const html = renderToStaticMarkup(
      <ConversationPane
        session={{
          ...session,
          generationState: 'idle',
          messages: {},
          messageOrder: [],
          tools: {
            agent: {
              id: 'agent',
              name: 'Agent',
              state: 'success',
              summary: 'researcher',
              input: {
                name: 'researcher',
                team_name: 'refactor-ui',
                subagent_type: 'worker',
              },
              output: 'Agent launched',
              startedAt: 1,
              completedAt: 2,
            },
            team: {
              id: 'team',
              name: 'TeamCreate',
              state: 'success',
              summary: 'refactor-ui',
              input: { team_name: 'refactor-ui' },
              startedAt: 3,
              completedAt: 4,
            },
          },
          toolOrder: ['agent', 'team'],
        }}
        onSubmit={() => {}}
        onInterrupt={() => {}}
        onSelectWorkspace={() => {}}
        onOpenFile={() => {}}
        onOpenAgents={() => {}}
      />,
    )

    expect(html).toContain('tool-card')
    expect(html).toContain('Agent')
    expect(html).toContain('tool-open-agents')
    expect(html).toContain('title="打开 Agent 观测"')
    expect(html).toContain('researcher')
    expect(html).toContain('创建团队')
    expect(html).toContain('refactor-ui')
  })

  test('renders active edit tools as one collapsed progress group with file details', () => {
    const html = renderToStaticMarkup(
      <ConversationPane
        session={{
          ...session,
          generationState: 'running',
          messages: {},
          messageOrder: [],
          tools: {
            edit1: {
              id: 'edit1',
              name: 'Edit',
              state: 'success',
              summary: 'src/old.ts',
              input: { file_path: 'src/old.ts' },
              startedAt: 1,
              completedAt: 2,
            },
            edit2: {
              id: 'edit2',
              name: 'Edit',
              state: 'running',
              summary: 'src/current.ts',
              input: { file_path: 'src/current.ts' },
              startedAt: 3,
            },
          },
          toolOrder: ['edit1', 'edit2'],
        }}
        onSubmit={() => {}}
        onInterrupt={() => {}}
        onSelectWorkspace={() => {}}
        onOpenFile={() => {}}
      />,
    )

    expect(html).toContain('tool-group')
    expect(html).toContain('编辑')
    expect(html).toContain('tool-group-description')
    expect(html).not.toContain('点击展开')
    expect(html).not.toContain('src/old.ts')
    expect(html).toContain('src/current.ts')
    expect(html).toContain('<span class="tool-group-description" title="src/current.ts">src/current.ts</span>')
    expect(html.match(/<details/g)?.length).toBe(1)
  })

  test('uses the same single-level collapsed group for every active tool type', () => {
    const html = renderToStaticMarkup(
      <ConversationPane
        session={{
          ...session,
          generationState: 'running',
          messages: {},
          messageOrder: [],
          tools: {
            read: { id: 'read', name: 'Read', state: 'running', summary: 'src/app.ts', startedAt: 1 },
            shell: { id: 'shell', name: 'BashTool', state: 'running', summary: 'bun test', startedAt: 2 },
            search: { id: 'search', name: 'Grep', state: 'running', summary: 'query', startedAt: 3 },
          },
          toolOrder: ['read', 'shell', 'search'],
        }}
        onSubmit={() => {}}
        onInterrupt={() => {}}
        onSelectWorkspace={() => {}}
        onOpenFile={() => {}}
      />,
    )

    expect(html.match(/<details/g)?.length).toBe(3)
    expect(html).toContain('src/app.ts')
    expect(html).toContain('bun test')
    expect(html).toContain('query')
  })

  test('summarizes long shell commands without widening the conversation', () => {
    const longCommand = [
      'node -e',
      '"const fs = require(\'fs\');',
      'const html = fs.readFileSync(\'G:/ai/test/racing-game.html\', \'utf8\');',
      'const match = html.match(/<script>([\\\\s\\\\S]*?)<\\\\/script>/);',
      'if (!match) process.exit(1);',
      'console.log(match[1].slice(0, 2000));"',
    ].join(' ')
    const html = renderToStaticMarkup(
      <ConversationPane
        session={{
          ...session,
          generationState: 'running',
          messages: {},
          messageOrder: [],
          tools: {
            shell: {
              id: 'shell',
              name: 'BashTool',
              state: 'running',
              summary: longCommand,
              input: { command: longCommand },
              startedAt: 1,
            },
          },
          toolOrder: ['shell'],
        }}
        onSubmit={() => {}}
        onInterrupt={() => {}}
        onSelectWorkspace={() => {}}
      />,
    )

    expect(html).toContain('Shell')
    expect(html).not.toContain('>命令<')
    expect(html).toContain('tool-command-summary')
    expect(html).toContain('查看完整 Shell')
    expect(html).toContain('node -e')
    expect(html).not.toContain(`<span class="tool-group-description" title="${longCommand}">${longCommand}</span>`)
  })

  test('filters directory-looking paths from the file panel', () => {
    const files = filesFromTools(
      {
        folder: {
          id: 'folder',
          name: 'Read',
          state: 'success',
          summary: 'src/components',
          input: { path: 'src/components' },
        },
        file: {
          id: 'file',
          name: 'Write',
          state: 'success',
          summary: 'src/query.ts',
          input: { file_path: 'src/query.ts' },
        },
      },
      ['folder', 'file'],
    )
    expect(files.map(file => file.path)).toEqual(['src/query.ts'])
  })

  test('keeps read-only tool references out of the produced file panel', () => {
    const files = filesFromTools(
      {
        read: {
          id: 'read',
          name: 'Read',
          state: 'success',
          summary: 'src/query.ts',
          input: { file_path: 'src/query.ts' },
          output: 'app.use console.log res.json process.env.PORT',
        },
      },
      ['read'],
    )

    expect(files).toEqual([])
  })

  test('extracts bare shell artifacts from output text', () => {
    const files = filesFromTools(
      {
        shell: {
          id: 'shell',
          name: 'BashTool',
          state: 'success',
          summary: 'build completed',
          output: 'Generated app.bundle.js and index.html',
        },
      },
      ['shell'],
    )
    expect(files.map(file => file.path)).toEqual(['app.bundle.js', 'index.html'])
  })

  test('does not extract web URLs as conversation files', () => {
    const files = filesFromTools(
      {
        web: {
          id: 'web',
          name: 'WebFetch',
          state: 'success',
          summary: 'Fetched web sources',
          output: [
            'https://finance.sina.com.cn/roll/2026-01-02/doc-inhexryn9013336.shtml',
            'http://auto.news18a.com/news/storys_240239.html',
            'Generated report.html',
          ].join('\n'),
        },
      },
      ['web'],
    )

    expect(files.map(file => file.path)).toEqual([])
  })

  test('does not extract decimal fragments as hidden files', () => {
    const files = filesFromTools(
      {
        shell: {
          id: 'shell',
          name: 'BashTool',
          state: 'success',
          summary: 'Calculated scores',
          input: { path: '.env' },
          output: 'Scores: 0.9 0.07 2.3 3.78; generated result.json',
        },
      },
      ['shell'],
    )

    expect(files.map(file => file.path)).toEqual(['result.json'])
  })

  test('renders a right-side editable file panel from tool paths', () => {
    const files = filesFromTools(session.tools, session.toolOrder)
    const activity = buildAgentActivity({}, [])
    const html = renderToStaticMarkup(
      <WorkspacePanel
        fileCount={files.length}
        agentActivity={activity}
        files={
          <ConversationFilesPanel
            files={[{ id: 'edit:src/query.ts', path: 'src/query.ts', label: 'query.ts', source: 'tool' }]}
            selectedPath="src/query.ts"
            fileContent="export const ok = true"
            onOpen={() => {}}
          />
        }
      />,
    )
    expect(html).toContain('文件')
    expect(html).toContain('workspace-tabs')
    expect(html).not.toContain('Agent')
    expect(html).toContain('src/query.ts')
    expect(html).not.toContain('保存')
    expect(html).toContain('export const ok')
  })

  test('can render the right workspace directly on the Agent tab', () => {
    const activity = buildAgentActivity(
      {
        agent: {
          id: 'agent',
          name: 'Agent',
          state: 'success',
          summary: 'researcher',
          input: { name: 'researcher' },
        },
      },
      ['agent'],
    )
    const html = renderToStaticMarkup(
      <WorkspacePanel
        fileCount={0}
        activeTab="agents"
        onTabChange={() => {}}
        agentActivity={activity}
        files={<aside>files</aside>}
      />,
    )

    expect(html).toContain('aria-selected="true"')
    expect(html).toContain('Agent 观测')
    expect(html).toContain('researcher')
    expect(html).not.toContain('<aside>files</aside>')
  })

  test('hides the Agent tab until the current conversation has agent activity', () => {
    const html = renderToStaticMarkup(
      <WorkspacePanel
        fileCount={0}
        activeTab="files"
        onTabChange={() => {}}
        agentActivity={buildAgentActivity({}, [])}
        files={<aside>files</aside>}
      />,
    )

    expect(html).not.toContain('Agent')
    expect(html).toContain('<aside>files</aside>')
  })

  test('falls back to files when the selected Agent tab no longer has agent activity', () => {
    const html = renderToStaticMarkup(
      <WorkspacePanel
        fileCount={0}
        activeTab="agents"
        onTabChange={() => {}}
        agentActivity={buildAgentActivity({}, [])}
        files={<aside>files</aside>}
      />,
    )

    expect(html).not.toContain('Agent 瑙傛祴')
    expect(html).toContain('<aside>files</aside>')
  })

  test('can render the right workspace directly on the Artifacts tab', () => {
    const artifacts: DesktopLocalArtifact[] = [
      {
        id: 'file:g:/tmp/dashboard.html',
        source: 'file',
        title: 'dashboard.html',
        kind: 'html',
        status: 'ready',
        path: 'G:/tmp/dashboard.html',
        content: '<h1>Dashboard</h1>',
        createdAt: 100,
      },
    ]
    const html = renderToStaticMarkup(
      <WorkspacePanel
        fileCount={0}
        activeTab="artifacts"
        onTabChange={() => {}}
        agentActivity={buildAgentActivity({}, [])}
        artifacts={artifacts}
        selectedArtifactId="file:g:/tmp/dashboard.html"
        artifactContent="<h1>Dashboard</h1>"
        onSelectArtifact={() => {}}
        files={<aside>files</aside>}
      />,
    )

    expect(html).toContain('Artifacts')
    expect(html).toContain('dashboard.html')
    expect(html).toContain('html-preview')
    expect(html).toContain('local-artifact-frame')
    expect(html).toContain('local-artifacts-full-preview')
    expect(html).toContain('sandbox="allow-scripts"')
    expect(html).not.toContain('local-artifact-list')
    expect(html).not.toContain('local-artifact-detail')
    expect(html).not.toContain('<aside>files</aside>')
  })

  test('renders an empty local artifacts state', () => {
    const html = renderToStaticMarkup(
      <WorkspacePanel
        fileCount={0}
        activeTab="artifacts"
        onTabChange={() => {}}
        agentActivity={buildAgentActivity({}, [])}
        artifacts={[]}
        selectedArtifactId={null}
        artifactContent={null}
        onSelectArtifact={() => {}}
        files={<aside>files</aside>}
      />,
    )

    expect(html).toContain('还没有本地 Artifacts')
  })

  test('renders installed workspace editors and editor menu states', () => {
    const loading = renderToStaticMarkup(
      <WorkspaceEditorMenu
        status="loading"
        editors={[]}
        openingId={null}
        error={null}
        onOpen={() => {}}
        onRefresh={() => {}}
      />,
    )
    const ready = renderToStaticMarkup(
      <WorkspaceEditorMenu
        status="ready"
        editors={[{ id: 'vscode', name: 'Visual Studio Code', icon: 'vscode' }]}
        openingId={null}
        error={null}
        onOpen={() => {}}
        onRefresh={() => {}}
      />,
    )

    expect(loading).toContain('正在检测编辑器')
    expect(ready).toContain('workspace-editor-menu')
    expect(ready).toContain('Visual Studio Code')
    expect(ready).toContain('重新检测')
  })

  test('renders file content with a styled code preview and roomy layout', () => {
    const html = renderToStaticMarkup(
      <ConversationFilesPanel
        files={[{ id: 'edit:src/query.ts', path: 'src/query.ts', label: 'query.ts', source: 'tool' }]}
        selectedPath="src/query.ts"
        fileContent={'export const ok = true\nconsole.log(ok)'}
        onOpen={() => {}}
      />,
    )

    expect(html).toContain('files-panel-wide')
    expect(html).toContain('files-panel-split')
    expect(html).toContain('file-preview-main')
    expect(html).toContain('file-viewer')
    expect(html).toContain('language-ts')
    expect(html).toContain('line-number')
    expect(html).toContain('export')
  })

  test('builds agent task ownership and mailbox communication from tool events', () => {
    const activity = buildAgentActivity(
      {
        team: {
          id: 'team',
          name: 'TeamCreate',
          state: 'success',
          summary: 'refactor-ui',
          input: { team_name: 'refactor-ui' },
          startedAt: 100,
        },
        task: {
          id: 'task',
          name: 'TaskCreate',
          state: 'success',
          summary: 'Analyze AgentTool',
          input: {
            subject: 'Analyze AgentTool',
            description: 'Find trigger path',
          },
          output: JSON.stringify({ taskId: 'task-1' }),
          startedAt: 110,
        },
        agent: {
          id: 'agent',
          name: 'Agent',
          state: 'running',
          summary: 'researcher',
          input: {
            name: 'researcher',
            team_name: 'refactor-ui',
            subagent_type: 'worker',
          },
          startedAt: 120,
        },
        assign: {
          id: 'assign',
          name: 'TaskUpdate',
          state: 'success',
          summary: 'Assign task',
          input: {
            taskId: 'task-1',
            owner: 'researcher',
            status: 'in_progress',
          },
          startedAt: 130,
        },
        mail: {
          id: 'mail',
          name: 'SendMessage',
          state: 'success',
          summary: 'progress',
          input: {
            to: 'team-lead',
            message: '已定位 AgentTool 入口',
          },
          startedAt: 140,
        },
      },
      ['team', 'task', 'agent', 'assign', 'mail'],
    )

    expect(activity.teamName).toBe('refactor-ui')
    expect(activity.tasks[0]).toMatchObject({
      id: 'task-1',
      subject: 'Analyze AgentTool',
      owner: 'researcher',
      status: 'in_progress',
    })
    expect(activity.agents[0]).toMatchObject({
      name: 'researcher',
      status: 'running',
      currentTasks: ['Analyze AgentTool'],
    })
    const progress = activity.messages.find(message => message.text === '已定位 AgentTool 入口')
    expect(progress).toMatchObject({
      from: 'researcher',
      to: 'team-lead',
      text: '已定位 AgentTool 入口',
    })
  })

  test('renders a polished agent observation panel in the right workspace', () => {
    const activity = buildAgentActivity(
      {
        agent: {
          id: 'agent',
          name: 'Agent',
          state: 'running',
          summary: 'tester',
          input: { name: 'tester', team_name: 'fix-team' },
        },
        task: {
          id: 'task',
          name: 'TaskCreate',
          state: 'success',
          summary: 'Fix message ordering',
          input: { subject: 'Fix message ordering' },
          output: JSON.stringify({ taskId: 'order-fix' }),
        },
        assign: {
          id: 'assign',
          name: 'TaskUpdate',
          state: 'success',
          summary: 'tester',
          input: {
            taskId: 'order-fix',
            owner: 'tester',
            status: 'in_progress',
          },
        },
      },
      ['agent', 'task', 'assign'],
    )
    const html = renderToStaticMarkup(<AgentActivityPanel activity={activity} />)

    expect(html).toContain('agent-observer-panel')
    expect(html).toContain('Agent 观测')
    expect(html).toContain('fix-team')
    expect(html).toContain('Fix message ordering')
    expect(html).toContain('tester')
    expect(html).toContain('运行中')
  })

  test('keeps delegated Plan agent runs separate and exposes their final output', () => {
    const activity = buildAgentActivity(
      {
        planAgent: {
          id: 'planAgent',
          name: 'Agent',
          state: 'success',
          summary: '设计麻将游戏实现方案',
          input: {
            description: '设计麻将游戏实现方案',
            prompt: '为 G:/ai/test 项目设计四人血战到底麻将的实现方案',
            subagent_type: 'Plan',
          },
          output: '建议使用单文件 HTML + Canvas，包含牌墙、摸打、胡牌检测和 AI 回合调度。',
          startedAt: 100,
          completedAt: 200,
        },
      },
      ['planAgent'],
    )

    expect(activity.delegatedRuns).toHaveLength(1)
    expect(activity.delegatedRuns[0]).toMatchObject({
      id: 'planAgent',
      type: 'Plan',
      title: '设计麻将游戏实现方案',
      status: 'completed',
      output: '建议使用单文件 HTML + Canvas，包含牌墙、摸打、胡牌检测和 AI 回合调度。',
    })

    const html = renderToStaticMarkup(<AgentActivityPanel activity={activity} />)

    expect(html).toContain('agent-delegation-list')
    expect(html).toContain('委派代理')
    expect(html).toContain('Plan')
    expect(html).toContain('设计麻将游戏实现方案')
    expect(html).toContain('输出结论')
    expect(html).toContain('单文件 HTML + Canvas')
  })

  test('groups subagent work files by tool ownership metadata', () => {
    const activity = buildAgentActivity(
      {
        write: {
          id: 'write',
          name: 'Write',
          state: 'success',
          summary: 'src/worker-output.ts',
          input: { file_path: 'src/worker-output.ts' },
          agentId: 'worker@alpha',
          agentName: 'worker',
          teamName: 'alpha',
        },
        edit: {
          id: 'edit',
          name: 'Edit',
          state: 'success',
          summary: 'src/reviewer-notes.md',
          input: {
            file_path: 'src/reviewer-notes.md',
            old_string: 'todo',
            new_string: 'done',
          },
          agentId: 'reviewer@alpha',
          agentName: 'reviewer',
          teamName: 'alpha',
        },
      },
      ['write', 'edit'],
    )

    expect(activity.summary.fileCount).toBe(2)
    expect(activity.agents.find(agent => agent.name === 'worker')?.files.map(file => file.path)).toEqual([
      'src/worker-output.ts',
    ])
    expect(activity.agents.find(agent => agent.name === 'reviewer')?.files.map(file => file.path)).toEqual([
      'src/reviewer-notes.md',
    ])

    const html = renderToStaticMarkup(<AgentActivityPanel activity={activity} />)
    expect(html).toContain('Work files')
    expect(html).not.toContain('agent-task-list')
    expect(html).toContain('<details')
    expect(html).toContain('<summary')
    expect(html).toContain('worker-output.ts')
    expect(html).toContain('reviewer-notes.md')
  })

  test('builds team activity from ExecuteExtraTool wrapped TeamCreate calls', () => {
    const activity = buildAgentActivity(
      {
        team: {
          id: 'team',
          name: 'ExecuteExtraTool',
          state: 'success',
          summary: 'TeamCreate',
          input: {
            tool_name: 'TeamCreate',
            params: {
              team_name: 'coupon-team',
              description: 'build coupon system',
            },
          },
          output: JSON.stringify({
            tool_name: 'TeamCreate',
            result: {
              success: true,
              team_name: 'coupon-team',
            },
          }),
        },
      },
      ['team'],
    )

    expect(activity.teamName).toBe('coupon-team')
    const html = renderToStaticMarkup(<AgentActivityPanel activity={activity} />)
    expect(html).toContain('coupon-team')
  })

  test('describes completed agents as finished instead of waiting for tasks', () => {
    const activity = buildAgentActivity(
      {
        agent: {
          id: 'agent',
          name: 'Agent',
          state: 'success',
          summary: 'backend',
          input: {
            name: 'backend',
            team_name: 'user-system',
          },
        },
      },
      ['agent'],
    )

    const html = renderToStaticMarkup(<AgentActivityPanel activity={activity} />)
    expect(html).toContain('backend')
    expect(html).toContain('执行完成')
    expect(html).not.toContain('等待任务')
  })

  test('uses live teammate status over the completed outer Agent call', () => {
    const activity = buildAgentActivity(
      {
        outer: {
          id: 'outer',
          name: 'Agent',
          state: 'success',
          summary: 'backend',
          input: {
            name: 'backend',
            team_name: 'user-system',
          },
        },
        live: {
          id: 'live',
          name: 'Agent',
          state: 'running',
          summary: 'backend',
          input: {
            name: 'backend',
            team_name: 'user-system',
            desktop_status: 'running',
            desktop_idle: false,
          },
          agentId: 'backend@user-system',
          agentName: 'backend',
          teamName: 'user-system',
        },
      },
      ['outer', 'live'],
    )

    expect(activity.agents.find(agent => agent.name === 'backend')?.status).toBe('running')
    const html = renderToStaticMarkup(<AgentActivityPanel activity={activity} />)
    expect(html).toContain('正在执行')
  })

  test('promotes mailbox task assignments into the task execution list', () => {
    const activity = buildAgentActivity({
      team: {
        id: 'team',
        name: 'TeamCreate',
        state: 'success',
        summary: 'user-system',
        input: { team_name: 'user-system' },
      },
    }, ['team'], {
      generatedAt: 100,
      teams: [{
        name: 'user-system',
        inboxes: [{
          agentName: 'backend',
          messages: [{
            from: 'team-lead',
            text: JSON.stringify({
              type: 'task_assignment',
              taskId: 'backend-setup',
              subject: '实现后端 API',
              description: 'Node.js + Express + SQLite',
            }),
            timestamp: '2026-08-01T00:00:00.000Z',
            read: false,
            summary: '实现后端 API',
          }],
        }],
      }],
    })

    expect(activity.tasks).toEqual([{
      id: 'backend-setup',
      subject: '实现后端 API',
      description: 'Node.js + Express + SQLite',
      status: 'in_progress',
      owner: 'backend',
      updatedAt: Date.parse('2026-08-01T00:00:00.000Z'),
    }])
    expect(activity.agents.find(agent => agent.name === 'backend')?.currentTasks).toEqual([
      '实现后端 API',
    ])
  })

  test('promotes plain mailbox task briefs into the task execution list', () => {
    const activity = buildAgentActivity({
      team: {
        id: 'team',
        name: 'TeamCreate',
        state: 'success',
        summary: 'user-system-team',
        input: { team_name: 'user-system-team' },
      },
    }, ['team'], {
      generatedAt: 100,
      teams: [{
        name: 'user-system-team',
        inboxes: [{
          agentName: 'architect',
          messages: [{
            from: 'team-lead',
            text: '你的完整任务 brief 如下，请立即开始架构设计任务：在 docs/design.md 撰写用户系统技术设计文档。',
            timestamp: '2026-08-01T00:00:00.000Z',
            read: false,
            summary: '发送架构师完整任务brief',
          }],
        }],
      }],
    })

    expect(activity.tasks).toHaveLength(1)
    expect(activity.tasks[0]).toMatchObject({
      id: 'user-system-team:architect:mailbox-assignment',
      subject: '发送架构师完整任务brief',
      owner: 'architect',
      status: 'in_progress',
    })
    expect(activity.agents.find(agent => agent.name === 'architect')?.currentTasks).toEqual([
      '发送架构师完整任务brief',
    ])
  })

  test('does not show historical mailbox agents when the current session has no agent context', () => {
    const activity = buildAgentActivity({}, [], {
      generatedAt: 100,
      teams: [{
        name: 'old-team',
        inboxes: [{
          agentName: 'team-lead',
          messages: [{
            from: 'historical-agent',
            text: 'old message',
            timestamp: '2026-07-26T00:00:00.000Z',
            read: false,
          }],
        }],
      }],
    })

    expect(activity.teamName).toBeNull()
    expect(activity.agents).toEqual([])
    expect(activity.messages).toEqual([])
  })

  test('merges read-only mailbox messages into matching session agent activity', () => {
    const activity = buildAgentActivity({
      team: {
        id: 'team',
        name: 'TeamCreate',
        state: 'success',
        summary: 'mail-team',
        input: { team_name: 'mail-team' },
      },
    }, ['team'], {
      generatedAt: 100,
      teams: [{
        name: 'mail-team',
        inboxes: [{
          agentName: 'team-lead',
          messages: [{
            from: 'researcher',
            text: '已完成代码搜索',
            timestamp: '2026-07-26T00:00:00.000Z',
            read: false,
            summary: '完成搜索',
          }],
        }],
      }],
    })

    expect(activity.teamName).toBe('mail-team')
    expect(activity.agents.map(agent => agent.name)).toContain('researcher')
    expect(activity.messages[0]).toMatchObject({
      from: 'researcher',
      to: 'team-lead',
      text: '已完成代码搜索',
    })
    const html = renderToStaticMarkup(<AgentActivityPanel activity={activity} />)
    expect(html).toContain('<details')
    expect(html).toContain('<summary')
    expect(html).toContain('researcher')
  })

  test('calculates edit diff blocks and tool icons', () => {
    const diff = buildEditDiff({
      id: 'tool-edit',
      name: 'Edit',
      state: 'success',
      summary: 'src/app.ts',
      input: {
        file_path: 'src/app.ts',
        old_string: 'const oldValue = 1\nconsole.log(oldValue)',
        new_string: 'const newValue = 2\nconsole.log(newValue)',
      },
    })

    expect(diff?.additions).toBe(2)
    expect(diff?.deletions).toBe(2)
    expect(diff?.lines.map(line => line.kind)).toEqual(['remove', 'remove', 'add', 'add'])
    expect(toolDisplayMeta('Read').icon).not.toEqual(toolDisplayMeta('Edit').icon)
  })

  test('renders complete rich blocks and placeholders incomplete fenced output', () => {
    const complete = renderToStaticMarkup(
      <MarkdownMessage
        content={[
          '```mermaid',
          'graph TD; A-->B;',
          '```',
          '```plantuml',
          '@startuml',
          'A -> B',
          '@enduml',
          '```',
          '```html',
          '<main>Hello</main>',
          '```',
          '```markdown',
          '# Title',
          '```',
        ].join('\n')}
      />,
    )
    expect(complete).toContain('diagram-render')
    expect(complete).toContain('mermaid-render-target')
    expect(complete).toContain('plantuml-render-target')
    expect(complete).toContain('HTML 预览')
    expect(complete).toContain('message-html-preview')
    expect(complete).toContain('sandbox="allow-scripts"')
    expect(complete).toContain('Markdown 预览')

    const incomplete = renderToStaticMarkup(
      <MarkdownMessage content={'```mermaid\ngraph TD; A-->'} />,
    )
    expect(incomplete).toContain('内容生成中')
    expect(incomplete).not.toContain('diagram-render')
  })
  test('renders markdown syntax as html instead of plain text', () => {
    const html = renderToStaticMarkup(
      <MarkdownMessage
        content={[
          '# Title',
          '',
          '**bold text** and [link](https://example.com)',
          '',
          '| Name | Value |',
          '| --- | --- |',
          '| A | 1 |',
        ].join('\n')}
      />,
    )

    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<strong>bold text</strong>')
    expect(html).toContain('<a href="https://example.com">link</a>')
    expect(html).toContain('<table>')
  })

  test('renders loose diagram blocks produced by model output', () => {
    const plantUml = renderToStaticMarkup(
      <MarkdownMessage
        content={[
          'Architecture:',
          '@startuml',
          'Alice -> Bob: hello',
          '@enduml',
        ].join('\n')}
      />,
    )
    expect(plantUml).toContain('plantuml-render-target')
    expect(plantUml).not.toContain('https://www.plantuml.com/plantuml/svg/')
    expect(plantUml).not.toContain('<p>@startuml')

    const mermaid = renderToStaticMarkup(
      <MarkdownMessage
        content={[
          '~~~ mermaid',
          'flowchart TD',
          'A --> B',
          '~~~',
        ].join('\n')}
      />,
    )
    expect(mermaid).toContain('mermaid-render-target')
    expect(mermaid).not.toContain('<p>~~~ mermaid')
  })

  test('renders PlantUML sequence diagrams locally without external image urls', () => {
    const svg = renderPlantUmlToSvg([
      '@startuml',
      'actor 用户 as User',
      'participant "秒杀API\\nGateway" as Gateway',
      'database "主数据库\\nMySQL" as DB',
      'title 秒杀系统架构图\\nSpike System Architecture',
      '== 核心流程 ==',
      'User -> Gateway: 1. 点击「立即秒杀」',
      'note right: QPS 限流\\n用户维度 + IP 维度',
      'alt 库存不足',
      'Gateway --> User: 返回「已售罄」',
      'else 扣减成功',
      'Gateway -> DB: 插入订单',
      'end',
      '@enduml',
    ].join('\n'))

    expect(svg).toContain('<svg')
    expect(svg).toContain('plantuml-local-svg')
    expect(svg).toContain('秒杀系统架构图')
    expect(svg).toContain('QPS 限流')
    expect(svg).toContain('alt 库存不足')
    expect(svg).not.toContain('https://')
  })

  test('renders diagrams inside a zoomable scroll canvas', () => {
    const html = renderToStaticMarkup(
      <MarkdownMessage
        content={[
          '@startuml',
          'actor User',
          'participant Gateway',
          'User -> Gateway: hello',
          '@enduml',
        ].join('\n')}
      />,
    )

    expect(html).toContain('diagram-toolbar')
    expect(html).toContain('diagram-viewport')
    expect(html).toContain('aria-label="放大图表"')
    expect(html).toContain('aria-label="缩小图表"')
    expect(html).toContain('aria-label="适应宽度"')
  })
})
