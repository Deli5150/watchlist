// `npm run dev`: the Expo dev server (web, live reload) and the desktop app pointed at it.
// Quitting the app stops the server. For phones, use `npm start` instead.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 8081
const url = `http://localhost:${PORT}`

// The desktop side reads the Google client from the environment in development (.env, like Expo does).
const dotenv = Object.fromEntries(
  (fs.existsSync(path.join(root, '.env')) ? fs.readFileSync(path.join(root, '.env'), 'utf8') : '')
    .split('\n')
    .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim()))
    .filter(Boolean)
    .map((m) => [m[1], m[2]])
)

const server = spawn('npx', ['expo', 'start', '--web', '--port', String(PORT)], { cwd: root, stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, BROWSER: 'none' } })

async function waitForServer() {
  for (let i = 0; i < 240; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('the dev server did not start')
}

await waitForServer()
console.log(`\nOpening WatchLine (desktop) on ${url}\n`)
const electron = path.join(root, 'desktop/node_modules/.bin/electron')
const app = spawn(electron, ['.', `--user-data-dir=${path.join(root, '.dev-data')}`], { cwd: path.join(root, 'desktop'), stdio: 'inherit', env: { ...process.env, ...dotenv, WATCHLIST_DEV_URL: url } })
const stop = () => {
  server.kill()
  app.kill()
}
app.on('exit', () => {
  server.kill()
  process.exit(0)
})
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
