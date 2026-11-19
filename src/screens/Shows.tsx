import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { memo, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'
import { addDays, today, toDate } from '../lib/dates'
import { useAsync } from '../lib/hooks'
import { useTab, useWide } from '../lib/layout'
import { refreshLibrary, useShows } from '../lib/library'
import { daysUntil, epKey, showProgress, watchIndex, type Progress } from '../lib/progress'
import { useStore } from '../lib/store'
import { img, seasons as fetchSeasons, type ShowBasics } from '../lib/tmdb'
import type { LibraryItem } from '../lib/types'
import { upcomingEpisodes, type UpcomingEpisode } from '../lib/upcoming'
import { useRootNav } from '../nav'
import { CircleButton, Page } from '../ui/kit'
import { HScroll } from '../ui/HScroll'
import { Poster, ProgressRing, SectionHeader, useOpenTitle } from '../ui/media'
import { PressableScale } from '../ui/motion'
import { colors, display } from '../ui/theme'
import { EpisodeCard } from './Season'

// Shows: the shows pinned to your WatchList (the ones you're watching), the Episode Queue with each
// one's next episodes, what airs this week and new seasons on the way. (Watch Later is in Library.)

interface Row {
  item: LibraryItem
  show: ShowBasics | undefined
  p: Progress | null
  last: number
}

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

export default function Shows() {
  const { items, watches } = useStore(useShallow((s) => ({ items: s.items, watches: s.watches })))
  const shows = useShows()

  useEffect(() => {
    void refreshLibrary()
  }, [items.length])

  const { pinned, queue, seasons } = useMemo(() => {
    const idx = watchIndex(watches)
    const rows: Row[] = items
      .filter((i) => i.type === 'tv' && i.status === 'watching')
      .map((item) => {
        const show = shows[item.tmdbId]
        return { item, show, p: show ? showProgress(show, item, idx.episodes.get(item.id)) : null, last: idx.last.get(item.id) ?? item.statusAt }
      })
      .sort((a, b) => b.last - a.last)
    // New seasons of shows you follow: announced (episode 1 with a date) or returning without one.
    const seasons = items
      .filter((i) => i.type === 'tv' && i.status !== 'dropped' && shows[i.tmdbId])
      .map((item) => ({ item, show: shows[item.tmdbId] }))
      .filter(({ show }) => (show.next_episode_to_air ? show.next_episode_to_air.episode_number === 1 : show.status === 'Returning Series'))
      .sort((a, b) => (a.show.next_episode_to_air?.air_date ?? '9999').localeCompare(b.show.next_episode_to_air?.air_date ?? '9999'))
    return {
      pinned: rows,
      queue: rows.filter((r) => !r.p || r.p.next),
      seasons
    }
  }, [items, watches, shows])

  const shownKey = items.filter((i) => i.type === 'tv' && i.status !== 'dropped').map((i) => `${i.id}@${shows[i.tmdbId]?.next_episode_to_air?.id ?? ''}`).join()
  const week = useAsync(() => upcomingEpisodes(items, shows, today(), addDays(today(), 6)), [shownKey])

  return (
    <Page wide bottomSpace={120}>
      <ScreenTitle title="Shows" />
      {!items.length && <Welcome />}
      {pinned.length > 0 && (
        <>
          <SectionHeader title="WatchList" icon="pin" />
          <HScroll contentContainerStyle={{ gap: 12 }} style={{ marginBottom: 26 }}>
            {pinned.map((r) => (
              <PinTile key={r.item.id} row={r} />
            ))}
          </HScroll>
        </>
      )}
      {queue.length > 0 && (
        <>
          <SectionHeader title="Episode Queue" icon="list" />
          <View style={{ marginBottom: 26 }}>
            {queue.map((r) => (
              <QueueRow key={r.item.id} row={r} />
            ))}
          </View>
        </>
      )}
      {(week.data?.length ?? 0) > 0 && <WeekStrip list={week.data!} />}
      {seasons.length > 0 && <UpcomingSeasons list={seasons} />}
      {items.length > 0 && !queue.length && <Text style={{ color: colors.dim, fontSize: 15, lineHeight: 22 }}>You’re all caught up. Find something new in Discover.</Text>}
    </Page>
  )
}

/** The big screen title, with Settings (and Calendar/History) buttons on phones. */
export function ScreenTitle({ title }: { title: string }) {
  const wide = useWide()
  const setTab = useTab((s) => s.set)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 30, marginBottom: 18 }}>
      <Text style={[display(40), { flex: 1 }]}>{title}</Text>
      {!wide && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <CircleButton icon="calendar-outline" label="Calendar" onPress={() => setTab('calendar')} />
          <CircleButton icon="time-outline" label="History" onPress={() => setTab('history')} />
          <CircleButton icon="settings-sharp" label="Settings" onPress={() => setTab('settings')} />
        </View>
      )}
    </View>
  )
}

/** A show pinned to your WatchList (one you're watching): episodes left, and where you are. */
const PinTile = memo(function PinTile({ row }: { row: Row }) {
  const { item, show, p } = row
  const next = p?.next
  const upcoming = show?.next_episode_to_air
  const caughtUp = Boolean(p?.caughtUp)
  return (
    <PosterTile
      item={item}
      badge={p ? (caughtUp ? '✓' : String(p.left)) : undefined}
      sub={next ? `SEASON ${String(next.season).padStart(2, '0')}` : caughtUp ? 'CAUGHT UP' : '—'}
      extra={next ? `EPISODE ${next.episode}` : upcoming?.air_date ? `NEXT ${daysUntil(upcoming.air_date) <= 0 ? 'TODAY' : `IN ${daysUntil(upcoming.air_date)} DAYS`}` : caughtUp ? 'NO NEW EPISODES YET' : undefined}
    />
  )
})

/** A show in the Episode Queue; opens to its next few episodes. */
const QueueRow = memo(function QueueRow({ row }: { row: Row }) {
  const [open, setOpen] = useState(false)
  const nav = useRootNav()
  const { item, show, p } = row
  const n = p?.next
  // When open: every episode from the next one on (the rest of this season and the later ones).
  const numbers = open && show && n ? show.seasons.filter((x) => x.season_number >= n.season && x.season_number > 0 && !item.skippedSeasons.includes(x.season_number)).map((x) => x.season_number) : []
  const res = useAsync(() => (numbers.length ? fetchSeasons(item.tmdbId, numbers) : Promise.resolve([])), [item.tmdbId, numbers.join()])
  const watched = useStore((s) => watchIndex(s.watches).episodes.get(item.id))
  const nextEps = (res.data ?? []).flatMap((x) => x.episodes).filter((e) => n && (e.season_number > n.season || e.episode_number >= n.episode))
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: open ? 2 : 1, borderColor: open ? colors.accent : colors.border, marginBottom: 10, overflow: 'hidden' }}>
      <Pressable onPress={() => setOpen(!open)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', padding: 10, opacity: pressed ? 0.8 : 1 })}>
        <Poster path={item.poster} width={52} radius={7} />
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={display(21)} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={{ color: colors.dim, fontSize: 12.5, fontWeight: '800', letterSpacing: 0.6, marginTop: 1 }}>{n ? `SEASON ${n.season}  •  EPISODE ${n.episode.toLocaleString()}` : '—'}</Text>
        </View>
        {p && <ProgressRing value={p.total ? p.watched / p.total : 0} label={String(p.left)} size={48} />}
      </Pressable>
      {open && show && (
        <View style={{ paddingHorizontal: 10, paddingBottom: 10 }}>
          {!res.data && <ActivityIndicator color={colors.accentHi} style={{ marginVertical: 16 }} />}
          {res.data && (
            <ScrollView nestedScrollEnabled style={{ maxHeight: 360 }} contentContainerStyle={{ paddingRight: 4 }}>
              {nextEps.map((e, i) => (
                <View key={e.id}>
                  {(i === 0 || e.season_number !== nextEps[i - 1].season_number) && (
                    <Text style={{ color: colors.dim, fontSize: 12, fontWeight: '800', letterSpacing: 1, marginTop: i ? 10 : 0, marginBottom: 6 }}>{`SEASON ${e.season_number}`}</Text>
                  )}
                  <EpisodeCard show={show} e={e} watch={watched?.get(epKey(e.season_number, e.episode_number))} isNext={e.season_number === n?.season && e.episode_number === n?.episode} />
                </View>
              ))}
            </ScrollView>
          )}
          {nextEps.length > 4 && <Text style={{ color: colors.faint, textAlign: 'center', fontSize: 12, marginTop: 6 }}>{`${nextEps.length} episodes · scroll for more`}</Text>}
          <Pressable onPress={() => nav.push('Title', { type: 'tv', id: item.tmdbId, tab: 'progress' })} style={({ pressed }) => ({ height: 46, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginTop: 4, opacity: pressed ? 0.7 : 1 })}>
            <Text style={display(19, colors.accentHi)}>View Show</Text>
            <Ionicons name="arrow-forward" size={17} color={colors.accentHi} style={{ marginLeft: 6 }} />
          </Pressable>
        </View>
      )}
    </View>
  )
})

/** The next seven days: days with episodes open up, empty ones stay a thin column. */
function WeekStrip({ list }: { list: UpcomingEpisode[] }) {
  const open = useOpenTitle()
  const days = Array.from({ length: 7 }, (_, i) => addDays(today(), i))
  return (
    <>
      <SectionHeader title="Upcoming Episodes" icon="calendar" />
      <ScrollView horizontal showsHorizontalScrollIndicator={Platform.OS === 'web'} contentContainerStyle={{ gap: 8, paddingBottom: Platform.OS === 'web' ? 10 : 0 }} style={{ marginBottom: 26 }}>
        {days.map((d, i) => {
          const eps = list.filter((u) => u.date === d)
          const label = i === 0 ? 'TODAY' : i === 1 ? 'TOMORROW' : DAYS[toDate(d).getDay()]
          if (!eps.length)
            return (
              <View key={d} style={{ width: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', paddingTop: 10, minHeight: 230 }}>
                <Text style={{ color: colors.dim, fontSize: 12, fontWeight: '800' }}>{label.slice(0, 1)}</Text>
              </View>
            )
          return (
            <View key={d} style={{ gap: 8 }}>
              <View style={{ height: 30, borderRadius: 15, backgroundColor: colors.card, justifyContent: 'center', paddingHorizontal: 14 }}>
                <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: '800', letterSpacing: 0.8 }}>{label}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {eps.map((u) => (
                  <PressableScale key={`${u.item.id}-${u.episode.id}`} onPress={() => open('tv', u.item.tmdbId)} style={{ width: 250, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
                    <View style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.cardHi }}>
                      {(u.episode.still_path ?? u.item.backdrop) && <Image source={{ uri: img(u.episode.still_path ?? u.item.backdrop, 'w300')! }} style={{ width: '100%', height: '100%' }} contentFit="cover" />}
                    </View>
                    <View style={{ padding: 10, alignItems: 'center' }}>
                      <Text style={display(17)} numberOfLines={1}>
                        {u.item.title}
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.dim }}>
                        {`S${String(u.episode.season_number).padStart(2, '0')} `}
                        <Text style={{ color: colors.accentHi }}>{`EPISODE ${u.episode.episode_number}`}</Text>
                      </Text>
                    </View>
                  </PressableScale>
                ))}
              </View>
            </View>
          )
        })}
      </ScrollView>
    </>
  )
}

function UpcomingSeasons({ list }: { list: Array<{ item: LibraryItem; show: ShowBasics }> }) {
  return (
    <>
      <SectionHeader title="Upcoming Seasons" icon="sparkles" iconColor="#d9a441" />
      <ScrollView horizontal showsHorizontalScrollIndicator={Platform.OS === 'web'} contentContainerStyle={{ gap: 12, paddingBottom: Platform.OS === 'web' ? 10 : 0 }} style={{ marginBottom: 26 }}>
        {list.map(({ item, show }) => {
          const next = show.next_episode_to_air
          const n = next?.season_number ?? (show.last_episode_to_air?.season_number ?? 0) + 1
          const when = next?.air_date ? (daysUntil(next.air_date) <= 0 ? 'TODAY' : `${daysUntil(next.air_date)} DAYS`) : 'TBA'
          return <PosterTile key={item.id} item={item} sub={`SEASON ${String(n).padStart(2, '0')}`} extra={when} />
        })}
      </ScrollView>
    </>
  )
}

/** A poster with a caption strip under it (Showline-style tiles). */
export function PosterTile({ item, sub, extra, badge, right }: { item: LibraryItem; sub?: string; extra?: string; badge?: string; right?: React.ReactNode }) {
  const open = useOpenTitle()
  return (
    <PressableScale onPress={() => open(item.type, item.tmdbId)} style={{ width: 170, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
      <View>
        <Poster path={item.poster} title={item.title} width={170} radius={0} style={{ borderWidth: 0 }} />
        {badge && (
          <View style={{ position: 'absolute', top: 8, right: 8, minWidth: 34, height: 34, borderRadius: 17, paddingHorizontal: 6, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={display(16, colors.onAccent)}>{badge}</Text>
          </View>
        )}
        {right}
      </View>
      <View style={{ padding: 9, alignItems: 'center' }}>
        <Text style={display(17)} numberOfLines={1}>
          {item.title}
        </Text>
        {sub ? <Text style={display(15, colors.dim)}>{sub}</Text> : null}
        {extra ? <Text style={{ color: colors.faint, fontSize: 12, fontWeight: '800', letterSpacing: 0.5 }}>{extra}</Text> : null}
      </View>
    </PressableScale>
  )
}

function Welcome() {
  const setTab = useTab((s) => s.set)
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 22, borderWidth: 1, borderColor: colors.border, padding: 24, alignItems: 'center' }}>
      <Ionicons name="tv-outline" size={42} color={colors.accentHi} />
      <Text style={[display(28), { marginTop: 12 }]}>Welcome to WatchList</Text>
      <Text style={{ color: colors.dim, fontSize: 15, textAlign: 'center', marginTop: 8, lineHeight: 22, maxWidth: 460 }}>
        Add the shows and movies you watch. WatchList keeps your place in every show, tells you when new episodes air, and shows where to stream them.
      </Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
        <Pressable onPress={() => setTab('search')} style={({ pressed }) => ({ height: 42, paddingHorizontal: 18, borderRadius: 21, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', opacity: pressed ? 0.8 : 1 })}>
          <Ionicons name="search" size={16} color={colors.onAccent} />
          <Text style={[display(18, colors.onAccent), { marginLeft: 6 }]}>Search</Text>
        </Pressable>
        <Pressable onPress={() => setTab('discover')} style={({ pressed }) => ({ height: 42, paddingHorizontal: 18, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', alignItems: 'center', opacity: pressed ? 0.8 : 1 })}>
          <Ionicons name="star" size={16} color={colors.text} />
          <Text style={[display(18), { marginLeft: 6 }]}>Discover</Text>
        </Pressable>
      </View>
    </View>
  )
}
