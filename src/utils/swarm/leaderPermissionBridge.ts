/**
 * Leader Permission Bridge
 *
 * Module-level bridge that allows the REPL to register its setToolUseConfirmQueue
 * and setToolPermissionContext functions for in-process teammates to use.
 *
 * When an in-process teammate requests permissions, it uses the standard
 * ToolUseConfirm dialog rather than the worker permission badge. This bridge
 * makes the REPL's queue setter and permission context setter accessible
 * from non-React code in the in-process runner.
 */

import type { ToolUseConfirm } from '../../components/permissions/PermissionRequest.js'
import type { Tool, ToolPermissionContext, ToolUseContext } from '../../Tool.js'
import type { AssistantMessage } from '../../types/message.js'
import type { PermissionDecision, PermissionAskDecision } from '../../types/permissions.js'
import type { TeammateIdentity } from '../../tasks/InProcessTeammateTask/types.js'

export type SetToolUseConfirmQueueFn = (
  updater: (prev: ToolUseConfirm[]) => ToolUseConfirm[],
) => void

export type SetToolPermissionContextFn = (
  context: ToolPermissionContext,
  options?: { preserveMode?: boolean },
) => void

let registeredSetter: SetToolUseConfirmQueueFn | null = null
let registeredPermissionContextSetter: SetToolPermissionContextFn | null = null

export type LeaderPermissionRequest = {
  identity: TeammateIdentity
  tool: Tool
  input: Record<string, unknown>
  toolUseContext: ToolUseContext
  assistantMessage: AssistantMessage
  toolUseID: string
  permissionResult: PermissionAskDecision
  description: string
}

export type LeaderPermissionHandler = (
  request: LeaderPermissionRequest,
) => Promise<PermissionDecision>

let registeredPermissionHandler: LeaderPermissionHandler | null = null

export function registerLeaderToolUseConfirmQueue(
  setter: SetToolUseConfirmQueueFn,
): void {
  registeredSetter = setter
}

export function getLeaderToolUseConfirmQueue(): SetToolUseConfirmQueueFn | null {
  return registeredSetter
}

export function unregisterLeaderToolUseConfirmQueue(): void {
  registeredSetter = null
}

export function registerLeaderSetToolPermissionContext(
  setter: SetToolPermissionContextFn,
): void {
  registeredPermissionContextSetter = setter
}

export function getLeaderSetToolPermissionContext(): SetToolPermissionContextFn | null {
  return registeredPermissionContextSetter
}

export function unregisterLeaderSetToolPermissionContext(): void {
  registeredPermissionContextSetter = null
}

export function registerLeaderPermissionHandler(
  handler: LeaderPermissionHandler,
): void {
  registeredPermissionHandler = handler
}

export function getLeaderPermissionHandler(): LeaderPermissionHandler | null {
  return registeredPermissionHandler
}

export function unregisterLeaderPermissionHandler(): void {
  registeredPermissionHandler = null
}
