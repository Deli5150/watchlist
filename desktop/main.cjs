const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, Notification, protocol, session, shell, Tray } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const updater = require('./updater.cjs')
const google = require('./google.cjs')
const { version } = require('./package.json')

// WatchLine's desktop shell: the app's web build (web/, from `expo export`) served over app://,
// with its data in a JSON file, TMDB responses cached as files, new-episode alerts as system
// notifications (WatchLine keeps running in the background for them), and the updater (updater.cjs).

const WEB = path.join(__dirname, 'web')
const DATA = () => path.join(app.getPath('userData'), 'watchlist.json')
const REMINDERS = () => path.join(app.getPath('userData'), 'reminders.json')

// The app was called WatchList: keep using its data folder (the name picks the folder otherwise).
if (!app.commandLine.hasSwitch('user-data-dir')) {
  const old = path.join(app.getPath('appData'), 'WatchList')
  if (fs.existsSync(old)) app.setPath('userData', old)
}

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])

if (!app.requestSingleInstanceLock()) app.exit(0)

let win = null
let tray = null

// Trailers play in YouTube's embed, which refuses to play without a Referer, and pages on app://
// don't send one: give its requests the app's website instead.
function allowYouTubeEmbeds() {
  const urls = ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/*']
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls }, (details, callback) => {
    const headers = details.requestHeaders
    if (!headers.Referer || headers.Referer.startsWith('app://')) headers.Referer = 'https://deli5150.github.io/watchlist/'
    callback({ requestHeaders: headers })
  })
}

function serveWeb() {
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url)
    let file = path.normalize(path.join(WEB, decodeURIComponent(pathname)))
    if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(WEB, 'index.html')
    return net.fetch(pathToFileURL(file).toString())
  })
}

// The title bar is hidden on macOS: leave room for the traffic lights and make the top draggable.
const MAC_CHROME_CSS = `
  #root { margin-top: 28px; height: calc(100% - 28px) !important; }
  #watchlist-drag { position: fixed; top: 0; left: 0; right: 0; height: 28px; -webkit-app-region: drag; z-index: 0; background: transparent; }
`

function createWindow() {
  win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 420,
    minHeight: 600,
    title: 'WatchLine',
    backgroundColor: '#0a0a0c',
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    icon: process.platform === 'linux' ? path.join(__dirname, 'build/tray.png') : undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: false }
  })
  // `npm run dev` points the app at the Expo dev server (live reload) instead of the built web/.
  win.loadURL(process.env.WATCHLIST_DEV_URL || 'app://watchlist/')
  win.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) win.show()
  })
  win.webContents.on('did-finish-load', () => {
    // Slim scrollbars that sit on any theme.
    win.webContents.insertCSS(`
      ::-webkit-scrollbar { width: 10px; height: 10px; background: transparent; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.16); border-radius: 5px; border: 2px solid transparent; background-clip: padding-box; }
      ::-webkit-scrollbar-thumb:hover { background-color: rgba(255,255,255,0.28); }
    `)
  })
  if (process.platform === 'darwin') {
    win.webContents.on('did-finish-load', () => {
      win.webContents.insertCSS(MAC_CHROME_CSS)
      win.webContents.executeJavaScript(`if(!document.getElementById('watchlist-drag')){const d=document.createElement('div');d.id='watchlist-drag';document.body.prepend(d)}`)
    })
  }
  // Links open in the browser, never inside WatchLine.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://') && !(process.env.WATCHLIST_DEV_URL && url.startsWith(process.env.WATCHLIST_DEV_URL))) {
      e.preventDefault()
      if (/^https?:/.test(url)) void shell.openExternal(url)
    }
  })
  // Closing the window keeps WatchLine running for new-episode alerts (quit from the menu, dock or tray).
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })
}

function showWindow() {
  if (!win) createWindow()
  else {
    win.show()
    win.focus()
  }
}

function createTray() {
  if (process.platform === 'darwin') return
  const icon = nativeImage.createFromPath(path.join(__dirname, 'build', 'tray.png')).resize({ width: 18, height: 18 })
  tray = new Tray(icon)
  tray.setToolTip('WatchLine')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open WatchLine', click: showWindow },
      { type: 'separator' },
      { label: 'Quit', click: () => ((app.isQuitting = true), app.quit()) }
    ])
  )
  tray.on('click', showWindow)
}

// ── Data ─────────────────────────────────────────────────────────────────────────────────────

ipcMain.on('version', (e) => (e.returnValue = version))

ipcMain.handle('data:load', () => {
  for (const f of [DATA(), `${DATA()}.bak`]) {
    try {
      const text = fs.readFileSync(f, 'utf8')
      JSON.parse(text)
      return text
    } catch {}
  }
  return null
})

ipcMain.handle('data:save', (_e, json) => {
  const file = DATA()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`)
  fs.writeFileSync(`${file}.tmp`, json)
  fs.renameSync(`${file}.tmp`, file)
})

ipcMain.handle('file:save', async (_e, name, content) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('downloads'), name) })
  if (canceled || !filePath) return false
  fs.writeFileSync(filePath, content)
  return true
})

ipcMain.on('open-external', (_e, url) => {
  if (/^https?:\/\//.test(url)) void shell.openExternal(url)
})

// ── Reminders ────────────────────────────────────────────────────────────────────────────────

let reminders = []
let fired = new Set()

function loadReminders() {
  try {
    const saved = JSON.parse(fs.readFileSync(REMINDERS(), 'utf8'))
    reminders = saved.reminders ?? []
    fired = new Set(saved.fired ?? [])
  } catch {}
}

function saveReminders() {
  const live = new Set(reminders.map((r) => r.id))
  fs.writeFileSync(REMINDERS(), JSON.stringify({ reminders, fired: [...fired].filter((id) => live.has(id)) }))
}

function notify(title, body) {
  if (!Notification.isSupported()) return
  const n = new Notification({ title, body, silent: false })
  n.on('click', showWindow)
  n.show()
}

/** Shows reminders that are due (or were missed in the last day while WatchLine wasn't running). */
function fireDue() {
  const now = Date.now()
  let changed = false
  for (const r of reminders) {
    if (r.at <= now && r.at > now - 24 * 3600_000 && !fired.has(r.id)) {
      fired.add(r.id)
      changed = true
      notify(r.title, r.body)
    }
  }
  if (changed) saveReminders()
}

ipcMain.on('reminders:set', (_e, list) => {
  reminders = Array.isArray(list) ? list : []
  saveReminders()
  fireDue()
})
ipcMain.on('notify', (_e, title, body) => notify(title, body))

// ── TMDB cache ───────────────────────────────────────────────────────────────────────────────
// Show and movie details from TMDB, kept as files so the library opens without the network.

const CACHE = () => path.join(app.getPath('userData'), 'cache')
const cacheFile = (key) => path.join(CACHE(), `${String(key).replace(/[^a-z0-9_.-]/gi, '_')}.json`)

ipcMain.handle('cache:get', (_e, key) => {
  try {
    return fs.readFileSync(cacheFile(key), 'utf8')
  } catch {
    return null
  }
})
ipcMain.handle('cache:set', (_e, key, json) => {
  fs.mkdirSync(CACHE(), { recursive: true })
  fs.writeFileSync(cacheFile(key), json)
})
ipcMain.handle('cache:clear', () => fs.rmSync(CACHE(), { recursive: true, force: true }))

// ── Your own wallpaper ───────────────────────────────────────────────────────────────────────
// An image you picked (resized to a JPEG data URL by the app), kept beside the data file.

const WALLPAPER = () => path.join(app.getPath('userData'), 'wallpaper.txt')
ipcMain.handle('wallpaper:get', () => {
  try {
    return fs.readFileSync(WALLPAPER(), 'utf8')
  } catch {
    return null
  }
})
ipcMain.handle('wallpaper:set', (_e, dataUrl) => {
  if (dataUrl) fs.writeFileSync(WALLPAPER(), dataUrl)
  else fs.rmSync(WALLPAPER(), { force: true })
})

// ── Sync with Google ─────────────────────────────────────────────────────────────────────────

ipcMain.on('google:configured', (e) => (e.returnValue = google.configured()))
ipcMain.handle('google:sign-in', () => google.signIn())
ipcMain.handle('google:sign-out', () => google.signOut())
ipcMain.handle('google:fetch', (_e, url, init) => google.authFetch(url, init))

// ── Updates ──────────────────────────────────────────────────────────────────────────────────

ipcMain.handle('update:status', () => updater.updateStatus())
ipcMain.handle('update:check', (_e, quiet) => updater.checkForUpdates(Boolean(quiet)))
ipcMain.handle('update:download', () => updater.downloadUpdate())
ipcMain.handle('update:install', () => updater.installUpdate())
ipcMain.on('update:auto', (_e, enabled) => updater.setAuto(enabled))

// ── App ──────────────────────────────────────────────────────────────────────────────────────

app.on('second-instance', showWindow)
app.on('activate', showWindow)
app.on('before-quit', () => (app.isQuitting = true))
app.on('window-all-closed', () => {})

app.whenReady().then(() => {
  app.setAppUserModelId('app.watchlist.tracker')
  serveWeb()
  allowYouTubeEmbeds()
  loadReminders()
  createWindow()
  createTray()
  setInterval(fireDue, 30_000)
  updater.startUpdater((status) => win?.webContents.send('update:status', status))
  if (process.env.WATCHLIST_SHOTS) void screenshots(process.env.WATCHLIST_SHOTS)
})

/** Test hook: WATCHLIST_SHOTS=<dir> [WATCHLIST_SHOT_STEPS="name:click text,…"] saves screenshots, then quits. */
async function screenshots(dir) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  fs.mkdirSync(dir, { recursive: true })
  win.webContents.on('console-message', (e) => {
    if (e.level === 'warning' || e.level === 'error') console.log(`[page ${e.level}] ${e.message}`)
  })
  await wait(4000)
  const steps = (process.env.WATCHLIST_SHOT_STEPS || 'home:,library:Library,settings:Settings').split(',')
  for (const step of steps) {
    const [name, ...clicks] = step.split(':')
    for (const text of clicks.filter(Boolean)) {
      if (text.startsWith('!')) {
        await win.webContents.executeJavaScript(text.slice(1).replace(/%2C/g, ',').replace(/%3A/g, ':').replace(/%26/g, '&')).catch((e) => console.log(`[step failed] ${e.message}`))
        await wait(900)
        continue
      }
      if (text.startsWith('@')) {
        await win.webContents.executeJavaScript(`(() => { const el = [...document.querySelectorAll('[aria-label=${JSON.stringify(text.slice(1))}]')].filter((e) => e.offsetParent).pop(); el && el.click() })()`)
        await wait(900)
        continue
      }
      // Only visible elements: hidden tabs stay mounted and would otherwise swallow the click.
      await win.webContents.executeJavaScript(`(() => { const els = [...document.querySelectorAll('div,span')].filter(e => e.childElementCount === 0 && e.textContent.trim() === ${JSON.stringify(text)} && e.offsetParent); const el = els[els.length - 1]; el && el.click(); return !!el })()`)
      await wait(900)
    }
    await wait(1200)
    console.log('shot', name, await win.webContents.executeJavaScript('JSON.stringify([innerWidth, innerHeight, document.documentElement.scrollWidth, document.body.scrollWidth, devicePixelRatio])'))
    const img = await win.webContents.capturePage()
    fs.writeFileSync(path.join(dir, `${name}.png`), img.toPNG())
  }
  app.isQuitting = true
  app.quit()
}
