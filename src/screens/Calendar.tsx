import { useMemo } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'
import { today, toDate } from '../lib/dates'
import { useAsync } from '../lib/hooks'
import { useShows } from '../lib/library'
import { daysUntil, epKey, watchIndex } from '../lib/progress'
import { useStore } from '../lib/store'
import { upcomingEpisodes, upcomingMovies, type Upcoming } from '../lib/upcoming'
import { EmptyNote, Page } from '../ui/kit'
import { Poster, useOpenTitle } from '../ui/media'
import { PressableScale } from '../ui/motion'
import { colors } from '../ui/theme'
import { Ionicons } from '@expo/vector-icons'

// Calendar: new episodes of the shows you follow and Watchlist movies, by day.

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function dayTitle(date: string): string {
  const n = daysUntil(date)
  const d = toDate(date)
  const name = `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`
  return n === 0 ? `Today · ${name}` : n === 1 ? `Tomorrow · ${name}` : n === -1 ? `Yesterday · ${name}` : name
}

export default function Calendar() {
  const { items, watches } = useStore(useShallow((s) => ({ items: s.items, watches: s.watches })))
  const shows = useShows()
  const key = items
    .filter((i) => i.status !== 'dropped')
    .map((i) => `${i.id}${i.type === 'tv' ? `@${shows[i.tmdbId]?.next_episode_to_air?.id ?? ''}` : ''}`)
    .join()
  const res = useAsync(async () => {
    const [eps, movies] = await Promise.all([upcomingEpisodes(items, shows), upcomingMovies(items)])
    return [...eps, ...movies].sort((a, b) => a.date.localeCompare(b.date))
  }, [key])

  const days = useMemo(() => {
    const map = new Map<string, Upcoming[]>()
    for (const u of res.data ?? []) map.set(u.date, [...(map.get(u.date) ?? []), u])
    return [...map.entries()]
  }, [res.data])

  const idx = watchIndex(watches)
  const now = today()
  const past = days.filter(([d]) => d < now)
  const coming = days.filter(([d]) => d >= now)

  return (
    <Page bottomSpace={110}>
      <Text style={{ color: colors.text, fontSize: 34, fontWeight: '800', marginTop: 34, marginBottom: 18 }}>Calendar</Text>
      {res.loading && !res.data && <ActivityIndicator color={colors.accentHi} style={{ marginTop: 30 }} />}
      {res.data && !days.length && <EmptyNote>{items.length ? 'Nothing coming up for the shows and movies in your library.' : 'Add shows to see when their new episodes air.'}</EmptyNote>}
      {coming.map(([date, list]) => (
        <Day key={date} date={date} list={list} watched={(u) => u.kind === 'episode' && Boolean(idx.episodes.get(u.item.id)?.has(epKey(u.episode.season_number, u.episode.episode_number)))} />
      ))}
      {past.length > 0 && (
        <>
          <Text style={{ color: colors.dim, fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginTop: 10, marginBottom: 12 }}>LAST 7 DAYS</Text>
          {[...past].reverse().map(([date, list]) => (
            <Day key={date} date={date} list={list} watched={(u) => u.kind === 'episode' && Boolean(idx.episodes.get(u.item.id)?.has(epKey(u.episode.season_number, u.episode.episode_number)))} />
          ))}
        </>
      )}
    </Page>
  )
}

function Day({ date, list, watched }: { date: string; list: Upcoming[]; watched: (u: Upcoming) => boolean }) {
  const open = useOpenTitle()
  const isToday = date === today()
  return (
    <View style={{ marginBottom: 22 }}>
      <Text style={{ color: isToday ? colors.accentHi : colors.text, fontSize: 16, fontWeight: '700', marginBottom: 10 }}>{dayTitle(date)}</Text>
      <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
        {list.map((u, i) => (
          <PressableScale
            key={u.kind === 'episode' ? `${u.item.id}-${u.episode.id}` : u.item.id}
            onPress={() => open(u.item.type, u.item.tmdbId)}
            style={{ flexDirection: 'row', alignItems: 'center', padding: 10, borderTopWidth: i ? 1 : 0, borderColor: colors.separator }}
          >
            <Poster path={u.item.poster} width={40} radius={6} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
                {u.item.title}
              </Text>
              <Text style={{ color: colors.dim, fontSize: 13, marginTop: 2 }} numberOfLines={1}>
                {u.kind === 'episode' ? `S${u.episode.season_number} · E${u.episode.episode_number}${u.episode.name ? ` · ${u.episode.name}` : ''}` : 'Movie release'}
              </Text>
            </View>
            {watched(u) && <Ionicons name="checkmark-circle" size={20} color={colors.success} />}
          </PressableScale>
        ))}
      </View>
    </View>
  )
}
