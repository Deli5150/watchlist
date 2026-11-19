import type { ShowBasics } from './tmdb'
import type { LibraryItem, Watch } from './types'

// Show progress, worked out from TMDB's season list and what you've watched. Kept free of React and
// the store so it can be tested (tests/progress.test.ts).

export interface Ep {
  season: number
  episode: number
}

export const episodeId = (itemId: string, season: number, episode: number): string => `${itemId}:${season}:${episode}`
export const epKey = (season: number, episode: number): string => `${season}:${episode}`
export const epLabel = (season: number, episode: number): string => `S${season} · E${episode}`

/** Local date as YYYY-MM-DD (default: today). */
export function today(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export interface WatchIndex {
  /** itemId → "s:e" → watch. */
  episodes: Map<string, Map<string, Watch>>
  /** itemId → movie watch. */
  movies: Map<string, Watch>
  /** itemId → time of the latest watch. */
  last: Map<string, number>
}

const indexCache = new WeakMap<Watch[], WatchIndex>()

/** Lookups over all watches (cached per watches array, which the store replaces on every change). */
export function watchIndex(watches: Watch[]): WatchIndex {
  const hit = indexCache.get(watches)
  if (hit) return hit
  const idx: WatchIndex = { episodes: new Map(), movies: new Map(), last: new Map() }
  for (const w of watches) {
    if (w.season === null || w.episode === null) idx.movies.set(w.itemId, w)
    else {
      let m = idx.episodes.get(w.itemId)
      if (!m) idx.episodes.set(w.itemId, (m = new Map()))
      m.set(epKey(w.season, w.episode), w)
    }
    if ((idx.last.get(w.itemId) ?? 0) < w.at) idx.last.set(w.itemId, w.at)
  }
  indexCache.set(watches, idx)
  return idx
}

/** Whether an episode has aired, going by the show's latest aired episode. */
export function hasAired(show: Pick<ShowBasics, 'last_episode_to_air'>, season: number, episode: number): boolean {
  const last = show.last_episode_to_air
  if (!last) return false
  return season < last.season_number || (season === last.season_number && episode <= last.episode_number)
}

/** Every aired episode in order, leaving out specials (season 0) and skipped seasons. */
export function airedEpisodes(show: Pick<ShowBasics, 'seasons' | 'last_episode_to_air'>, skipped: number[] = []): Ep[] {
  const out: Ep[] = []
  const seasons = [...(show.seasons ?? [])].filter((s) => s.season_number > 0 && !skipped.includes(s.season_number)).sort((a, b) => a.season_number - b.season_number)
  for (const s of seasons) {
    for (let e = 1; e <= s.episode_count; e++) {
      if (!hasAired(show, s.season_number, e)) break
      out.push({ season: s.season_number, episode: e })
    }
  }
  return out
}

export interface Progress {
  watched: number
  total: number
  /** The next episode to watch, or null when you're caught up. */
  next: Ep | null
  /** Watched every aired episode. */
  caughtUp: boolean
  /** Caught up and the show has ended. */
  finished: boolean
  /** How many aired episodes come after the next one (including it). */
  left: number
}

const ENDED = ['Ended', 'Canceled']

export function showProgress(show: Pick<ShowBasics, 'seasons' | 'last_episode_to_air' | 'status'>, item: Pick<LibraryItem, 'skippedSeasons'>, watched: Map<string, Watch> | undefined): Progress {
  const aired = airedEpisodes(show, item.skippedSeasons)
  let count = 0
  let furthest = -1
  aired.forEach((ep, i) => {
    if (watched?.has(epKey(ep.season, ep.episode))) {
      count++
      furthest = i
    }
  })
  // Up next is the episode after the furthest one you've watched (earlier gaps are treated as
  // skipped, like you'd expect after starting a show mid-way).
  const nextIndex = furthest + 1
  const next = nextIndex < aired.length ? aired[nextIndex] : null
  const caughtUp = aired.length > 0 && next === null
  return { watched: count, total: aired.length, next, caughtUp, finished: caughtUp && ENDED.includes(show.status), left: next ? aired.length - nextIndex : 0 }
}

/** Earlier aired episodes you haven't watched, for "mark previous episodes too". */
export function unwatchedBefore(show: Pick<ShowBasics, 'seasons' | 'last_episode_to_air'>, item: Pick<LibraryItem, 'skippedSeasons'>, watched: Map<string, Watch> | undefined, target: Ep): Ep[] {
  return airedEpisodes(show, item.skippedSeasons).filter(
    (ep) => (ep.season < target.season || (ep.season === target.season && ep.episode < target.episode)) && !watched?.has(epKey(ep.season, ep.episode))
  )
}

/** Minutes as "2h 15m" / "45m", or days for long totals. */
export function duration(minutes: number, long = false): string {
  const m = Math.round(minutes)
  if (long && m >= 60 * 24) {
    const d = Math.floor(m / 1440)
    const h = Math.floor((m % 1440) / 60)
    return h ? `${d}d ${h}h` : `${d}d`
  }
  const h = Math.floor(m / 60)
  const r = m % 60
  if (!h) return `${r}m`
  return r ? `${h}h ${r}m` : `${h}h`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Mar 4, 2026" (or "Mar 4" this year) from YYYY-MM-DD. */
export function formatDate(date: string | null | undefined, alwaysYear = false): string {
  if (!date) return ''
  const [y, m, d] = date.split('-').map(Number)
  if (!m) return String(y)
  const thisYear = new Date().getFullYear() === y
  return `${MONTHS[m - 1]} ${d}${thisYear && !alwaysYear ? '' : `, ${y}`}`
}

export const monthName = (m: number): string => MONTHS[m]

/** Whole days from `from` (default today) to a YYYY-MM-DD date (negative = past). */
export function daysUntil(date: string, from = today()): number {
  const utc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((utc(date) - utc(from)) / 86_400_000)
}

/** "Today", "Tomorrow", "In 5 days", or the date. */
export function whenLabel(date: string): string {
  const n = daysUntil(date)
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  if (n === -1) return 'Yesterday'
  if (n > 1 && n < 7) return `In ${n} days`
  return formatDate(date)
}
