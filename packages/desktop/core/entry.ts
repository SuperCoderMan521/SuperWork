import { JsonLineDecoder } from '../electron/json-lines.js'
import { createDesktopError } from '../shared/errors.js'
import type { DesktopCommand, DesktopEvent } from '../shared/protocol.js'
import { DESKTOP_PROTOCOL_VERSION } from '../shared/protocol.js'
import { DesktopCommandSchema } from '../shared/schemas.js'

type CoreProtocolOptions = {
  input: AsyncIterable<string>
  emit: (event: DesktopEvent) => void
  dispatch: (command: DesktopCommand) => void | Promise<void>
}

function requestIdFrom(value: unknown): string {
  if (typeof value !== 'object' || value === null) return 'invalid-command'
  const requestId = (value as Record<string, unknown>).requestId
  return typeof requestId === 'string' && requestId.length > 0
    ? requestId
    : 'invalid-command'
}

/** Runs the validated protocol pump used by the Bun Core Sidecar. */
export async function runCoreProtocol(options: CoreProtocolOptions): Promise<void> {
  process.stderr.write(
    `[INFO] [desktop-core] startup complete, sending core.ready protocolVersion=${DESKTOP_PROTOCOL_VERSION}\n`,
  )
  options.emit({
    type: 'core.ready',
    protocolVersion: DESKTOP_PROTOCOL_VERSION,
  })
  const decoder = new JsonLineDecoder()

  for await (const chunk of options.input) {
    for (const value of decoder.push(chunk)) {
      const parsed = DesktopCommandSchema.safeParse(value)
      if (!parsed.success) {
        options.emit({
          type: 'command.failed',
          requestId: requestIdFrom(value),
          error: createDesktopError(
            'INVALID_COMMAND',
            'Desktop command was invalid',
            true,
            parsed.error.message,
          ),
        })
        continue
      }

      try {
        await options.dispatch(parsed.data)
      } catch (error) {
        const sessionId =
          'sessionId' in parsed.data ? parsed.data.sessionId : undefined
        options.emit({
          type: 'command.failed',
          requestId: parsed.data.requestId,
          sessionId,
          error: createDesktopError(
            'QUERY_FAILED',
            error instanceof Error ? error.message : 'Desktop command failed',
            true,
          ),
        })
      }
    }
  }
}
