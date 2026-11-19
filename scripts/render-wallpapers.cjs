// Draws the built-in wallpapers (assets/wallpapers/*.jpg) on a canvas. Run with Electron:
//   desktop/node_modules/.bin/electron scripts/render-wallpapers.cjs
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const W = 1920
const H = 1440
const out = path.join(__dirname, '..', 'assets', 'wallpapers')

// Each one draws on `ctx` (W×H). `rand` is seeded, so the pictures come out the same every time.
const PAINT = String.raw`
function seeded(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 } }
function glow(ctx, x, y, r, color, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.globalAlpha = alpha; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1
}
function stars(ctx, rand, n, maxY = H) {
  for (let i = 0; i < n; i++) {
    const s = rand() ** 3 * 2.2 + 0.4
    ctx.globalAlpha = 0.25 + rand() * 0.75
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.arc(rand() * W, rand() * maxY, s, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 1
}
function grain(ctx, rand, amount = 14) {
  const img = ctx.getImageData(0, 0, W, H)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * amount
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)
}
function vignette(ctx, strength = 0.7) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95)
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + strength + ')')
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
}

const PAINTERS = {
  // Velvet curtains, lit from above: the cinema before the film starts.
  curtain(ctx, rand) {
    ctx.fillStyle = '#1a0306'; ctx.fillRect(0, 0, W, H)
    const folds = 26
    for (let i = 0; i < folds; i++) {
      const x = (i / folds) * W, w = W / folds
      const g = ctx.createLinearGradient(x, 0, x + w, 0)
      g.addColorStop(0, '#2a0409'); g.addColorStop(0.35, '#8d1020'); g.addColorStop(0.55, '#b51a2c'); g.addColorStop(0.8, '#4a0610'); g.addColorStop(1, '#1f0306')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.moveTo(x - 2, 0); ctx.lineTo(x + w + 2, 0)
      ctx.bezierCurveTo(x + w + 6, H * 0.5, x + w - 6, H * 0.8, x + w + 4, H); ctx.lineTo(x - 4, H)
      ctx.bezierCurveTo(x + 6, H * 0.8, x - 6, H * 0.5, x - 2, 0); ctx.fill()
    }
    const top = ctx.createLinearGradient(0, 0, 0, H)
    top.addColorStop(0, 'rgba(0,0,0,0.65)'); top.addColorStop(0.25, 'rgba(0,0,0,0)'); top.addColorStop(0.7, 'rgba(0,0,0,0.15)'); top.addColorStop(1, 'rgba(0,0,0,0.85)')
    ctx.fillStyle = top; ctx.fillRect(0, 0, W, H)
    ctx.globalCompositeOperation = 'screen'
    glow(ctx, W / 2, H * 0.28, H * 0.75, 'rgba(255,170,120,0.45)')
    ctx.globalCompositeOperation = 'source-over'
    vignette(ctx, 0.75); grain(ctx, rand, 10)
  },
  // A projector's beam through a dark room, with dust in the light.
  projector(ctx, rand) {
    const bg = ctx.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, '#07080d'); bg.addColorStop(1, '#0d0f18'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
    const sx = W * 0.82, sy = H * 0.12
    ctx.globalCompositeOperation = 'screen'
    ctx.filter = 'blur(28px)'
    for (let k = 0; k < 3; k++) {
      const spread = 0.18 + k * 0.1
      const g = ctx.createLinearGradient(sx, sy, W * 0.15, H * 0.9)
      g.addColorStop(0, 'rgba(190,210,255,' + (0.4 - k * 0.11) + ')'); g.addColorStop(1, 'rgba(120,150,255,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.moveTo(sx, sy)
      ctx.lineTo(W * (0.05 - spread * 0.3), H * (0.55 - spread)); ctx.lineTo(W * (0.25 + spread * 0.4), H * (1.05 + spread * 0.2)); ctx.closePath(); ctx.fill()
    }
    ctx.filter = 'none'
    glow(ctx, sx, sy, 160, 'rgba(230,240,255,0.9)')
    glow(ctx, sx, sy, 34, '#ffffff')
    for (let i = 0; i < 260; i++) {
      const t = rand(), x = sx + (W * 0.2 - sx) * t + (rand() - 0.5) * 700 * t, y = sy + (H * 0.75 - sy) * t + (rand() - 0.5) * 500 * t
      ctx.globalAlpha = (1 - t) * 0.6 * rand(); ctx.fillStyle = '#dfe8ff'
      ctx.beginPath(); ctx.arc(x, y, rand() * 2.2 + 0.4, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'
    // Rows of seats in silhouette.
    for (let r = 0; r < 3; r++) {
      const y = H * (0.8 + r * 0.075), size = 110 + r * 40
      ctx.fillStyle = 'rgba(0,0,0,' + (0.75 + r * 0.1) + ')'
      for (let x = -size + (r % 2) * size * 0.5; x < W + size; x += size * 1.05) {
        ctx.beginPath(); ctx.ellipse(x, y, size * 0.42, size * 0.55, 0, 0, Math.PI * 2); ctx.fill()
      }
      ctx.fillRect(0, y, W, H)
    }
    vignette(ctx, 0.6); grain(ctx, rand, 12)
  },
  // Ribbons of aurora over a night sky.
  aurora(ctx, rand) {
    const bg = ctx.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, '#03040c'); bg.addColorStop(0.6, '#061322'); bg.addColorStop(1, '#03070c'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
    stars(ctx, rand, 700, H * 0.8)
    ctx.globalCompositeOperation = 'screen'
    ctx.filter = 'blur(38px)'
    const bands = [['rgba(45,230,170,0.55)', 0.42, 160], ['rgba(70,140,255,0.45)', 0.32, 120], ['rgba(170,90,255,0.4)', 0.22, 110]]
    for (const [color, base, amp] of bands) {
      for (let x = 0; x < W; x += 6) {
        const y = H * base + Math.sin(x / 260 + base * 9) * amp + Math.sin(x / 90) * 18
        const h = 220 + Math.sin(x / 180 + base * 4) * 120
        const g = ctx.createLinearGradient(0, y - h, 0, y)
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, color)
        ctx.fillStyle = g; ctx.fillRect(x, y - h, 7, h + 30)
      }
    }
    ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over'
    // Mountains.
    for (const [shade, base, rough] of [['#050a10', 0.78, 120], ['#020406', 0.88, 80]]) {
      ctx.fillStyle = shade; ctx.beginPath(); ctx.moveTo(0, H)
      let y = H * base
      for (let x = 0; x <= W; x += 40) { y += (rand() - 0.5) * rough * 0.6; y = Math.min(Math.max(y, H * base - rough), H * base + rough * 0.5); ctx.lineTo(x, y) }
      ctx.lineTo(W, H); ctx.fill()
    }
    vignette(ctx, 0.5); grain(ctx, rand, 8)
  },
  // An outrun sunset over a neon grid.
  synthwave(ctx, rand) {
    const horizon = H * 0.62
    const sky = ctx.createLinearGradient(0, 0, 0, horizon)
    sky.addColorStop(0, '#0b0521'); sky.addColorStop(0.6, '#3a0d4f'); sky.addColorStop(1, '#a8235f'); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, horizon)
    stars(ctx, rand, 300, horizon * 0.6)
    // The sun, cut by stripes.
    const r = H * 0.26, cx = W / 2, cy = horizon - r * 0.35
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip()
    const sun = ctx.createLinearGradient(0, cy - r, 0, cy + r)
    sun.addColorStop(0, '#ffd56b'); sun.addColorStop(0.55, '#ff6a6a'); sun.addColorStop(1, '#d6256f'); ctx.fillStyle = sun; ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
    for (let i = 0; i < 8; i++) { const y = cy + r * 0.05 + i * i * 4.2 + i * 14; ctx.clearRect(cx - r, y, r * 2, 4 + i * 2.4) }
    ctx.restore()
    ctx.globalCompositeOperation = 'screen'; glow(ctx, cx, cy, r * 2.2, 'rgba(255,90,140,0.35)'); ctx.globalCompositeOperation = 'source-over'
    // Re-fill the sky under the stripes' cut-outs.
    ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = sky; ctx.fillRect(0, 0, W, horizon); ctx.globalCompositeOperation = 'source-over'
    const ground = ctx.createLinearGradient(0, horizon, 0, H)
    ground.addColorStop(0, '#1a0626'); ground.addColorStop(1, '#05010a'); ctx.fillStyle = ground; ctx.fillRect(0, horizon, W, H - horizon)
    ctx.strokeStyle = '#ff3fa8'; ctx.shadowColor = '#ff3fa8'; ctx.shadowBlur = 14; ctx.lineWidth = 2.5
    for (let i = -24; i <= 24; i++) { ctx.beginPath(); ctx.moveTo(cx + i * 18, horizon); ctx.lineTo(cx + i * 260, H); ctx.stroke() }
    for (let i = 1; i < 18; i++) { const y = horizon + (H - horizon) * (i / 18) ** 2.1; ctx.globalAlpha = 0.35 + 0.65 * (i / 18); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0
    const haze = ctx.createLinearGradient(0, horizon - 40, 0, horizon + 120)
    haze.addColorStop(0, 'rgba(255,80,160,0)'); haze.addColorStop(0.4, 'rgba(255,80,160,0.35)'); haze.addColorStop(1, 'rgba(255,80,160,0)')
    ctx.fillStyle = haze; ctx.fillRect(0, horizon - 40, W, 160)
    vignette(ctx, 0.55); grain(ctx, rand, 8)
  },
  // Deep space: a nebula and a field of stars.
  nebula(ctx, rand) {
    ctx.fillStyle = '#03030a'; ctx.fillRect(0, 0, W, H)
    ctx.globalCompositeOperation = 'screen'
    const clouds = [['rgba(80,60,255,0.5)', 0.3, 0.4], ['rgba(255,60,140,0.4)', 0.62, 0.55], ['rgba(40,200,255,0.35)', 0.48, 0.3], ['rgba(255,140,60,0.25)', 0.75, 0.7]]
    for (const [color, fx, fy] of clouds) for (let i = 0; i < 40; i++) glow(ctx, W * fx + (rand() - 0.5) * 900, H * fy + (rand() - 0.5) * 600, 120 + rand() * 340, color, 0.35)
    ctx.globalCompositeOperation = 'source-over'
    stars(ctx, rand, 1400)
    for (let i = 0; i < 14; i++) { const x = rand() * W, y = rand() * H; glow(ctx, x, y, 26, 'rgba(255,255,255,0.8)'); ctx.fillStyle = '#fff'; ctx.fillRect(x - 0.8, y - 14, 1.6, 28); ctx.fillRect(x - 14, y - 0.8, 28, 1.6) }
    vignette(ctx, 0.55); grain(ctx, rand, 8)
  },
  // Layered hills at dusk.
  dusk(ctx, rand) {
    const sky = ctx.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#0f1030'); sky.addColorStop(0.45, '#4b2a5e'); sky.addColorStop(0.7, '#d0626a'); sky.addColorStop(0.85, '#f2a065'); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H)
    stars(ctx, rand, 220, H * 0.35)
    glow(ctx, W * 0.3, H * 0.55, 420, 'rgba(255,190,140,0.45)')
    glow(ctx, W * 0.3, H * 0.55, 90, 'rgba(255,240,210,1)')
    const layers = ['#6b3a5e', '#4e2a4f', '#33203d', '#20152b', '#110b18']
    layers.forEach((shade, i) => {
      const base = H * (0.6 + i * 0.08), amp = 90 - i * 8, f = 0.0018 + i * 0.0006, ph = rand() * 10
      ctx.fillStyle = shade; ctx.beginPath(); ctx.moveTo(0, H)
      for (let x = 0; x <= W; x += 8) ctx.lineTo(x, base + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3.1 + ph) * amp * 0.3)
      ctx.lineTo(W, H); ctx.fill()
      const mist = ctx.createLinearGradient(0, base - amp, 0, base + amp * 2)
      mist.addColorStop(0, 'rgba(255,170,150,0.0)'); mist.addColorStop(1, 'rgba(255,170,150,' + (0.08 - i * 0.012) + ')')
      ctx.fillStyle = mist; ctx.fillRect(0, base - amp, W, amp * 3)
    })
    vignette(ctx, 0.45); grain(ctx, rand, 8)
  }
}
`

app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true })
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html,<html><body></body></html>')
  const names = await win.webContents.executeJavaScript(`const W=${W},H=${H};${PAINT};Object.keys(PAINTERS)`)
  for (const [i, name] of names.entries()) {
    const dataUrl = await win.webContents.executeJavaScript(`(() => {
      const c = document.createElement('canvas'); c.width = W; c.height = H
      const ctx = c.getContext('2d', { willReadFrequently: true })
      PAINTERS[${JSON.stringify(name)}](ctx, seeded(${i * 7919 + 17}))
      return c.toDataURL('image/jpeg', 0.84)
    })()`)
    fs.writeFileSync(path.join(out, `${name}.jpg`), Buffer.from(dataUrl.split(',')[1], 'base64'))
    // A small copy for the picker.
    const thumb = await win.webContents.executeJavaScript(`(() => new Promise((res) => {
      const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = 360; c.height = 270; c.getContext('2d').drawImage(im, 0, 0, 360, 270); res(c.toDataURL('image/jpeg', 0.8)) }; im.src = ${JSON.stringify(dataUrl)}
    }))()`)
    fs.writeFileSync(path.join(out, `${name}-thumb.jpg`), Buffer.from(thumb.split(',')[1], 'base64'))
    console.log(name)
  }
  app.quit()
})
