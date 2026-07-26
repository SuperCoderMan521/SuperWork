import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'bun:test'
import { DesktopAgentMailboxService } from '../core/agent-mailbox-service.js'

let tempRoot: string | null = null

describe('DesktopAgentMailboxService', () => {
  afterEach(async () => {
    if (!tempRoot) return
    await rm(tempRoot, { recursive: true, force: true })
    tempRoot = null
  })

  test('reads team inbox files without changing read state', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'desktop-mailbox-'))
    const inboxDir = join(tempRoot, 'teams', 'alpha', 'inboxes')
    await mkdir(inboxDir, { recursive: true })
    const inboxPath = join(inboxDir, 'researcher.json')
    const messages = [
      {
        from: 'team-lead',
        text: 'Analyze AgentTool',
        timestamp: '2026-07-26T00:00:00.000Z',
        read: false,
        summary: 'Analyze',
      },
    ]
    await writeFile(inboxPath, JSON.stringify(messages, null, 2), 'utf8')

    const service = new DesktopAgentMailboxService({
      claudeConfigDir: tempRoot,
      now: () => 100,
    })
    const snapshot = await service.snapshot()

    expect(snapshot).toEqual({
      generatedAt: 100,
      teams: [{
        name: 'alpha',
        inboxes: [{
          agentName: 'researcher',
          messages,
        }],
      }],
    })
    expect(JSON.parse(await Bun.file(inboxPath).text())).toEqual(messages)
  })

  test('skips corrupt inbox files instead of failing the whole snapshot', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'desktop-mailbox-'))
    const inboxDir = join(tempRoot, 'teams', 'alpha', 'inboxes')
    await mkdir(inboxDir, { recursive: true })
    await writeFile(join(inboxDir, 'bad.json'), '{bad-json', 'utf8')

    const service = new DesktopAgentMailboxService({
      claudeConfigDir: tempRoot,
      now: () => 200,
    })

    expect(await service.snapshot()).toEqual({
      generatedAt: 200,
      teams: [{ name: 'alpha', inboxes: [] }],
    })
  })
})
