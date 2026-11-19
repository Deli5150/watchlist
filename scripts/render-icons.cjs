// Renders assets/src/icon.svg into every icon size the apps need. Run with Electron:
//   desktop/node_modules/.bin/electron scripts/render-icons.cjs
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.join(__dirname, '..')
const svg = fs.readFileSync(path.join(root, 'assets/src/icon.svg'), 'utf8')

/** svg variants: full icon, art only (transparent), art in white (monochrome). */
const art = svg.replace(/<!--bg-->[\s\S]*?<!--\/bg-->/, '')
const variants = { full: svg, art, mono: art }

async function render(win, svgText, size, file, scale = 1) {
  const html = `<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center"><img style="width:${size * scale}px;height:${size * scale}px" src="data:image/svg+xml;base64,${Buffer.from(svgText).toString('base64')}"></div></body></html>`
  win.setContentSize(size, size)
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`)
  await new Promise((r) => setTimeout(r, 150))
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, img.resize({ width: size, height: size }).toPNG())
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true }, width: 1024, height: 1024 })
  const a = (p) => path.join(root, p)
  await render(win, variants.full, 1024, a('assets/icon.png'))
  await render(win, variants.art, 1024, a('assets/android-icon-foreground.png'), 0.62)
  await render(win, variants.mono, 1024, a('assets/android-icon-monochrome.png'), 0.62)
  await render(win, variants.art, 1024, a('assets/splash-icon.png'), 0.8)
  await render(win, variants.full, 48, a('assets/favicon.png'))
  await render(win, variants.full, 1024, a('desktop/build/icon.png'))
  await render(win, variants.art, 64, a('desktop/build/tray.png'), 0.9)
  // macOS .icns, with a rounded-square mask like other Mac apps.
  const rounded = svg.replaceAll('<rect width="1024" height="1024"', '<rect x="100" y="100" width="824" height="824" rx="185"').replace('<g id="art"', '<g transform="translate(100 100) scale(0.8047)"><g id="art"').replace('</g>\n</svg>', '</g></g>\n</svg>')
  const set = a('desktop/build/icon.iconset')
  fs.rmSync(set, { recursive: true, force: true })
  for (const s of [16, 32, 128, 256, 512]) {
    await render(win, rounded, s, path.join(set, `icon_${s}x${s}.png`))
    await render(win, rounded, s * 2, path.join(set, `icon_${s}x${s}@2x.png`))
  }
  execFileSync('/usr/bin/iconutil', ['-c', 'icns', set, '-o', a('desktop/build/icon.icns')])
  fs.rmSync(set, { recursive: true, force: true })
  console.log('icons written')
  app.quit()
})
