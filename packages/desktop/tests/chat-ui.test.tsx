import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ResizableWorkspace } from '../renderer/src/app/ResizableWorkspace.js'
import type { RendererSession } from '../renderer/src/app/reducer.js'
import {
  ConversationPane,
  getConversationTimeline,
  groupConversationTimeline,
} from '../renderer/src/features/chat/ConversationPane.js'
import { MarkdownMessage } from '../renderer/src/features/chat/MarkdownMessage.js'
import { renderPlantUmlToSvg } from '../renderer/src/features/chat/plantumlLocalRenderer.js'
import {
  buildEditDiff,
  toolDisplayMeta,
} from '../renderer/src/features/chat/toolRendering.js'
import {
  ConversationFilesPanel,
  filesFromTools,
} from '../renderer/src/features/files/ConversationFilesPanel.js'
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
      />,
    )
    expect(html).toContain('Hello')
    expect(html).not.toContain('src/query.ts')
    expect(html).toContain('输入问题')
    expect(html).toContain('选择工作区')
    expect(html).toContain('aria-label="中断生成"')
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

  test('hides completed tool frames from the conversation after generation finishes', () => {
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

    expect(html).not.toContain('tool-card')
    expect(html).not.toContain('src/app.ts')
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
    expect(html).not.toContain('tool-group-description')
    expect(html).not.toContain('点击展开')
    expect(html).not.toContain('src/old.ts')
    expect(html).toContain('src/current.ts')
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
          name: 'Read',
          state: 'success',
          summary: 'src/query.ts',
          input: { file_path: 'src/query.ts' },
        },
      },
      ['folder', 'file'],
    )
    expect(files.map(file => file.path)).toEqual(['src/query.ts'])
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

  test('renders a right-side editable file panel from tool paths', () => {
    const files = filesFromTools(session.tools, session.toolOrder)
    const html = renderToStaticMarkup(
      <ConversationFilesPanel
        files={files}
        selectedPath="src/query.ts"
        fileContent="export const ok = true"
        onOpen={() => {}}
      />,
    )
    expect(html).toContain('文件')
    expect(html).toContain('src/query.ts')
    expect(html).not.toContain('保存')
    expect(html).toContain('export const ok')
  })

  test('renders file content with a styled code preview and roomy layout', () => {
    const files = filesFromTools(session.tools, session.toolOrder)
    const html = renderToStaticMarkup(
      <ConversationFilesPanel
        files={files}
        selectedPath="src/query.ts"
        fileContent={'export const ok = true\nconsole.log(ok)'}
        onOpen={() => {}}
      />,
    )

    expect(html).toContain('files-panel-wide')
    expect(html).toContain('file-viewer')
    expect(html).toContain('language-ts')
    expect(html).toContain('line-number')
    expect(html).toContain('export')
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
