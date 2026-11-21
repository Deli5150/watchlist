import { Ionicons } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { memo, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'
import { useWide } from '../lib/layout'
import { STATUS_LABEL, MOVIE_STATUS_LABEL, useShows } from '../lib/library'
import { useAsync } from '../lib/hooks'
import { countdown, inCaughtUp, monthYear, showProgress, today, watchIndex, type Progress } from '../lib/progress'
import { movieBasics, type MovieBasics, type ShowBasics } from '../lib/tmdb'
import { useStore } from '../lib/store'
import type { LibraryItem, LibrarySort, MediaType } from '../lib/types'
import { useRootNav, type LibraryFilter, type RootParams } from '../nav'
import { EmptyNote, Header, Page, SearchField } from '../ui/kit'
import { Poster, ProgressRing } from '../ui/media'
import { PressableScale } from '../ui/motion'
import { showMenu } from '../ui/overlays'
import { colors, display } from '../ui/theme'
import { ScreenTitle } from './Shows'

// Library: your shows and movies at a glance (counts and a stack of posters), and a list for each
// status. Caught Up is worked out: shows you're watching with every aired episode watched.

type IconName = React.ComponentProps<typeof Ionicons>['name']

const ROWS: Record<MediaType, Array<{ filter: LibraryFilter; label: string; sub: string; icon: IconName; color: string }>> = {
  tv: [
    { filter: 'watching', label: 'Watchlist', sub: 'Pinned to the top of Shows', icon: 'pin', color: 'accent' },
    { filter: 'planned', label: 'Watch Later', sub: 'Set aside for another time', icon: 'time', color: '#d9a441' },
    { filter: 'caughtup', label: 'Caught Up', sub: 'Waiting on new episodes', icon: 'hourglass', color: '#8b8b95' },
    { filter: 'completed', label: 'Finished', sub: 'Shows you finished that have ended', icon: 'checkmark', color: '#8b8b95' },
  ],
  movie: [
    { filter: 'planned', label: 'Watchlist', sub: 'Movies you want to see', icon: 'bookmark', color: 'accent' },
    { filter: 'later', label: 'Watch Later', sub: 'Set aside for another time', icon: 'time', color: '#d9a441' },
    { filter: 'completed', label: 'Watched', sub: 'Movies you’ve seen', icon: 'checkmark', color: '#8b8b95' }
  ]
}

/** Library items that belong to a list. */
function matches(i: LibraryItem, filter: LibraryFilter, p: Progress | null, show: ShowBasics | undefined): boolean {
  if (filter === 'all') return true
  if (filter === 'favorites') return i.favorite
  if (filter === 'caughtup') return i.type === 'tv' && inCaughtUp(i, show, p)
  // Finished shows that haven't ended are under Caught Up instead.
  if (filter === 'completed' && i.type === 'tv') return i.status === 'completed' && !inCaughtUp(i, show, p)
  // Shows set aside the old ways (Paused, Dropped) count as Watch Later.
  if (filter === 'planned' && i.type === 'tv') return i.status === 'planned' || i.status === 'later' || i.status === 'paused' || i.status === 'dropped'
  return i.status === filter
}

export default function Library() {
  const { items, watches } = useStore(useShallow((s) => ({ items: s.items, watches: s.watches })))
  const shows = useShows()
  const wide = useWide()
  const stats = useMemo(() => {
    const idx = watchIndex(watches)
    const progress = new Map<string, Progress>()
    let available = 0
    for (const i of items) {
      if (i.type !== 'tv' || !shows[i.tmdbId]) continue
      const p = showProgress(shows[i.tmdbId], i, idx.episodes.get(i.id))
      progress.set(i.id, p)
      available += p.total
    }
    const count = (type: MediaType, f: LibraryFilter) => items.filter((i) => i.type === type && matches(i, f, progress.get(i.id) ?? null, shows[i.tmdbId])).length
    return {
      progress,
      available,
      episodes: watches.filter((w) => w.season !== null).length,
      moviesWatched: idx.movies.size,
      count
    }
  }, [items, watches, shows])
  const tv = items.filter((i) => i.type === 'tv')
  const movies = items.filter((i) => i.type === 'movie')
  const cards = (
    <>
      <HubCard
        type="tv"
        title="Shows"
        posters={tv.slice(-4).map((i) => i.poster)}
        stats={[
          ['Shows', tv.length],
          ['Episodes available', stats.available],
          ['Episodes watched', stats.episodes]
        ]}
        count={(f) => stats.count('tv', f)}
      />
      <HubCard
        type="movie"
        title="Movies"
        posters={movies.slice(-4).map((i) => i.poster)}
        stats={[
          ['Movies', movies.length],
          ['Watched', stats.moviesWatched],
          ['On your watchlist', stats.count('movie', 'planned')]
        ]}
        count={(f) => stats.count('movie', f)}
      />
    </>
  )
  return (
    <Page wide bottomSpace={120}>
      <ScreenTitle title="Library" />
      {wide ? <View style={{ flexDirection: 'row', gap: 18, alignItems: 'flex-start' }}>{cards}</View> : cards}
    </Page>
  )
}

function HubCard({ type, title, posters, stats, count }: { type: MediaType; title: string; posters: Array<string | null>; stats: Array<[string, number]>; count: (f: LibraryFilter) => number }) {
  const nav = useRootNav()
  return (
    <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 28, borderWidth: 1, borderColor: colors.border, padding: 18, marginBottom: 18 }}>
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700', marginBottom: 14 }}>{title}</Text>
      <View style={{ backgroundColor: colors.cardHi, borderRadius: 18, padding: 16, flexDirection: 'row', marginBottom: 8, overflow: 'hidden' }}>
        <View style={{ flex: 1 }}>
          {stats.map(([label, n], i) => (
            <View key={label} style={{ paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderColor: colors.separator }}>
              <Text style={{ color: colors.dim, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>{label}</Text>
              <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800' }}>{n.toLocaleString()}</Text>
            </View>
          ))}
        </View>
        <PosterStack posters={posters.filter(Boolean) as string[]} />
      </View>
      {ROWS[type].map((r) => {
        // "accent" follows the theme.
        const tint = r.color === 'accent' ? colors.accent : r.color
        return (
        <Pressable
          key={r.filter}
          onPress={() => nav.push('LibraryList', { type, filter: r.filter })}
          style={(state) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderRadius: 12, backgroundColor: (state as { hovered?: boolean }).hovered || state.pressed ? 'rgba(255,255,255,0.04)' : 'transparent' })}
        >
          <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: `${tint}33`, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
            <Ionicons name={r.icon} size={20} color={tint} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>{r.label}</Text>
            <Text style={{ color: colors.dim, fontSize: 13.5, marginTop: 1 }}>{r.sub}</Text>
          </View>
          <Text style={{ color: colors.dim, fontSize: 17, marginRight: 6 }}>{count(r.filter)}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.dim} />
        </Pressable>
        )
      })}
    </View>
  )
}

/** A fanned stack of the latest posters. */
function PosterStack({ posters }: { posters: string[] }) {
  if (!posters.length) return null
  return (
    <View style={{ width: 130, height: 150, alignItems: 'center', justifyContent: 'center' }}>
      {posters.slice(0, 4).map((p, i, all) => (
        <View key={`${p}${i}`} style={{ position: 'absolute', transform: [{ rotate: `${(all.length - 1 - i) * 5 - 4}deg` }, { translateX: (all.length - 1 - i) * 8 }], shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 8 }}>
          <Poster path={p} width={88} radius={9} />
        </View>
      ))}
    </View>
  )
}

// ── A list ──────────────────────────────────────────────────────────────────────────────────────

const SORTS: Array<{ value: LibrarySort; label: string }> = [
  { value: 'recent', label: 'Recently watched' },
  { value: 'added', label: 'Recently added' },
  { value: 'title', label: 'Title' },
  { value: 'rating', label: 'Your rating' },
  { value: 'year', label: 'Release year' }
]

/** The gold of "Upcoming" notes (Watch Later's colour). */
const UPCOMING = '#d9a441'

const short = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`
}

export function LibraryList({ route }: NativeStackScreenProps<RootParams, 'LibraryList'>) {
  const { type, filter } = route.params
  const { items, watches, sort, setSettings } = useStore(useShallow((s) => ({ items: s.items, watches: s.watches, sort: s.settings.librarySort, setSettings: s.setSettings })))
  const shows = useShows()
  const [query, setQuery] = useState('')
  const row = ROWS[type].find((r) => r.filter === filter)
  const title = row?.label ?? (type === 'movie' ? MOVIE_STATUS_LABEL : STATUS_LABEL)[filter as 'watching'] ?? 'Library'

  const list = useMemo(() => {
    const idx = watchIndex(watches)
    const q = query.trim().toLowerCase()
    const last = (i: LibraryItem) => idx.last.get(i.id) ?? i.statusAt
    const by: Record<LibrarySort, (a: LibraryItem, b: LibraryItem) => number> = {
      recent: (a, b) => last(b) - last(a),
      added: (a, b) => b.addedAt - a.addedAt,
      title: (a, b) => a.title.localeCompare(b.title),
      rating: (a, b) => b.rating - a.rating || a.title.localeCompare(b.title),
      year: (a, b) => (b.year || '0').localeCompare(a.year || '0')
    }
    return items
      .filter((i) => i.type === type)
      .map((i) => ({ i, p: i.type === 'tv' && shows[i.tmdbId] ? showProgress(shows[i.tmdbId], i, idx.episodes.get(i.id)) : null, last: idx.last.get(i.id) }))
      .filter(({ i, p }) => matches(i, filter, p, shows[i.tmdbId]) && (!q || i.title.toLowerCase().includes(q)))
      .sort((a, b) => by[sort](a.i, b.i))
  }, [items, watches, shows, type, filter, query, sort])

  // Release dates of the movies that may not be out yet (the year alone can't tell).
  const thisYear = new Date().getFullYear()
  const maybeUpcoming = type === 'movie' ? list.filter(({ i, last }) => !last && (!i.year || Number(i.year) >= thisYear)).map(({ i }) => i.tmdbId) : []
  const movieDates = useAsync(
    async () => Object.fromEntries(await Promise.all(maybeUpcoming.map(async (id) => [id, await movieBasics(id).catch(() => null)] as const))),
    [maybeUpcoming.join()]
  )

  return (
    <Page
      header={
        <Header
          title={title}
          right={
            <Pressable
              accessibilityLabel="Sort"
              onPress={() => showMenu('Sort by', SORTS.map((s) => ({ label: s.label, selected: s.value === sort, onPress: () => setSettings({ librarySort: s.value }) })))}
              style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
            >
              <Ionicons name="filter" size={18} color={colors.text} />
            </Pressable>
          }
        />
      }
    >
      <View style={{ flexDirection: 'row', marginBottom: 10, paddingHorizontal: 4 }}>
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '800', letterSpacing: 1, flex: 1 }}>{title.toUpperCase()}</Text>
        <Text style={{ color: colors.dim, fontSize: 13, fontWeight: '700', letterSpacing: 1 }}>{SORTS.find((s) => s.value === sort)?.label.toUpperCase()}</Text>
      </View>
      {items.filter((i) => i.type === type).length > 10 && <SearchField value={query} onChange={setQuery} placeholder={`Filter ${title.toLowerCase()}`} style={{ marginBottom: 12 }} />}
      {list.length ? (
        <View style={{ backgroundColor: colors.card, borderRadius: 22, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14 }}>
          {list.map(({ i, p, last }, n) => (
            <ListRow key={i.id} item={i} p={p} last={last} first={n === 0} showInfo={shows[i.tmdbId]} release={releaseOf(i, shows[i.tmdbId], movieDates.data?.[i.tmdbId])} />
          ))}
        </View>
      ) : (
        <EmptyNote>Nothing here yet.</EmptyNote>
      )}
    </Page>
  )
}

/**
 * When a title that isn't out yet comes out: its date, or null for "not announced"; undefined for
 * titles already out (or not known yet).
 */
function releaseOf(i: LibraryItem, show: ShowBasics | undefined, movie: MovieBasics | null | undefined): string | null | undefined {
  if (i.status === 'completed') return undefined
  if (i.type === 'tv') {
    if (!show || show.last_episode_to_air) return undefined
    const date = show.next_episode_to_air?.air_date ?? show.first_air_date
    return date && date > today() ? date : date ? undefined : null
  }
  if (!movie) return undefined
  if (movie.release_date) return movie.release_date > today() ? movie.release_date : undefined
  return movie.status === 'Released' ? undefined : null
}

const ListRow = memo(function ListRow({ item, p, last, first, showInfo, release }: { item: LibraryItem; p: Progress | null; last: number | undefined; first: boolean; showInfo: { number_of_seasons: number; number_of_episodes: number } | undefined; release?: string | null }) {
  const nav = useRootNav()
  // A finished show with new episodes out since counts them instead of a check.
  const fresh = item.type === 'tv' && item.status === 'completed' && Boolean(p?.next)
  const done = (item.status === 'completed' && !fresh) || (item.type === 'movie' && Boolean(last))
  const upcoming = release !== undefined && !done
  const sub = fresh && p ? `${p.left} NEW ${p.left === 1 ? 'EPISODE' : 'EPISODES'}` : upcoming ? (release ? `Upcoming  •  ${monthYear(release)}` : 'Unknown Release Date') : done && last ? `Last watched ${short(last)}` : item.type === 'tv' && showInfo ? `${showInfo.number_of_seasons} ${showInfo.number_of_seasons === 1 ? 'SEASON' : 'SEASONS'}  •  ${showInfo.number_of_episodes.toLocaleString()} EPISODES` : item.year
  const [count, unit] = release ? countdown(release) : ['TBA', '']
  return (
    <PressableScale onPress={() => nav.push('Title', { type: item.type, id: item.tmdbId })} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: first ? 0 : 1, borderColor: colors.separator }}>
      <Poster path={item.poster} width={44} radius={6} />
      <View style={{ flex: 1, marginLeft: 14 }}>
        <Text style={display(20)} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={{ color: upcoming ? UPCOMING : colors.dim, fontSize: done || upcoming ? 14 : 12.5, fontWeight: done ? '500' : '700', letterSpacing: done || upcoming ? 0 : 0.6, marginTop: 1 }}>{sub}</Text>
      </View>
      {upcoming ? (
        <View style={{ minWidth: 54, alignItems: 'center' }}>
          <Text style={display(unit ? 24 : 17, release ? colors.text : UPCOMING)}>{count}</Text>
          {unit ? <Text style={{ color: colors.dim, fontSize: 12, fontWeight: '700', marginTop: -2 }}>{unit}</Text> : null}
        </View>
      ) : done ? (
        <ProgressRing value={1} done size={46} />
      ) : p ? (
        <ProgressRing value={p.total ? p.watched / p.total : 0} label={String(p.caughtUp ? 0 : p.left || p.total)} size={46} color={item.status === 'planned' ? colors.dim : colors.accent} />
      ) : null}
    </PressableScale>
  )
})
