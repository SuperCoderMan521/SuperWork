const SPECIAL_FILENAMES = new Set([
  'Dockerfile',
  'Makefile',
  'LICENSE',
  'README',
])

const PATH_TOKEN_PATTERN =
  /(?:[A-Za-z]:[\\/]|\\\\|~[\\/]|\.{1,2}[\\/]|[A-Za-z0-9_.@~-]+[\\/])[^\s'"`<>|]+/g

const BARE_FILE_PATTERN =
  /\b(?:[A-Za-z0-9][A-Za-z0-9_.@~-]*\.[A-Za-z][A-Za-z0-9_-]{0,10}|(?:\.[A-Za-z0-9][A-Za-z0-9._-]*))\b/g

function stripWrappingPunctuation(value: string): string {
  return value.replace(/^[("'`<[\{]+|[)"'`>\]}.,;:!?]+$/g, '')
}

function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

function hasUsefulFilenameShape(path: string): boolean {
  const name = baseName(path)
  if (SPECIAL_FILENAMES.has(name)) return true
  if (/^\.[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) return true
  return /[A-Za-z]/.test(name) && /\.[A-Za-z][A-Za-z0-9_-]{0,10}$/.test(name)
}

export function looksLikeFilePath(value: string): boolean {
  const candidate = stripWrappingPunctuation(value.trim())
  if (!candidate || candidate.startsWith('http') || candidate.includes('\0')) {
    return false
  }
  if (candidate.length >= 260) return false
  if (/[\\/]/.test(candidate)) return hasUsefulFilenameShape(candidate)
  return hasUsefulFilenameShape(candidate)
}

export function extractPathCandidates(text: string): string[] {
  const candidates = new Set<string>()
  for (const match of text.match(PATH_TOKEN_PATTERN) ?? []) {
    candidates.add(stripWrappingPunctuation(match))
  }
  for (const match of text.matchAll(BARE_FILE_PATTERN)) {
    const raw = match[0]
    const index = match.index ?? -1
    if (index < 0) continue
    const before = text[index - 1]
    const after = text[index + raw.length]
    if (before === '/' || before === '\\') continue
    if (after === '/' || after === '\\') continue
    candidates.add(stripWrappingPunctuation(raw))
  }
  return [...candidates].filter(candidate => candidate.length > 0)
}
