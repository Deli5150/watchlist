import { Ionicons } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { memo, useMemo } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { dateOfTime, timeOnDate } from '../lib/dates'
import { useAsync, useLocalSeasons } from '../lib/hooks'
import { useWide } from '../lib/layout'
import { itemId, setSkippedSeason, useShow } from '../lib/library'
import { daysUntil, epKey, formatDate, hasAired, watchIndex, type Ep } from '../lib/progress'
import { useStore } from '../lib/store'
import { img, season as fetchSeason, seasons as fetchSeasons, type EpisodeRef, type SeasonDetails, type ShowBasics } from '../lib/tmdb'
import type { LibraryItem, Watch } from '../lib/types'
import type { RootParams } from '../nav'
import { unwatchEpisode, watchEpisode, watchSeason } from '../ui/actions'
import { Header, Page } from '../ui/kit'
import { Poster, ProgressBar } from '../ui/media'
import { pickDate, showMenu } from '../ui/overlays'
import { colors, display } from '../ui/theme'
import { Image } from 'expo-image'
import { ErrorNote } from './Discover'

// A show's seasons on its page's Progress tab: the season's status, moving between seasons, and
// every episode with its watched check. And the Scorecard screen.

const short = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`
}

/** The Progress tab for one season of a show. */
export function SeasonPanel({ show, item, seasonNumber, onSeason, next }: { show: ShowBasics; item: LibraryItem | undefined; seasonNumber: number; onSeason: (n: number) => void; next: Ep | null }) {
  const n = seasonNumber
  const res = useAsync(() => fetchSeason(show.id, n), [show.id, n])
  const one = useMemo(() => (res.data ? [res.data] : undefined), [res.data])
  const s = useLocalSeasons(show.id, one)?.[0]
  const watched = useStore((s) => watchIndex(s.watches).episodes.get(itemId('tv', show.id)))
  const numbers = useMemo(() => [...show.seasons].map((x) => x.season_number).sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b)), [show.seasons])
  const at = numbers.indexOf(n)
  const aired = useMemo(() => (s ? s.episodes.filter((e) => hasAired(show, n, e.episode_number)) : []), [s, show, n])
  const count = aired.filter((e) => watched?.has(epKey(n, e.episode_number))).length
  const skipped = item?.skippedSeasons.includes(n) ?? false
  const state = skipped ? 'Skipped' : !aired.length ? 'Not Aired' : count === aired.length ? 'Watched' : count ? 'In Progress' : 'Not Started'
  const stateIcon = skipped ? 'play-skip-forward' : state === 'Watched' ? 'checkmark-circle' : state === 'In Progress' ? 'contrast' : 'ellipse-outline'
  const meta = show.seasons.find((x) => x.season_number === n)

  const statusMenu = () =>
    showMenu(s?.name ?? `Season ${n}`, [
      ...(aired.length
        ? [
            { label: 'Watch', sub: 'Mark every aired episode watched', onPress: () => watchSeason(show, n, aired.filter((e) => !watched?.has(epKey(n, e.episode_number))), true) },
            ...(count ? [{ label: 'Unwatch', sub: 'Mark the season unwatched', onPress: () => watchSeason(show, n, aired, false) }] : [])
          ]
        : []),
      ...(n > 0 ? [{ label: skipped ? `Don’t skip ${s?.name ?? `Season ${n}`}` : `Skip ${s?.name ?? `Season ${n}`}`, sub: 'Skipped seasons don’t count toward progress', onPress: () => setSkippedSeason(show, n, !skipped) }] : [])
    ])

  const pickSeason = () =>
    showMenu(
      'Season',
      numbers.map((x) => ({ label: show.seasons.find((y) => y.season_number === x)?.name ?? `Season ${x}`, selected: x === n, onPress: () => onSeason(x) }))
    )

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
        <Poster path={meta?.poster_path ?? show.poster_path} width={48} radius={6} />
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={display(26)}>{s?.name ?? meta?.name ?? `Season ${n}`}</Text>
          <Text style={{ color: colors.dim, fontSize: 15 }}>{`${meta?.episode_count ?? s?.episodes.length ?? 0} Episodes`}</Text>
        </View>
        <Pressable onPress={statusMenu} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 })}>
          <Ionicons name={stateIcon} size={16} color={state === 'Watched' ? colors.success : colors.text} />
          <Text style={[display(17), { marginLeft: 7 }]}>{state}</Text>
          <Ionicons name="chevron-expand" size={14} color={colors.dim} style={{ marginLeft: 4 }} />
        </Pressable>
      </View>
      {aired.length > 0 && <ProgressBar value={count / aired.length} height={8} style={{ marginBottom: 16 }} />}

      {numbers.length > 1 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <NavDot icon="play-back" label="First season" disabled={at <= 0} onPress={() => onSeason(numbers[0])} />
          <NavDot icon="chevron-back" label="Previous season" disabled={at <= 0} onPress={() => onSeason(numbers[at - 1])} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Pressable onPress={pickSeason} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', height: 38, paddingHorizontal: 16, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 })}>
              <Text style={display(18)}>{meta?.name ?? `Season ${n}`}</Text>
              <Ionicons name="chevron-expand" size={14} color={colors.dim} style={{ marginLeft: 6 }} />
            </Pressable>
          </View>
          <NavDot icon="chevron-forward" label="Next season" disabled={at >= numbers.length - 1} onPress={() => onSeason(numbers[at + 1])} />
          <NavDot icon="play-forward" label="Last season" disabled={at >= numbers.length - 1} onPress={() => onSeason(numbers[numbers.length - 1])} />
        </View>
      )}

      {skipped && <Text style={{ color: colors.faint, fontSize: 13, marginBottom: 12 }}>This season is skipped: it doesn’t count toward your progress or Up Next.</Text>}
      {!s && res.loading && <ActivityIndicator color={colors.accentHi} style={{ marginTop: 20 }} />}
      {!s && res.error && <ErrorNote message={res.error} onRetry={res.reload} />}
      {s?.episodes.map((e) => (
        <EpisodeCard key={e.id} show={show} e={e} watch={watched?.get(epKey(n, e.episode_number))} isNext={next?.season === n && next.episode === e.episode_number} />
      ))}
    </View>
  )
}

function NavDot({ icon, label, onPress, disabled }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityLabel={label} onPress={onPress} disabled={disabled} hitSlop={6} style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, marginHorizontal: 4, backgroundColor: disabled ? 'rgba(255,255,255,0.08)' : '#fff', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Ionicons name={icon} size={17} color={disabled ? colors.faint : '#111'} />
    </Pressable>
  )
}

/** One episode: its still, "EPISODE 3 · 24 MIN", the title, when you watched it (or when it airs) and the check. */
export const EpisodeCard = memo(function EpisodeCard({ show, e, watch, isNext, compact }: { show: ShowBasics; e: EpisodeRef; watch: Watch | undefined; isNext?: boolean; compact?: boolean }) {
  const wide = useWide()
  const aired = hasAired(show, e.season_number, e.episode_number)
  const ep = { season: e.season_number, episode: e.episode_number }
  const still = img(e.still_path, 'w300')
  const toggle = () => {
    if (!watch) return watchEpisode(show, ep, e.runtime)
    showMenu(`Episode ${e.episode_number} · ${e.name}`, [
      { label: 'Change watch date', sub: `Watched ${formatDate(dateOfTime(watch.at), true)}`, onPress: () => pickDate(dateOfTime(watch.at), (d) => useStore.getState().setWatchTime(watch.id, timeOnDate(d, new Date(watch.at))), 'Watched on') },
      { label: 'Mark unwatched', destructive: true, onPress: () => unwatchEpisode(show, ep) }
    ])
  }
  const when = watch ? `✓ Watched ${short(watch.at)}` : e.air_date ? (aired ? `Aired ${formatDate(e.air_date, true)}` : daysUntil(e.air_date) <= 0 ? 'Airing today' : `Airs ${formatDate(e.air_date, true)}`) : 'Air date to be announced'
  const h = compact ? 74 : wide ? 104 : 92
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: h, backgroundColor: watch ? colors.cardHi : colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 8, opacity: !aired ? 0.75 : 1 }}>
      <View style={{ width: h * 1.4, height: '100%', backgroundColor: 'rgba(255,255,255,0.05)' }}>
        {still && <Image source={{ uri: still }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} />}
      </View>
      <View style={{ flex: 1, paddingHorizontal: 14 }}>
        <Text style={{ color: isNext ? colors.accentHi : colors.dim, fontSize: 12, fontWeight: '800', letterSpacing: 0.6 }}>
          {`EPISODE ${e.episode_number.toLocaleString()}${e.runtime ? `  •  ${e.runtime} MIN` : ''}`}
          {e.vote_average > 0 && !compact ? <Text style={{ color: colors.faint }}>{`  •  ★ ${e.vote_average.toFixed(1)}`}</Text> : null}
        </Text>
        <Text style={[display(compact ? 17 : 19), { marginTop: 1 }]} numberOfLines={1}>
          {e.name}
        </Text>
        {!compact && (
          <Text style={{ color: colors.dim, fontSize: 13.5, marginTop: 2 }} numberOfLines={1}>
            {when}
          </Text>
        )}
      </View>
      <View style={{ paddingRight: 14 }}>
        {aired ? (
          <Pressable
            accessibilityLabel={watch ? 'Watched' : 'Mark watched'}
            onPress={toggle}
            hitSlop={8}
            style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: watch ? 'rgba(255,255,255,0.28)' : 'transparent', borderWidth: 2, borderColor: watch ? 'transparent' : 'rgba(255,255,255,0.85)', opacity: pressed ? 0.7 : 1 })}
          >
            {watch && <Ionicons name="checkmark" size={22} color="#fff" />}
          </Pressable>
        ) : (
          <Ionicons name="time-outline" size={22} color={colors.dim} />
        )}
      </View>
    </View>
  )
})

// ── Scorecard ───────────────────────────────────────────────────────────────────────────────────

const scoreColor = (v: number): string => (v >= 9 ? '#1f9d55' : v >= 8 ? '#38c172' : v >= 7.5 ? '#9ccc3d' : v >= 7 ? '#e3c13a' : v >= 6 ? '#f08a3e' : '#e5484d')

/** Every episode's TMDB rating as a grid: a column per season. */
export function Scorecard({ route, navigation }: NativeStackScreenProps<RootParams, 'Scorecard'>) {
  const { id } = route.params
  const show = useShow(id)
  const numbers = useMemo(() => (show ? show.seasons.filter((s) => s.season_number > 0 && s.episode_count > 0).map((s) => s.season_number) : []), [show])
  const res = useAsync<SeasonDetails[]>(() => (numbers.length ? fetchSeasons(id, numbers) : Promise.resolve([])), [id, numbers.join()])
  const list = res.data ?? []
  const rows = Math.max(0, ...list.map((s) => s.episodes.length))
  const avg = (s: SeasonDetails) => {
    const rated = s.episodes.filter((e) => e.vote_average > 0)
    return rated.length ? rated.reduce((a, e) => a + e.vote_average, 0) / rated.length : 0
  }
  const best = list.flatMap((s) => s.episodes).sort((a, b) => b.vote_average - a.vote_average)[0]
  const CELL = 46
  return (
    <Page wide header={<Header title={show ? `${show.name} · Scorecard` : 'Scorecard'} />}>
      {res.loading && !res.data && <ActivityIndicator color={colors.accentHi} style={{ marginTop: 40 }} />}
      {res.error && !res.data && <ErrorNote message={res.error} onRetry={res.reload} />}
      {best && (
        <Text style={{ color: colors.dim, fontSize: 14, marginBottom: 16 }}>
          {`Highest rated: S${best.season_number} · E${best.episode_number} “${best.name}” (${best.vote_average.toFixed(1)})`}
        </Text>
      )}
      {list.length > 0 && (
        <View style={{ flexDirection: 'row' }}>
          <View style={{ marginRight: 6 }}>
            <View style={{ height: CELL + 18 }} />
            {Array.from({ length: rows }, (_, i) => (
              <View key={i} style={{ height: CELL, justifyContent: 'center' }}>
                <Text style={{ color: colors.dim, fontSize: 12, fontWeight: '600', width: 34 }}>{`E${i + 1}`}</Text>
              </View>
            ))}
          </View>
          <ScrollView horizontal style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row' }}>
              {list.map((s) => (
                <Pressable key={s.id} onPress={() => navigation.push('Title', { type: 'tv', id, tab: 'progress', season: s.season_number })} style={{ width: CELL, marginRight: 4 }}>
                  <View style={{ height: CELL + 18, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 6 }}>
                    <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{`S${s.season_number}`}</Text>
                    <Text style={{ color: colors.dim, fontSize: 11, marginTop: 2 }}>{avg(s) ? avg(s).toFixed(1) : '–'}</Text>
                  </View>
                  {s.episodes.map((e) => (
                    <View key={e.id} style={{ height: CELL - 4, marginBottom: 4, borderRadius: 8, backgroundColor: e.vote_average ? scoreColor(e.vote_average) : 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: e.vote_average ? '#fff' : colors.faint, fontWeight: '800', fontSize: 13 }}>{e.vote_average ? e.vote_average.toFixed(1) : '–'}</Text>
                    </View>
                  ))}
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
      {res.data && !rows && <Text style={{ color: colors.dim, marginTop: 20 }}>No episode ratings yet.</Text>}
      <Text style={{ color: colors.faint, fontSize: 12, marginTop: 18 }}>Ratings are TMDB users’ scores out of 10.</Text>
    </Page>
  )
}
