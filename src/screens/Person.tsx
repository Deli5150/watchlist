import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useAsync } from '../lib/hooks'
import { formatDate } from '../lib/progress'
import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { useStore } from '../lib/store'
import { collection, dateOf, img, person, titleOf, yearOf, type MediaSummary } from '../lib/tmdb'
import type { RootParams } from '../nav'
import { Header, Page } from '../ui/kit'
import { useRootNav } from '../nav'
import { Avatar, CardRow, MediaCard, PosterGrid, SectionHeader } from '../ui/media'
import { colors, display } from '../ui/theme'
import { ShowAll } from './Title'
import { ErrorNote } from './Discover'

// A person's page (cast or crew), and a movie collection's page.

function ageOf(birthday: string, until?: string | null): number {
  const b = new Date(birthday)
  const e = until ? new Date(until) : new Date()
  let age = e.getFullYear() - b.getFullYear()
  if (e.getMonth() < b.getMonth() || (e.getMonth() === b.getMonth() && e.getDate() < b.getDate())) age--
  return age
}

export default function Person({ route }: NativeStackScreenProps<RootParams, 'Person'>) {
  const res = useAsync(() => person(route.params.id), [route.params.id])
  const p = res.data
  const [bio, setBio] = useState(false)

  const { movies, shows } = useMemo(() => {
    const merged = new Map<string, MediaSummary>()
    for (const m of [...(p?.combined_credits?.cast ?? []), ...(p?.combined_credits?.crew ?? [])]) {
      if (m.media_type === 'person') continue
      const k = `${m.media_type}-${m.id}`
      const had = merged.get(k)
      merged.set(k, had ? { ...had, character: had.character || m.character, job: [had.job, m.job].filter(Boolean).join(', ') } : m)
    }
    const all = [...merged.values()].filter((m) => !(m.media_type === 'tv' && (m.episode_count ?? 0) > 200 && !m.character))
    return { movies: all.filter((m) => m.media_type === 'movie'), shows: all.filter((m) => m.media_type === 'tv') }
  }, [p])

  return (
    <Page header={<Header title="" />}>
      {!p && res.loading && <ActivityIndicator color={colors.accentHi} style={{ marginTop: 40 }} />}
      {!p && res.error && <ErrorNote message={res.error} onRetry={res.reload} />}
      {p && (
        <>
          <View style={{ flexDirection: 'row', marginBottom: 22 }}>
            <View style={{ width: 128, height: 150, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.cardHi }}>
              {img(p.profile_path, 'w185') ? <Image source={{ uri: img(p.profile_path, 'w185')! }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : <Avatar path={null} size={128} name={p.name} />}
            </View>
            <View style={{ flex: 1, marginLeft: 18, justifyContent: 'center' }}>
              <Text style={display(28)}>{p.name}</Text>
              <Text style={{ color: colors.dim, fontSize: 16, marginTop: 2 }}>{p.known_for_department}</Text>
              {p.birthday && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                  <Ionicons name="calendar-outline" size={15} color={colors.dim} />
                  <Text style={{ color: colors.text, fontSize: 15, marginLeft: 6 }}>{`Born ${formatDate(p.birthday, true)}`}</Text>
                </View>
              )}
              {p.birthday && <Text style={{ color: colors.accentHi, fontSize: 15, fontWeight: '700', marginTop: 3 }}>{p.deathday ? `Died ${formatDate(p.deathday, true)}, aged ${ageOf(p.birthday, p.deathday)}` : `${ageOf(p.birthday)} years old`}</Text>}
              {p.place_of_birth ? <Text style={{ color: colors.dim, fontSize: 13, marginTop: 3 }}>{p.place_of_birth}</Text> : null}
            </View>
          </View>
          {p.biography ? (
            <View style={{ marginBottom: 24 }}>
              <SectionHeader title="Biography" />
              <Pressable onPress={() => setBio(!bio)}>
                <Text style={{ color: colors.text, opacity: 0.8, fontSize: 15.5, lineHeight: 23 }} numberOfLines={bio ? undefined : 4}>
                  {p.biography}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {movies.length > 0 && <Credits title="Movies" list={movies} />}
          {shows.length > 0 && <Credits title="TV Shows" list={shows} />}
        </>
      )}
    </Page>
  )
}

/** A person's movies or shows, most popular (or newest) first, five at a time. */
function Credits({ title, list }: { title: string; list: MediaSummary[] }) {
  const nav = useRootNav()
  const [order, setOrder] = useState<'popular' | 'newest'>('popular')
  const [all, setAll] = useState(false)
  const items = useStore((s) => s.items)
  const sorted = [...list].sort((a, b) =>
    order === 'popular' ? ((b as { vote_count?: number }).vote_count ?? 0) - ((a as { vote_count?: number }).vote_count ?? 0) : (dateOf(b) || '9999').localeCompare(dateOf(a) || '9999')
  )
  const shown = all ? sorted : sorted.slice(0, 5)
  return (
    <View style={{ marginBottom: 26 }}>
      <SectionHeader
        title={title}
        right={
          <Pressable onPress={() => setOrder(order === 'popular' ? 'newest' : 'popular')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.accentSoft, opacity: pressed ? 0.7 : 1 })}>
            <Text style={{ color: colors.accentHi, fontWeight: '700', fontSize: 14 }}>{order === 'popular' ? 'Most Popular' : 'Newest'}</Text>
            <Ionicons name="swap-vertical" size={14} color={colors.accentHi} style={{ marginLeft: 5 }} />
          </Pressable>
        }
      />
      {shown.map((m) => {
        const type = m.media_type === 'movie' ? 'movie' : 'tv'
        const saved = items.find((i) => i.id === `${type}:${m.id}`)
        const role = m.character ? m.character : m.job
        return (
          <CardRow
            key={`${m.media_type}-${m.id}`}
            image={m.poster_path}
            title={titleOf(m)}
            titleExtra={yearOf(dateOf(m)) || undefined}
            sub={role || undefined}
            dim={saved?.status === 'completed'}
            onPress={() => nav.push('Title', { type, id: m.id })}
            right={saved ? <Ionicons name={saved.status === 'completed' ? 'checkmark-circle' : 'bookmark'} size={22} color={saved.status === 'completed' ? colors.success : colors.accent} /> : undefined}
          />
        )
      })}
      {list.length > 5 && <ShowAll open={all} onPress={() => setAll(!all)} count={list.length} />}
    </View>
  )
}

export function Collection({ route }: NativeStackScreenProps<RootParams, 'Collection'>) {
  const res = useAsync(() => collection(route.params.id), [route.params.id])
  const c = res.data
  const parts = [...(c?.parts ?? [])].map((m) => ({ ...m, media_type: 'movie' as const })).sort((a, b) => (a.release_date || '9999').localeCompare(b.release_date || '9999'))
  return (
    <Page wide header={<Header title={c?.name ?? ''} />}>
      {!c && res.loading && <ActivityIndicator color={colors.accentHi} style={{ marginTop: 40 }} />}
      {!c && res.error && <ErrorNote message={res.error} onRetry={res.reload} />}
      {c?.overview ? <Text style={{ color: colors.text, opacity: 0.88, fontSize: 15, lineHeight: 23, marginBottom: 22, maxWidth: 820 }}>{c.overview}</Text> : null}
      <PosterGrid items={parts} keyOf={(m) => String(m.id)} render={(m, w) => <MediaCard m={m} width={w} />} />
    </Page>
  )
}
