/** Version of the newline-delimited protocol shared by desktop processes. */
export const DESKTOP_PROTOCOL_VERSION = 1 as const

export type CoreDiagnosticStatus =
  | 'stopped'
  | 'starting'
  | 'ready'
  | 'restarting'
  | 'failed'

export type DiagnosticsSnapshot = {
  coreStatus: CoreDiagnosticStatus
  logPath: string
  latestLines: string
  lastError: string | null
}

export type {
  DesktopCommand,
  DesktopConfigItem,
  DesktopConfigSnapshot,
  DesktopError,
  DesktopEvent,
  DesktopFileEntry,
  BuddySnapshot,
  DesktopMemoryFile,
  DesktopModelConnectionResult,
  DesktopModelConfig,
  DesktopMessage,
  DesktopPermissionRequest,
  DesktopSession,
  DesktopSessionSummary,
  DesktopSettings,
  DesktopToolCall,
  PermissionDecision,
  PermissionMode,
} from './types.js'
