import { addDays, today } from './dates'
import { desktop } from './storage'
import { useStore } from './store'
import { season, tmdb, type EpisodeRef, type ShowBasics } from './tmdb'
import type { LibraryItem } from './types'

// What's coming up for the titles in your library: episodes of the shows you follow and the
// release dates of your movies. Used by the Calendar and the desktop's new-episode alerts.

export interface UpcomingEpisode {
  kind: 'episode'
  date: string
  item: LibraryItem
  episode: EpisodeRef
}

export interface UpcomingMovie {
  kind: 'movie'
  date: string
  item: LibraryItem
}

export type Upcoming = UpcomingEpisode | UpcomingMovie

/** Shows that count: everything but dropped. */
const follows = (i: LibraryItem) => i.type === 'tv' && i.status !== 'dropped'

/** Episodes airing from `from` to `until` (YYYY-MM-DD, inclusive) of the shows you follow. */
export async function upcomingEpisodes(items: LibraryItem[], shows: Record<number, ShowBasics>, from = addDays(today(), -7), until = addDays(today(), 120)): Promise<UpcomingEpisode[]> {
  const out: UpcomingEpisode[] = []
  await Promise.all(
    items.filter(follows).map(async (item) => {
      const show = shows[item.tmdbId]
      const next = show?.next_episode_to_air
      const last = show?.last_episode_to_air
      // The season airing now and the next one, if different (earlier seasons are long past).
      const numbers = new Set<number>()
      if (next) numbers.add(next.season_number)
      if (last && last.air_date && last.air_date >= addDays(from, -60)) numbers.add(last.season_number)
      for (const n of numbers) {
        try {
          const s = await season(item.tmdbId, n, 6 * 3600_000)
          for (const e of s.episodes) if (e.air_date && e.air_date >= from && e.air_date <= until) out.push({ kind: 'episode', date: e.air_date, item, episode: e })
        } catch {}
      }
    })
  )
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.item.title.localeCompare(b.item.title) || a.episode.episode_number - b.episode.episode_number)
}

export async function upcomingMovies(items: LibraryItem[], from = addDays(today(), -7), until = addDays(today(), 365)): Promise<UpcomingMovie[]> {
  const out: UpcomingMovie[] = []
  await Promise.all(
    items
      .filter((i) => i.type === 'movie' && i.status !== 'dropped' && (!i.year || Number(i.year) >= Number(from.slice(0, 4)) - 1))
      .map(async (item) => {
        try {
          const m = await tmdb<{ release_date: string | null }>(`/movie/${item.tmdbId}`, {}, 24 * 3600_000)
          if (m.release_date && m.release_date >= from && m.release_date <= until) out.push({ kind: 'movie', date: m.release_date, item })
        } catch {}
      })
  )
  return out
}

/** Desktop: schedule a notification on the morning each followed show's new episode airs. */
export async function scheduleAlerts(shows: Record<number, ShowBasics>): Promise<void> {
  if (!desktop) return
  const { items, settings } = useStore.getState()
  if (!settings.notifications) return desktop.setReminders([])
  const eps = await upcomingEpisodes(
    items.filter((i) => i.status === 'watching' || i.status === 'planned' || i.status === 'completed'),
    shows,
    today(),
    addDays(today(), 30)
  )
  desktop.setReminders(
    eps.map((u) => {
      const [y, m, d] = u.date.split('-').map(Number)
      return {
        id: `${u.item.id}:${u.episode.season_number}:${u.episode.episode_number}`,
        at: new Date(y, m - 1, d, 9, 0).getTime(),
        title: `New episode of ${u.item.title}`,
        body: `S${u.episode.season_number} · E${u.episode.episode_number}${u.episode.name ? ` · ${u.episode.name}` : ''} is out today.`
      }
    })
  )
}
