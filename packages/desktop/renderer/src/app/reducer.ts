import type {
  DesktopEvent,
  DesktopMessage,
  DesktopPermissionRequest,
  DesktopSession,
  DesktopSessionSummary,
  DesktopToolCall,
} from '../../../shared/protocol.js'

export type DesktopRendererAction =
  | DesktopEvent
  | {
      type: 'renderer.localGenerationState'
      sessionId: string
      state: RendererSession['generationState']
    }
  | {
      type: 'renderer.clearError'
    }

export type RendererSession = Omit<DesktopSession, 'messages' | 'tools'> & {
  messages: Record<string, DesktopMessage>
  messageOrder: string[]
  tools: Record<string, DesktopToolCall>
  toolOrder: string[]
  permissions: Record<string, DesktopPermissionRequest>
  permissionOrder: string[]
  needsSnapshot: boolean
}

export type DesktopRendererState = {
  sessions: Record<string, RendererSession>
  sessionList: DesktopSessionSummary[]
  selectedSessionId: string | null
  coreReady: boolean
  lastError: string | null
}

export function createDesktopState(): DesktopRendererState {
  return {
    sessions: {},
    sessionList: [],
    selectedSessionId: null,
    coreReady: false,
    lastError: null,
  }
}

function emptySession(id: string): RendererSession {
  return {
    id,
    title: 'Conversation',
    cwd: '.',
    updatedAt: 0,
    model: 'default',
    mode: 'default',
    messages: {},
    messageOrder: [],
    tools: {},
    toolOrder: [],
    permissions: {},
    permissionOrder: [],
    generationState: 'idle',
    sequence: 0,
    needsSnapshot: false,
  }
}

function normalizeSession(session: DesktopSession): RendererSession {
  return {
    ...session,
    messages: Object.fromEntries(session.messages.map(message => [message.id, message])),
    messageOrder: session.messages.map(message => message.id),
    tools: Object.fromEntries(session.tools.map(tool => [tool.id, tool])),
    toolOrder: session.tools.map(tool => tool.id),
    permissions: {},
    permissionOrder: [],
    needsSnapshot: false,
  }
}

type SessionEvent = Extract<DesktopEvent, { sessionId: string; sequence: number }>

function updateSession(
  state: DesktopRendererState,
  event: SessionEvent,
): DesktopRendererState {
  if (event.type === 'session.snapshot') {
    return {
      ...state,
      sessions: {
        ...state.sessions,
        [event.sessionId]: normalizeSession(event.session),
      },
      selectedSessionId: state.selectedSessionId ?? event.sessionId,
    }
  }

  const previous = state.sessions[event.sessionId] ?? emptySession(event.sessionId)
  const hasGap = event.sequence !== previous.sequence + 1
  let session: RendererSession = {
    ...previous,
    sequence: event.sequence,
    needsSnapshot: previous.needsSnapshot || hasGap,
  }

  switch (event.type) {
    case 'message.added': {
      const exists = event.message.id in session.messages
      session = {
        ...session,
        messages: { ...session.messages, [event.message.id]: event.message },
        messageOrder: exists
          ? session.messageOrder
          : [...session.messageOrder, event.message.id],
      }
      break
    }
    case 'message.delta': {
      const current = session.messages[event.messageId] ?? {
        id: event.messageId,
        role: 'assistant' as const,
        content: '',
        createdAt: Date.now(),
      }
      const exists = event.messageId in session.messages
      session = {
        ...session,
        messages: {
          ...session.messages,
          [event.messageId]: {
            ...current,
            content: `${current.content}${event.delta}`,
          },
        },
        messageOrder: exists
          ? session.messageOrder
          : [...session.messageOrder, event.messageId],
      }
      break
    }
    case 'tool.updated': {
      const exists = event.tool.id in session.tools
      const terminal = event.tool.state !== 'pending' && event.tool.state !== 'running'
      const permissionOrder = terminal
        ? session.permissionOrder.filter(
            id => session.permissions[id]?.toolCallId !== event.tool.id,
          )
        : session.permissionOrder
      const permissions = Object.fromEntries(
        permissionOrder.map(id => [id, session.permissions[id]!]),
      )
      session = {
        ...session,
        tools: { ...session.tools, [event.tool.id]: event.tool },
        toolOrder: exists ? session.toolOrder : [...session.toolOrder, event.tool.id],
        permissions,
        permissionOrder,
      }
      break
    }
    case 'permission.requested':
      session = {
        ...session,
        permissions: {
          ...session.permissions,
          [event.request.id]: event.request,
        },
        permissionOrder: [...session.permissionOrder, event.request.id],
      }
      break
    case 'generation.state':
      session = { ...session, generationState: event.state }
      break
  }

  return {
    ...state,
    sessions: { ...state.sessions, [event.sessionId]: session },
  }
}

export function desktopReducer(
  state: DesktopRendererState,
  event: DesktopRendererAction,
): DesktopRendererState {
  if ('sessionId' in event && 'sequence' in event) {
    return updateSession(state, event)
  }

  switch (event.type) {
    case 'renderer.localGenerationState': {
      const session = state.sessions[event.sessionId]
      if (!session) return state
      return {
        ...state,
        sessions: {
          ...state.sessions,
          [event.sessionId]: {
            ...session,
            generationState: event.state,
          },
        },
      }
    }
    case 'renderer.clearError':
      return { ...state, lastError: null }
    case 'core.ready':
      return { ...state, coreReady: true }
    case 'session.listed':
      return { ...state, sessionList: event.sessions }
    case 'session.deleted': {
      const sessions = { ...state.sessions }
      delete sessions[event.sessionId]
      return {
        ...state,
        sessions,
        sessionList: state.sessionList.filter(session => session.id !== event.sessionId),
        selectedSessionId: state.selectedSessionId === event.sessionId ? null : state.selectedSessionId,
      }
    }
    case 'settings.changed':
      return state
    case 'settings.opened':
      return state
    case 'command.failed': {
      if (!event.sessionId || !state.sessions[event.sessionId]) {
        return { ...state, lastError: event.error.message }
      }
      if (event.error.message === 'No active generation to interrupt') {
        return {
          ...state,
          sessions: {
            ...state.sessions,
            [event.sessionId]: {
              ...state.sessions[event.sessionId],
              generationState: 'idle',
            },
          },
        }
      }
      return {
        ...state,
        sessions: {
          ...state.sessions,
          [event.sessionId]: {
            ...state.sessions[event.sessionId],
            generationState: 'failed',
          },
        },
        lastError: event.error.message,
      }
    }
    default:
      return state
  }
}
