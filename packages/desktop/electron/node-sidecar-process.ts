import { spawn } from 'node:child_process'
import type { SidecarProcess, SidecarProcessFactory } from './sidecar-manager.js'

export type NodeSidecarOptions = {
  bunPath: string
  entryPath: string
  cwd: string
  onStderr?: (chunk: string) => void
}

export function createNodeSidecarFactory(
  options: NodeSidecarOptions,
): SidecarProcessFactory {
  return () => {
    const child = spawn(options.bunPath, ['run', options.entryPath], {
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    child.stderr.on('data', chunk => {
      const text = chunk.toString('utf8')
      options.onStderr?.(text)
      process.stderr.write(chunk)
    })

    const processAdapter: SidecarProcess = {
      write: value => child.stdin.write(value),
      onOutput: listener => {
        const handler = (chunk: Buffer) => listener(chunk.toString('utf8'))
        child.stdout.on('data', handler)
        return () => child.stdout.off('data', handler)
      },
      onExit: listener => {
        const handler = (code: number | null) => listener(code)
        child.on('exit', handler)
        return () => child.off('exit', handler)
      },
      onError: listener => {
        const handler = (error: Error) => listener(error)
        child.on('error', handler)
        return () => child.off('error', handler)
      },
      terminate: () => child.kill(),
    }
    return processAdapter
  }
}
