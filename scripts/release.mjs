// Publishes a GitHub Release for the version in package.json, with every download attached and the
// notes from that version's CHANGELOG.md section. The in-app updaters (desktop/updater.cjs,
// src/lib/updater.ts) read these releases, so the file names matter.
//
// Build first (see README → Building), then: npm run release
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const dist = path.join(root, 'dist')

// The APK is built as app-release.apk; the iPhone .ipa is built into dist/ by scripts/ios.sh.
const apk = path.join(root, 'android/app/build/outputs/apk/release/app-release.apk')
if (fs.existsSync(apk)) fs.copyFileSync(apk, path.join(dist, `WatchList-${version}.apk`))

const names = [
  `WatchList-${version}.dmg`,
  `WatchList-${version}-mac.zip`,
  `WatchList-Setup-${version}.exe`,
  `WatchList-${version}-x86_64.AppImage`,
  `WatchList-${version}.apk`,
  `WatchList-${version}.ipa`
]
const files = names.map((n) => path.join(dist, n)).filter((f) => fs.existsSync(f))
const missing = names.filter((n) => !fs.existsSync(path.join(dist, n)))
if (missing.length) console.warn(`Not attached (not found in dist/): ${missing.join(', ')}`)

const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
const start = changelog.indexOf(`## [${version}]`)
if (start < 0) throw new Error(`CHANGELOG.md has no "## [${version}]" section`)
const rest = changelog.slice(start)
const next = rest.indexOf('\n## [', 1)
const notes = (next > 0 ? rest.slice(0, next) : rest).split('\n').slice(1).join('\n').trim()
const notesFile = path.join(os.tmpdir(), `watchlist-${version}-notes.md`)
fs.writeFileSync(notesFile, notes)

execFileSync('gh', ['release', 'create', `v${version}`, '--title', `WatchList ${version}`, '--notes-file', notesFile, ...files], { cwd: root, stdio: 'inherit' })
console.log(`Published v${version}`)
