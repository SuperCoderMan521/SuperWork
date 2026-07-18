import { z } from 'zod'
import { DESKTOP_PROTOCOL_VERSION } from './protocol.js'

const IdSchema = z.string().min(1)
const RequestSchema = z.object({ requestId: IdSchema })
const SessionRequestSchema = RequestSchema.extend({ sessionId: IdSchema })
const SequencedSessionEventSchema = z.object({
  sessionId: IdSchema,
  sequence: z.number().int().nonnegative(),
})

export const PermissionModeSchema = z.enum([
  'default',
  'acceptEdits',
  'bypassPermissions',
  'plan',
  'dontAsk',
])

export const PermissionDecisionSchema = z.enum([
  'deny',
  'allow_once',
  'allow_session',
])

export const DesktopErrorSchema = z.object({
  code: z.enum([
    'INVALID_COMMAND',
    'CORE_UNAVAILABLE',
    'PROTOCOL_MISMATCH',
    'SESSION_NOT_FOUND',
    'QUERY_FAILED',
    'PERMISSION_CANCELLED',
    'SIDECAR_CRASHED',
  ]),
  message: z.string().min(1),
  recoverable: z.boolean(),
  detail: z.string().optional(),
})

export const DesktopMessageSchema = z.object({
  id: IdSchema,
  role: z.enum(['user', 'assistant', 'system', 'error']),
  kind: z.enum(['text', 'thinking', 'redacted_thinking', 'system', 'error']).optional(),
  content: z.string(),
  createdAt: z.number().int().nonnegative(),
})

export const DesktopToolCallSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  state: z.enum([
    'pending',
    'running',
    'success',
    'error',
    'denied',
    'interrupted',
  ]),
  summary: z.string(),
  input: z.unknown().optional(),
  output: z.string().optional(),
  startedAt: z.number().int().nonnegative().optional(),
  completedAt: z.number().int().nonnegative().optional(),
})

export const DesktopPermissionRequestSchema = z.object({
  id: IdSchema,
  toolCallId: IdSchema,
  toolName: z.string().min(1),
  summary: z.string(),
  input: z.unknown(),
  decisions: z.array(PermissionDecisionSchema).min(1),
})

export const DesktopSessionSummarySchema = z.object({
  id: IdSchema,
  title: z.string(),
  cwd: z.string().min(1),
  updatedAt: z.number().int().nonnegative(),
})

export const DesktopSessionSchema = DesktopSessionSummarySchema.extend({
  model: z.string().min(1),
  mode: PermissionModeSchema,
  messages: z.array(DesktopMessageSchema),
  tools: z.array(DesktopToolCallSchema),
  generationState: z.enum(['idle', 'running', 'interrupting', 'failed']),
  sequence: z.number().int().nonnegative(),
})

export const DesktopSettingsSchema = z.object({
  model: z.string().min(1),
  mode: PermissionModeSchema,
  availableModels: z.array(z.string().min(1)),
})

export const DesktopConfigItemSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  path: z.string().optional(),
})

export const DesktopMemoryFileSchema = z.object({
  id: IdSchema,
  label: z.string().min(1),
  path: z.string().min(1),
  scope: z.enum(['project', 'user', 'auto', 'team']),
  exists: z.boolean(),
  content: z.string().optional(),
})

export const DesktopModelConfigSchema = z.object({
  provider: z.string().min(1).optional(),
  baseUrl: z.string().optional(),
  token: z.string().optional(),
  model: z.string().optional(),
})

export const DesktopConfigSnapshotSchema = z.object({
  cwd: z.string().min(1),
  skills: z.array(DesktopConfigItemSchema),
  mcpServers: z.array(DesktopConfigItemSchema),
  plugins: z.array(DesktopConfigItemSchema),
  memoryFiles: z.array(DesktopMemoryFileSchema),
  modelConfig: DesktopModelConfigSchema.optional(),
})

export const DesktopModelConnectionResultSchema = z.object({
  ok: z.boolean(),
  provider: z.string().min(1),
  model: z.string().optional(),
  status: z.number().int().optional(),
  latencyMs: z.number().int().nonnegative(),
  message: z.string().min(1),
})

export const DesktopFileEntrySchema = z.object({
  id: IdSchema,
  path: z.string().min(1),
  source: z.enum(['tool', 'memory']),
  label: z.string().min(1),
})

export const BuddySnapshotSchema = z.object({
  enabled: z.boolean(),
  muted: z.boolean(),
  companion: z.object({
    name: z.string(), personality: z.string(), species: z.string(), rarity: z.string(),
    shiny: z.boolean(), hat: z.string(), eye: z.string(),
    stats: z.record(z.string(), z.number()), sprite: z.array(z.string()),
  }).nullable(),
  reaction: z.string().nullable(),
  petAt: z.number().int().nonnegative().nullable(),
})

export const DesktopCommandSchema = z.discriminatedUnion('type', [
  RequestSchema.extend({ type: z.literal('session.list') }),
  RequestSchema.extend({
    type: z.literal('session.create'),
    cwd: z.string().min(1),
  }),
  SessionRequestSchema.extend({ type: z.literal('session.resume') }),
  SessionRequestSchema.extend({ type: z.literal('session.delete') }),
  SessionRequestSchema.extend({ type: z.literal('session.snapshot') }),
  SessionRequestSchema.extend({
    type: z.literal('prompt.submit'),
    text: z.string().min(1),
  }),
  SessionRequestSchema.extend({ type: z.literal('generation.interrupt') }),
  RequestSchema.extend({
    type: z.literal('permission.resolve'),
    permissionId: IdSchema,
    decision: PermissionDecisionSchema,
  }),
  SessionRequestSchema.extend({
    type: z.literal('model.set'),
    model: z.string().min(1),
  }),
  SessionRequestSchema.extend({
    type: z.literal('mode.set'),
    mode: PermissionModeSchema,
  }),
  RequestSchema.extend({ type: z.literal('config.get'), cwd: z.string().min(1) }),
  RequestSchema.extend({
    type: z.literal('config.write'),
    cwd: z.string().min(1),
    modelConfig: DesktopModelConfigSchema,
  }),
  RequestSchema.extend({
    type: z.literal('config.test'),
    cwd: z.string().min(1),
    modelConfig: DesktopModelConfigSchema,
  }),
  RequestSchema.extend({
    type: z.literal('file.read'),
    path: z.string().min(1),
    cwd: z.string().min(1).optional(),
  }),
  RequestSchema.extend({
    type: z.literal('file.write'),
    path: z.string().min(1),
    cwd: z.string().min(1).optional(),
    content: z.string(),
  }),
  RequestSchema.extend({ type: z.literal('memory.read'), path: z.string().min(1) }),
  RequestSchema.extend({
    type: z.literal('memory.write'),
    path: z.string().min(1),
    content: z.string(),
  }),
  RequestSchema.extend({
    type: z.literal('memory.compact'),
    path: z.string().min(1),
    content: z.string(),
  }),
  RequestSchema.extend({ type: z.literal('core.shutdown') }),
  RequestSchema.extend({ type: z.literal('buddy.get') }),
  RequestSchema.extend({ type: z.literal('buddy.hatch') }),
  RequestSchema.extend({ type: z.literal('buddy.rehatch') }),
  RequestSchema.extend({ type: z.literal('buddy.pet'), sessionId: IdSchema.optional() }),
  RequestSchema.extend({ type: z.literal('buddy.setMuted'), muted: z.boolean() }),
])

export const DesktopEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('core.ready'),
    protocolVersion: z.literal(DESKTOP_PROTOCOL_VERSION),
  }),
  RequestSchema.extend({
    type: z.literal('session.listed'),
    sessions: z.array(DesktopSessionSummarySchema),
  }),
  z.object({ type: z.literal('session.deleted'), sessionId: IdSchema }),
  SequencedSessionEventSchema.extend({
    type: z.literal('session.snapshot'),
    session: DesktopSessionSchema,
  }),
  SequencedSessionEventSchema.extend({
    type: z.literal('message.added'),
    message: DesktopMessageSchema,
  }),
  SequencedSessionEventSchema.extend({
    type: z.literal('message.delta'),
    messageId: IdSchema,
    delta: z.string(),
  }),
  SequencedSessionEventSchema.extend({
    type: z.literal('tool.updated'),
    tool: DesktopToolCallSchema,
  }),
  SequencedSessionEventSchema.extend({
    type: z.literal('permission.requested'),
    request: DesktopPermissionRequestSchema,
  }),
  SequencedSessionEventSchema.extend({
    type: z.literal('generation.state'),
    state: z.enum(['idle', 'running', 'interrupting', 'failed']),
  }),
  z.object({
    type: z.literal('settings.changed'),
    settings: DesktopSettingsSchema,
  }),
  z.object({ type: z.literal('settings.opened') }),
  RequestSchema.extend({
    type: z.literal('config.snapshot'),
    config: DesktopConfigSnapshotSchema,
  }),
  RequestSchema.extend({
    type: z.literal('config.saved'),
    config: DesktopConfigSnapshotSchema,
  }),
  RequestSchema.extend({
    type: z.literal('config.tested'),
    result: DesktopModelConnectionResultSchema,
  }),
  RequestSchema.extend({
    type: z.literal('file.loaded'),
    path: z.string().min(1),
    content: z.string(),
  }),
  RequestSchema.extend({
    type: z.literal('file.saved'),
    path: z.string().min(1),
    content: z.string(),
  }),
  RequestSchema.extend({
    type: z.literal('memory.loaded'),
    file: DesktopMemoryFileSchema.extend({ content: z.string() }),
  }),
  RequestSchema.extend({
    type: z.literal('memory.saved'),
    file: DesktopMemoryFileSchema.extend({ content: z.string() }),
  }),
  RequestSchema.extend({
    type: z.literal('memory.compacted'),
    file: DesktopMemoryFileSchema.extend({ content: z.string() }),
    originalCharacters: z.number().int().nonnegative(),
    compactedCharacters: z.number().int().nonnegative(),
  }),
  RequestSchema.extend({
    type: z.literal('command.failed'),
    sessionId: IdSchema.optional(),
    error: DesktopErrorSchema,
  }),
  RequestSchema.extend({ type: z.literal('buddy.snapshot'), state: BuddySnapshotSchema }),
  RequestSchema.extend({ type: z.literal('buddy.reaction'), reaction: z.string(), petAt: z.number().int().nonnegative().optional() }),
])
