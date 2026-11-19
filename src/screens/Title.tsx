import { Ionicons } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Share, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { dateOfTime } from '../lib/dates'
import { useAsync, useSeason } from '../lib/hooks'
import { useWide } from '../lib/layout'
import { ensureShow, itemId, MOVIE_STATUS_LABEL, refreshItemFields, STATUS_LABEL, useShow } from '../lib/library'
import { duration, epLabel, formatDate, showProgress, watchIndex } from '../lib/progress'
import { useStore } from '../lib/store'
import {
  currentRegion,
  img,
  movieDetails,
  showDetails,
  trailerOf,
  yearOf,
  type CastMember,
  type CrewMember,
  type MovieDetails,
  type Providers,
  type ShowBasics,
  type ShowDetails,
  type Video
} from '../lib/tmdb'
import type { LibraryItem, MediaType } from '../lib/types'
import { useRootNav, type RootParams } from '../nav'
import { chooseStatus, unwatchMovie, watchEpisode, watchMovie } from '../ui/actions'
import { CircleButton, Column, Segmented } from '../ui/kit'
import { CardRow, Carousel, Poster, ProgressBar, SectionHeader, Stars } from '../ui/media'
import { PressableScale } from '../ui/motion'
import { closeSheet, showMenu, showSheet } from '../ui/overlays'
import { colors, display } from '../ui/theme'
import { playableVideos, playTrailer, youtubeThumb } from '../ui/Trailer'
import { ErrorNote } from './Discover'
import { SeasonPanel } from './Season'
import { openUrl } from './Settings'

// A show's or movie's page: the banner with the cover art, title and rating, then Details (your status,
// where to watch, scorecard, videos, genres and info), Progress (seasons and episodes) and Cast & Crew.

type Details = ShowDetails | MovieDetails
type Tab = 'details' | 'progress' | 'cast'
type IconName = React.ComponentProps<typeof Ionicons>['name']

export default function Title({ route, navigation }: NativeStackScreenProps<RootParams, 'Title'>) {
  const { type, id } = route.params
  const res = useAsync<Details>(() => (type === 'tv' ? showDetails(id) : movieDetails(id)), [type, id])
  const item = useStore((s) => s.items.find((i) => i.id === itemId(type, id)))
  const insets = useSafeAreaInsets()
  const [tab, setTab] = useState<Tab>(route.params.tab ?? 'details')
  const d = res.data

  // Keep the saved copy's name and pictures up to date, and the show's progress data fresh.
  useEffect(() => {
    if (d && item) refreshItemFields(item, d)
    if (d && type === 'tv') void ensureShow(id)
  }, [d?.id])

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        {d ? <Body type={type} d={d} item={item} tab={tab} setTab={setTab} startSeason={route.params.season} /> : <View style={{ height: 300 }} />}
        {!d && res.loading && <ActivityIndicator color={colors.accentHi} style={{ marginTop: 20 }} />}
        {!d && res.error && <ErrorNote message={res.error} onRetry={res.reload} />}
      </ScrollView>
      <View style={{ position: 'absolute', top: insets.top + 10, left: 16 }}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => navigation.goBack()} style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} />
      </View>
      {d && (
        <View style={{ position: 'absolute', top: insets.top + 10, right: 16 }}>
          <CircleButton icon="ellipsis-horizontal" label="More" onPress={() => moreMenu(type, d, item)} style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} />
        </View>
      )}
    </View>
  )
}

const titleOf = (d: Details): string => (d as ShowDetails).name ?? (d as MovieDetails).title ?? ''

function moreMenu(type: MediaType, d: Details, item: LibraryItem | undefined) {
  const title = titleOf(d)
  const imdb = type === 'tv' ? (d as ShowDetails).external_ids?.imdb_id : (d as MovieDetails).imdb_id
  showMenu(title, [
    { label: item ? 'Change status…' : 'Add to WatchList…', onPress: () => chooseStatus(type, d as ShowDetails & MovieDetails, title) },
    ...(item ? [{ label: item.favorite ? 'Remove from favorites' : 'Add to favorites', onPress: () => useStore.getState().updateItem(item.id, { favorite: !item.favorite }) }] : []),
    ...(item ? [{ label: item.rating ? `Your rating: ${item.rating}/10` : 'Rate…', onPress: () => rate(item, title) }] : []),
    { label: 'Share', onPress: () => void Share.share({ message: `${title} — https://www.themoviedb.org/${type}/${d.id}` }) },
    { label: 'Open on TMDB', onPress: () => openUrl(`https://www.themoviedb.org/${type}/${d.id}`) },
    ...(imdb ? [{ label: 'Open on IMDb', onPress: () => openUrl(`https://www.imdb.com/title/${imdb}/`) }] : [])
  ])
}

function Body({ type, d, item, tab, setTab, startSeason }: { type: MediaType; d: Details; item: LibraryItem | undefined; tab: Tab; setTab: (t: Tab) => void; startSeason?: number }) {
  const wide = useWide()
  const { width } = useWindowDimensions()
  const show = type === 'tv' ? (d as ShowDetails) : null
  const movie = type === 'movie' ? (d as MovieDetails) : null
  const title = titleOf(d)
  const heroH = wide ? Math.min(500, width * 0.4) : Math.min(340, width * 0.66)
  const posterW = wide ? 180 : 112
  const region = currentRegion()
  const cert = show ? (show.content_ratings?.results.find((r) => r.iso_3166_1 === region)?.rating ?? show.content_ratings?.results.find((r) => r.iso_3166_1 === 'US')?.rating) : movieCert(movie!, region)
  const meta = show
    ? [yearOf(show.first_air_date), `${show.number_of_seasons} ${show.number_of_seasons === 1 ? 'Season' : 'Seasons'}`, `${show.number_of_episodes} Episodes`, cert, show.networks[0]?.name]
    : [yearOf(movie!.release_date), movie!.runtime ? duration(movie!.runtime) : '', cert]
  const basics = useShow(show ? show.id : undefined)
  const watched = useStore((s) => (item && show ? watchIndex(s.watches).episodes.get(item.id) : undefined))
  const p = show ? showProgress(basics ?? show, item ?? { skippedSeasons: [] }, watched) : null

  return (
    <>
      {/* The banner, fading into the page, with the cover art at its bottom-left. */}
      <View style={{ height: heroH, backgroundColor: colors.cardHi }}>
        {d.backdrop_path && <Image source={{ uri: img(d.backdrop_path, 'w1280')! }} style={{ position: 'absolute', width: '100%', height: '100%' }} contentFit="cover" transition={200} />}
        <LinearGradient colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0)', colors.bg]} locations={[0, 0.4, 1]} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
      </View>
      <Column>
        <View style={{ flexDirection: 'row', marginTop: -posterW * 0.72, marginBottom: 22 }}>
          <Poster path={d.poster_path} title={title} width={posterW} radius={12} />
          <View style={{ flex: 1, marginLeft: wide ? 22 : 16, justifyContent: 'flex-end' }}>
            <Text style={display(wide ? 44 : 28)} numberOfLines={3}>
              {title}
            </Text>
            <Text style={{ color: colors.dim, fontSize: 15, marginTop: 4 }}>{meta.filter(Boolean).join('  •  ')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginTop: 10 }}>
              <Stars value={d.vote_average} size={16} />
              {item?.rating ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="person" size={13} color={colors.accentHi} />
                  <Text style={{ color: colors.accentHi, fontWeight: '700', marginLeft: 4 }}>{`${item.rating}/10`}</Text>
                </View>
              ) : null}
              <StatusBadge status={show ? show.status : movie!.status} />
            </View>
            {p && p.total > 0 && (
              <Pressable onPress={() => setTab('progress')} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                <ProgressBar value={p.watched / p.total} height={7} style={{ width: 150 }} />
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', marginLeft: 10 }}>{`${Math.round((p.watched / p.total) * 100)}% Complete`}</Text>
              </Pressable>
            )}
          </View>
        </View>
        <View style={{ marginBottom: 22, maxWidth: wide ? 520 : undefined, width: '100%' }}>
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[{ label: 'Details', value: 'details' }, ...(show ? [{ label: 'Progress', value: 'progress' as Tab }] : []), { label: 'Cast & Crew', value: 'cast' }]}
          />
        </View>
        {tab === 'details' && <DetailsTab type={type} d={d} item={item} title={title} />}
        {tab === 'progress' && show && <ProgressTab show={show} item={item} startSeason={startSeason} />}
        {tab === 'cast' && <CastTab type={type} d={d} />}
      </Column>
    </>
  )
}

// ── Details ─────────────────────────────────────────────────────────────────────────────────────

function DetailsTab({ type, d, item, title }: { type: MediaType; d: Details; item: LibraryItem | undefined; title: string }) {
  const show = type === 'tv' ? (d as ShowDetails) : null
  const movie = type === 'movie' ? (d as MovieDetails) : null
  const region = currentRegion()
  const basics = useShow(show ? show.id : undefined)
  const keywords = show ? (show.keywords?.results ?? []) : (movie?.keywords?.keywords ?? [])
  const imdb = show ? show.external_ids?.imdb_id : movie?.imdb_id

  return (
    <>
      <Actions type={type} d={d} item={item} title={title} />
      {show && <NextUpCard show={basics ?? show} item={item} />}

      {d.tagline ? <Text style={{ color: colors.dim, fontSize: 15, fontStyle: 'italic', marginBottom: 8 }}>{d.tagline}</Text> : null}
      {d.overview ? (
        <Section title="Overview">
          <Overview text={d.overview} />
        </Section>
      ) : null}
      <WhereToWatch providers={d['watch/providers']?.results[region]} />
      {show && <ScorecardCard show={basics ?? show} />}
      <Videos title={title} videos={d.videos?.results} />
      {d.genres.length > 0 && (
        <Section title="Genres">
          <Chips items={d.genres.map((g) => g.name)} tone="accent" />
        </Section>
      )}
      {keywords.length > 0 && (
        <Section title="Themes">
          <Chips items={keywords.slice(0, 14).map((k) => k.name)} tone="accent" />
        </Section>
      )}
      <Section title="Links">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {d.homepage ? <LinkChip icon="compass-outline" label="Official Website" url={d.homepage} /> : null}
          {imdb ? <LinkChip icon="link" label="IMDb" url={`https://www.imdb.com/title/${imdb}/`} /> : null}
          <LinkChip icon="link" label="TMDB" url={`https://www.themoviedb.org/${type}/${d.id}`} />
        </View>
      </Section>
      {show && show.networks.length > 0 && (
        <Section title={show.networks.length === 1 ? 'Network' : 'Networks'}>
          <Chips items={show.networks.map((n) => n.name)} />
        </Section>
      )}
      {(d.production_companies?.length ?? 0) > 0 && (
        <Section title="Studios">
          <Chips items={d.production_companies!.map((c) => c.name)} />
        </Section>
      )}
      {movie?.belongs_to_collection && <CollectionCard c={movie.belongs_to_collection} />}
      <Carousel title="More like this" items={(d.recommendations?.results ?? []).map((m) => ({ ...m, media_type: m.media_type ?? type }))} />
      <Info type={type} d={d} />
    </>
  )
}

function movieCert(movie: MovieDetails, region: string): string | undefined {
  const pick = (r: string) => movie.release_dates?.results.find((x) => x.iso_3166_1 === r)?.release_dates.find((x) => x.certification)?.certification
  return pick(region) ?? pick('US')
}

function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={{ marginBottom: 26 }}>
      <SectionHeader title={title} right={right} />
      {children}
    </View>
  )
}

const STATUS_ICON: Record<string, IconName> = {
  Ended: 'flag',
  Canceled: 'close-circle',
  'Returning Series': 'refresh',
  'In Production': 'videocam',
  Planned: 'calendar',
  Released: 'checkmark-circle',
  'Post Production': 'film',
  Rumored: 'help-circle'
}

/** "Ended", "Returning"… in an outlined pill. */
function StatusBadge({ status }: { status: string }) {
  if (!status) return null
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: colors.text, borderRadius: 10, paddingHorizontal: 10, height: 34 }}>
      <Ionicons name={STATUS_ICON[status] ?? 'information-circle'} size={15} color={colors.text} />
      <Text style={[display(17), { marginLeft: 6 }]}>{status === 'Returning Series' ? 'Returning' : status}</Text>
    </View>
  )
}

function Chips({ items, tone = 'plain' }: { items: string[]; tone?: 'plain' | 'accent' }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((t) => (
        <View
          key={t}
          style={{ height: 38, paddingHorizontal: 15, borderRadius: 19, justifyContent: 'center', backgroundColor: tone === 'accent' ? colors.accentSoft : 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: tone === 'accent' ? colors.accentDeep : colors.border }}
        >
          <Text style={display(17, tone === 'accent' ? colors.accentHi : colors.text)}>{t}</Text>
        </View>
      ))}
    </View>
  )
}

function LinkChip({ icon, label, url }: { icon: IconName; label: string; url: string }) {
  return (
    <Pressable onPress={() => openUrl(url)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', height: 38, paddingHorizontal: 15, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 })}>
      <Ionicons name={icon} size={16} color={colors.text} style={{ marginRight: 6 }} />
      <Text style={display(17)}>{label}</Text>
    </Pressable>
  )
}

/** Status, watched, trailer, favorite and rating. */
function Actions({ type, d, item, title }: { type: MediaType; d: Details; item: LibraryItem | undefined; title: string }) {
  const watched = useStore((s) => (type === 'movie' ? watchIndex(s.watches).movies.get(itemId('movie', d.id)) : undefined))
  const updateItem = useStore((s) => s.updateItem)
  const labels = type === 'movie' ? MOVIE_STATUS_LABEL : STATUS_LABEL
  const trailer = trailerOf(d.videos?.results)
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 }}>
      <BigButton
        icon={item ? 'bookmark' : 'add'}
        label={item ? labels[item.status] : 'Add to WatchList'}
        tone={item ? 'plain' : 'accent'}
        chevron={Boolean(item)}
        onPress={() => chooseStatus(type, d as ShowDetails & MovieDetails, title)}
      />
      {type === 'movie' && (
        <BigButton
          icon={watched ? 'checkmark-circle' : 'checkmark-circle-outline'}
          label={watched ? `Watched ${formatDate(dateOfTime(watched.at))}` : 'Mark watched'}
          tone={watched ? 'success' : 'plain'}
          onPress={() => (watched ? unwatchMovie(d as MovieDetails) : watchMovie(d as MovieDetails))}
        />
      )}
      {trailer && <BigButton icon="play" label="Trailer" onPress={() => playTrailer(title, d.videos?.results ?? [], trailer)} />}
      {item && <IconButton icon={item.favorite ? 'heart' : 'heart-outline'} label="Favorite" on={item.favorite} onPress={() => updateItem(item.id, { favorite: !item.favorite })} />}
      {item && <IconButton icon={item.rating ? 'star' : 'star-outline'} label="Rate" on={item.rating > 0} onPress={() => rate(item, title)} />}
    </View>
  )
}

function rate(item: LibraryItem, title: string) {
  showSheet(<RateSheet item={item} title={title} />)
}

function RateSheet({ item, title }: { item: LibraryItem; title: string }) {
  const rating = useStore((s) => s.items.find((i) => i.id === item.id)?.rating ?? 0)
  const update = useStore((s) => s.updateItem)
  return (
    <View style={{ padding: 22, alignItems: 'center' }}>
      <Text style={display(22)}>{`Rate ${title}`}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 18 }}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <Pressable
            key={n}
            onPress={() => {
              update(item.id, { rating: n })
              closeSheet()
            }}
            style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: n <= rating ? colors.accent : 'rgba(255,255,255,0.08)' }}
          >
            <Text style={{ color: n <= rating ? colors.onAccent : colors.text, fontWeight: '700', fontSize: 15 }}>{n}</Text>
          </Pressable>
        ))}
      </View>
      {rating > 0 && (
        <Pressable
          onPress={() => {
            update(item.id, { rating: 0 })
            closeSheet()
          }}
          style={{ marginTop: 16 }}
        >
          <Text style={{ color: colors.dim, fontWeight: '600' }}>Clear rating</Text>
        </Pressable>
      )}
    </View>
  )
}

function BigButton({ icon, label, onPress, tone = 'plain', chevron }: { icon: IconName; label: string; onPress: () => void; tone?: 'plain' | 'accent' | 'success'; chevron?: boolean }) {
  const bg = tone === 'accent' ? colors.accent : tone === 'success' ? 'rgba(61,220,132,0.16)' : 'rgba(255,255,255,0.1)'
  const fg = tone === 'accent' ? colors.onAccent : tone === 'success' ? colors.success : colors.text
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: bg, flexDirection: 'row', alignItems: 'center', opacity: pressed ? 0.75 : 1 })}>
      <Ionicons name={icon} size={18} color={fg} />
      <Text style={[display(18, fg), { marginLeft: 7 }]}>{label}</Text>
      {chevron && <Ionicons name="chevron-down" size={15} color={fg} style={{ marginLeft: 5 }} />}
    </Pressable>
  )
}

function IconButton({ icon, label, onPress, on }: { icon: IconName; label: string; onPress: () => void; on?: boolean }) {
  return (
    <Pressable accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Ionicons name={icon} size={19} color={on ? colors.accent : colors.text} />
    </Pressable>
  )
}

/** The next episode to watch, with a button to mark it. */
function NextUpCard({ show, item }: { show: ShowBasics; item: LibraryItem | undefined }) {
  const watched = useStore((s) => (item ? watchIndex(s.watches).episodes.get(item.id) : undefined))
  const p = useMemo(() => showProgress(show, item ?? { skippedSeasons: [] }, watched), [show, item, watched])
  const next = p.next
  const season = useSeason(next ? show.id : undefined, next?.season)
  const ep = season?.episodes.find((e) => e.episode_number === next?.episode)
  const upcoming = show.next_episode_to_air
  if (!p.total || (!next && !upcoming)) return null
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 24, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.accentHi, fontSize: 12, fontWeight: '800', letterSpacing: 0.8 }}>{next ? (p.watched ? 'UP NEXT' : 'START WATCHING') : 'NEXT EPISODE'}</Text>
        <Text style={[display(19), { marginTop: 2 }]} numberOfLines={1}>
          {next
            ? `${epLabel(next.season, next.episode)}${ep?.name ? ` · ${ep.name}` : ''}`
            : `${epLabel(upcoming!.season_number, upcoming!.episode_number)} airs ${upcoming!.air_date ? formatDate(upcoming!.air_date) : 'soon'}`}
        </Text>
      </View>
      {next && (
        <Pressable onPress={() => watchEpisode(show, next, ep?.runtime)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 })}>
          <Ionicons name="checkmark" size={17} color={colors.onAccent} />
          <Text style={[display(17, colors.onAccent), { marginLeft: 5 }]}>Watched</Text>
        </Pressable>
      )}
    </View>
  )
}

/** Streaming services (from JustWatch, through TMDB) for your region, as big logo tiles. */
function WhereToWatch({ providers }: { providers: Providers | undefined }) {
  const seen = new Set<number>()
  const unique = (list: NonNullable<Providers['flatrate']>) => list.filter((p) => !seen.has(p.provider_id) && Boolean(seen.add(p.provider_id))).sort((a, b) => a.display_priority - b.display_priority)
  const groups = [
    { label: '', list: unique([...(providers?.flatrate ?? []), ...(providers?.free ?? []), ...(providers?.ads ?? [])]) },
    { label: 'Rent', list: unique(providers?.rent ?? []) },
    { label: 'Buy', list: unique(providers?.buy ?? []) }
  ].filter((g) => g.list.length)
  if (!groups.length) return null
  const open = providers?.link ? () => openUrl(providers.link!) : undefined
  return (
    <Section
      title="Where to watch"
      right={
        <Pressable onPress={open} hitSlop={6}>
          <Text style={{ color: '#f5c84c', fontSize: 13, fontWeight: '700' }}>▸ JustWatch</Text>
        </Pressable>
      }
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, alignItems: 'center' }}>
        {groups.map((g) => (
          <View key={g.label || 'stream'} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            {g.label ? (
              <Pressable onPress={open} style={{ width: 78, height: 78, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={display(15, colors.dim)}>{`${g.label.toUpperCase()} →`}</Text>
              </Pressable>
            ) : null}
            {g.list.map((p) => (
              <Pressable key={p.provider_id} accessibilityLabel={p.provider_name} onPress={open}>
                <Image source={{ uri: img(p.logo_path, 'w185')! }} style={{ width: 78, height: 78, borderRadius: 16 }} />
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
    </Section>
  )
}

function Overview({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Pressable onPress={() => setOpen(!open)}>
      <Text style={{ color: colors.text, fontSize: 16.5, lineHeight: 25, opacity: 0.92 }} numberOfLines={open ? undefined : 5}>
        {text}
      </Text>
    </Pressable>
  )
}

const scoreColor = (v: number): string => (v >= 9 ? '#1f9d55' : v >= 8 ? '#38c172' : v >= 7.5 ? '#9ccc3d' : v >= 7 ? '#e3c13a' : v >= 6 ? '#f08a3e' : '#e5484d')

/** The latest season's episode ratings as bars; opens the full Scorecard. */
function ScorecardCard({ show }: { show: ShowBasics }) {
  const nav = useRootNav()
  const n = show.last_episode_to_air?.season_number ?? show.seasons.find((s) => s.season_number > 0)?.season_number
  const season = useSeason(n !== undefined ? show.id : undefined, n)
  const eps = (season?.episodes ?? []).filter((e) => e.vote_average > 0)
  if (!eps.length) return null
  const avg = eps.reduce((a, e) => a + e.vote_average, 0) / eps.length
  return (
    <Section title="Scorecard">
      <PressableScale onPress={() => nav.push('Scorecard', { id: show.id })} style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
          <Text style={[display(22), { flex: 1 }]}>{season?.name ?? `Season ${n}`}</Text>
          <View style={{ backgroundColor: scoreColor(avg), borderRadius: 14, paddingHorizontal: 11, height: 28, justifyContent: 'center', marginRight: 12 }}>
            <Text style={display(17, '#0b0b0c')}>{avg.toFixed(1)}</Text>
          </View>
          <Ionicons name="arrow-up-outline" size={20} color={colors.text} style={{ transform: [{ rotate: '45deg' }] }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 56, gap: 3 }}>
          {eps.slice(0, 40).map((e) => (
            <View key={e.id} style={{ flex: 1, height: '100%', justifyContent: 'flex-end', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 4 }}>
              <View style={{ height: `${Math.max(12, ((e.vote_average - 4) / 6) * 100)}%`, backgroundColor: scoreColor(e.vote_average), borderRadius: 4 }} />
            </View>
          ))}
        </View>
      </PressableScale>
    </Section>
  )
}

/** Trailers, teasers and clips (YouTube), played in the app: the first big, the rest in a row. */
function Videos({ title, videos }: { title: string; videos: Video[] | undefined }) {
  const list = playableVideos(videos)
  const wide = useWide()
  if (!list.length) return null
  const [first, ...rest] = list
  return (
    <Section title="Videos">
      <PressableScale onPress={() => playTrailer(title, list, first)} style={{ maxWidth: wide ? 640 : undefined }}>
        <VideoThumb v={first} big />
        <Text style={{ color: colors.text, fontSize: 14, textAlign: 'center', marginTop: 8 }} numberOfLines={1}>
          {first.name}
        </Text>
      </PressableScale>
      {rest.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingTop: 14 }}>
          {rest.slice(0, 15).map((v) => (
            <PressableScale key={v.key} onPress={() => playTrailer(title, list, v)} style={{ width: 220 }}>
              <VideoThumb v={v} />
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600', marginTop: 6 }} numberOfLines={1}>
                {v.name}
              </Text>
              <Text style={{ color: colors.dim, fontSize: 12 }}>{v.type}</Text>
            </PressableScale>
          ))}
        </ScrollView>
      )}
    </Section>
  )
}

function VideoThumb({ v, big }: { v: Video; big?: boolean }) {
  return (
    <View style={{ borderRadius: big ? 18 : 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardHi }}>
      <Image source={{ uri: youtubeThumb(v.key) }} style={{ width: '100%', aspectRatio: 16 / 9 }} contentFit="cover" transition={150} />
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: big ? 72 : 44, height: big ? 72 : 44, borderRadius: 40, backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="play" size={big ? 32 : 22} color="#fff" style={{ marginLeft: 3 }} />
        </View>
      </View>
    </View>
  )
}

function CollectionCard({ c }: { c: NonNullable<MovieDetails['belongs_to_collection']> }) {
  const nav = useRootNav()
  return (
    <PressableScale onPress={() => nav.push('Collection', { id: c.id })} style={{ marginBottom: 26, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
      {c.backdrop_path && <Image source={{ uri: img(c.backdrop_path, 'w780')! }} style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0.35 }} contentFit="cover" />}
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14 }}>
        <Poster path={c.poster_path} width={54} radius={7} />
        <View style={{ marginLeft: 14, flex: 1 }}>
          <Text style={{ color: colors.dim, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>PART OF</Text>
          <Text style={display(20)}>{c.name}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.dim} />
      </View>
    </PressableScale>
  )
}

function Info({ type, d }: { type: MediaType; d: Details }) {
  const rows: Array<[string, string]> = []
  if (type === 'tv') {
    const s = d as ShowDetails
    if (s.created_by.length) rows.push(['Created by', s.created_by.map((c) => c.name).join(', ')])
    if (s.first_air_date) rows.push(['First Aired', formatDate(s.first_air_date, true)])
    if (s.last_air_date) rows.push(['Last Aired', formatDate(s.last_air_date, true)])
    if (s.type) rows.push(['Format', s.type])
    if (s.origin_country?.length) rows.push(['Country', s.origin_country.join(', ')])
    if (s.original_name !== s.name) rows.push(['Original Title', s.original_name])
  } else {
    const m = d as MovieDetails
    const directors = m.credits?.crew.filter((c) => c.job === 'Director').map((c) => c.name)
    if (directors?.length) rows.push(['Directed by', directors.join(', ')])
    if (m.release_date) rows.push(['Released', formatDate(m.release_date, true)])
    if (m.runtime) rows.push(['Runtime', duration(m.runtime)])
    if (m.budget) rows.push(['Budget', `$${(m.budget / 1e6).toFixed(m.budget < 1e7 ? 1 : 0)}M`])
    if (m.revenue) rows.push(['Box Office', `$${(m.revenue / 1e6).toFixed(m.revenue < 1e7 ? 1 : 0)}M`])
    if (m.original_title !== m.title) rows.push(['Original Title', m.original_title])
  }
  if (!rows.length) return null
  return (
    <Section title="Info">
      {rows.map(([k, v]) => (
        <View key={k} style={{ flexDirection: 'row', paddingVertical: 5 }}>
          <Text style={{ color: colors.dim, fontSize: 16, flex: 1 }}>{k}</Text>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', flex: 1.4, textAlign: 'right' }}>{v}</Text>
        </View>
      ))}
    </Section>
  )
}

// ── Progress ────────────────────────────────────────────────────────────────────────────────────

function ProgressTab({ show, item, startSeason }: { show: ShowDetails; item: LibraryItem | undefined; startSeason?: number }) {
  const basics = useShow(show.id) ?? show
  const watched = useStore((s) => (item ? watchIndex(s.watches).episodes.get(item.id) : undefined))
  const p = showProgress(basics, item ?? { skippedSeasons: [] }, watched)
  const first = show.seasons.find((s) => s.season_number > 0)?.season_number ?? show.seasons[0]?.season_number ?? 1
  const [n, setN] = useState(startSeason ?? p.next?.season ?? basics.last_episode_to_air?.season_number ?? first)
  return (
    <>
      <NextUpCard show={basics} item={item} />
      <SeasonPanel show={basics} item={item} seasonNumber={n} onSeason={setN} next={p.next} />
    </>
  )
}

// ── Cast & Crew ─────────────────────────────────────────────────────────────────────────────────

const KEY_JOBS = ['Director', 'Series Director', 'Creator', 'Screenplay', 'Writer', 'Novel', 'Original Story', 'Producer', 'Executive Producer', 'Original Music Composer', 'Music', 'Director of Photography', 'Editor', 'Character Designer', 'Animation Director']

function CastTab({ type, d }: { type: MediaType; d: Details }) {
  const nav = useRootNav()
  const [allCast, setAllCast] = useState(false)
  const cast: CastMember[] = (type === 'tv' ? (d as ShowDetails).aggregate_credits?.cast : (d as MovieDetails).credits?.cast) ?? []
  const crew = useMemo(() => {
    const raw: CrewMember[] = (type === 'tv' ? (d as ShowDetails).aggregate_credits?.crew : (d as MovieDetails).credits?.crew) ?? []
    const created: CrewMember[] = type === 'tv' ? (d as ShowDetails).created_by.map((c) => ({ id: c.id, name: c.name, profile_path: c.profile_path, job: 'Creator', department: 'Writing' })) : []
    const out = new Map<number, { id: number; name: string; profile_path: string | null; job: string; rank: number }>()
    for (const c of [...created, ...raw]) {
      for (const job of c.jobs?.map((j) => j.job) ?? (c.job ? [c.job] : [])) {
        const rank = KEY_JOBS.indexOf(job)
        if (rank < 0) continue
        const had = out.get(c.id)
        if (!had || rank < had.rank) out.set(c.id, { id: c.id, name: c.name, profile_path: c.profile_path, job, rank })
      }
    }
    return [...out.values()].sort((a, b) => a.rank - b.rank).slice(0, 24)
  }, [d.id, type])
  const shown = allCast ? cast : cast.slice(0, 20)
  return (
    <>
      {cast.length > 0 && (
        <Section title="Cast">
          {shown.map((c) => {
            const role = c.character ?? c.roles?.map((r) => r.character).filter(Boolean).join(' / ')
            return (
              <CardRow
                key={c.id}
                image={c.profile_path}
                imageKind="avatar"
                title={c.name}
                titleExtra={c.total_episode_count ? `${c.total_episode_count} ${c.total_episode_count === 1 ? 'episode' : 'episodes'}` : undefined}
                sub={role ? `as ${role}` : undefined}
                onPress={() => nav.push('Person', { id: c.id })}
              />
            )
          })}
          {cast.length > 20 && <ShowAll open={allCast} onPress={() => setAllCast(!allCast)} count={cast.length} />}
        </Section>
      )}
      {crew.length > 0 && (
        <Section title="Crew">
          {crew.map((c) => (
            <CardRow key={c.id} image={c.profile_path} imageKind="avatar" title={c.name} sub={c.job} onPress={() => nav.push('Person', { id: c.id })} />
          ))}
        </Section>
      )}
    </>
  )
}

export function ShowAll({ open, onPress, count }: { open: boolean; onPress: () => void; count: number }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ height: 48, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{open ? 'Show Less' : `Show All ${count}`}</Text>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.text} style={{ marginLeft: 6 }} />
    </Pressable>
  )
}
