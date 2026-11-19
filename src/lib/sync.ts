import { create } from 'zustand'
import type { AppData, Settings } from './types'

// "Sync with Google": WatchList's data kept in one JSON file in the user's own Google Drive app folder
// (scope drive.appdata, a hidden folder only WatchList can read), shared by every device. Each
// library title, each watched episode or movie, and each synced setting is an entry with the time it
// last changed; the newest wins, and deletions are remembered (with their time) so a delete on
// one device reaches the others. So changes made on different devices to different things all survive.

export const SYNC_FILE = 'watchlist-sync.json'

/** Settings that follow you between devices (the rest, like the library's sort, are per device). */
export const SYNCED_SETTINGS = ['theme', 'region', 'language', 'notifications', 'markPrevious'] as const satisfies ReadonlyArray<keyof Settings>

const COLLECTIONS = ['items', 'watches'] as const
type Collection = (typeof COLLECTIONS)[number]

export interface SyncEntry {
  at: number
  value: unknown
}

export interface SyncDoc {
  version: 1
  updatedAt: number
  entries: Record<string, SyncEntry>
  /** Entry key → when it was deleted. */
  removed: Record<string, number>
}

/** Per-device bookkeeping, saved with the data. */
export interface SyncMeta {
  enabled: boolean
  email?: string
  /** Entry key → when it last changed on this device (missing = never: the cloud's copy wins). */
  at: Record<string, number>
  removed: Record<string, number>
  lastSync: number
  error?: string
}

export const emptyMeta = (): SyncMeta => ({ enabled: false, at: {}, removed: {}, lastSync: 0 })
export const emptyDoc = (): SyncDoc => ({ version: 1, updatedAt: 0, entries: {}, removed: {} })

type Synced = Pick<AppData, Collection | 'settings'>

/** Every entry of this device's data: "items:<id>", "watches:<id>", "settings:<field>". */
export function entriesOf(data: Synced): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const c of COLLECTIONS) for (const item of data[c] as Array<{ id: string }>) out[`${c}:${item.id}`] = item
  for (const k of SYNCED_SETTINGS) out[`settings:${k}`] = data.settings[k]
  return out
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/**
 * Stamps what changed between two versions of the data with `now` (and deletions as removed), so
 * the next sync knows this device's copy is newer.
 */
export function stampChanges(prev: Synced, next: Synced, meta: SyncMeta, now = Date.now()): SyncMeta | null {
  const a = entriesOf(prev)
  const b = entriesOf(next)
  let at: Record<string, number> | null = null
  let removed: Record<string, number> | null = null
  for (const [k, v] of Object.entries(b)) {
    if (k in a && (a[k] === v || same(a[k], v))) continue
    at ??= { ...meta.at }
    at[k] = now
    if (meta.removed[k]) {
      removed ??= { ...meta.removed }
      delete removed[k]
    }
  }
  for (const k of Object.keys(a)) {
    if (k in b) continue
    removed ??= { ...meta.removed }
    removed[k] = now
  }
  return at || removed ? { ...meta, at: at ?? meta.at, removed: removed ?? meta.removed } : null
}

const TOMBSTONE_DAYS = 180

/** Merges this device's data with the cloud's: the newest change to each entry wins. */
export function merge(local: Synced, meta: SyncMeta, remote: SyncDoc, now = Date.now()): { data: Synced; meta: SyncMeta; doc: SyncDoc; changedLocal: boolean; changedRemote: boolean } {
  const mine = entriesOf(local)
  const keys = new Set([...Object.keys(mine), ...Object.keys(remote.entries), ...Object.keys(meta.removed), ...Object.keys(remote.removed)])
  const entries: Record<string, SyncEntry> = {}
  const removed: Record<string, number> = {}
  const cutoff = now - TOMBSTONE_DAYS * 86_400_000
  for (const k of keys) {
    const localAt = k in mine ? (meta.at[k] ?? 0) : -1
    const remoteAt = remote.entries[k]?.at ?? -1
    const goneAt = Math.max(meta.removed[k] ?? -1, remote.removed[k] ?? -1)
    const liveAt = Math.max(localAt, remoteAt)
    if (goneAt >= 0 && goneAt >= liveAt) {
      if (goneAt > cutoff) removed[k] = goneAt
      continue
    }
    if (liveAt < 0) continue
    // Ties go to this device's copy.
    entries[k] = localAt >= remoteAt ? { at: localAt, value: mine[k] } : remote.entries[k]
  }

  // Rebuild the collections, keeping this device's order and adding new items at the end.
  const data: Synced = { ...local, settings: { ...local.settings } }
  let changedLocal = false
  for (const c of COLLECTIONS) {
    const list: Array<{ id: string }> = []
    const kept = new Set<string>()
    for (const item of local[c] as Array<{ id: string }>) {
      const k = `${c}:${item.id}`
      const e = entries[k]
      if (e) {
        list.push(e.value as { id: string })
        kept.add(k)
      }
    }
    for (const [k, e] of Object.entries(entries)) {
      if (k.startsWith(`${c}:`) && !kept.has(k)) list.push(e.value as { id: string })
    }
    if (!same(list, local[c])) changedLocal = true
    ;(data as Record<string, unknown>)[c] = list
  }
  for (const s of SYNCED_SETTINGS) {
    const e = entries[`settings:${s}`]
    if (e && !same(e.value, local.settings[s])) {
      ;(data.settings as unknown as Record<string, unknown>)[s] = e.value
      changedLocal = true
    }
  }

  const doc: SyncDoc = { version: 1, updatedAt: now, entries, removed }
  const changedRemote = !same(entries, remote.entries) || !same(removed, remote.removed)
  const newMeta: SyncMeta = { ...meta, at: Object.fromEntries(Object.entries(entries).map(([k, e]) => [k, e.at])), removed, lastSync: now, error: undefined }
  return { data, meta: newMeta, doc, changedLocal, changedRemote }
}

/** What the Settings → Sync screen shows. */
export const useSyncStatus = create<{ busy: boolean }>(() => ({ busy: false }))
