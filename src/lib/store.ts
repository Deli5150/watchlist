import { create } from 'zustand'
import { DEFAULT_SETTINGS, emptyData } from './defaults'
import { loadData, saveData } from './storage'
import { emptyMeta, stampChanges, type SyncMeta } from './sync'
import { setLocale } from './tmdb'
import type { AppData, LibraryItem, Settings, Status, Watch } from './types'

// All of WatchList's data in one store, saved (shortly after each change) as a single JSON document:
// your library (shows and movies with their status) and every episode or movie you've watched.

interface Store extends AppData {
  loaded: boolean
  /** Sync with Google's bookkeeping for this device (saved with the data, never exported). */
  sync: SyncMeta
  hydrate(): Promise<void>
  addItem(item: Omit<LibraryItem, 'addedAt' | 'statusAt' | 'rating' | 'favorite' | 'skippedSeasons'> & Partial<LibraryItem>): LibraryItem
  updateItem(id: string, patch: Partial<LibraryItem>): void
  setStatus(id: string, status: Status): void
  removeItem(id: string): void
  addWatches(watches: Watch[]): void
  removeWatches(ids: string[]): void
  setWatchTime(id: string, at: number): void
  setSettings(patch: Partial<Settings>): void
  replaceAll(data: AppData): void
  eraseAll(): void
}

/** Fills in anything an older or hand-edited file is missing. */
export function normalize(raw: Partial<AppData>): AppData {
  const items = (Array.isArray(raw.items) ? raw.items : []).map((i) => ({
    ...i,
    poster: i.poster ?? null,
    backdrop: i.backdrop ?? null,
    year: i.year ?? '',
    status: i.status ?? 'planned',
    addedAt: i.addedAt ?? Date.now(),
    statusAt: i.statusAt ?? i.addedAt ?? Date.now(),
    rating: i.rating ?? 0,
    favorite: Boolean(i.favorite),
    skippedSeasons: Array.isArray(i.skippedSeasons) ? i.skippedSeasons : [],
    genres: Array.isArray(i.genres) ? i.genres : []
  }))
  const known = new Set(items.map((i) => i.id))
  const watches = (Array.isArray(raw.watches) ? raw.watches : []).filter((w) => w && known.has(w.itemId)).map((w) => ({ ...w, runtime: w.runtime ?? 0 }))
  return { version: 1, items, watches, settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) } }
}

const dataOf = (s: Store): AppData => ({ version: 1, items: s.items, watches: s.watches, settings: s.settings })

export const useStore = create<Store>((set, get) => ({
  ...emptyData(),
  loaded: false,
  sync: emptyMeta(),

  async hydrate() {
    try {
      const json = await loadData()
      if (json) {
        const raw = JSON.parse(json) as Partial<AppData> & { sync?: SyncMeta }
        set({ ...normalize(raw), sync: { ...emptyMeta(), ...raw.sync } })
      }
    } catch (e) {
      console.warn('WatchList: could not read saved data', e)
    }
    const { language, region } = get().settings
    setLocale(language, region)
    set({ loaded: true })
  },

  addItem(item) {
    const existing = get().items.find((i) => i.id === item.id)
    if (existing) return existing
    const now = Date.now()
    const full: LibraryItem = { rating: 0, favorite: false, skippedSeasons: [], ...item, addedAt: now, statusAt: now }
    set((s) => ({ items: [...s.items, full] }))
    return full
  },
  updateItem(id, patch) {
    set((s) => ({ items: s.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
  },
  setStatus(id, status) {
    set((s) => ({ items: s.items.map((x) => (x.id === id && x.status !== status ? { ...x, status, statusAt: Date.now() } : x)) }))
  },
  removeItem(id) {
    set((s) => ({ items: s.items.filter((x) => x.id !== id), watches: s.watches.filter((w) => w.itemId !== id) }))
  },
  addWatches(watches) {
    if (!watches.length) return
    set((s) => {
      const ids = new Set(watches.map((w) => w.id))
      return { watches: [...s.watches.filter((w) => !ids.has(w.id)), ...watches] }
    })
  },
  removeWatches(ids) {
    if (!ids.length) return
    const gone = new Set(ids)
    set((s) => ({ watches: s.watches.filter((w) => !gone.has(w.id)) }))
  },
  setWatchTime(id, at) {
    set((s) => ({ watches: s.watches.map((w) => (w.id === id ? { ...w, at } : w)) }))
  },
  setSettings(patch) {
    set((s) => ({ settings: { ...s.settings, ...patch } }))
    if (patch.language || patch.region) setLocale(get().settings.language, get().settings.region)
  },
  replaceAll(data) {
    set({ ...normalize(data) })
  },
  eraseAll() {
    // With Sync on, erasing is recorded as deletions, so it reaches the other devices too.
    set({ ...emptyData(), settings: { ...DEFAULT_SETTINGS, lastSeenVersion: get().settings.lastSeenVersion } })
  }
}))

/** Set while applying what Sync downloaded, so those changes aren't stamped as this device's. */
let applyingSync = false
export function applySynced(patch: Partial<Store>): void {
  applyingSync = true
  try {
    useStore.setState(patch)
  } finally {
    applyingSync = false
  }
  const { language, region } = useStore.getState().settings
  setLocale(language, region)
}

const changeListeners = new Set<() => void>()
/** Called after this device changes something that syncs. */
export const onLocalChange = (fn: () => void): (() => void) => (changeListeners.add(fn), () => changeListeners.delete(fn))

// Note what changed for Sync, and save shortly after changes.
let timer: ReturnType<typeof setTimeout> | null = null
useStore.subscribe((state, prev) => {
  if (!state.loaded || !prev.loaded) return
  if (!applyingSync) {
    const stamped = stampChanges(prev, state, state.sync)
    if (stamped) {
      useStore.setState({ sync: stamped })
      changeListeners.forEach((fn) => fn())
      return
    }
  }
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    const s = useStore.getState()
    void saveData(JSON.stringify({ ...dataOf(s), sync: s.sync }))
  }, 250)
})

export const exportData = (): AppData => dataOf(useStore.getState())

export const itemById = (id: string): LibraryItem | undefined => useStore.getState().items.find((i) => i.id === id)
