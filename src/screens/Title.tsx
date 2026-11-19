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
import { ensureShow, itemId, MOVIE_STATUS_LABEL, refreshItemFields, STATUS_LABEL } from '../lib/library'
import { duration, epLabel, formatDate, showProgress, watchIndex } from '../lib/progress'
import { useStore } from '../lib/store'
import { currentRegion, img, movieDetails, showDetails, trailerOf, yearOf, type CastMember, type MovieDetails, type Providers, type ShowDetails } from '../lib/tmdb'
import type { LibraryItem, MediaType } from '../lib/types'
import { useRootNav, type RootParams } from '../nav'
import { chooseStatus, unwatchMovie, watchEpisode, watchMovie } from '../ui/actions'
import { CircleButton, Column } from '../ui/kit'
import { Avatar, Carousel, Poster, ProgressBar, Score, SectionHeader } from '../ui/media'
import { PressableScale } from '../ui/motion'
import { showSheet, closeSheet } from '../ui/overlays'
import { colors } from '../ui/theme'
import { ErrorNote } from './Discover'
import { openUrl } from './Settings'

// A show's or movie's page: backdrop, your status and progress, where to watch, seasons, cast,
// and more like it.

type Details = ShowDetails | MovieDetails

export default function Title({ route, navigation }: NativeStackScreenProps<RootParams, 'Title'>) {
  const { type, id } = route.params
  const res = useAsync<Details>(() => (type === 'tv' ? showDetails(id) : movieDetails(id)), [type, id])
  const item = useStore((s) => s.items.find((i) => i.id === itemId(type, id)))
  const insets = useSafeAreaInsets()
  const d = res.data

  // Keep the saved copy's name and pictures up to date, and the show's progress data fresh.
  useEffect(() => {
    if (d && item) refreshItemFields(item, d)
    if (d && type === 'tv') void ensureShow(id)
  }, [d?.id])

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}>
        {d ? <Body type={type} d={d} item={item} /> : <View style={{ height: 300 }} />}
        {!d && res.loading && <ActivityIndicator color={colors.accentHi} style={{ marginTop: 20 }} />}
        {!d && res.error && <ErrorNote message={res.error} onRetry={res.reload} />}
      </ScrollView>
      <View style={{ position: 'absolute', top: insets.top + 10, left: 16 }}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => navigation.goBack()} style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} />
      </View>
    </View>
  )
}

function Body({ type, d, item }: { type: MediaType; d: Details; item: LibraryItem | undefined }) {
  const wide = useWide()
  const { width } = useWindowDimensions()
  const show = type === 'tv' ? (d as ShowDetails) : null
  const movie = type === 'movie' ? (d as MovieDetails) : null
  const title = show?.name ?? movie?.title ?? ''
  const heroH = wide ? Math.min(460, width * 0.38) : Math.min(300, width * 0.62)
  const posterW = wide ? 170 : 112
  const region = currentRegion()

  const cert = show ? show.content_ratings?.results.find((r) => r.iso_3166_1 === region)?.rating ?? show.content_ratings?.results.find((r) => r.iso_3166_1 === 'US')?.rating : movieCert(movie!, region)
  const meta = [
    yearOf(show?.first_air_date ?? movie?.release_date),
    show ? `${show.number_of_seasons} ${show.number_of_seasons === 1 ? 'season' : 'seasons'}` : movie?.runtime ? duration(movie.runtime) : '',
    cert,
    show?.networks[0]?.name
  ].filter(Boolean)

  return (
    <>
      <View style={{ height: heroH, backgroundColor: colors.cardHi }}>
        {d.backdrop_path && <Image source={{ uri: img(d.backdrop_path, 'w1280')! }} style={{ position: 'absolute', width: '100%', height: '100%' }} contentFit="cover" transition={200} />}
        <LinearGradient colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0)', colors.bg]} locations={[0, 0.4, 1]} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
      </View>
      <Column>
        <View style={{ flexDirection: 'row', marginTop: -posterW * 0.75 }}>
          <Poster path={d.poster_path} title={title} width={posterW} radius={12} />
          <View style={{ flex: 1, marginLeft: 16, justifyContent: 'flex-end' }}>
            <Text style={{ color: colors.text, fontSize: wide ? 34 : 24, fontWeight: '800' }} numberOfLines={3}>
              {title}
            </Text>
            <Text style={{ color: colors.dim, fontSize: 14, marginTop: 6 }}>{meta.join(' · ')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 14 }}>
              <Score value={d.vote_average} size={14} />
              {item?.rating ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="person" size={12} color={colors.accentHi} />
                  <Text style={{ color: colors.accentHi, fontWeight: '700', marginLeft: 4 }}>{`${item.rating}/10`}</Text>
                </View>
              ) : null}
              {show && <Text style={{ color: colors.dim, fontSize: 13 }}>{show.status}</Text>}
            </View>
          </View>
        </View>

        <Actions type={type} d={d} item={item} title={title} />

        {show && <ShowProgressCard show={show} item={item} />}

        <WhereToWatch providers={d['watch/providers']?.results[region]} />

        {d.tagline ? <Text style={{ color: colors.dim, fontSize: 15, fontStyle: 'italic', marginBottom: 8 }}>{d.tagline}</Text> : null}
        {d.overview ? <Overview text={d.overview} /> : null}
        {d.genres.length > 0 && <Text style={{ color: colors.dim, fontSize: 13, marginBottom: 26 }}>{d.genres.map((g) => g.name).join(' · ')}</Text>}

        {show && <Seasons show={show} item={item} />}
        <Cast cast={show ? show.aggregate_credits?.cast : movie?.credits?.cast} />
        {movie?.belongs_to_collection && <CollectionCard c={movie.belongs_to_collection} />}
        <Carousel title="More like this" items={(d.recommendations?.results ?? []).map((m) => ({ ...m, media_type: m.media_type ?? type }))} />
        <Info type={type} d={d} />
      </Column>
    </>
  )
}

function movieCert(movie: MovieDetails, region: string): string | undefined {
  const pick = (r: string) => movie.release_dates?.results.find((x) => x.iso_3166_1 === r)?.release_dates.find((x) => x.certification)?.certification
  return pick(region) ?? pick('US')
}

/** Status, watched, favorite, rating, trailer and share. */
function Actions({ type, d, item, title }: { type: MediaType; d: Details; item: LibraryItem | undefined; title: string }) {
  const watched = useStore((s) => (type === 'movie' ? watchIndex(s.watches).movies.get(itemId('movie', d.id)) : undefined))
  const updateItem = useStore((s) => s.updateItem)
  const labels = type === 'movie' ? MOVIE_STATUS_LABEL : STATUS_LABEL
  const trailer = trailerOf(d.videos?.results)
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20, marginBottom: 22 }}>
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
      {item && <IconButton icon={item.favorite ? 'heart' : 'heart-outline'} label="Favorite" on={item.favorite} onPress={() => updateItem(item.id, { favorite: !item.favorite })} />}
      {item && <IconButton icon={item.rating ? 'star' : 'star-outline'} label="Rate" on={item.rating > 0} onPress={() => rate(item, title)} />}
      {trailer && <IconButton icon="play" label="Trailer" onPress={() => openUrl(`https://www.youtube.com/watch?v=${trailer.key}`)} />}
      <IconButton icon="share-outline" label="Share" onPress={() => void Share.share({ message: `${title} — https://www.themoviedb.org/${type}/${d.id}` })} />
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
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{`Rate ${title}`}</Text>
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

function BigButton({ icon, label, onPress, tone = 'plain', chevron }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; tone?: 'plain' | 'accent' | 'success'; chevron?: boolean }) {
  const bg = tone === 'accent' ? colors.accent : tone === 'success' ? 'rgba(61,220,132,0.16)' : 'rgba(255,255,255,0.1)'
  const fg = tone === 'accent' ? colors.onAccent : tone === 'success' ? colors.success : colors.text
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: bg, flexDirection: 'row', alignItems: 'center', opacity: pressed ? 0.75 : 1 })}>
      <Ionicons name={icon} size={18} color={fg} />
      <Text style={{ color: fg, fontSize: 15, fontWeight: '700', marginLeft: 7 }}>{label}</Text>
      {chevron && <Ionicons name="chevron-down" size={15} color={fg} style={{ marginLeft: 5 }} />}
    </Pressable>
  )
}

function IconButton({ icon, label, onPress, on }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; on?: boolean }) {
  return (
    <Pressable accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Ionicons name={icon} size={19} color={on ? colors.accent : colors.text} />
    </Pressable>
  )
}

/** Your progress through a show and its next episode. */
function ShowProgressCard({ show, item }: { show: ShowDetails; item: LibraryItem | undefined }) {
  const watched = useStore((s) => (item ? watchIndex(s.watches).episodes.get(item.id) : undefined))
  const p = useMemo(() => showProgress(show, item ?? { skippedSeasons: [] }, watched), [show, item, watched])
  const next = p.next
  const season = useSeason(next ? show.id : undefined, next?.season)
  const ep = season?.episodes.find((e) => e.episode_number === next?.episode)
  if (!p.total) return null
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700', flex: 1 }}>{p.finished ? 'Finished' : p.caughtUp ? 'All caught up' : p.watched ? 'Your progress' : 'Not started'}</Text>
        <Text style={{ color: colors.dim, fontSize: 13 }}>{`${p.watched} of ${p.total} episodes · ${Math.round((p.watched / p.total) * 100)}%`}</Text>
      </View>
      <ProgressBar value={p.watched / p.total} height={6} />
      {next && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.dim, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>UP NEXT</Text>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', marginTop: 2 }} numberOfLines={1}>
              {`${epLabel(next.season, next.episode)}${ep?.name ? ` · ${ep.name}` : ''}`}
            </Text>
          </View>
          <Pressable onPress={() => watchEpisode(show, next, ep?.runtime)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 })}>
            <Ionicons name="checkmark" size={17} color={colors.onAccent} />
            <Text style={{ color: colors.onAccent, fontWeight: '700', marginLeft: 5 }}>Watched</Text>
          </Pressable>
        </View>
      )}
      {!next && show.next_episode_to_air && (
        <Text style={{ color: colors.dim, fontSize: 14, marginTop: 12 }}>
          {`Next: ${epLabel(show.next_episode_to_air.season_number, show.next_episode_to_air.episode_number)} airs ${show.next_episode_to_air.air_date ? formatDate(show.next_episode_to_air.air_date) : 'soon'}`}
        </Text>
      )}
    </View>
  )
}

const PROVIDER_KINDS: Array<{ key: keyof Providers; label: string }> = [
  { key: 'flatrate', label: 'Stream' },
  { key: 'free', label: 'Free' },
  { key: 'ads', label: 'With ads' },
  { key: 'rent', label: 'Rent' },
  { key: 'buy', label: 'Buy' }
]

/** Streaming services (from JustWatch, through TMDB) for your region. */
function WhereToWatch({ providers }: { providers: Providers | undefined }) {
  const groups = PROVIDER_KINDS.map((k) => ({ ...k, list: (providers?.[k.key] as Providers['flatrate']) ?? [] })).filter((g) => g.list.length)
  if (!groups.length) return null
  return (
    <View style={{ marginBottom: 24 }}>
      <SectionHeader
        title="Where to watch"
        right={
          <Text style={{ color: colors.faint, fontSize: 11 }} onPress={providers?.link ? () => openUrl(providers.link!) : undefined}>
            Data by JustWatch
          </Text>
        }
      />
      {groups.map((g) => (
        <View key={g.key} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ color: colors.dim, fontSize: 13, width: 70 }}>{g.label}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {g.list
              .sort((a, b) => a.display_priority - b.display_priority)
              .map((p) => (
                <Pressable key={p.provider_id} accessibilityLabel={p.provider_name} onPress={providers?.link ? () => openUrl(providers.link!) : undefined}>
                  <Image source={{ uri: img(p.logo_path, 'w92')! }} style={{ width: 42, height: 42, borderRadius: 10 }} />
                </Pressable>
              ))}
          </ScrollView>
        </View>
      ))}
    </View>
  )
}

function Overview({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Pressable onPress={() => setOpen(!open)} style={{ marginBottom: 12 }}>
      <Text style={{ color: colors.text, fontSize: 15, lineHeight: 23, opacity: 0.9 }} numberOfLines={open ? undefined : 4}>
        {text}
      </Text>
    </Pressable>
  )
}

function Seasons({ show, item }: { show: ShowDetails; item: LibraryItem | undefined }) {
  const nav = useRootNav()
  const watched = useStore((s) => (item ? watchIndex(s.watches).episodes.get(item.id) : undefined))
  const seasons = [...show.seasons].sort((a, b) => (a.season_number === 0 ? 1 : b.season_number === 0 ? -1 : a.season_number - b.season_number))
  return (
    <View style={{ marginBottom: 26 }}>
      <SectionHeader
        title="Seasons"
        right={
          <Pressable onPress={() => nav.push('Scorecard', { id: show.id })} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="grid-outline" size={15} color={colors.accentHi} />
            <Text style={{ color: colors.accentHi, fontSize: 14, fontWeight: '600', marginLeft: 5 }}>Scorecard</Text>
          </Pressable>
        }
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 6 }}>
        {seasons.map((s) => {
          let count = 0
          for (let e = 1; e <= s.episode_count; e++) if (watched?.has(`${s.season_number}:${e}`)) count++
          const skipped = item?.skippedSeasons.includes(s.season_number)
          return (
            <PressableScale key={s.id} onPress={() => nav.push('Season', { id: show.id, season: s.season_number })} style={{ width: 118, opacity: skipped ? 0.45 : 1 }}>
              <Poster path={s.poster_path ?? show.poster_path} title={s.name} width={118} />
              {s.episode_count > 0 && <ProgressBar value={count / s.episode_count} style={{ marginTop: 7 }} />}
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600', marginTop: 6 }} numberOfLines={1}>
                {s.name}
              </Text>
              <Text style={{ color: colors.dim, fontSize: 12, marginTop: 1 }}>{skipped ? 'Skipped' : `${count ? `${count}/` : ''}${s.episode_count} episodes`}</Text>
            </PressableScale>
          )
        })}
      </ScrollView>
    </View>
  )
}

function Cast({ cast }: { cast: CastMember[] | undefined }) {
  const nav = useRootNav()
  if (!cast?.length) return null
  return (
    <View style={{ marginBottom: 26 }}>
      <SectionHeader title="Cast" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 6 }}>
        {cast.slice(0, 24).map((c) => (
          <PressableScale key={c.id} onPress={() => nav.push('Person', { id: c.id })} style={{ width: 92, alignItems: 'center' }}>
            <Avatar path={c.profile_path} size={80} name={c.name} />
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600', marginTop: 7, textAlign: 'center' }} numberOfLines={2}>
              {c.name}
            </Text>
            <Text style={{ color: colors.dim, fontSize: 11.5, marginTop: 2, textAlign: 'center' }} numberOfLines={2}>
              {c.character ?? c.roles?.[0]?.character ?? ''}
            </Text>
          </PressableScale>
        ))}
      </ScrollView>
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
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 2 }}>{c.name}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.dim} />
      </View>
    </PressableScale>
  )
}

function Info({ type, d }: { type: MediaType; d: Details }) {
  const rows: Array<[string, ReactNode]> = []
  if (type === 'tv') {
    const s = d as ShowDetails
    if (s.created_by.length) rows.push(['Created by', s.created_by.map((c) => c.name).join(', ')])
    if (s.networks.length) rows.push(['Network', s.networks.map((n) => n.name).join(', ')])
    rows.push(['Status', s.status])
    if (s.first_air_date) rows.push(['First aired', formatDate(s.first_air_date, true)])
    if (s.last_air_date) rows.push(['Last aired', formatDate(s.last_air_date, true)])
    rows.push(['Episodes', String(s.number_of_episodes)])
    if (s.original_name !== s.name) rows.push(['Original title', s.original_name])
  } else {
    const m = d as MovieDetails
    const directors = m.credits?.crew.filter((c) => c.job === 'Director').map((c) => c.name)
    if (directors?.length) rows.push(['Directed by', directors.join(', ')])
    if (m.release_date) rows.push(['Released', formatDate(m.release_date, true)])
    if (m.runtime) rows.push(['Runtime', duration(m.runtime)])
    rows.push(['Status', m.status])
    if (m.budget) rows.push(['Budget', `$${(m.budget / 1e6).toFixed(m.budget < 1e7 ? 1 : 0)}M`])
    if (m.revenue) rows.push(['Box office', `$${(m.revenue / 1e6).toFixed(m.revenue < 1e7 ? 1 : 0)}M`])
    if (m.original_title !== m.title) rows.push(['Original title', m.original_title])
  }
  const imdb = type === 'tv' ? (d as ShowDetails).external_ids?.imdb_id : (d as MovieDetails).imdb_id
  return (
    <View style={{ marginBottom: 20 }}>
      <SectionHeader title="Info" />
      <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 6 }}>
        {rows.map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', paddingVertical: 9 }}>
            <Text style={{ color: colors.dim, fontSize: 14, width: 120 }}>{k}</Text>
            <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{v}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 14 }}>
        <LinkText label="TMDB" url={`https://www.themoviedb.org/${type}/${d.id}`} />
        {imdb && <LinkText label="IMDb" url={`https://www.imdb.com/title/${imdb}/`} />}
        {d.homepage ? <LinkText label="Website" url={d.homepage} /> : null}
      </View>
    </View>
  )
}

function LinkText({ label, url }: { label: string; url: string }) {
  return (
    <Pressable onPress={() => openUrl(url)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text style={{ color: colors.accentHi, fontWeight: '600', fontSize: 14 }}>{label}</Text>
      <Ionicons name="arrow-up-outline" size={13} color={colors.accentHi} style={{ marginLeft: 3, transform: [{ rotate: '45deg' }] }} />
    </Pressable>
  )
}

