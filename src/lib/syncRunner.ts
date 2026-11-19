import { create } from 'zustand'
import { driveFile } from './drive'
import { googleAvailable, googleFetch, googleSignIn, googleSignOut, SignedOutError } from './google'
import { applySynced, onLocalChange, useStore } from './store'
import { emptyMeta, merge } from './sync'

// Runs Sync with Google: after local changes (shortly), when the app opens or comes back, and every
// few minutes while it's open. One sync = download the file, merge, apply here, upload if changed.

const drive = driveFile(googleFetch)
const EVERY_MS = 10 * 60_000

export const useSyncBusy = create<boolean>(() => false)

let running: Promise<void> | null = null
let again = false

export function syncNow(): Promise<void> {
  if (!useStore.getState().sync.enabled) return Promise.resolve()
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    useSyncBusy.setState(true)
    try {
      do {
        again = false
        await syncOnce()
      } while (again)
    } finally {
      useSyncBusy.setState(false)
      running = null
    }
  })()
  return running
}

async function syncOnce(): Promise<void> {
  try {
    const remote = await drive.download()
    const s = useStore.getState()
    const result = merge({ items: s.items, watches: s.watches, settings: s.settings }, s.sync, remote)
    if (result.changedRemote) await drive.upload(result.doc)
    const latest = useStore.getState()
    // Changed here meanwhile: merge again rather than overwrite that change.
    if (latest.sync.at !== s.sync.at || latest.sync.removed !== s.sync.removed) {
      again = true
      return
    }
    applySynced({ ...(result.changedLocal ? result.data : {}), sync: { ...result.meta, enabled: latest.sync.enabled, email: latest.sync.email } })
  } catch (e) {
    const signedOut = e instanceof SignedOutError
    applySynced({ sync: { ...useStore.getState().sync, error: signedOut ? 'Signed out of Google. Turn Sync on again to reconnect.' : (e as Error).message } })
  }
}

let timer: ReturnType<typeof setTimeout> | null = null
let started = false

/** Starts syncing in the background (call once the store has loaded). */
export function startSync(): void {
  if (started) return
  started = true
  onLocalChange(() => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void syncNow(), 4000)
  })
  setInterval(() => void syncNow(), EVERY_MS)
  void syncNow()
}

export async function turnOnSync(): Promise<void> {
  if (!googleAvailable()) throw new Error('Sync isn’t set up in this copy of WatchList (it needs a Google OAuth client; see README → Sync with Google).')
  const email = await googleSignIn()
  drive.reset()
  applySynced({ sync: { ...useStore.getState().sync, enabled: true, email: email ?? (await drive.email()), error: undefined } })
  await syncNow()
}

export async function turnOffSync(): Promise<void> {
  const meta = useStore.getState().sync
  applySynced({ sync: { ...emptyMeta(), at: meta.at, removed: meta.removed } })
  drive.reset()
  await googleSignOut()
}
