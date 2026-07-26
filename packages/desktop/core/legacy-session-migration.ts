import { constants } from 'node:fs'
import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const SESSION_TRANSCRIPT_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/i

export type LegacySessionMigrationResult = {
  copied: string[]
  warnings: string[]
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined
  }
  return typeof error.code === 'string' ? error.code : undefined
}

export async function copyLegacyDesktopTranscripts(
  workspace: string,
  projectHistoryDir: string,
): Promise<LegacySessionMigrationResult> {
  const result: LegacySessionMigrationResult = { copied: [], warnings: [] }
  let entries
  try {
    entries = await readdir(workspace, { withFileTypes: true })
  } catch (error) {
    result.warnings.push(
      `Unable to scan legacy Desktop transcripts in ${workspace}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return result
  }

  const transcripts = entries
    .filter(entry => entry.isFile() && SESSION_TRANSCRIPT_PATTERN.test(entry.name))
    .map(entry => entry.name)
    .sort()
  if (transcripts.length === 0) return result

  try {
    await mkdir(projectHistoryDir, { recursive: true })
  } catch (error) {
    result.warnings.push(
      `Unable to create Desktop history directory ${projectHistoryDir}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return result
  }

  for (const filename of transcripts) {
    try {
      await copyFile(
        join(workspace, filename),
        join(projectHistoryDir, filename),
        constants.COPYFILE_EXCL,
      )
      result.copied.push(filename)
    } catch (error) {
      if (errorCode(error) === 'EEXIST') continue
      result.warnings.push(
        `Unable to recover Desktop transcript ${filename}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }
  return result
}
