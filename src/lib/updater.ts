import { cacheDirectory, createDownloadResumable, deleteAsync, makeDirectoryAsync } from 'expo-file-system/legacy'
import * as Linking from 'expo-linking'
import { Platform, Share } from 'react-native'
import { create } from 'zustand'
import WatchlistUpdater from '../../modules/watchlist-updater/src/WatchlistUpdaterModule'
import { VERSION } from '../version'
import { LATEST_RELEASE_API, newerRelease, RELEASES_PAGE, type GitHubRelease, type ReleaseInfo, type UpdateStatus } from './release'
import { desktop } from './storage'

// The in-app updater, from the GitHub repo's Releases. The desktop app does the work in its main
// process (desktop/updater.cjs) and reports here. Android downloads the new APK and opens the
// system installer on it (same signing key, so it installs over the app and keeps its data). An
// iPhone can't install apps itself: it downloads the new .ipa and offers to save it for sideloading.

const CHECK_EVERY_MS = 6 * 60 * 60_000
const KIND: 'desktop' | 'android' | 'ios' | 'none' = desktop ? 'desktop' : Platform.OS === 'android' && WatchlistUpdater ? 'android' : Platform.OS === 'ios' ? 'ios' : 'none'
const PATTERN = KIND === 'android' ? /^WatchLine-[\d.]+\.apk$/ : KIND === 'ios' ? /^WatchLine-[\d.]+\.ipa$/ : null

export const useUpdate = create<UpdateStatus>(() => ({ current: VERSION, state: 'idle', inApp: KIND !== 'none' }))

const set = (patch: Partial<UpdateStatus>) => useUpdate.setState(patch)
let release: ReleaseInfo | null = null
let downloaded: string | null = null
let lastAuto = 0

export async function checkForUpdates(quiet = false): Promise<void> {
  if (desktop) return desktop.updater.check(quiet)
  const { state } = useUpdate.getState()
  if (['checking', 'downloading', 'ready', 'installing'].includes(state)) return
  set({ state: 'checking', error: undefined })
  try {
    const res = await fetch(LATEST_RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } })
    if (res.status === 404) return set({ state: 'latest', lastCheck: Date.now() })
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
    release = newerRelease((await res.json()) as GitHubRelease, VERSION, PATTERN)
    if (!release) return set({ state: 'latest', version: undefined, lastCheck: Date.now() })
    set({ state: 'available', version: release.version, notes: release.notes, page: release.page, inApp: Boolean(release.asset), assetUrl: release.asset?.url, lastCheck: Date.now() })
  } catch (e) {
    if (quiet) set({ state: release ? 'available' : 'idle' })
    else set({ state: 'error', error: `Couldn't check for updates: ${(e as Error).message}` })
  }
}

export async function downloadUpdate(): Promise<void> {
  if (desktop) return desktop.updater.download()
  if (!release?.asset || KIND === 'none') return void Linking.openURL(release?.page ?? RELEASES_PAGE)
  if (useUpdate.getState().state === 'downloading') return
  set({ state: 'downloading', progress: 0, error: undefined })
  try {
    const dir = `${cacheDirectory}updates/`
    await deleteAsync(dir, { idempotent: true })
    await makeDirectoryAsync(dir, { intermediates: true })
    let shown = 0
    const task = createDownloadResumable(release.asset.url, `${dir}${release.asset.name}`, {}, ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      const p = totalBytesWritten / (totalBytesExpectedToWrite || release?.asset?.size || 1)
      if (p - shown >= 0.01) {
        shown = p
        set({ progress: p })
      }
    })
    const result = await task.downloadAsync()
    if (!result || result.status !== 200) throw new Error(`download failed (${result?.status ?? 'cancelled'})`)
    downloaded = result.uri
    set({ state: 'ready', progress: 1 })
  } catch (e) {
    set({ state: 'error', error: `Couldn't download the update: ${(e as Error).message}` })
  }
}

/** Installs (desktop, Android) or offers to save the .ipa (iPhone). */
export async function installUpdate(): Promise<void> {
  if (desktop) return desktop.updater.install()
  if (!downloaded) return
  if (KIND === 'ios') {
    try {
      await Share.share({ url: downloaded })
    } catch (e) {
      set({ error: `Couldn't open the share sheet: ${(e as Error).message}` })
    }
    return
  }
  if (!WatchlistUpdater) return
  if (!WatchlistUpdater.canInstall()) {
    WatchlistUpdater.openInstallSettings()
    set({ error: 'Allow “Install unknown apps” for WatchLine, then come back and tap Install again.' })
    return
  }
  if (!WatchlistUpdater.install(downloaded)) set({ state: 'error', error: 'The downloaded update is gone. Download it again.' })
  else set({ error: undefined })
}

/** Checks at launch and when the app comes back, at most every few hours. */
export function autoCheck(enabled: boolean): void {
  if (!enabled || desktop || Date.now() - lastAuto < CHECK_EVERY_MS) return
  lastAuto = Date.now()
  void checkForUpdates(true)
}

/** Follows the desktop app's updater (it checks on its own schedule). */
export function startUpdater(): void {
  if (!desktop) return
  void desktop.updater.status().then((s) => useUpdate.setState(s))
  desktop.updater.onChange((s) => useUpdate.setState(s))
}
