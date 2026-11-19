// In-app updates from the GitHub repo's Releases (published by scripts/release.mjs). Builds are
// ad-hoc signed, which the usual Electron updaters refuse, so WatchLine installs its own way:
//   macOS     the release's -mac.zip, unpacked, swapped in for the running .app, then reopened
//   Windows   the release's Setup .exe, run silently into the same folder; it reopens WatchLine
//   AppImage  the new AppImage swapped in for the running file, then started
// The running copy is moved aside rather than overwritten, and cleaned up on the next launch.
const { app, shell } = require('electron')
const { spawn, execFile } = require('node:child_process')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
// Node's own fs: Electron's treats .asar files as folders, so it can't delete an app copy.
const rawFs = require('original-fs')
const path = require('node:path')
const { promisify } = require('node:util')
const { version } = require('./package.json')

const run = promisify(execFile)
const REPO = 'Deli5150/watchlist'
const LATEST = `https://api.github.com/repos/${REPO}/releases/latest`
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`
const CHECK_EVERY_MS = 6 * 60 * 60_000

const PATTERNS = {
  'mac-app': /^WatchLine-[\d.]+-mac\.zip$/,
  'win-nsis': /^WatchLine-Setup-[\d.]+\.exe$/,
  appimage: /^WatchLine-[\d.]+-x86_64\.AppImage$/
}

const macBundle = () => path.resolve(process.execPath, '../../..')

function installKind() {
  if (!app.isPackaged) return 'none'
  if (process.platform === 'darwin') return macBundle().endsWith('.app') ? 'mac-app' : 'none'
  if (process.platform === 'win32') return 'win-nsis'
  if (process.platform === 'linux' && process.env.APPIMAGE) return 'appimage'
  return 'none'
}

const kind = installKind()
const updateDir = () => path.join(app.getPath('userData'), 'update')

let status = { current: version, state: 'idle', inApp: kind !== 'none' }
let release = null
let downloaded = null
let notify = () => {}
let auto = true

const parts = (v) => v.replace(/^v/i, '').split('-')[0].split('.').map((n) => Number.parseInt(n, 10) || 0)
function compareVersions(a, b) {
  const x = parts(a)
  const y = parts(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d) return d
  }
  return 0
}

function set(patch) {
  status = { ...status, ...patch }
  notify(status)
}

async function checkForUpdates(quiet = false) {
  if (['checking', 'downloading', 'ready', 'installing'].includes(status.state)) return
  set({ state: 'checking', error: undefined })
  try {
    const res = await fetch(process.env.WATCHLIST_RELEASE_API || LATEST, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': `WatchLine/${version}` } })
    if (res.status === 404) return set({ state: 'latest', lastCheck: Date.now() })
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
    const r = await res.json()
    const v = String(r.tag_name).replace(/^v/i, '')
    if (r.draft || r.prerelease || compareVersions(v, version) <= 0) {
      release = null
      return set({ state: 'latest', version: undefined, lastCheck: Date.now() })
    }
    const pattern = PATTERNS[kind]
    const file = pattern && (r.assets || []).find((a) => pattern.test(a.name))
    release = {
      version: v,
      notes: (r.body || '').trim(),
      page: r.html_url,
      asset: file && { name: file.name, url: file.browser_download_url, size: file.size, sha256: file.digest?.startsWith('sha256:') ? file.digest.slice(7) : undefined }
    }
    set({ state: 'available', version: v, notes: release.notes, page: release.page, inApp: Boolean(release.asset), lastCheck: Date.now() })
  } catch (e) {
    if (quiet) set({ state: release ? 'available' : 'idle' })
    else set({ state: 'error', error: `Couldn't check for updates: ${e.message}` })
  }
}

async function downloadUpdate() {
  if (!release?.asset) {
    if (release) void shell.openExternal(release.page)
    return
  }
  if (status.state === 'downloading') return
  const asset = release.asset
  set({ state: 'downloading', progress: 0, error: undefined })
  try {
    rawFs.rmSync(updateDir(), { recursive: true, force: true })
    fs.mkdirSync(updateDir(), { recursive: true })
    const file = path.join(updateDir(), asset.name)
    const res = await fetch(asset.url, { headers: { 'User-Agent': `WatchLine/${version}` } })
    if (!res.ok || !res.body) throw new Error(`download failed (${res.status})`)
    const total = Number(res.headers.get('content-length')) || asset.size
    const hash = createHash('sha256')
    const out = fs.createWriteStream(file)
    let got = 0
    let shown = 0
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      hash.update(value)
      got += value.length
      if (!out.write(value)) await new Promise((r) => out.once('drain', r))
      if (total && got / total - shown >= 0.01) {
        shown = got / total
        set({ progress: shown })
      }
    }
    await new Promise((resolve, reject) => out.end((e) => (e ? reject(e) : resolve())))
    if (asset.sha256 && hash.digest('hex') !== asset.sha256) throw new Error('the download was damaged; try again')
    downloaded = file
    set({ state: 'ready', progress: 1 })
  } catch (e) {
    set({ state: 'error', error: `Couldn't download the update: ${e.message}` })
  }
}

/** Runs `script` on its own (it outlives WatchLine) once this process has quit. */
function afterQuit(script, env) {
  spawn('/bin/sh', ['-c', `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done; ${script}`], { detached: true, stdio: 'ignore', env }).unref()
}
const quote = (s) => `'${s.replace(/'/g, `'\\''`)}'`

async function installUpdate() {
  if (status.state !== 'ready' || !downloaded) return
  set({ state: 'installing' })
  try {
    if (kind === 'mac-app') {
      const target = macBundle()
      fs.accessSync(path.dirname(target), fs.constants.W_OK)
      const unpacked = path.join(updateDir(), 'unpacked')
      await run('/usr/bin/ditto', ['-x', '-k', downloaded, unpacked])
      const bundle = fs.readdirSync(unpacked).find((n) => n.endsWith('.app'))
      if (!bundle) throw new Error('the update has no app in it')
      const next = path.join(unpacked, bundle)
      await run('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', next]).catch(() => {})
      const old = `${target}.old`
      rawFs.rmSync(old, { recursive: true, force: true })
      fs.renameSync(target, old)
      try {
        fs.renameSync(next, target)
      } catch {
        await run('/usr/bin/ditto', [next, target]).catch((e) => {
          fs.renameSync(old, target)
          throw e
        })
      }
      afterQuit(`/usr/bin/open -n ${quote(target)}`)
    } else if (kind === 'win-nsis') {
      // electron-builder's installer: /S installs silently into the same folder, --force-run reopens WatchLine.
      spawn(downloaded, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore' }).unref()
    } else if (kind === 'appimage') {
      const target = process.env.APPIMAGE
      const next = `${target}.new`
      fs.copyFileSync(downloaded, next)
      fs.chmodSync(next, 0o755)
      fs.renameSync(next, target)
      const env = { ...process.env }
      for (const k of ['APPIMAGE', 'APPDIR', 'OWD', 'ARGV0', 'CHROME_DESKTOP']) delete env[k]
      afterQuit(`exec ${quote(target)}`, env)
    } else {
      throw new Error("this copy of WatchLine can't update itself")
    }
    app.isQuitting = true
    app.quit()
  } catch (e) {
    const message = e.code === 'EACCES' ? "WatchLine's folder can't be changed by your account" : e.message
    set({ state: 'error', error: `Couldn't install the update: ${message}. Download it from the release page instead.`, page: release?.page ?? RELEASES_PAGE })
  }
}

function cleanUp() {
  const leftovers = [updateDir()]
  if (kind === 'mac-app') leftovers.push(`${macBundle()}.old`)
  for (const p of leftovers) rawFs.rm(p, { recursive: true, force: true }, () => {})
}

function startUpdater(onChange) {
  notify = onChange
  cleanUp()
  const tick = () => auto && checkForUpdates(true)
  setTimeout(tick, 8000)
  setInterval(tick, CHECK_EVERY_MS)
  // Test hook: install whatever is newer straight away.
  if (process.env.WATCHLIST_AUTO_INSTALL_UPDATE === '1') {
    setTimeout(async () => {
      await checkForUpdates()
      if (status.state === 'available') await downloadUpdate()
      if (status.state === 'ready') await installUpdate()
    }, 2000)
  }
}

module.exports = {
  startUpdater,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  updateStatus: () => status,
  setAuto: (v) => (auto = Boolean(v))
}
