import { addToLibrary, finishShow, itemId, markEpisodes, markMovie, MOVIE_STATUS_LABEL, previousUnwatched, STATUS_LABEL, unmarkEpisodes, unmarkMovie } from '../lib/library'
import { epKey, epLabel, type Ep } from '../lib/progress'
import { useStore } from '../lib/store'
import type { MediaSummary, MovieDetails, ShowBasics } from '../lib/tmdb'
import type { MediaType, Status } from '../lib/types'
import { confirm, showMenu } from './overlays'
import { toast } from './toast'

// Watching and library actions as the screens use them: with the "earlier episodes too?" question,
// and an Undo in the toast.

export function watchEpisode(show: ShowBasics, ep: Ep, runtime?: number | null): void {
  const prev = previousUnwatched(show, ep)
  const mode = useStore.getState().settings.markPrevious
  const mark = (withPrev: boolean) => {
    const eps = withPrev ? [...prev, ep] : [ep]
    markEpisodes(show, eps, Date.now(), runtime ? { [epKey(ep.season, ep.episode)]: runtime } : undefined)
    toast(eps.length > 1 ? `Marked ${eps.length} episodes of ${show.name} watched` : `${show.name} · ${epLabel(ep.season, ep.episode)} watched`, () => unmarkEpisodes(show, eps))
  }
  if (prev.length && mode === 'ask') {
    showMenu(
      'Watched the earlier episodes too?',
      [
        { label: `Mark ${prev.length} earlier ${prev.length === 1 ? 'episode' : 'episodes'} too`, onPress: () => mark(true) },
        { label: 'Just this one', onPress: () => mark(false) }
      ],
      `${prev.length} aired ${prev.length === 1 ? 'episode' : 'episodes'} before ${epLabel(ep.season, ep.episode)} ${prev.length === 1 ? 'isn’t' : 'aren’t'} marked yet. (Settings → “Mark earlier episodes too” changes whether this asks.)`
    )
  } else mark(prev.length > 0 && mode === 'always')
}

export function unwatchEpisode(show: ShowBasics, ep: Ep): void {
  unmarkEpisodes(show, [ep])
}

/** Marks a whole season (only aired episodes) watched or unwatched. */
export function watchSeason(show: ShowBasics, seasonNumber: number, episodes: Array<{ episode_number: number; runtime?: number | null }>, watched: boolean): void {
  const eps = episodes.map((e) => ({ season: seasonNumber, episode: e.episode_number }))
  if (!watched) {
    confirm('Mark season unwatched?', `This removes ${eps.length} episodes from your history.`, 'Mark unwatched', () => unmarkEpisodes(show, eps))
    return
  }
  const runtimes = Object.fromEntries(episodes.filter((e) => e.runtime).map((e) => [epKey(seasonNumber, e.episode_number), e.runtime as number]))
  // Earlier seasons' aired episodes left unwatched (when you jump ahead to a later season).
  const first = Math.min(...eps.map((e) => e.episode))
  const prev = eps.length ? previousUnwatched(show, { season: seasonNumber, episode: first }).filter((e) => e.season < seasonNumber) : []
  const mode = useStore.getState().settings.markPrevious
  const mark = (withPrev: boolean) => {
    const all = withPrev ? [...prev, ...eps] : eps
    markEpisodes(show, all, Date.now(), runtimes)
    toast(withPrev ? `Season ${seasonNumber} and ${prev.length} earlier ${prev.length === 1 ? 'episode' : 'episodes'} marked watched` : `Season ${seasonNumber} marked watched`, () => unmarkEpisodes(show, all))
  }
  if (prev.length && mode === 'ask') {
    const seasons = [...new Set(prev.map((e) => e.season))]
    const which = seasons.length === 1 ? `Season ${seasons[0]}` : `Seasons ${seasons.slice(0, -1).join(', ')} and ${seasons[seasons.length - 1]}`
    showMenu(
      'Watched the earlier seasons too?',
      [
        { label: `Mark ${which} watched too`, onPress: () => mark(true) },
        { label: `Just Season ${seasonNumber}`, onPress: () => mark(false) }
      ],
      `${which} ${seasons.length === 1 ? 'has' : 'have'} ${prev.length} aired ${prev.length === 1 ? 'episode' : 'episodes'} not marked yet. (Settings → “Mark earlier episodes too” changes whether this asks.)`
    )
  } else mark(prev.length > 0 && mode === 'always')
}

/** Finished: marks every aired episode watched, with an Undo that puts things back. */
export function finishShowWithUndo(show: ShowBasics, title: string): void {
  const id = itemId('tv', show.id)
  const before = useStore.getState().items.find((i) => i.id === id)?.status
  const eps = finishShow(show)
  toast(eps.length ? `${title} finished · ${eps.length} ${eps.length === 1 ? 'episode' : 'episodes'} marked watched` : `${title} finished`, () => {
    if (eps.length) unmarkEpisodes(show, eps)
    if (before) useStore.getState().setStatus(id, before)
    else useStore.getState().removeItem(id)
  })
}

export function watchMovie(movie: MovieDetails | MediaSummary): void {
  const before = useStore.getState().items.find((i) => i.id === itemId('movie', movie.id))?.status
  markMovie(movie)
  toast(`${movie.title ?? 'Movie'} watched`, () => {
    unmarkMovie(movie.id)
    if (before) useStore.getState().setStatus(itemId('movie', movie.id), before)
    else useStore.getState().removeItem(itemId('movie', movie.id))
  })
}

export function unwatchMovie(movie: MovieDetails | MediaSummary): void {
  unmarkMovie(movie.id)
}

const STATUSES: Status[] = ['watching', 'planned', 'completed']
const MOVIE_STATUSES: Status[] = ['planned', 'later', 'completed']

/** The "where is this in my library" menu. */
export function chooseStatus(type: MediaType, m: ShowBasics | MovieDetails | MediaSummary, title: string): void {
  const id = itemId(type, m.id)
  const current = useStore.getState().items.find((i) => i.id === id)
  const labels = type === 'movie' ? MOVIE_STATUS_LABEL : STATUS_LABEL
  showMenu(title, [
    ...(type === 'movie' ? MOVIE_STATUSES : STATUSES).map((s) => ({
      label: labels[s],
      selected: current?.status === s || (s === 'planned' && type === 'tv' && (current?.status === 'paused' || current?.status === 'dropped' || current?.status === 'later')),
      onPress: () => {
        if (type === 'movie' && s === 'completed') watchMovie(m as MovieDetails)
        else if (type === 'tv' && s === 'completed') finishShowWithUndo(m as ShowBasics, title)
        else if (type === 'movie' && s !== 'completed' && current?.status === 'completed') {
          unmarkMovie(m.id)
          useStore.getState().setStatus(id, s)
        } else addToLibrary(type, m, s)
      }
    })),
    ...(current
      ? [
          {
            label: 'Remove from library',
            destructive: true,
            onPress: () =>
              confirm(`Remove ${title}?`, 'Its watch history is removed too.', 'Remove', () => {
                useStore.getState().removeItem(id)
                toast(`${title} removed`)
              })
          }
        ]
      : [])
  ])
}
