import type { DesktopToolCall } from '../../../../shared/protocol.js'

export type DiffLine = {
  kind: 'add' | 'remove'
  text: string
}

export type EditDiff = {
  path: string | null
  additions: number
  deletions: number
  lines: DiffLine[]
}

export type ToolDisplayMeta = {
  icon: string
  label: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {}
}

function stringValue(input: Record<string, unknown>, key: string): string | null {
  const value = input[key]
  return typeof value === 'string' ? value : null
}

function splitLines(value: string): string[] {
  return value.length === 0 ? [] : value.split(/\r?\n/)
}

export function toolDisplayMeta(name: string): ToolDisplayMeta {
  const normalized = name.toLowerCase()
  if (normalized.includes('read')) return { icon: '📖', label: '读取' }
  if (normalized.includes('edit')) return { icon: '✎', label: '编辑' }
  if (normalized.includes('write')) return { icon: '＋', label: '写入' }
  if (normalized.includes('bash') || normalized.includes('shell')) {
    return { icon: '⌁', label: '命令' }
  }
  if (normalized.includes('grep') || normalized.includes('glob')) {
    return { icon: '⌕', label: '搜索' }
  }
  if (normalized.includes('web')) return { icon: '◎', label: '网络' }
  return { icon: '◇', label: name }
}

function diffFromPair(path: string | null, oldText: string, newText: string): EditDiff {
  const removed = splitLines(oldText).map<DiffLine>(line => ({
    kind: 'remove',
    text: line,
  }))
  const added = splitLines(newText).map<DiffLine>(line => ({
    kind: 'add',
    text: line,
  }))
  return {
    path,
    additions: added.length,
    deletions: removed.length,
    lines: [...removed, ...added],
  }
}

function mergeDiffs(diffs: EditDiff[]): EditDiff | null {
  if (diffs.length === 0) return null
  return {
    path: diffs[0]?.path ?? null,
    additions: diffs.reduce((sum, diff) => sum + diff.additions, 0),
    deletions: diffs.reduce((sum, diff) => sum + diff.deletions, 0),
    lines: diffs.flatMap(diff => diff.lines),
  }
}

export function buildEditDiff(tool: DesktopToolCall): EditDiff | null {
  if (!tool.name.toLowerCase().includes('edit')) return null
  const input = asRecord(tool.input)
  const path = stringValue(input, 'file_path') ?? stringValue(input, 'path')
  const oldText = stringValue(input, 'old_string')
  const newText = stringValue(input, 'new_string')
  if (oldText !== null && newText !== null) {
    return diffFromPair(path, oldText, newText)
  }

  const edits = input.edits
  if (!Array.isArray(edits)) return null
  const diffs = edits
    .map(edit => {
      const record = asRecord(edit)
      const oldEditText = stringValue(record, 'old_string')
      const newEditText = stringValue(record, 'new_string')
      if (oldEditText === null || newEditText === null) return null
      return diffFromPair(path, oldEditText, newEditText)
    })
    .filter((diff): diff is EditDiff => diff !== null)
  return mergeDiffs(diffs)
}
