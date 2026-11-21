import { addDays, dateOfTime, today } from './dates'
import { cached, tmdb, type EpisodeRef } from './tmdb'

// Air dates on your own calendar. TMDB has only the date an episode airs where the show is made,
// so a Japanese anime on at 00:30 Tokyo time shows as the next day for someone in the US, where
// it's already out the morning before. TVmaze has each episode's exact air time: an episode's date
// becomes the day that time falls on here. TVmaze numbers some shows differently, so its episodes
// are matched by date (a day either way), preferring the same season and episode.

const HOUR = 3600_000
const DAY = 24 * HOUR

interface MazeEpisode {
  s: number
  n: number | null
  date: string
  stamp: string
}

// TVmaze allows about 20 requests in 10 seconds: one at a time, a little apart.
let queue: Promise<unknown> = Promise.resolve()
function maze<T>(path: string): Promise<T | null> {
  const run = queue.then(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(`https://api.tvmaze.com${path}`)
      if (res.status === 404) return null
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 2000))
        continue
      }
      if (!res.ok) throw new Error(`TVmaze answered ${res.status}`)
      await new Promise((r) => setTimeout(r, 400))
      return (await res.json()) as T
    }
    throw new Error('TVmaze is busy')
  })
  queue = run.catch(() => undefined)
  return run
}

/** TVmaze's episodes of a TMDB show, or null when TVmaze doesn't have it. */
function mazeEpisodes(tmdbId: number): Promise<MazeEpisode[] | null> {
  return cached(`tvmaze:episodes:${tmdbId}`, 6 * HOUR, async () => {
    const ids = await tmdb<{ tvdb_id: number | null; imdb_id: string | null }>(`/tv/${tmdbId}/external_ids`, {}, 7 * DAY)
    const mazeId = await cached(`tvmaze:show:${tmdbId}`, 7 * DAY, async () => {
      const show = (ids.tvdb_id ? await maze<{ id: number }>(`/lookup/shows?thetvdb=${ids.tvdb_id}`) : null) ?? (ids.imdb_id ? await maze<{ id: number }>(`/lookup/shows?imdb=${ids.imdb_id}`) : null)
      return show?.id ?? null
    })
    if (!mazeId) return null
    const eps = await maze<Array<{ season: number; number: number | null; airdate: string; airstamp: string | null }>>(`/shows/${mazeId}/episodes`)
    return (eps ?? []).filter((e) => e.airdate && e.airstamp).map((e) => ({ s: e.season, n: e.number, date: e.airdate, stamp: e.airstamp! }))
  })
}

/** The local date of the TVmaze episode that's this one, or null without a match. */
export function localDate(ep: Pick<EpisodeRef, 'season_number' | 'episode_number' | 'air_date'>, maze: MazeEpisode[], toLocal: (stamp: string) => string = (s) => dateOfTime(Date.parse(s))): string | null {
  const date = ep.air_date
  if (!date) return null
  const near = maze.filter((m) => m.date === date || m.date === addDays(date, -1) || m.date === addDays(date, 1))
  const match =
    near.find((m) => m.s === ep.season_number && m.n === ep.episode_number) ??
    near.find((m) => m.n === ep.episode_number) ??
    near.find((m) => m.date === date) ??
    (near.length === 1 ? near[0] : undefined)
  return match ? toLocal(match.stamp) : null
}

/** Whether a date is recent or coming (older episodes aren't worth a TVmaze lookup). */
const current = (date: string | null | undefined): boolean => Boolean(date && date >= addDays(today(), -21))

/** Episodes with their air dates moved to your calendar (unchanged when TVmaze can't tell). */
export async function localizeEpisodes<E extends EpisodeRef>(tmdbId: number, eps: E[]): Promise<E[]> {
  if (!eps.some((e) => current(e.air_date))) return eps
  try {
    const maze = await mazeEpisodes(tmdbId)
    if (!maze?.length) return eps
    return eps.map((e) => {
      if (!current(e.air_date)) return e
      const date = localDate(e, maze)
      return date && date !== e.air_date ? { ...e, air_date: date } : e
    })
  } catch {
    return eps
  }
}

/** A show (basics or details) with its latest and next episodes' dates on your calendar. */
export async function localizeShow<S extends { id: number; next_episode_to_air: EpisodeRef | null; last_episode_to_air: EpisodeRef | null }>(show: S): Promise<S> {
  const eps = [show.last_episode_to_air, show.next_episode_to_air].filter((e): e is EpisodeRef => Boolean(e))
  const fixed = await localizeEpisodes(show.id, eps)
  if (fixed.every((e, i) => e === eps[i])) return show
  const find = (e: EpisodeRef | null) => (e ? (fixed.find((f) => f.id === e.id) ?? e) : null)
  return { ...show, last_episode_to_air: find(show.last_episode_to_air), next_episode_to_air: find(show.next_episode_to_air) }
}

/** A season (or several) with air dates on your calendar. */
export async function localizeSeasons<S extends { episodes: EpisodeRef[] }>(tmdbId: number, list: S[]): Promise<S[]> {
  return Promise.all(
    list.map(async (s) => {
      const episodes = await localizeEpisodes(tmdbId, s.episodes)
      return episodes === s.episodes ? s : { ...s, episodes }
    })
  )
}
