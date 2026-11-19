import { Ionicons } from '@expo/vector-icons'
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'
import { dateOfTime, toDate } from '../lib/dates'
import { duration, formatDate, monthName } from '../lib/progress'
import { useStore } from '../lib/store'
import type { LibraryItem, Watch } from '../lib/types'
import { EmptyNote, Page, Pill } from '../ui/kit'
import { Chip, Poster, useOpenTitle } from '../ui/media'
import { PressableScale } from '../ui/motion'
import { confirm, pickDate, showMenu } from '../ui/overlays'
import { colors } from '../ui/theme'
import { timeOnDate } from '../lib/dates'

// History: what you watched, by year: totals, watch time per month, and every day's episodes and movies.

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function History() {
  const { items, watches } = useStore(useShallow((s) => ({ items: s.items, watches: s.watches })))
  const years = useMemo(() => [...new Set(watches.map((w) => new Date(w.at).getFullYear()))].sort((a, b) => b - a), [watches])
  const [year, setYear] = useState<number | 'all'>('all')
  const [limit, setLimit] = useState(60)
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  const list = useMemo(() => watches.filter((w) => year === 'all' || new Date(w.at).getFullYear() === year).sort((a, b) => b.at - a.at), [watches, year])
  const stats = useMemo(() => {
    let episodes = 0
    let movies = 0
    let minutes = 0
    const shows = new Set<string>()
    for (const w of list) {
      minutes += w.runtime
      if (w.season === null) movies++
      else {
        episodes++
        shows.add(w.itemId)
      }
    }
    return { episodes, movies, minutes, shows: shows.size }
  }, [list])

  const days = useMemo(() => {
    const map = new Map<string, Watch[]>()
    for (const w of list.slice(0, limit)) {
      const d = dateOfTime(w.at)
      map.set(d, [...(map.get(d) ?? []), w])
    }
    return [...map.entries()]
  }, [list, limit])

  return (
    <Page bottomSpace={110}>
      <Text style={{ color: colors.text, fontSize: 34, fontWeight: '800', marginTop: 34, marginBottom: 16 }}>History</Text>
      {!watches.length ? (
        <EmptyNote>Episodes and movies you mark watched show up here.</EmptyNote>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginBottom: 16 }}>
            <Chip label="All time" on={year === 'all'} onPress={() => setYear('all')} />
            {years.map((y) => (
              <Chip key={y} label={String(y)} on={year === y} onPress={() => setYear(y)} />
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
            <Stat label="Watch time" value={duration(stats.minutes, true)} />
            <Stat label="Episodes" value={stats.episodes.toLocaleString()} />
            <Stat label="Shows" value={stats.shows.toLocaleString()} />
            <Stat label="Movies" value={stats.movies.toLocaleString()} />
          </View>
          <MonthChart watches={list} year={year === 'all' ? null : year} />
          {days.map(([date, ws]) => (
            <View key={date} style={{ marginBottom: 18 }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 8 }}>{`${DAYS[toDate(date).getDay()]}, ${formatDate(date, true)}`}</Text>
              <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
                {ws.map((w, i) => (
                  <WatchRow key={w.id} w={w} item={byId.get(w.itemId)} first={i === 0} />
                ))}
              </View>
            </View>
          ))}
          {list.length > limit && <Pill label="Show more" onPress={() => setLimit(limit + 100)} style={{ alignSelf: 'center' }} />}
        </>
      )}
    </Page>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: 130, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14 }}>
      <Text style={{ color: colors.dim, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', marginTop: 4 }}>{value}</Text>
    </View>
  )
}

/** Hours watched per month (a year's 12 months, or the last 12 for all time). */
function MonthChart({ watches, year }: { watches: Watch[]; year: number | null }) {
  const [hover, setHover] = useState<number | null>(null)
  const months = useMemo(() => {
    const now = new Date()
    const slots = Array.from({ length: 12 }, (_, i) => {
      const d = year === null ? new Date(now.getFullYear(), now.getMonth() - 11 + i, 1) : new Date(year, i, 1)
      return { y: d.getFullYear(), m: d.getMonth(), minutes: 0, count: 0 }
    })
    for (const w of watches) {
      const d = new Date(w.at)
      const s = slots.find((x) => x.y === d.getFullYear() && x.m === d.getMonth())
      if (s) {
        s.minutes += w.runtime
        s.count++
      }
    }
    return slots
  }, [watches, year])
  const max = Math.max(1, ...months.map((m) => m.minutes))
  const H = 120
  const shown = hover !== null ? months[hover] : null
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 14 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700', flex: 1 }}>Watch time by month</Text>
        <Text style={{ color: colors.dim, fontSize: 13 }}>{shown ? `${monthName(shown.m)} ${shown.y}: ${duration(shown.minutes)} · ${shown.count} watched` : `Peak ${duration(max)}`}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: H, gap: 2, borderBottomWidth: 1, borderColor: colors.separator }}>
        {months.map((m, i) => (
          <Pressable
            key={i}
            onHoverIn={() => setHover(i)}
            onHoverOut={() => setHover((h) => (h === i ? null : h))}
            onPress={() => setHover(hover === i ? null : i)}
            accessibilityLabel={`${monthName(m.m)} ${m.y}: ${duration(m.minutes)}`}
            style={{ flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' }}
          >
            <View
              style={{
                width: '62%',
                maxWidth: 28,
                height: m.minutes ? Math.max(3, (m.minutes / max) * (H - 4)) : 0,
                backgroundColor: hover === null || hover === i ? colors.accent : colors.accentSoft,
                borderTopLeftRadius: 4,
                borderTopRightRadius: 4
              }}
            />
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 6 }}>
        {months.map((m, i) => (
          <Text key={i} style={{ flex: 1, textAlign: 'center', color: hover === i ? colors.text : colors.faint, fontSize: 10.5 }}>
            {monthName(m.m).slice(0, 1)}
          </Text>
        ))}
      </View>
    </View>
  )
}

function WatchRow({ w, item, first }: { w: Watch; item: LibraryItem | undefined; first: boolean }) {
  const open = useOpenTitle()
  const { setWatchTime, removeWatches } = useStore.getState()
  const label = w.season === null ? 'Movie' : `S${w.season} · E${w.episode}`
  const more = () =>
    showMenu(`${item?.title ?? ''} · ${label}`, [
      { label: 'Open', onPress: () => item && open(item.type, item.tmdbId) },
      { label: 'Change watch date', onPress: () => pickDate(dateOfTime(w.at), (d) => setWatchTime(w.id, timeOnDate(d, new Date(w.at))), 'Watched on') },
      { label: 'Remove from history', destructive: true, onPress: () => confirm('Remove from history?', 'It’s marked unwatched.', 'Remove', () => removeWatches([w.id])) }
    ])
  return (
    <PressableScale onPress={() => item && open(item.type, item.tmdbId)} style={{ flexDirection: 'row', alignItems: 'center', padding: 10, borderTopWidth: first ? 0 : 1, borderColor: colors.separator }}>
      <Poster path={item?.poster} width={36} radius={5} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '600' }} numberOfLines={1}>
          {item?.title ?? 'Removed title'}
        </Text>
        <Text style={{ color: colors.dim, fontSize: 12.5, marginTop: 2 }}>{`${label} · ${duration(w.runtime)}`}</Text>
      </View>
      <Pressable onPress={more} hitSlop={10} accessibilityLabel="More" style={{ padding: 6 }}>
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.dim} />
      </Pressable>
    </PressableScale>
  )
}
