import { addDays, today } from './dates'
import { cacheGet, cacheSet } from './storage'

// The Movie Database (TMDB): every show, movie, season, person and picture in WatchList comes from
// it, and "Where to watch" is TMDB's streaming data (supplied to TMDB by JustWatch). The key is a
// TMDB API key or read access token in .env (EXPO_PUBLIC_TMDB_KEY), built into the app.
//
// Responses are cached (memory, then a file/AsyncStorage) and reused while fresh; when TMDB can't
// be reached, a stale copy is used instead.

const KEY = process.env.EXPO_PUBLIC_TMDB_KEY ?? ''
const BASE = 'https://api.themoviedb.org/3'
const HOUR = 3600_000

export const tmdbConfigured = (): boolean => Boolean(KEY)

export type ImageSize = 'w92' | 'w154' | 'w185' | 'w300' | 'w342' | 'w500' | 'w780' | 'w1280' | 'h632' | 'original'

/** A TMDB picture's URL, or null without one. */
export const img = (path: string | null | undefined, size: ImageSize = 'w342'): string | null => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null)

let language = 'en-US'
let region = 'US'
export function setLocale(lang: string, reg: string): void {
  language = lang
  region = reg
}
export const currentRegion = (): string => region

interface Cached<T> {
  at: number
  data: T
}

const memory = new Map<string, Cached<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

export class TmdbError extends Error {}

async function request<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  if (!KEY) throw new TmdbError('WatchList was built without a TMDB key (see README → TMDB).')
  // (Built by hand: React Native's URLSearchParams can't set values.)
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  // A v4 read access token is a JWT; a v3 key is 32 hex characters.
  const bearer = KEY.startsWith('eyJ')
  if (!bearer) q.push(`api_key=${encodeURIComponent(KEY)}`)
  const res = await fetch(`${BASE}${path}?${q.join('&')}`, { headers: bearer ? { Authorization: `Bearer ${KEY}`, Accept: 'application/json' } : { Accept: 'application/json' } })
  if (res.status === 404) throw new TmdbError('Not found on TMDB')
  if (!res.ok) throw new TmdbError(`TMDB answered ${res.status}`)
  return (await res.json()) as T
}

/** A GET from TMDB, cached for `ttl` ms (in the current language). */
export function tmdb<T>(path: string, params: Record<string, string | number | undefined> = {}, ttl = 12 * HOUR): Promise<T> {
  const all = { language, ...params }
  const key = `${path}?${Object.entries(all)
    .map(([k, v]) => `${k}=${v ?? ''}`)
    .sort()
    .join('&')}`
  return cached(key, ttl, () => request<T>(path, all), (e) => e instanceof TmdbError && e.message === 'Not found on TMDB')
}

/**
 * Anything fetched, cached under `key` for `ttl` ms (memory, then a file/AsyncStorage). When `load`
 * fails, a stale copy is used instead, unless `final` says the failure is for good (not found).
 */
export async function cached<T>(key: string, ttl: number, load: () => Promise<T>, final: (e: unknown) => boolean = () => false): Promise<T> {
  const mem = memory.get(key) as Cached<T> | undefined
  if (mem && Date.now() - mem.at < ttl) return mem.data
  const pending = inflight.get(key)
  if (pending) return pending as Promise<T>
  const job = (async () => {
    let stale: Cached<T> | undefined = mem
    if (!stale) {
      try {
        const text = await cacheGet(cacheKey(key))
        if (text) stale = JSON.parse(text) as Cached<T>
      } catch {}
      if (stale && Date.now() - stale.at < ttl) {
        memory.set(key, stale)
        return stale.data
      }
    }
    try {
      const data = await load()
      const entry = { at: Date.now(), data }
      memory.set(key, entry)
      void cacheSet(cacheKey(key), JSON.stringify(entry))
      return data
    } catch (e) {
      if (stale && !final(e)) {
        memory.set(key, stale)
        return stale.data
      }
      throw e
    }
  })()
  inflight.set(key, job)
  try {
    return await job
  } finally {
    inflight.delete(key)
  }
}

/** A short, file-safe name for a request. */
function cacheKey(key: string): string {
  let h = 5381
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0
  const slug = key.replace(/[^a-z0-9]+/gi, '_').slice(0, 60)
  return `${slug}_${(h >>> 0).toString(36)}`
}

/** Forget cached copies of one path (any parameters), so the next request goes to TMDB. */
export function invalidate(path: string): void {
  for (const k of memory.keys()) if (k.startsWith(`${path}?`)) memory.delete(k)
}

// ── Shapes (only the fields WatchList uses) ─────────────────────────────────────────────────────

export interface Genre {
  id: number
  name: string
}

export interface EpisodeRef {
  id: number
  name: string
  overview: string
  air_date: string | null
  episode_number: number
  season_number: number
  still_path: string | null
  runtime: number | null
  vote_average: number
  vote_count: number
}

export interface SeasonRef {
  id: number
  name: string
  season_number: number
  episode_count: number
  air_date: string | null
  poster_path: string | null
  overview: string
  vote_average?: number
}

export interface Provider {
  provider_id: number
  provider_name: string
  logo_path: string
  display_priority: number
}

export interface Providers {
  link?: string
  flatrate?: Provider[]
  free?: Provider[]
  ads?: Provider[]
  rent?: Provider[]
  buy?: Provider[]
}

export interface CastMember {
  id: number
  name: string
  profile_path: string | null
  character?: string
  roles?: Array<{ character: string; episode_count: number }>
  total_episode_count?: number
  order?: number
}

export interface CrewMember {
  id: number
  name: string
  profile_path: string | null
  job?: string
  jobs?: Array<{ job: string; episode_count: number }>
  department: string
}

export interface Video {
  key: string
  site: string
  type: string
  name: string
  official: boolean
}

/** A show or movie as lists and search return it. */
export interface MediaSummary {
  id: number
  media_type?: 'tv' | 'movie' | 'person'
  name?: string
  title?: string
  original_name?: string
  original_title?: string
  poster_path: string | null
  backdrop_path: string | null
  profile_path?: string | null
  first_air_date?: string
  release_date?: string
  vote_average?: number
  overview?: string
  genre_ids?: number[]
  popularity?: number
  known_for_department?: string
  known_for?: MediaSummary[]
  character?: string
  job?: string
  episode_count?: number
}

export interface Paged<T> {
  page: number
  results: T[]
  total_pages: number
  total_results: number
}

export interface ShowBasics {
  id: number
  name: string
  original_name: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  first_air_date: string | null
  last_air_date: string | null
  status: string
  in_production: boolean
  number_of_seasons: number
  number_of_episodes: number
  episode_run_time: number[]
  genres: Genre[]
  networks: Array<{ id: number; name: string; logo_path: string | null }>
  created_by: Array<{ id: number; name: string; profile_path: string | null }>
  seasons: SeasonRef[]
  last_episode_to_air: EpisodeRef | null
  next_episode_to_air: EpisodeRef | null
  vote_average: number
  vote_count: number
  tagline: string
  type: string
  origin_country: string[]
  homepage: string
}

export interface Logo {
  file_path: string
  iso_639_1: string | null
  aspect_ratio: number
}

export interface Company {
  id: number
  name: string
  logo_path: string | null
}

export interface ShowDetails extends ShowBasics {
  images?: { logos: Logo[] }
  keywords?: { results: Genre[] }
  production_companies?: Company[]
  aggregate_credits?: { cast: CastMember[]; crew: CrewMember[] }
  'watch/providers'?: { results: Record<string, Providers> }
  external_ids?: { imdb_id?: string | null; tvdb_id?: number | null }
  recommendations?: Paged<MediaSummary>
  content_ratings?: { results: Array<{ iso_3166_1: string; rating: string }> }
  videos?: { results: Video[] }
}

export interface MovieDetails {
  id: number
  title: string
  original_title: string
  overview: string
  tagline: string
  poster_path: string | null
  backdrop_path: string | null
  release_date: string | null
  runtime: number | null
  status: string
  genres: Genre[]
  vote_average: number
  vote_count: number
  budget: number
  revenue: number
  homepage: string
  imdb_id?: string | null
  belongs_to_collection: { id: number; name: string; poster_path: string | null; backdrop_path: string | null } | null
  production_companies?: Company[]
  images?: { logos: Logo[] }
  keywords?: { keywords: Genre[] }
  credits?: { cast: CastMember[]; crew: CrewMember[] }
  'watch/providers'?: { results: Record<string, Providers> }
  recommendations?: Paged<MediaSummary>
  release_dates?: { results: Array<{ iso_3166_1: string; release_dates: Array<{ certification: string; release_date: string; type: number }> }> }
  videos?: { results: Video[] }
}

export interface SeasonDetails {
  id: number
  name: string
  overview: string
  air_date: string | null
  poster_path: string | null
  season_number: number
  episodes: EpisodeRef[]
}

export interface PersonDetails {
  id: number
  name: string
  biography: string
  birthday: string | null
  deathday: string | null
  place_of_birth: string | null
  profile_path: string | null
  known_for_department: string
  gender?: number
  combined_credits?: { cast: MediaSummary[]; crew: MediaSummary[] }
  external_ids?: { imdb_id?: string | null; instagram_id?: string | null }
}

export interface CollectionDetails {
  id: number
  name: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  parts: MediaSummary[]
}

// ── Requests ────────────────────────────────────────────────────────────────────────────────────

/** A show's basics: what progress, Up Next and the calendar need (light, refreshed often). */
export const showBasics = (id: number, ttl = 6 * HOUR) => tmdb<ShowBasics>(`/tv/${id}`, {}, ttl)

/** Everything the show page shows. */
export const showDetails = (id: number) =>
  tmdb<ShowDetails>(`/tv/${id}`, {
    append_to_response: 'aggregate_credits,watch/providers,external_ids,recommendations,content_ratings,videos,images,keywords',
    include_video_language: `${language.split('-')[0]},en,null`,
    include_image_language: `${language.split('-')[0]},en,null`
  })

export const movieDetails = (id: number) =>
  tmdb<MovieDetails>(`/movie/${id}`, {
    append_to_response: 'credits,watch/providers,recommendations,release_dates,videos,images,keywords',
    include_video_language: `${language.split('-')[0]},en,null`,
    include_image_language: `${language.split('-')[0]},en,null`
  })

/** A movie's basics (runtime, release date), for library cards. */
export interface MovieBasics {
  id: number
  title: string
  runtime: number | null
  release_date: string | null
  poster_path: string | null
  backdrop_path: string | null
  vote_average: number
  status: string
}
export const movieBasics = (id: number) => tmdb<MovieBasics>(`/movie/${id}`, {}, 24 * HOUR)

/** The title logo in the app's language (else English, else any). */
export function logoOf(images: { logos: Logo[] } | undefined): Logo | undefined {
  const logos = images?.logos ?? []
  const lang = language.split('-')[0]
  return logos.find((l) => l.iso_639_1 === lang) ?? logos.find((l) => l.iso_639_1 === 'en') ?? logos[0]
}

export const season = (tvId: number, n: number, ttl = 12 * HOUR) => tmdb<SeasonDetails>(`/tv/${tvId}/season/${n}`, {}, ttl)

/** Several seasons in as few requests as possible (TMDB appends up to 20 per request). */
export async function seasons(tvId: number, numbers: number[]): Promise<SeasonDetails[]> {
  const out: SeasonDetails[] = []
  for (let i = 0; i < numbers.length; i += 20) {
    const chunk = numbers.slice(i, i + 20)
    const res = await tmdb<Record<string, unknown>>(`/tv/${tvId}`, { append_to_response: chunk.map((n) => `season/${n}`).join(',') })
    for (const n of chunk) {
      const s = res[`season/${n}`] as SeasonDetails | undefined
      if (s) out.push(s)
    }
  }
  return out
}

export const person = (id: number) => tmdb<PersonDetails>(`/person/${id}`, { append_to_response: 'combined_credits,external_ids' }, 24 * HOUR)

export const collection = (id: number) => tmdb<CollectionDetails>(`/collection/${id}`, {}, 24 * HOUR)

export const search = (query: string, page = 1) => tmdb<Paged<MediaSummary>>('/search/multi', { query, page, include_adult: 'false' }, HOUR)

export type ListKind =
  | 'trending'
  | 'trending-tv'
  | 'trending-movie'
  | 'popular-tv'
  | 'popular-movie'
  | 'top-tv'
  | 'top-movie'
  | 'airing-today'
  | 'on-the-air'
  | 'upcoming-movie'
  | 'now-playing'
  | 'anticipated-tv'
  | 'anticipated-movie'

const LIST_PATHS: Record<Exclude<ListKind, 'anticipated-tv' | 'anticipated-movie'>, { path: string; type?: 'tv' | 'movie'; regional?: boolean }> = {
  trending: { path: '/trending/all/week' },
  'trending-tv': { path: '/trending/tv/week', type: 'tv' },
  'trending-movie': { path: '/trending/movie/week', type: 'movie' },
  'popular-tv': { path: '/tv/popular', type: 'tv' },
  'popular-movie': { path: '/movie/popular', type: 'movie' },
  'top-tv': { path: '/tv/top_rated', type: 'tv' },
  'top-movie': { path: '/movie/top_rated', type: 'movie' },
  'airing-today': { path: '/tv/airing_today', type: 'tv' },
  'on-the-air': { path: '/tv/on_the_air', type: 'tv' },
  'upcoming-movie': { path: '/movie/upcoming', type: 'movie', regional: true },
  'now-playing': { path: '/movie/now_playing', type: 'movie', regional: true }
}

/** One of TMDB's lists, each result tagged with its media type. */
export async function list(kind: ListKind, page = 1): Promise<Paged<MediaSummary>> {
  if (kind === 'anticipated-tv' || kind === 'anticipated-movie') return anticipated(kind === 'anticipated-tv' ? 'tv' : 'movie', page)
  const { path, type, regional } = LIST_PATHS[kind as Exclude<ListKind, 'anticipated-tv' | 'anticipated-movie'>]
  const res = await tmdb<Paged<MediaSummary>>(path, { page, ...(regional ? { region } : {}) }, 6 * HOUR)
  return { ...res, results: res.results.filter((r) => r.media_type !== 'person').map((r) => ({ ...r, media_type: r.media_type ?? type })) }
}

/** Shows or movies of a genre, most popular first. */
export async function byGenre(type: 'tv' | 'movie', genreId: number, page = 1): Promise<Paged<MediaSummary>> {
  const res = await tmdb<Paged<MediaSummary>>(`/discover/${type}`, { with_genres: genreId, sort_by: 'popularity.desc', page, 'vote_count.gte': 50 }, 12 * HOUR)
  return { ...res, results: res.results.map((r) => ({ ...r, media_type: type })) }
}

/** The most popular shows and movies that aren't out yet. */
async function anticipated(type: 'tv' | 'movie', page = 1): Promise<Paged<MediaSummary>> {
  const tomorrow = addDays(today(), 1)
  const res = await tmdb<Paged<MediaSummary>>(
    `/discover/${type}`,
    { page, sort_by: 'popularity.desc', [type === 'tv' ? 'first_air_date.gte' : 'primary_release_date.gte']: tomorrow, ...(type === 'movie' ? { region } : {}) },
    12 * HOUR
  )
  return { ...res, results: res.results.map((r) => ({ ...r, media_type: type })) }
}

/** Titles like the ones you've added: TMDB's recommendations for them, most recommended first. */
export async function recommendedFor(seeds: Array<{ type: 'tv' | 'movie'; id: number }>, exclude: Set<string>): Promise<MediaSummary[]> {
  const counts = new Map<string, { m: MediaSummary; n: number }>()
  const lists = await Promise.all(seeds.map((s) => tmdb<Paged<MediaSummary>>(`/${s.type}/${s.id}/recommendations`, {}, 24 * HOUR).then((r) => r.results.map((m) => ({ ...m, media_type: s.type }))).catch(() => [])))
  for (const list of lists) {
    for (const m of list) {
      const k = `${m.media_type}:${m.id}`
      if (exclude.has(k)) continue
      const had = counts.get(k)
      counts.set(k, { m, n: (had?.n ?? 0) + 1 })
    }
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || (b.m.popularity ?? 0) - (a.m.popularity ?? 0)).map((x) => x.m)
}

export const genres = (type: 'tv' | 'movie') => tmdb<{ genres: Genre[] }>(`/genre/${type}/list`, {}, 7 * 24 * HOUR)

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────────

export const titleOf = (m: MediaSummary): string => m.title ?? m.name ?? m.original_title ?? m.original_name ?? ''
export const yearOf = (date: string | null | undefined): string => (date ? date.slice(0, 4) : '')
export const dateOf = (m: MediaSummary): string => m.release_date ?? m.first_air_date ?? ''

/** The best trailer to open on YouTube. */
export function trailerOf(videos: Video[] | undefined): Video | undefined {
  const yt = (videos ?? []).filter((v) => v.site === 'YouTube')
  return yt.find((v) => v.type === 'Trailer' && v.official) ?? yt.find((v) => v.type === 'Trailer') ?? yt.find((v) => v.type === 'Teaser')
}
