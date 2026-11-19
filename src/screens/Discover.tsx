import { useState } from 'react'
import { ActivityIndicator, ScrollView, Text, useWindowDimensions, View } from 'react-native'
import { useAsync } from '../lib/hooks'
import { byGenre, genres, list, tmdbConfigured, type ListKind, type MediaSummary } from '../lib/tmdb'
import type { MediaType } from '../lib/types'
import { useRootNav, type RootParams } from '../nav'
import { EmptyNote, Header, Page, Pill, Segmented } from '../ui/kit'
import { Carousel, Chip, MediaCard, PosterGrid, Still, useOpenTitle } from '../ui/media'
import { PressableScale } from '../ui/motion'
import { colors } from '../ui/theme'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

// Discover: what's trending, popular, airing and coming soon on TMDB, and genres to browse.

const ROWS: Array<{ title: string; list: ListKind }> = [
  { title: 'Popular shows', list: 'popular-tv' },
  { title: 'Popular movies', list: 'popular-movie' },
  { title: 'Airing today', list: 'airing-today' },
  { title: 'In theaters', list: 'now-playing' },
  { title: 'Coming soon', list: 'upcoming-movie' },
  { title: 'Top rated shows', list: 'top-tv' },
  { title: 'Top rated movies', list: 'top-movie' }
]

export default function Discover() {
  const nav = useRootNav()
  const [genreType, setGenreType] = useState<MediaType>('tv')
  const trending = useAsync(() => list('trending'), [])
  const genreList = useAsync(() => genres(genreType), [genreType])
  if (!tmdbConfigured()) return <NoKey />
  const hero = trending.data?.results.filter((m) => m.backdrop_path).slice(0, 6) ?? []
  return (
    <Page wide bottomSpace={110}>
      <Text style={{ color: colors.text, fontSize: 34, fontWeight: '800', marginTop: 34, marginBottom: 18 }}>Discover</Text>
      {trending.error && !trending.data && <ErrorNote message={trending.error} onRetry={trending.reload} />}
      {hero.length > 0 && <Hero items={hero} />}
      {trending.data && <Carousel title="Trending this week" items={trending.data.results.slice(6)} onSeeAll={() => nav.push('Browse', { title: 'Trending this week', list: 'trending' })} />}
      {ROWS.map((r) => (
        <ListRow key={r.list} {...r} onSeeAll={() => nav.push('Browse', { title: r.title, list: r.list })} />
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', flex: 1 }}>Genres</Text>
        <View style={{ width: 200 }}>
          <Segmented<MediaType>
            value={genreType}
            onChange={setGenreType}
            options={[
              { label: 'Shows', value: 'tv' },
              { label: 'Movies', value: 'movie' }
            ]}
          />
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {genreList.data?.genres.map((g) => (
          <Chip key={g.id} label={g.name} onPress={() => nav.push('Browse', { title: g.name, genre: { type: genreType, id: g.id } })} />
        ))}
      </View>
    </Page>
  )
}

function ListRow({ title, list: kind, onSeeAll }: { title: string; list: ListKind; onSeeAll: () => void }) {
  const res = useAsync(() => list(kind), [kind])
  return <Carousel title={title} items={res.data?.results ?? []} onSeeAll={onSeeAll} />
}

/** Big backdrops of the top trending titles. */
function Hero({ items }: { items: MediaSummary[] }) {
  const open = useOpenTitle()
  const w = Math.min(460, useWindowDimensions().width - 56)
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }} style={{ marginBottom: 28 }}>
      {items.map((m) => (
        <PressableScale key={m.id} onPress={() => open(m.media_type === 'movie' ? 'movie' : 'tv', m.id)} style={{ width: w }}>
          <Still path={m.backdrop_path} style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ position: 'absolute', left: 16, right: 16, bottom: 14 }}>
              <Text style={{ color: colors.accentHi, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 }}>{m.media_type === 'movie' ? 'TRENDING MOVIE' : 'TRENDING SHOW'}</Text>
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 3 }} numberOfLines={1}>
                {m.title ?? m.name}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 3 }} numberOfLines={2}>
                {m.overview}
              </Text>
            </View>
          </Still>
        </PressableScale>
      ))}
    </ScrollView>
  )
}

/** A full list (See all, or a genre), a page at a time. */
export function Browse({ route }: NativeStackScreenProps<RootParams, 'Browse'>) {
  const { title, list: kind, genre } = route.params
  const [pages, setPages] = useState(1)
  const [extra, setExtra] = useState<MediaSummary[]>([])
  const [more, setMore] = useState(false)
  const first = useAsync(() => (kind ? list(kind, 1) : byGenre(genre!.type, genre!.id, 1)), [kind, genre?.id, genre?.type])
  const all = [...(first.data?.results ?? []), ...extra].filter((m, i, a) => a.findIndex((x) => x.id === m.id && x.media_type === m.media_type) === i)
  const loadMore = async () => {
    setMore(true)
    try {
      const res = kind ? await list(kind, pages + 1) : await byGenre(genre!.type, genre!.id, pages + 1)
      setExtra((e) => [...e, ...res.results])
      setPages((p) => p + 1)
    } finally {
      setMore(false)
    }
  }
  return (
    <Page wide header={<Header title={title} />}>
      {first.error && !first.data && <ErrorNote message={first.error} onRetry={first.reload} />}
      {!first.data && !first.error && <ActivityIndicator color={colors.accentHi} style={{ marginTop: 40 }} />}
      <PosterGrid items={all} keyOf={(m) => `${m.media_type}-${m.id}`} render={(m, w) => <MediaCard m={m} width={w} />} />
      {first.data && pages < Math.min(first.data.total_pages, 20) && (
        <View style={{ alignItems: 'center', marginTop: 24 }}>{more ? <ActivityIndicator color={colors.accentHi} /> : <Pill label="Load more" onPress={() => void loadMore()} />}</View>
      )}
    </Page>
  )
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={{ alignItems: 'center', marginVertical: 30 }}>
      <Text style={{ color: colors.dim, fontSize: 15, textAlign: 'center', marginBottom: 12 }}>{`Couldn’t reach TMDB: ${message}`}</Text>
      {onRetry && <Pill label="Try again" onPress={onRetry} />}
    </View>
  )
}

export function NoKey() {
  return (
    <Page>
      <EmptyNote>{'This copy of WatchList was built without a TMDB API key, so it can’t look up shows and movies.\nAdd EXPO_PUBLIC_TMDB_KEY to .env and rebuild (README → TMDB).'}</EmptyNote>
    </Page>
  )
}
