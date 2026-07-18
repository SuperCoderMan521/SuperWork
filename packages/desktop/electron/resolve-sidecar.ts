import path from 'node:path'
import type { NodeSidecarOptions } from './node-sidecar-process.js'

type ResolveSidecarInput = {
  packaged: boolean
  resourcesPath: string
  appPath: string
  platform: NodeJS.Platform
}

export function resolveSidecar(input: ResolveSidecarInput): NodeSidecarOptions {
  const paths = input.platform === 'win32' ? path.win32 : path.posix
  if (input.packaged) {
    return {
      bunPath: paths.join(
        input.resourcesPath,
        'runtime',
        input.platform === 'win32' ? 'bun.exe' : 'bun',
      ),
      entryPath: paths.join(input.resourcesPath, 'core', 'main.js'),
      cwd: input.resourcesPath,
    }
  }
  return {
    bunPath:
      process.env.CCB_BUN_PATH ??
      paths.join(
        input.appPath,
        'dist',
        'runtime',
        input.platform === 'win32' ? 'bun.exe' : 'bun',
      ),
    entryPath: paths.join(input.appPath, 'dist', 'core', 'main.js'),
    cwd: input.appPath,
  }
}
