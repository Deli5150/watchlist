import { Ionicons } from '@expo/vector-icons'
import { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'
import { addDays, addMonths, MONTH_NAMES, today, toDate } from '../lib/dates'
import { useAsync } from '../lib/hooks'
import { useWide } from '../lib/layout'
import { useShows } from '../lib/library'
import { daysUntil, epKey, watchIndex } from '../lib/progress'
import { useStore } from '../lib/store'
import { upcomingEpisodes, upcomingMovies, type UpcomingEpisode, type UpcomingMovie } from '../lib/upcoming'
import type { EpisodeRef } from '../lib/tmdb'
import type { Settings } from '../lib/types'
import { EmptyNote, Page, Pill, Segmented } from '../ui/kit'
import { Poster, useOpenTitle } from '../ui/media'
import { PressableScale } from '../ui/motion'
import { colors } from '../ui/theme'

// Calendar: new episodes of the shows you follow and your movies' release dates, as a list of
// what's coming, a week at a time, or a month at a time.

type View_ = Settings['calendarView']

/** One calendar entry: a movie, or one or more episodes of a show on the same day. */
type Release = UpcomingMovie | (UpcomingEpisode & { episodes: EpisodeRef[] })

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const weekStart = (d: string): string => addDays(d, -toDate(d).getDay())
const monthStart = (d: string): string => `${d.slice(0, 8)}01`
const short = (d: string): string => `${MONTHS[toDate(d).getMonth()]} ${toDate(d).getDate()}`

function dayTitle(date: string): string {
  const n = daysUntil(date)
  const d = toDate(date)
  const name = `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`
  return n === 0 ? `Today · ${name}` : n === 1 ? `Tomorrow · ${name}` : n === -1 ? `Yesterday · ${name}` : name
}

/** The dates a view covers: the list's next four months, one week, or the 6 weeks around a month. */
function rangeOf(view: View_, anchor: string): { from: string; until: string } {
  if (view === 'week') {
    const from = weekStart(anchor)
    return { from, until: addDays(from, 6) }
  }
  if (view === 'month') {
    const from = weekStart(monthStart(anchor))
    return { from, until: addDays(from, 41) }
  }
  return { from: addDays(today(), -7), until: addDays(today(), 120) }
}

export default function Calendar() {
  const { items, watches, view, setSettings } = useStore(useShallow((s) => ({ items: s.items, watches: s.watches, view: s.settings.calendarView, setSettings: s.setSettings })))
  const shows = useShows()
  const [anchor, setAnchor] = useState(today())
  const [picked, setPicked] = useState<string | null>(null)
  const { from, until } = rangeOf(view, anchor)

  const key = items
    .filter((i) => i.status !== 'dropped')
    .map((i) => `${i.id}${i.type === 'tv' ? `@${shows[i.tmdbId]?.next_episode_to_air?.id ?? ''}` : ''}`)
    .join()
  const res = useAsync(async () => {
    const [eps, movies] = await Promise.all([upcomingEpisodes(items, shows, from, until), upcomingMovies(items, from, until)])
    return [...eps, ...movies].sort((a, b) => a.date.localeCompare(b.date))
  }, [key, from, until])

  // A show's episodes on the same day (a season dropping at once) become one entry.
  const byDate = useMemo(() => {
    const map = new Map<string, Release[]>()
    for (const u of res.data ?? []) {
      const day = map.get(u.date) ?? []
      const prev = day[day.length - 1]
      if (u.kind === 'episode' && prev?.kind === 'episode' && prev.item.id === u.item.id && prev.episode.season_number === u.episode.season_number) prev.episodes.push(u.episode)
      else day.push(u.kind === 'episode' ? { ...u, episodes: [u.episode] } : u)
      map.set(u.date, day)
    }
    return map
  }, [res.data])

  const idx = watchIndex(watches)
  const watched = (u: Release) => u.kind === 'episode' && u.episodes.every((e) => idx.episodes.get(u.item.id)?.has(epKey(e.season_number, e.episode_number)))

  const step = (n: number) => {
    setPicked(null)
    setAnchor(view === 'week' ? addDays(anchor, 7 * n) : addMonths(monthStart(anchor), n, 1))
  }
  const title =
    view === 'week'
      ? `${short(from)} – ${short(until)}${from.slice(0, 4) !== until.slice(0, 4) || from.slice(0, 4) !== today().slice(0, 4) ? `, ${until.slice(0, 4)}` : ''}`
      : `${MONTH_NAMES[toDate(anchor).getMonth()]} ${anchor.slice(0, 4)}`
  const showsToday = today() >= from && today() <= until

  return (
    <Page wide={view !== 'list'} bottomSpace={110}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 34, marginBottom: 16 }}>
        <Text style={{ color: colors.text, fontSize: 34, fontWeight: '800', flex: 1 }}>Calendar</Text>
        <View style={{ width: 260 }}>
          <Segmented<View_>
            value={view}
            onChange={(calendarView) => {
              setSettings({ calendarView })
              setAnchor(today())
              setPicked(null)
            }}
            options={[
              { label: 'List', value: 'list' },
              { label: 'Week', value: 'week' },
              { label: 'Month', value: 'month' }
            ]}
          />
        </View>
      </View>

      {view !== 'list' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <Pressable accessibilityLabel={view === 'week' ? 'Previous week' : 'Previous month'} onPress={() => step(-1)} hitSlop={8} style={arrow}>
            <Ionicons name="chevron-back" size={18} color={colors.text} />
          </Pressable>
          <Pressable accessibilityLabel={view === 'week' ? 'Next week' : 'Next month'} onPress={() => step(1)} hitSlop={8} style={[arrow, { marginLeft: 8 }]}>
            <Ionicons name="chevron-forward" size={18} color={colors.text} />
          </Pressable>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', marginLeft: 14, flex: 1 }}>{title}</Text>
          {res.loading && <ActivityIndicator color={colors.accentHi} style={{ marginRight: 12 }} />}
          {!showsToday && (
            <Pill
              label="Today"
              onPress={() => {
                setAnchor(today())
                setPicked(null)
              }}
            />
          )}
        </View>
      )}

      {view === 'list' && <ListView loading={res.loading && !res.data} byDate={byDate} empty={!items.length} watched={watched} />}
      {view === 'week' && <WeekView from={from} byDate={byDate} watched={watched} />}
      {view === 'month' && <MonthView from={from} anchor={anchor} byDate={byDate} watched={watched} picked={picked} onPick={setPicked} />}
    </Page>
  )
}

const arrow = { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' } as const

interface ViewProps {
  byDate: Map<string, Release[]>
  watched: (u: Release) => boolean
}

// ── List ────────────────────────────────────────────────────────────────────────────────────────

function ListView({ byDate, watched, loading, empty }: ViewProps & { loading: boolean; empty: boolean }) {
  const now = today()
  const days = [...byDate.entries()]
  const past = days.filter(([d]) => d < now)
  const coming = days.filter(([d]) => d >= now)
  if (loading) return <ActivityIndicator color={colors.accentHi} style={{ marginTop: 30 }} />
  if (!days.length) return <EmptyNote>{empty ? 'Add shows to see when their new episodes air.' : 'Nothing coming up for the shows and movies in your library.'}</EmptyNote>
  return (
    <>
      {coming.map(([date, list]) => (
        <Day key={date} date={date} list={list} watched={watched} />
      ))}
      {past.length > 0 && (
        <>
          <Text style={{ color: colors.dim, fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginTop: 10, marginBottom: 12 }}>LAST 7 DAYS</Text>
          {[...past].reverse().map(([date, list]) => (
            <Day key={date} date={date} list={list} watched={watched} />
          ))}
        </>
      )}
    </>
  )
}

/** One day's releases as rows. */
function Day({ date, list, watched }: { date: string; list: Release[]; watched: (u: Release) => boolean }) {
  const isToday = date === today()
  return (
    <View style={{ marginBottom: 22 }}>
      <Text style={{ color: isToday ? colors.accentHi : colors.text, fontSize: 16, fontWeight: '700', marginBottom: 10 }}>{dayTitle(date)}</Text>
      {list.length ? (
        <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
          {list.map((u, i) => (
            <ReleaseRow key={keyOf(u)} u={u} first={i === 0} watched={watched(u)} />
          ))}
        </View>
      ) : (
        <Text style={{ color: colors.faint, fontSize: 14 }}>Nothing this day.</Text>
      )}
    </View>
  )
}

const keyOf = (u: Release): string => (u.kind === 'episode' ? `${u.item.id}-${u.episode.id}` : u.item.id)
/** "S3 · E5", or "S3 · E5–E8" for several. */
function epRange(u: Release): string {
  if (u.kind !== 'episode') return 'Movie'
  const first = u.episodes[0]
  const last = u.episodes[u.episodes.length - 1]
  return `S${first.season_number} · E${first.episode_number}${last !== first ? `–${last.episode_number}` : ''}`
}
const label = (u: Release): string =>
  u.kind === 'episode' ? `${epRange(u)}${u.episodes.length === 1 && u.episode.name ? ` · ${u.episode.name}` : u.episodes.length > 1 ? ` · ${u.episodes.length} episodes` : ''}` : 'Movie release'


function ReleaseRow({ u, first, watched }: { u: Release; first: boolean; watched: boolean }) {
  const open = useOpenTitle()
  return (
    <PressableScale onPress={() => open(u.item.type, u.item.tmdbId)} style={{ flexDirection: 'row', alignItems: 'center', padding: 10, borderTopWidth: first ? 0 : 1, borderColor: colors.separator }}>
      <Poster path={u.item.poster} width={40} radius={6} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
          {u.item.title}
        </Text>
        <Text style={{ color: colors.dim, fontSize: 13, marginTop: 2 }} numberOfLines={1}>
          {label(u)}
        </Text>
      </View>
      {watched && <Ionicons name="checkmark-circle" size={20} color={colors.success} />}
    </PressableScale>
  )
}

// ── Week ────────────────────────────────────────────────────────────────────────────────────────

function WeekView({ from, byDate, watched }: ViewProps & { from: string }) {
  const wide = useWide()
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))
  // Phones: the days one under another.
  if (!wide) return <>{days.map((d) => <Day key={d} date={d} list={byDate.get(d) ?? []} watched={watched} />)}</>
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {days.map((d) => {
        const isToday = d === today()
        const list = byDate.get(d) ?? []
        return (
          <View key={d} style={{ flex: 1, minHeight: 320, backgroundColor: isToday ? colors.accentSoft : colors.card, borderRadius: 14, borderWidth: 1, borderColor: isToday ? colors.accent : colors.border, padding: 8 }}>
            <Text style={{ color: isToday ? colors.accentHi : colors.dim, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>{DAYS[toDate(d).getDay()].slice(0, 3)}</Text>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: 10 }}>{toDate(d).getDate()}</Text>
            <View style={{ gap: 12 }}>
              {list.map((u) => (
                <WeekCard key={keyOf(u)} u={u} watched={watched(u)} />
              ))}
            </View>
          </View>
        )
      })}
    </View>
  )
}

function WeekCard({ u, watched }: { u: Release; watched: boolean }) {
  const open = useOpenTitle()
  return (
    <PressableScale onPress={() => open(u.item.type, u.item.tmdbId)}>
      <View>
        <Poster path={u.item.poster} title={u.item.title} width="100%" radius={8} />
        {watched && (
          <View style={{ position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark" size={12} color="#06210f" />
          </View>
        )}
      </View>
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600', marginTop: 5 }} numberOfLines={2}>
        {u.item.title}
      </Text>
      <Text style={{ color: colors.dim, fontSize: 11, marginTop: 1 }} numberOfLines={1}>
        {epRange(u)}
      </Text>
    </PressableScale>
  )
}

// ── Month ───────────────────────────────────────────────────────────────────────────────────────

function MonthView({ from, anchor, byDate, watched, picked, onPick }: ViewProps & { from: string; anchor: string; picked: string | null; onPick: (d: string) => void }) {
  const wide = useWide()
  // Exactly seven columns, 6px apart.
  const [gridW, setGridW] = useState(0)
  const cell = gridW ? Math.floor((gridW - 6 * 6) / 7) : 0
  const month = anchor.slice(0, 7)
  // Weeks of the grid; a sixth row only when the month needs it.
  const days = Array.from({ length: 42 }, (_, i) => addDays(from, i))
  const rows = days[35].slice(0, 7) === month ? 6 : 5
  const selected = picked ?? (today().slice(0, 7) === month ? today() : null)
  const thumbs = wide ? 3 : 0
  return (
    <>
      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
        {DAYS.map((d) => (
          <Text key={d} style={{ flex: 1, textAlign: 'center', color: colors.dim, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>
            {wide ? d.slice(0, 3) : d.slice(0, 1)}
          </Text>
        ))}
      </View>
      <View onLayout={(e) => setGridW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 22 }}>
        {cell > 0 &&
          days.slice(0, rows * 7).map((d) => {
            const list = byDate.get(d) ?? []
            const inMonth = d.slice(0, 7) === month
            const isToday = d === today()
            const on = d === selected
            return (
              <Pressable
                key={d}
                accessibilityLabel={`${dayTitle(d)}: ${list.length} ${list.length === 1 ? 'release' : 'releases'}`}
                onPress={() => onPick(d)}
                style={(state) => ({
                  width: cell,
                  height: wide ? 118 : 58,
                  borderRadius: 10,
                  padding: 6,
                  backgroundColor: on ? colors.accentSoft : (state as { hovered?: boolean }).hovered ? colors.cardHi : colors.card,
                  borderWidth: 1,
                  borderColor: on ? colors.accent : colors.border,
                  opacity: inMonth ? 1 : 0.4
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: isToday ? colors.accent : 'transparent' }}>
                    <Text style={{ color: isToday ? colors.onAccent : colors.text, fontSize: 12, fontWeight: '700' }}>{toDate(d).getDate()}</Text>
                  </View>
                  {list.length > thumbs && (
                    <Text style={{ color: colors.dim, fontSize: 11, fontWeight: '600', marginLeft: 'auto' }}>{thumbs ? `+${list.length - thumbs}` : list.length}</Text>
                  )}
                </View>
                {thumbs > 0 ? (
                  <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
                    {list.slice(0, thumbs).map((u) => (
                      <View key={keyOf(u)} style={{ opacity: watched(u) ? 0.45 : 1 }}>
                        <Poster path={u.item.poster} width={Math.min(52, (cell - 20) / thumbs)} radius={4} />
                      </View>
                    ))}
                  </View>
                ) : (
                  list.length > 0 && (
                    <View style={{ flexDirection: 'row', gap: 3, marginTop: 6, justifyContent: 'center' }}>
                      {list.slice(0, 4).map((u) => (
                        <View key={keyOf(u)} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: watched(u) ? colors.success : colors.accent }} />
                      ))}
                    </View>
                  )
                )}
              </Pressable>
            )
          })}
      </View>
      {selected && <Day date={selected} list={byDate.get(selected) ?? []} watched={watched} />}
      {!selected && <Text style={{ color: colors.faint, fontSize: 14 }}>Pick a day to see what comes out.</Text>}
    </>
  )
}
