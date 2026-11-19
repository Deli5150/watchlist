import { Ionicons } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { memo, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { dateOfTime, timeOnDate } from '../lib/dates'
import { useAsync } from '../lib/hooks'
import { useWide } from '../lib/layout'
import { itemId, setSkippedSeason, useShow } from '../lib/library'
import { daysUntil, duration, epKey, formatDate, hasAired, watchIndex } from '../lib/progress'
import { useStore } from '../lib/store'
import { season as fetchSeason, seasons as fetchSeasons, type EpisodeRef, type SeasonDetails, type ShowBasics } from '../lib/tmdb'
import type { Watch } from '../lib/types'
import type { RootParams } from '../nav'
import { unwatchEpisode, watchEpisode, watchSeason } from '../ui/actions'
import { Header, Page, Toggle } from '../ui/kit'
import { Poster, ProgressBar, Still } from '../ui/media'
import { pickDate, showMenu } from '../ui/overlays'
import { colors } from '../ui/theme'
import { ErrorNote } from './Discover'

// One season: its episodes, each with a watched check, and the whole season at once.

export default function Season({ route }: NativeStackScreenProps<RootParams, 'Season'>) {
  const { id, season: n } = route.params
  const show = useShow(id)
  const res = useAsync(() => fetchSeason(id, n), [id, n])
  const item = useStore((s) => s.items.find((i) => i.id === itemId('tv', id)))
  const watched = useStore((s) => watchIndex(s.watches).episodes.get(itemId('tv', id)))
  const s = res.data
  const aired = useMemo(() => (s && show ? s.episodes.filter((e) => hasAired(show, n, e.episode_number)) : []), [s, show, n])
  const count = aired.filter((e) => watched?.has(epKey(n, e.episode_number))).length
  const all = aired.length > 0 && count === aired.length
  const skipped = item?.skippedSeasons.includes(n) ?? false

  return (
    <Page header={<Header title={show?.name ?? ''} />}>
      {!s && res.loading && <ActivityIndicator color={colors.accentHi} style={{ marginTop: 40 }} />}
      {!s && res.error && <ErrorNote message={res.error} onRetry={res.reload} />}
      {s && show && (
        <>
          <View style={{ flexDirection: 'row', marginBottom: 18 }}>
            <Poster path={s.poster_path ?? show.poster_path} width={96} />
            <View style={{ flex: 1, marginLeft: 16, justifyContent: 'center' }}>
              <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800' }}>{s.name}</Text>
              <Text style={{ color: colors.dim, fontSize: 14, marginTop: 4 }}>{[s.air_date?.slice(0, 4), `${s.episodes.length} episodes`].filter(Boolean).join(' · ')}</Text>
              {aired.length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                  <ProgressBar value={count / aired.length} style={{ flex: 1 }} />
                  <Text style={{ color: colors.dim, fontSize: 12, marginLeft: 8 }}>{`${count}/${aired.length}`}</Text>
                </View>
              )}
            </View>
          </View>
          {s.overview ? <Text style={{ color: colors.text, opacity: 0.85, fontSize: 14, lineHeight: 21, marginBottom: 16 }}>{s.overview}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14, alignItems: 'center' }}>
            {aired.length > 0 && (
              <Pressable
                onPress={() => watchSeason(show, n, all ? aired : aired.filter((e) => !watched?.has(epKey(n, e.episode_number))), !all)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: all ? 'rgba(255,255,255,0.1)' : colors.accent, opacity: pressed ? 0.8 : 1 })}
              >
                <Ionicons name={all ? 'close-circle-outline' : 'checkmark-done'} size={18} color={all ? colors.text : colors.onAccent} />
                <Text style={{ color: all ? colors.text : colors.onAccent, fontWeight: '700', marginLeft: 6 }}>{all ? 'Mark unwatched' : 'Mark season watched'}</Text>
              </Pressable>
            )}
            {n > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' }}>
                <Text style={{ color: colors.dim, fontSize: 14, marginRight: 8 }}>Skip season</Text>
                <Toggle value={skipped} onChange={(v) => setSkippedSeason(show, n, v)} />
              </View>
            )}
          </View>
          {skipped && <Text style={{ color: colors.faint, fontSize: 13, marginBottom: 12 }}>Skipped seasons don’t count toward your progress or Up Next.</Text>}
          {s.episodes.map((e) => (
            <EpisodeRow key={e.id} show={show} e={e} watch={watched?.get(epKey(n, e.episode_number))} />
          ))}
        </>
      )}
    </Page>
  )
}

const EpisodeRow = memo(function EpisodeRow({ show, e, watch }: { show: ShowBasics; e: EpisodeRef; watch: Watch | undefined }) {
  const [open, setOpen] = useState(false)
  const wide = useWide()
  const aired = hasAired(show, e.season_number, e.episode_number)
  const ep = { season: e.season_number, episode: e.episode_number }
  const toggle = () => {
    if (!watch) return watchEpisode(show, ep, e.runtime)
    showMenu(`E${e.episode_number} · ${e.name}`, [
      {
        label: 'Change watch date',
        sub: `Watched ${formatDate(dateOfTime(watch.at), true)}`,
        onPress: () => pickDate(dateOfTime(watch.at), (d) => useStore.getState().setWatchTime(watch.id, timeOnDate(d, new Date(watch.at))), 'Watched on')
      },
      { label: 'Mark unwatched', destructive: true, onPress: () => unwatchEpisode(show, ep) }
    ])
  }
  return (
    <Pressable onPress={() => setOpen(!open)} style={{ flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.separator }}>
      <Still path={e.still_path} size="w300" style={{ width: wide ? 170 : 120, borderRadius: 9 }} />
      <View style={{ flex: 1, marginLeft: 14 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }} numberOfLines={2}>{`${e.episode_number}. ${e.name}`}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 10 }}>
          <Text style={{ color: colors.dim, fontSize: 12.5 }}>{[e.air_date ? formatDate(e.air_date, true) : 'TBA', e.runtime ? duration(e.runtime) : ''].filter(Boolean).join(' · ')}</Text>
          {e.vote_average > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="star" size={11} color="#f5c518" />
              <Text style={{ color: colors.dim, fontSize: 12.5, marginLeft: 3 }}>{e.vote_average.toFixed(1)}</Text>
            </View>
          )}
        </View>
        {e.overview ? (
          <Text style={{ color: colors.dim, fontSize: 13, lineHeight: 19, marginTop: 6 }} numberOfLines={open ? undefined : 2}>
            {e.overview}
          </Text>
        ) : null}
      </View>
      <View style={{ marginLeft: 10, justifyContent: 'center' }}>
        {aired ? (
          <Pressable
            accessibilityLabel={watch ? 'Watched' : 'Mark watched'}
            onPress={toggle}
            hitSlop={8}
            style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: watch ? colors.accent : 'transparent', borderWidth: 2, borderColor: watch ? colors.accent : 'rgba(255,255,255,0.25)', opacity: pressed ? 0.7 : 1 })}
          >
            <Ionicons name="checkmark" size={20} color={watch ? colors.onAccent : 'rgba(255,255,255,0.35)'} />
          </Pressable>
        ) : (
          <Text style={{ color: colors.accentHi, fontSize: 12, fontWeight: '600', width: 64, textAlign: 'center' }}>{e.air_date ? (daysUntil(e.air_date) <= 0 ? 'Airing' : `In ${daysUntil(e.air_date)}d`) : 'TBA'}</Text>
        )}
      </View>
    </Pressable>
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
                <Pressable key={s.id} onPress={() => navigation.push('Season', { id, season: s.season_number })} style={{ width: CELL, marginRight: 4 }}>
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
