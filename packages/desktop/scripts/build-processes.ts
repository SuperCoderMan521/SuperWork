import { copyFile, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  DEFAULT_BUILD_FEATURES,
  getMacroDefines,
} from '../../../scripts/defines.js'

const packageRoot = resolve(import.meta.dirname, '..')
const dist = resolve(packageRoot, 'dist')
await mkdir(dist, { recursive: true })
await Promise.all([
  rm(resolve(dist, 'electron'), { recursive: true, force: true }),
  rm(resolve(dist, 'core'), { recursive: true, force: true }),
])
const runtimeDir = resolve(dist, 'runtime')
await mkdir(runtimeDir, { recursive: true })

async function assertBuild(
  label: string,
  options: Parameters<typeof Bun.build>[0],
): Promise<void> {
  const result = await Bun.build(options)
  if (result.success) return
  for (const log of result.logs) console.error(log)
  throw new Error(`${label} build failed`)
}

await assertBuild('Electron Main', {
  entrypoints: [resolve(packageRoot, 'electron/main.ts')],
  outdir: resolve(dist, 'electron'),
  target: 'node',
  format: 'esm',
  sourcemap: 'linked',
  external: ['electron'],
})

await assertBuild('Electron Preload', {
  entrypoints: [resolve(packageRoot, 'electron/preload.ts')],
  outdir: resolve(dist, 'electron'),
  target: 'node',
  format: 'cjs',
  naming: '[name].cjs',
  sourcemap: 'linked',
  external: ['electron'],
})

await assertBuild('Desktop Core', {
  entrypoints: [resolve(packageRoot, 'core/main.ts')],
  outdir: resolve(dist, 'core'),
  target: 'bun',
  format: 'esm',
  splitting: true,
  sourcemap: 'linked',
  define: {
    ...getMacroDefines(),
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  features: [...DEFAULT_BUILD_FEATURES],
})

await copyFile(
  process.execPath,
  resolve(runtimeDir, process.platform === 'win32' ? 'bun.exe' : 'bun'),
)

console.log('Built Electron processes and Bun Desktop Core')
