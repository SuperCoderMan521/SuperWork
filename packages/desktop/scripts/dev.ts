import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '127.0.0.1')
  })
}

async function findAvailablePort(start: number): Promise<number> {
  for (let port = start; port < start + 50; port += 1) {
    if (await isPortAvailable(port)) return port
  }
  throw new Error(`No available Vite port found from ${start}`)
}

const build = Bun.spawn(['bun', 'run', 'build:processes'], {
  cwd: packageRoot,
  stdout: 'inherit',
  stderr: 'inherit',
})
if ((await build.exited) !== 0) process.exit(1)

const vitePort = await findAvailablePort(5173)
const devUrl = `http://localhost:${vitePort}`

const vite = Bun.spawn(['bunx', 'vite', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], {
  cwd: packageRoot,
  stdout: 'inherit',
  stderr: 'inherit',
})

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
