import { Ionicons } from '@expo/vector-icons'
import { memo, useEffect, useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'
import { useSeason } from '../lib/hooks'
import { useTab, useWide } from '../lib/layout'
import { refreshLibrary, useShows } from '../lib/library'
import { daysUntil, epLabel, showProgress, watchIndex, whenLabel, type Progress } from '../lib/progress'
import { useStore } from '../lib/store'
import type { ShowBasics } from '../lib/tmdb'
import type { LibraryItem } from '../lib/types'
import { watchEpisode } from '../ui/actions'
import { CircleButton, Page } from '../ui/kit'
import { Poster, PosterGrid, ProgressBar, SectionHeader, Still, useOpenTitle } from '../ui/media'
import { PressableScale } from '../ui/motion'
import { colors } from '../ui/theme'

// Up Next: the next episode of every show you're watching, then shows waiting for new episodes,
// and what's on your Watchlist.

interface Row {
  item: LibraryItem
  show: ShowBasics | undefined
  p: Progress | null
  last: number
}

export default function UpNext() {
  const { items, watches } = useStore(useShallow((s) => ({ items: s.items, watches: s.watches })))
  const shows = useShows()

  useEffect(() => {
    void refreshLibrary()
  }, [items.length])

  const { next, waiting, start, movies } = useMemo(() => {
    const idx = watchIndex(watches)
    const rows: Row[] = items
      .filter((i) => i.type === 'tv' && i.status === 'watching')
      .map((item) => {
        const show = shows[item.tmdbId]
        return { item, show, p: show ? showProgress(show, item, idx.episodes.get(item.id)) : null, last: idx.last.get(item.id) ?? item.statusAt }
      })
      .sort((a, b) => b.last - a.last)
    return {
      next: rows.filter((r) => !r.p || r.p.next),
      waiting: rows
        .filter((r) => r.p?.caughtUp)
        .sort((a, b) => (a.show?.next_episode_to_air?.air_date ?? '9999').localeCompare(b.show?.next_episode_to_air?.air_date ?? '9999')),
      start: items.filter((i) => i.type === 'tv' && i.status === 'planned').sort((a, b) => b.statusAt - a.statusAt),
      movies: items.filter((i) => i.type === 'movie' && i.status === 'planned').sort((a, b) => b.statusAt - a.statusAt)
    }
  }, [items, watches, shows])

  const wide = useWide()
  const setTab = useTab((s) => s.set)
  return (
    <Page wide bottomSpace={110}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 34, marginBottom: 18 }}>
        <Text style={{ color: colors.text, fontSize: 34, fontWeight: '800', flex: 1 }}>Up Next</Text>
        {!wide && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <CircleButton icon="time-outline" label="History" onPress={() => setTab('history')} />
            <CircleButton icon="settings-outline" label="Settings" onPress={() => setTab('settings')} />
          </View>
        )}
      </View>
      {!items.length && <Welcome />}
      {next.length > 0 && (
        <View style={{ marginBottom: 28 }}>
          <PosterGrid items={next} keyOf={(r) => r.item.id} min={300} minColumns={1} render={(r, w) => <NextCard row={r} width={w} />} />
        </View>
      )}
      {waiting.length > 0 && (
        <View style={{ marginBottom: 28 }}>
          <SectionHeader title="Waiting for new episodes" />
          <PosterGrid items={waiting} keyOf={(r) => r.item.id} min={300} minColumns={1} render={(r) => <WaitingRow row={r} />} />
        </View>
      )}
      {start.length > 0 && <ItemRow title="Start watching" items={start} />}
      {movies.length > 0 && <ItemRow title="Movies to watch" items={movies} />}
      {items.length > 0 && !next.length && !waiting.length && !start.length && !movies.length && (
        <Text style={{ color: colors.dim, fontSize: 15, lineHeight: 22 }}>You’re all caught up. Find something new in Discover.</Text>
      )}
    </Page>
  )
}

/** The next episode of a show you're watching, with a button to mark it watched. */
const NextCard = memo(function NextCard({ row, width }: { row: Row; width: number }) {
  const { item, show, p } = row
  const open = useOpenTitle()
  const n = p?.next
  const season = useSeason(n ? item.tmdbId : undefined, n?.season)
  const ep = season?.episodes.find((e) => e.episode_number === n?.episode)
  const fresh = ep?.air_date ? daysUntil(ep.air_date) >= -7 : false
  return (
    <PressableScale onPress={() => open('tv', item.tmdbId)} style={{ width }}>
      <Still path={ep?.still_path ?? item.backdrop} style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border }}>
        <View style={{ position: 'absolute', left: 14, right: 14, bottom: 12, flexDirection: 'row', alignItems: 'flex-end' }}>
          <View style={{ flex: 1, marginRight: 10 }}>
            {fresh && (
              <View style={{ alignSelf: 'flex-start', backgroundColor: colors.accent, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 6 }}>
                <Text style={{ color: colors.onAccent, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>NEW</Text>
              </View>
            )}
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 13, marginTop: 2 }} numberOfLines={1}>
              {n ? `${epLabel(n.season, n.episode)}${ep?.name ? ` · ${ep.name}` : ''}` : 'Loading…'}
            </Text>
            {p && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                <ProgressBar value={p.total ? p.watched / p.total : 0} style={{ flex: 1 }} track="rgba(255,255,255,0.25)" />
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginLeft: 8, fontWeight: '600' }}>{`${p.left} left`}</Text>
              </View>
            )}
          </View>
          {show && n && (
            <Pressable
              accessibilityLabel="Mark watched"
              onPress={() => watchEpisode(show, n, ep?.runtime)}
              hitSlop={6}
              style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: pressed ? colors.accentHi : colors.accent, alignItems: 'center', justifyContent: 'center' })}
            >
              <Ionicons name="checkmark" size={24} color={colors.onAccent} />
            </Pressable>
          )}
        </View>
      </Still>
    </PressableScale>
  )
})

function WaitingRow({ row }: { row: Row }) {
  const open = useOpenTitle()
  const next = row.show?.next_episode_to_air
  const status = row.show?.status
  return (
    <PressableScale onPress={() => open('tv', row.item.tmdbId)} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 10 }}>
      <Poster path={row.item.poster} width={46} radius={7} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
          {row.item.title}
        </Text>
        <Text style={{ color: colors.dim, fontSize: 13, marginTop: 3 }} numberOfLines={1}>
          {next ? `${epLabel(next.season_number, next.episode_number)} · ${next.air_date ? whenLabel(next.air_date) : 'Date to be announced'}` : status === 'Returning Series' ? 'New season not announced yet' : status ?? ''}
        </Text>
      </View>
      {next?.air_date && daysUntil(next.air_date) <= 7 && <Ionicons name="time-outline" size={18} color={colors.accentHi} />}
    </PressableScale>
  )
}

function ItemRow({ title, items }: { title: string; items: LibraryItem[] }) {
  const open = useOpenTitle()
  return (
    <View style={{ marginBottom: 28 }}>
      <SectionHeader title={title} />
      <PosterGrid
        items={items.slice(0, 24)}
        keyOf={(i) => i.id}
        render={(i, w) => (
          <PressableScale onPress={() => open(i.type, i.tmdbId)}>
            <Poster path={i.poster} title={i.title} width={w} />
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600', marginTop: 7 }} numberOfLines={1}>
              {i.title}
            </Text>
            <Text style={{ color: colors.dim, fontSize: 12, marginTop: 1 }}>{i.year}</Text>
          </PressableScale>
        )}
      />
    </View>
  )
}

function Welcome() {
  const setTab = useTab((s) => s.set)
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 22, borderWidth: 1, borderColor: colors.border, padding: 24, alignItems: 'center' }}>
      <Ionicons name="tv-outline" size={42} color={colors.accentHi} />
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 12 }}>Welcome to WatchList</Text>
      <Text style={{ color: colors.dim, fontSize: 15, textAlign: 'center', marginTop: 8, lineHeight: 22, maxWidth: 460 }}>
        Add the shows and movies you watch. WatchList keeps your place in every show, tells you when new episodes air, and shows where to stream them.
      </Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
        <Pressable onPress={() => setTab('search')} style={({ pressed }) => ({ height: 42, paddingHorizontal: 18, borderRadius: 21, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', opacity: pressed ? 0.8 : 1 })}>
          <Ionicons name="search" size={16} color={colors.onAccent} />
          <Text style={{ color: colors.onAccent, fontWeight: '700', marginLeft: 6 }}>Search</Text>
        </Pressable>
        <Pressable onPress={() => setTab('discover')} style={({ pressed }) => ({ height: 42, paddingHorizontal: 18, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', alignItems: 'center', opacity: pressed ? 0.8 : 1 })}>
          <Ionicons name="compass-outline" size={16} color={colors.text} />
          <Text style={{ color: colors.text, fontWeight: '700', marginLeft: 6 }}>Discover</Text>
        </Pressable>
      </View>
    </View>
  )
}
