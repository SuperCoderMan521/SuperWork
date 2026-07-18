import type { z } from 'zod'
import type {
  DesktopCommandSchema,
  DesktopErrorSchema,
  DesktopEventSchema,
  DesktopConfigItemSchema,
  DesktopConfigSnapshotSchema,
  DesktopFileEntrySchema,
  DesktopMemoryFileSchema,
  DesktopModelConnectionResultSchema,
  DesktopModelConfigSchema,
  DesktopMessageSchema,
  DesktopPermissionRequestSchema,
  DesktopSessionSchema,
  DesktopSessionSummarySchema,
  DesktopSettingsSchema,
  DesktopToolCallSchema,
  BuddySnapshotSchema,
  PermissionDecisionSchema,
  PermissionModeSchema,
} from './schemas.js'

export type DesktopCommand = z.infer<typeof DesktopCommandSchema>
export type DesktopError = z.infer<typeof DesktopErrorSchema>
export type DesktopEvent = z.infer<typeof DesktopEventSchema>
export type DesktopConfigItem = z.infer<typeof DesktopConfigItemSchema>
export type DesktopConfigSnapshot = z.infer<typeof DesktopConfigSnapshotSchema>
export type DesktopFileEntry = z.infer<typeof DesktopFileEntrySchema>
export type DesktopMemoryFile = z.infer<typeof DesktopMemoryFileSchema>
export type DesktopModelConnectionResult = z.infer<
  typeof DesktopModelConnectionResultSchema
>
export type DesktopModelConfig = z.infer<typeof DesktopModelConfigSchema>
export type DesktopMessage = z.infer<typeof DesktopMessageSchema>
export type DesktopPermissionRequest = z.infer<
  typeof DesktopPermissionRequestSchema
>
export type DesktopSession = z.infer<typeof DesktopSessionSchema>
export type DesktopSessionSummary = z.infer<
  typeof DesktopSessionSummarySchema
>
export type DesktopSettings = z.infer<typeof DesktopSettingsSchema>
export type DesktopToolCall = z.infer<typeof DesktopToolCallSchema>
export type BuddySnapshot = z.infer<typeof BuddySnapshotSchema>
export type PermissionDecision = z.infer<typeof PermissionDecisionSchema>
export type PermissionMode = z.infer<typeof PermissionModeSchema>
