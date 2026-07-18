import type { DesktopError } from './protocol.js'

export function createDesktopError(
  code: DesktopError['code'],
  message: string,
  recoverable: boolean,
  detail?: string,
): DesktopError {
  return { code, message, recoverable, ...(detail ? { detail } : {}) }
}
