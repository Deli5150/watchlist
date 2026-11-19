export type MediaType = 'tv' | 'movie'

/** Where a title sits in your library. Movies use planned → completed. */
export type Status = 'watching' | 'planned' | 'completed' | 'paused' | 'dropped'

/** A show or movie in your library, with enough of TMDB's details to list it offline. */
export interface LibraryItem {
  /** "tv:1399" or "movie:550". */
  id: string
  type: MediaType
  tmdbId: number
  title: string
  poster: string | null
  backdrop: string | null
  /** First air or release year. */
  year: string
  status: Status
  addedAt: number
  /** When its status last changed, for sorting. */
  statusAt: number
  /** Your rating, 1–10 (0 = not rated). */
  rating: number
  favorite: boolean
  /** Seasons you don't plan to watch: left out of progress and Up Next. */
  skippedSeasons: number[]
  genres: string[]
}

/** One watched episode or movie. */
export interface Watch {
  /** "tv:1399:1:2" for an episode, "movie:550" for a movie. */
  id: string
  itemId: string
  season: number | null
  episode: number | null
  /** When you watched it (ms). */
  at: number
  /** Minutes. */
  runtime: number
}

export type LibrarySort = 'recent' | 'title' | 'added' | 'rating' | 'year'

export interface Settings {
  theme: string
  /** Country for "Where to watch" and release dates (ISO 3166-1). */
  region: string
  /** TMDB's language for titles and descriptions. */
  language: string
  notifications: boolean
  checkUpdates: boolean
  librarySort: LibrarySort
  /** Calendar: a list of what's coming, or a week or month at a time. */
  calendarView: 'list' | 'week' | 'month'
  /** Library: Shows or Movies. */
  libraryType: MediaType
  /** Ask before marking earlier episodes too. */
  markPrevious: 'ask' | 'always' | 'never'
  lastSeenVersion: string
  skippedVersion: string
  laterVersion: string
  laterUntil: number
}

export interface AppData {
  version: 1
  items: LibraryItem[]
  watches: Watch[]
  settings: Settings
}
