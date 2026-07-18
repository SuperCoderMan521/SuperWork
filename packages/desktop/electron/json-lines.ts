export class JsonLineDecodeError extends Error {
  constructor(
    readonly lineNumber: number,
    readonly line: string,
    cause: unknown,
  ) {
    super(`Invalid JSON on line ${lineNumber}`, { cause })
    this.name = 'JsonLineDecodeError'
  }
}

/** Incrementally decodes newline-delimited JSON without losing split chunks. */
export class JsonLineDecoder {
  private buffer = ''
  private lineNumber = 0

  push(chunk: string): unknown[] {
    this.buffer += chunk
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''

    return lines.flatMap(line => {
      this.lineNumber += 1
      if (line.trim().length === 0) return []

      try {
        const value: unknown = JSON.parse(line)
        return [value]
      } catch (error) {
        throw new JsonLineDecodeError(this.lineNumber, line, error)
      }
    })
  }
}

export function encodeJsonLine(value: unknown): string {
  const encoded = JSON.stringify(value)
  if (encoded === undefined) {
    throw new TypeError('JSON Lines values must be serializable')
  }
  return `${encoded}\n`
}
