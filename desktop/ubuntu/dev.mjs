process.env.LIFETECH_DESKTOP_DEV = '1'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import electron from 'electron'
import { electronEnvironment } from './runtime.mjs'

// Set the brand before Vite loads the shared configuration.
process.env.SITE_BRAND = 'lifetech'
const root = fileURLToPath(new URL('../../', import.meta.url))
const port = Number(process.env.LIFETECH_DEV_PORT || 5173)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('LIFETECH_DEV_PORT must be an integer from 1 to 65535')
}
const server = await createServer({ root, server: { host: '127.0.0.1', port, strictPort: process.env.LIFETECH_DEV_PORT !== undefined } })
try {
  await server.listen()
} catch (error) {
  console.error(`LifeTech development could not start: ${error.message}`)
  await server.close()
  process.exit(1)
}
const url = server.resolvedUrls.local[0]
console.log(`LifeTech development: ${url}\nLive reload enabled. Press Ctrl+C to stop.`)
const electronEnv = electronEnvironment()
const browser = spawn(electron, [fileURLToPath(new URL('./main.cjs', import.meta.url)), '--dev', url], { stdio: 'inherit', env: electronEnv })
let stopping = false
async function stop(code) {
  if (stopping) return
  stopping = true
  browser.kill('SIGTERM')
  await server.close()
  process.exit(code)
}
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
browser.on('error', error => { console.error(error.message); stop(1) })
browser.on('exit', code => stop(code || 0))
