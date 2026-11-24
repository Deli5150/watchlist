import AsyncStorage from '@react-native-async-storage/async-storage'
import type { UpdateStatus } from './release'

// Where WatchList keeps its data: on desktop, a JSON file in the app's data folder (through the
// Electron preload's bridge); on phones (and a plain browser), AsyncStorage. TMDB responses are
// cached the same way (desktop: one file each).

const KEY = 'watchlist:data'

export interface DesktopBridge {
  platform: 'darwin' | 'win32' | 'linux'
  version: string
  load(): Promise<string | null>
  save(json: string): Promise<void>
  setReminders(reminders: Array<{ id: string; at: number; title: string; body: string }>): void
  notifyNow(title: string, body: string): void
  saveFile(name: string, content: string): Promise<boolean>
  cache: {
    get(key: string): Promise<string | null>
    set(key: string, json: string): Promise<void>
    clear(): Promise<void>
  }
  wallpaper: {
    get(): Promise<string | null>
    set(dataUrl: string | null): Promise<void>
  }
  openExternal(url: string): void
  /** The dock (macOS) and taskbar (Windows) icon, as a PNG data URL; null for the usual one. */
  setIcon(dataUrl: string | null): Promise<void>
  google: {
    configured: boolean
    signIn(): Promise<string | undefined>
    signOut(): Promise<void>
    fetch(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; ok: boolean; text: string }>
  }
  updater: {
    status(): Promise<UpdateStatus>
    check(quiet?: boolean): Promise<void>
    download(): Promise<void>
    install(): Promise<void>
    setAuto(enabled: boolean): void
    onChange(cb: (status: UpdateStatus) => void): () => void
  }
}

export const desktop: DesktopBridge | null =
  typeof window !== 'undefined' ? ((window as unknown as { watchlist?: DesktopBridge }).watchlist ?? null) : null

export async function loadData(): Promise<string | null> {
  if (desktop) return desktop.load()
  return AsyncStorage.getItem(KEY)
}

export async function saveData(json: string): Promise<void> {
  if (desktop) return desktop.save(json)
  await AsyncStorage.setItem(KEY, json)
}

const CACHE_PREFIX = 'watchlist:cache:'

export async function cacheGet(key: string): Promise<string | null> {
  if (desktop) return desktop.cache.get(key)
  return AsyncStorage.getItem(CACHE_PREFIX + key)
}

export async function cacheSet(key: string, json: string): Promise<void> {
  if (desktop) return desktop.cache.set(key, json)
  await AsyncStorage.setItem(CACHE_PREFIX + key, json).catch(() => null)
}

export async function cacheClear(): Promise<void> {
  if (desktop) return desktop.cache.clear()
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(CACHE_PREFIX))
  await AsyncStorage.multiRemove(keys)
}
