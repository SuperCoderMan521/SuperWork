import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  App,
  defaultWorkspaceForNewSession,
  sessionIdFromPendingWorkspaceSnapshot,
  selectSidebarSessions,
  tabFromSlash,
} from '../renderer/src/app/App.js'
import { createDesktopState } from '../renderer/src/app/reducer.js'
import { BrandName } from '../renderer/src/components/BrandName.js'

describe('selectSidebarSessions', () => {
  test('uses live sessions before history summaries', () => {
    const state = createDesktopState()
    state.sessionList = [
      { id: 'history-1', title: 'History', cwd: 'G:/old', updatedAt: 1 },
    ]
    state.sessions['session-1'] = {
      id: 'session-1',
      title: 'Live',
      cwd: 'G:/project',
      updatedAt: 2,
      model: 'sonnet',
      mode: 'default',
      messages: {},
      messageOrder: [],
      tools: {},
      toolOrder: [],
      permissions: {},
      permissionOrder: [],
      generationState: 'idle',
      sequence: 1,
      needsSnapshot: false,
    }

    expect(selectSidebarSessions(state).map(session => session.id)).toEqual([
      'session-1',
      'history-1',
    ])
  })
})

describe('defaultWorkspaceForNewSession', () => {
  test('uses the current session cwd before falling back to project cwd', () => {
    expect(defaultWorkspaceForNewSession('G:/project', 'G:/fallback')).toBe('G:/project')
    expect(defaultWorkspaceForNewSession(null, 'G:/fallback')).toBe('G:/fallback')
  })
})

describe('sessionIdFromPendingWorkspaceSnapshot', () => {
  test('selects the newly created session when its cwd matches the pending workspace', () => {
    expect(
      sessionIdFromPendingWorkspaceSnapshot('G:/new-project', {
        type: 'session.snapshot',
        sessionId: 'session-new',
        sequence: 1,
        session: {
          id: 'session-new',
          title: 'New conversation',
          cwd: 'G:/new-project',
          updatedAt: 10,
          model: 'sonnet',
          mode: 'default',
          messages: [],
          tools: [],
          generationState: 'idle',
          sequence: 1,
        },
      }),
    ).toBe('session-new')
  })

  test('ignores unrelated snapshots while waiting for a created workspace session', () => {
    expect(
      sessionIdFromPendingWorkspaceSnapshot('G:/new-project', {
        type: 'session.snapshot',
        sessionId: 'session-old',
        sequence: 1,
        session: {
          id: 'session-old',
          title: 'Old conversation',
          cwd: 'G:/old-project',
          updatedAt: 10,
          model: 'sonnet',
          mode: 'default',
          messages: [],
          tools: [],
          generationState: 'idle',
          sequence: 1,
        },
      }),
    ).toBeNull()
  })
})

describe('tabFromSlash', () => {
  test('routes only configuration slash commands to settings', () => {
    expect(tabFromSlash('/config')).toBe('model')
    expect(tabFromSlash('/config model')).toBe('model')
    expect(tabFromSlash('/config memory')).toBe('memory')
    expect(tabFromSlash('/config mcp')).toBe('mcp')
    expect(tabFromSlash('/config plugins')).toBe('plugins')
    expect(tabFromSlash('/config skills')).toBe('skills')
  })

  test('lets executable Claude Code slash commands pass through as prompts', () => {
    expect(tabFromSlash('/model')).toBeNull()
    expect(tabFromSlash('/memory')).toBeNull()
    expect(tabFromSlash('/mcp')).toBeNull()
    expect(tabFromSlash('/plugin')).toBeNull()
    expect(tabFromSlash('/skill')).toBeNull()
    expect(tabFromSlash('/mcp list')).toBeNull()
    expect(tabFromSlash('/plugin list')).toBeNull()
    expect(tabFromSlash('/skill list')).toBeNull()
    expect(tabFromSlash('/compact')).toBeNull()
    expect(tabFromSlash('/help')).toBeNull()
  })
})

describe('App layout', () => {
  test('keeps the session sidebar visible when no conversation is selected', () => {
    const html = renderToStaticMarkup(<App />)

    expect(html).toContain('Super')
    expect(html).toContain('Work')
    expect(html).toContain('brand-super')
    expect(html).toContain('从一个工作区开始')
    expect(html).toContain('写 PPT')
    expect(html).toContain('整理日报')
    expect(html).toContain('desktop-layout')
  })

  test('shows configuration shortcuts in the sidebar', () => {
    const html = renderToStaticMarkup(<App />)

    expect(html).toContain('settings-shortcuts')
    expect(html).toContain('打开模型配置')
    expect(html).toContain('打开 Skills 配置')
    expect(html).toContain('打开 MCP 配置')
    expect(html).toContain('打开 Plugins 配置')
    expect(html).toContain('打开 Memory 配置')
  })

  test('keeps the composer available on the welcome page', () => {
    const html = renderToStaticMarkup(<App />)

    expect(html).toContain('welcome-chat')
    expect(html).toContain('composer-area')
    expect(html).toContain('autofocus')
  })
})

describe('BrandName', () => {
  test('renders a framed brand badge with split brand colors', () => {
    const html = renderToStaticMarkup(<BrandName />)

    expect(html).toContain('brand-badge')
    expect(html).toContain('brand-badge-super')
    expect(html).toContain('brand-badge-work')
  })

  test('renders a compact text-only brand for message headers', () => {
    const html = renderToStaticMarkup(<BrandName compact />)

    expect(html).not.toContain('brand-badge')
    expect(html).toContain('brand-super')
    expect(html).toContain('brand-work')
  })
})
