import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(path => rm(path, { recursive: true, force: true })),
  )
})

async function createDirectories(): Promise<{
  root: string
  workspace: string
  destination: string
}> {
  const root = await mkdtemp(join(tmpdir(), 'desktop-session-migration-'))
  tempRoots.push(root)
  const workspace = join(root, 'workspace')
  const destination = join(root, 'projects', 'workspace')
  await mkdir(workspace, { recursive: true })
  return { root, workspace, destination }
}

describe('copyLegacyDesktopTranscripts', () => {
  test('copies only UUID transcripts without deleting their workspace sources', async () => {
    const module = await import('../core/legacy-session-migration.js').catch(
      () => null,
    )
    expect(module).not.toBeNull()
    if (!module) return

    const { workspace, destination } = await createDirectories()
    const transcript = '11111111-1111-1111-1111-111111111111.jsonl'
    await writeFile(join(workspace, transcript), 'legacy transcript')
    await writeFile(join(workspace, 'notes.jsonl'), 'not a session')

    const result = await module.copyLegacyDesktopTranscripts(
      workspace,
      destination,
    )

    expect(result).toEqual({ copied: [transcript], warnings: [] })
    expect(await readFile(join(destination, transcript), 'utf8')).toBe(
      'legacy transcript',
    )
    expect(await readFile(join(workspace, transcript), 'utf8')).toBe(
      'legacy transcript',
    )
    expect(Bun.file(join(destination, 'notes.jsonl')).size).toBe(0)
  })

  test('does not overwrite an existing standard history transcript', async () => {
    const module = await import('../core/legacy-session-migration.js').catch(
      () => null,
    )
    expect(module).not.toBeNull()
    if (!module) return

    const { workspace, destination } = await createDirectories()
    const transcript = '22222222-2222-2222-2222-222222222222.jsonl'
    await mkdir(destination, { recursive: true })
    await writeFile(join(workspace, transcript), 'legacy transcript')
    await writeFile(join(destination, transcript), 'standard transcript')

    const result = await module.copyLegacyDesktopTranscripts(
      workspace,
      destination,
    )

    expect(result).toEqual({ copied: [], warnings: [] })
    expect(await readFile(join(destination, transcript), 'utf8')).toBe(
      'standard transcript',
    )
  })
})
