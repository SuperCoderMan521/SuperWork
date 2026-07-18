import { fileURLToPath } from 'node:url'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))

const build = Bun.spawn(['bun', 'run', 'build:processes'], {
  cwd: packageRoot,
  stdout: 'inherit',
  stderr: 'inherit',
})
if ((await build.exited) !== 0) process.exit(1)

const vite = Bun.spawn(['bunx', 'vite'], {
  cwd: packageRoot,
  stdout: 'inherit',
  stderr: 'inherit',
})

const devUrl = 'http://localhost:5173'
let ready = false
for (let attempt = 0; attempt < 100; attempt += 1) {
  try {
    const response = await fetch(devUrl)
    if (response.ok) {
      ready = true
      break
    }
  } catch {
    await Bun.sleep(100)
  }
}

if (!ready) {
  vite.kill()
  throw new Error('Vite did not become ready within 10 seconds')
}

const electron = Bun.spawn(['bunx', 'electron', '.'], {
  cwd: packageRoot,
  env: { ...process.env, CCB_DESKTOP_DEV_URL: devUrl },
  stdout: 'inherit',
  stderr: 'inherit',
})

const exitCode = await electron.exited
vite.kill()
process.exit(exitCode)
