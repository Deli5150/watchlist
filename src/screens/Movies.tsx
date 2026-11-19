import { Ionicons } from '@expo/vector-icons'
import { memo, useMemo } from 'react'
import { Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'
import { useAsync } from '../lib/hooks'
import { useWide } from '../lib/layout'
import { daysUntil, watchIndex } from '../lib/progress'
import { useStore } from '../lib/store'
import { movieBasics, type MovieBasics, type MovieDetails } from '../lib/tmdb'
import type { LibraryItem } from '../lib/types'
import { watchMovie } from '../ui/actions'
import { HScroll } from '../ui/HScroll'
import { EmptyNote, Page } from '../ui/kit'
import { Poster, PosterGrid, SectionHeader, useOpenTitle } from '../ui/media'
import { PressableScale } from '../ui/motion'
import { colors, display } from '../ui/theme'
import { PosterTile, ScreenTitle, useTileWidth } from './Shows'

// Movies: your Watchlist (with a check to mark one watched), upcoming releases from your library,
// and what you watched lately.

/** "2 HRS, 12 MIN" */
const runtimeLabel = (m: number | null | undefined): string => {
  if (!m) return '—'
  const h = Math.floor(m / 60)
  return h ? `${h} ${h === 1 ? 'HR' : 'HRS'}, ${m % 60} MIN` : `${m} MIN`
}

/** "26 DAYS", "11 MONTHS", "2 YEARS" until a date. */
function untilLabel(date: string): string {
  const d = daysUntil(date)
  if (d <= 0) return 'OUT NOW'
  if (d === 1) return 'TOMORROW'
  if (d < 45) return `${d} DAYS`
  if (d < 365) return `${Math.round(d / 30)} MONTHS`
  const y = Math.round(d / 365)
  return `${y} ${y === 1 ? 'YEAR' : 'YEARS'}`
}

/** Which bucket an upcoming release falls in. */
function bucketOf(date: string): string {
  const d = daysUntil(date)
  const now = new Date()
  const [y, m] = date.split('-').map(Number)
  if (d < 7) return 'This week'
  if (y === now.getFullYear() && m === now.getMonth() + 1) return 'This month'
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  if (y === next.getFullYear() && m === next.getMonth() + 1) return 'Next month'
  if (y === now.getFullYear()) return 'This year'
  if (y === now.getFullYear() + 1) return 'Next year'
  return 'Later'
}

export default function Movies() {
  const wide = useWide()
  const tile = useTileWidth()
  const { items, watches } = useStore(useShallow((s) => ({ items: s.items, watches: s.watches })))
  const movies = useMemo(() => items.filter((i) => i.type === 'movie'), [items])
  const key = movies.map((m) => m.id).join()
  const details = useAsync(async () => {
    const out: Record<number, MovieBasics> = {}
    await Promise.all(movies.map(async (m) => void (out[m.tmdbId] = await movieBasics(m.tmdbId).catch(() => undefined as never))))
    return out
  }, [key])
  const info = details.data ?? {}
  const idx = watchIndex(watches)

  const watchlist = movies.filter((m) => m.status === 'planned' && !(info[m.tmdbId]?.release_date && daysUntil(info[m.tmdbId].release_date!) > 0)).sort((a, b) => b.statusAt - a.statusAt)
  const upcoming = movies
    .filter((m) => m.status !== 'completed' && m.status !== 'dropped' && info[m.tmdbId]?.release_date && daysUntil(info[m.tmdbId].release_date!) > 0)
    .sort((a, b) => info[a.tmdbId].release_date!.localeCompare(info[b.tmdbId].release_date!))
  const watched = movies.filter((m) => idx.movies.has(m.id)).sort((a, b) => (idx.movies.get(b.id)?.at ?? 0) - (idx.movies.get(a.id)?.at ?? 0))
  const groups = new Map<string, LibraryItem[]>()
  for (const m of upcoming) {
    const b = bucketOf(info[m.tmdbId].release_date!)
    groups.set(b, [...(groups.get(b) ?? []), m])
  }

  return (
    <Page wide bottomSpace={120}>
      <ScreenTitle title="Movies" />
      {!movies.length && <EmptyNote>Movies you add show up here. Find some in Discover or Search.</EmptyNote>}
      {watchlist.length > 0 && (
        <View style={{ marginBottom: 26 }}>
          <SectionHeader title="Watchlist" icon="bookmark" />
          {wide ? (
            <PosterGrid items={watchlist} keyOf={(m) => m.id} min={150} render={(m, w) => <MovieCard item={m} info={info[m.tmdbId]} width={w} />} />
          ) : (
            // Phones: one row that scrolls sideways, so the watchlist doesn't take over the page.
            <HScroll contentContainerStyle={{ gap: 12 }}>
              {watchlist.map((m) => (
                <MovieCard key={m.id} item={m} info={info[m.tmdbId]} width={tile} />
              ))}
            </HScroll>
          )}
        </View>
      )}
      {groups.size > 0 && (
        <>
          <SectionHeader title="Upcoming Movies" icon="sparkles" iconColor="#d9a441" />
          <ScrollView horizontal showsHorizontalScrollIndicator={Platform.OS === 'web'} contentContainerStyle={{ gap: 12, paddingBottom: Platform.OS === 'web' ? 10 : 0 }} style={{ marginBottom: 26 }}>
            {[...groups.entries()].map(([label, list]) => (
              <View key={label} style={{ gap: 10 }}>
                <View style={{ height: 30, borderRadius: 15, backgroundColor: colors.card, justifyContent: 'center', paddingHorizontal: 14, alignSelf: 'stretch' }}>
                  <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: '800', letterSpacing: 0.8 }}>{label.toUpperCase()}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  {list.map((m) => (
                    <PosterTile key={m.id} item={m} extra={untilLabel(info[m.tmdbId].release_date!)} />
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </>
      )}
      {watched.length > 0 && (
        <>
          <SectionHeader title="Recently Watched" icon="checkmark-circle" iconColor={colors.success} />
          <ScrollView horizontal showsHorizontalScrollIndicator={Platform.OS === 'web'} contentContainerStyle={{ gap: 12, paddingBottom: Platform.OS === 'web' ? 10 : 0 }} style={{ marginBottom: 26 }}>
            {watched.slice(0, 20).map((m) => (
              <PosterTile key={m.id} item={m} sub={runtimeLabel(info[m.tmdbId]?.runtime)} extra={m.year} />
            ))}
          </ScrollView>
        </>
      )}
    </Page>
  )
}

/** A Watchlist movie: poster with a check to mark it watched, then title, runtime and year. */
const MovieCard = memo(function MovieCard({ item, info, width }: { item: LibraryItem; info: MovieBasics | undefined; width: number }) {
  const open = useOpenTitle()
  return (
    <PressableScale onPress={() => open('movie', item.tmdbId)} style={{ width, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
      <View>
        <Poster path={item.poster} title={item.title} width={width} radius={0} style={{ borderWidth: 0 }} />
        <Pressable
          accessibilityLabel="Mark watched"
          onPress={() => watchMovie({ ...info, id: item.tmdbId, title: item.title, poster_path: item.poster, backdrop_path: item.backdrop } as unknown as MovieDetails)}
          hitSlop={6}
          style={({ pressed }) => ({ position: 'absolute', top: 6, right: 6, width: width < 140 ? 32 : 40, height: width < 140 ? 32 : 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.75)', borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
        >
          <Ionicons name="checkmark" size={20} color="rgba(255,255,255,0.35)" />
        </Pressable>
      </View>
      <View style={{ padding: width < 140 ? 7 : 10, alignItems: 'center' }}>
        <Text style={display(width < 140 ? 15 : 17)} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={display(width < 140 ? 13 : 14.5, colors.dim)}>{runtimeLabel(info?.runtime)}</Text>
        <Text style={display(width < 140 ? 13 : 14.5, colors.dim)}>{item.year || '—'}</Text>
      </View>
    </PressableScale>
  )
})
