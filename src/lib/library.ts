import { useEffect } from 'react'
import { localizeShow } from './airdates'
import { create } from 'zustand'
import { airedEpisodes, episodeId, epKey, renumbered, showProgress, unwatchedBefore, watchIndex, type Ep } from './progress'
import { itemById, useStore } from './store'
import { showBasics, yearOf, type MediaSummary, type MovieDetails, type ShowBasics, type ShowDetails } from './tmdb'
import type { LibraryItem, MediaType, Status, Watch } from './types'

// What you do with your library: adding titles, marking episodes and movies watched, and keeping
// each show's status in step with its progress (planned → watching → completed).

// ── Show details for progress ───────────────────────────────────────────────────────────────────

/** TMDB's basics for the shows in your library, by TMDB id (loaded as needed). */
export const useShows = create<Record<number, ShowBasics>>(() => ({}))

const loading = new Map<number, Promise<ShowBasics | null>>()

export function ensureShow(id: number, force = false): Promise<ShowBasics | null> {
  if (!force && useShows.getState()[id]) return Promise.resolve(useShows.getState()[id])
  let job = loading.get(id)
  if (!job) {
    job = showBasics(id, force ? 0 : undefined)
      .then((show) => {
        useShows.setState({ [id]: show })
        tidyShow(show)
        // Then the latest and next episodes' dates on your calendar (airdates.ts), when TVmaze answers.
        void localizeShow(show).then((local) => {
          if (local !== show && useShows.getState()[id] === show) useShows.setState({ [id]: local })
        })
        return show
      })
      .catch(() => useShows.getState()[id] ?? null)
      .finally(() => loading.delete(id))
    loading.set(id, job)
  }
  return job
}

/**
 * Brings a saved show in step with TMDB's latest: episodes marked under a season's own numbering
 * move to TMDB's (see `seasonStarts`).
 */
function tidyShow(show: ShowBasics): void {
  const item = itemById(itemId('tv', show.id))
  if (!item) return
  const s = useStore.getState()
  const mine = s.watches.filter((w) => w.itemId === item.id && w.season !== null && w.episode !== null)
  const moves = renumbered(show, mine.map((w) => ({ season: w.season!, episode: w.episode! })))
  if (moves) {
    const to = new Map(moves.map((m) => [episodeId(item.id, m.from.season, m.from.episode), m.to]))
    const have = new Set(mine.map((w) => w.id))
    const old = mine.filter((w) => to.has(w.id))
    const moved = old
      .map((w) => {
        const ep = to.get(w.id)!
        return { ...w, id: episodeId(item.id, ep.season, ep.episode), episode: ep.episode }
      })
      .filter((w) => !have.has(w.id))
    s.removeWatches(old.map((w) => w.id))
    s.addWatches(moved)
  }
}

/** A show's basics, loading them if needed. */
export function useShow(id: number | undefined): ShowBasics | undefined {
  const show = useShows((s) => (id ? s[id] : undefined))
  useEffect(() => {
    if (id && !show) void ensureShow(id)
  }, [id, show])
  return show
}

/** Loads every tracked show (a few at a time), e.g. when the app opens. */
export async function refreshLibrary(force = false): Promise<void> {
  const ids = useStore
    .getState()
    .items.filter((i) => i.type === 'tv' && i.status !== 'dropped')
    .map((i) => i.tmdbId)
  let next = 0
  const worker = async () => {
    while (next < ids.length) await ensureShow(ids[next++], force)
  }
  await Promise.all(Array.from({ length: 6 }, worker))
}

// ── Adding ──────────────────────────────────────────────────────────────────────────────────────

export const itemId = (type: MediaType, tmdbId: number): string => `${type}:${tmdbId}`

type Source = MediaSummary | ShowDetails | MovieDetails | ShowBasics

/** Library fields from anything TMDB returned about a title. */
export function itemFields(type: MediaType, m: Source): Pick<LibraryItem, 'id' | 'type' | 'tmdbId' | 'title' | 'poster' | 'backdrop' | 'year' | 'genres'> {
  const any = m as Partial<MediaSummary & ShowDetails & MovieDetails>
  return {
    id: itemId(type, m.id),
    type,
    tmdbId: m.id,
    title: any.title ?? any.name ?? any.original_title ?? any.original_name ?? '',
    poster: any.poster_path ?? null,
    backdrop: any.backdrop_path ?? null,
    year: yearOf(any.release_date ?? any.first_air_date),
    genres: Array.isArray(any.genres) ? any.genres.map((g) => g.name) : []
  }
}

export function addToLibrary(type: MediaType, m: Source, status: Status = 'planned'): LibraryItem {
  const s = useStore.getState()
  const existing = s.items.find((i) => i.id === itemId(type, m.id))
  if (existing) {
    s.setStatus(existing.id, status)
    return existing
  }
  const item = s.addItem({ ...itemFields(type, m), status })
  if (type === 'tv') void ensureShow(m.id)
  return item
}

/** Keeps a saved title's name and pictures current with TMDB's. */
export function refreshItemFields(item: LibraryItem, m: Source): void {
  const f = itemFields(item.type, m)
  const genres = f.genres.length ? f.genres : item.genres
  if (f.title !== item.title || f.poster !== item.poster || f.backdrop !== item.backdrop || f.year !== item.year || genres.join() !== item.genres.join()) {
    useStore.getState().updateItem(item.id, { title: f.title || item.title, poster: f.poster ?? item.poster, backdrop: f.backdrop ?? item.backdrop, year: f.year || item.year, genres })
  }
}

// ── Watching ────────────────────────────────────────────────────────────────────────────────────

const runtimeOf = (show: ShowBasics): number => show.episode_run_time?.[0] || show.last_episode_to_air?.runtime || 40

/**
 * Puts a show's status in step with its progress after episodes were (un)marked: finishing an
 * ended show completes it, and watching an episode (`watched`) moves it to Watching. A Finished
 * show stays Finished as new episodes come out and you watch them (Library lists it under Caught
 * Up); unmarking episodes so you're no longer caught up moves it back.
 */
export function syncStatus(itemIdValue: string, show: ShowBasics, watched = false): void {
  const item = itemById(itemIdValue)
  if (!item) return
  const p = showProgress(show, item, watchIndex(useStore.getState().watches).episodes.get(item.id))
  const { setStatus } = useStore.getState()
  if (p.finished) setStatus(item.id, 'completed')
  else if (item.status === 'completed') {
    if (!watched && !p.caughtUp) setStatus(item.id, p.watched ? 'watching' : 'planned')
  }
  else if (watched && p.watched > 0) setStatus(item.id, 'watching')
}

/** Makes sure a show is in the library (as Watching) before marking its episodes. */
function ensureItem(show: ShowBasics): LibraryItem {
  return itemById(itemId('tv', show.id)) ?? addToLibrary('tv', show, 'watching')
}

export function markEpisodes(show: ShowBasics, eps: Ep[], at = Date.now(), runtimes?: Record<string, number>): void {
  const item = ensureItem(show)
  const fallback = runtimeOf(show)
  // Spread the times a little so a batch keeps its order in History.
  const watches: Watch[] = eps.map((ep, i) => ({
    id: episodeId(item.id, ep.season, ep.episode),
    itemId: item.id,
    season: ep.season,
    episode: ep.episode,
    at: at - (eps.length - 1 - i),
    runtime: runtimes?.[epKey(ep.season, ep.episode)] ?? fallback
  }))
  useStore.getState().addWatches(watches)
  syncStatus(item.id, show, true)
}

/** Finished: every aired episode (but skipped seasons) watched, and the show set to Finished. */
export function finishShow(given: ShowBasics): Ep[] {
  const show = useShows.getState()[given.id] ?? given
  const item = itemById(itemId('tv', show.id)) ?? addToLibrary('tv', show, 'completed')
  const watched = watchIndex(useStore.getState().watches).episodes.get(item.id)
  const eps = airedEpisodes(show, item.skippedSeasons).filter((ep) => !watched?.has(epKey(ep.season, ep.episode)))
  if (eps.length) markEpisodes(show, eps)
  useStore.getState().setStatus(item.id, 'completed')
  return eps
}

export function unmarkEpisodes(show: ShowBasics, eps: Ep[]): void {
  const id = itemId('tv', show.id)
  useStore.getState().removeWatches(eps.map((ep) => episodeId(id, ep.season, ep.episode)))
  syncStatus(id, show)
}

export function isEpisodeWatched(itemIdValue: string, season: number, episode: number): boolean {
  return Boolean(watchIndex(useStore.getState().watches).episodes.get(itemIdValue)?.has(epKey(season, episode)))
}

/** Earlier episodes left unwatched before this one (what "mark previous too" would add). */
export function previousUnwatched(show: ShowBasics, ep: Ep): Ep[] {
  const item = itemById(itemId('tv', show.id))
  return unwatchedBefore(show, item ?? { skippedSeasons: [] }, watchIndex(useStore.getState().watches).episodes.get(itemId('tv', show.id)), ep)
}

export function markMovie(movie: MovieDetails | MediaSummary, at = Date.now()): void {
  const s = useStore.getState()
  const id = itemId('movie', movie.id)
  if (!s.items.some((i) => i.id === id)) addToLibrary('movie', movie, 'completed')
  else s.setStatus(id, 'completed')
  const runtime = (movie as MovieDetails).runtime ?? 110
  useStore.getState().addWatches([{ id, itemId: id, season: null, episode: null, at, runtime }])
}

export function unmarkMovie(tmdbId: number): void {
  const id = itemId('movie', tmdbId)
  const s = useStore.getState()
  s.removeWatches([id])
  if (s.items.find((i) => i.id === id)?.status === 'completed') s.setStatus(id, 'planned')
}

export function setSkippedSeason(show: ShowBasics, seasonNumber: number, skipped: boolean): void {
  const item = ensureItem(show)
  const list = skipped ? [...new Set([...item.skippedSeasons, seasonNumber])] : item.skippedSeasons.filter((n) => n !== seasonNumber)
  useStore.getState().updateItem(item.id, { skippedSeasons: list.sort((a, b) => a - b) })
  syncStatus(item.id, show)
}

export const STATUS_LABEL: Record<Status, string> = {
  watching: 'Watchlist',
  planned: 'Watch Later',
  later: 'Watch Later',
  completed: 'Finished',
  paused: 'Watch Later',
  dropped: 'Watch Later'
}

export const MOVIE_STATUS_LABEL: Record<Status, string> = { ...STATUS_LABEL, planned: 'Watchlist', completed: 'Watched' }
