import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useAsync } from '../lib/hooks'
import { formatDate } from '../lib/progress'
import { collection, dateOf, person, yearOf, type MediaSummary } from '../lib/tmdb'
import type { RootParams } from '../nav'
import { Header, Page, Segmented } from '../ui/kit'
import { Avatar, Carousel, MediaCard, PosterGrid } from '../ui/media'
import { colors } from '../ui/theme'
import { ErrorNote } from './Discover'

// A person's page (cast or crew), and a movie collection's page.

export default function Person({ route }: NativeStackScreenProps<RootParams, 'Person'>) {
  const res = useAsync(() => person(route.params.id), [route.params.id])
  const p = res.data
  const [tab, setTab] = useState<'cast' | 'crew'>('cast')
  const [bio, setBio] = useState(false)

  const { cast, crew, known } = useMemo(() => {
    const dedupe = (list: MediaSummary[]) => {
      const seen = new Map<string, MediaSummary>()
      for (const m of list) {
        if (m.media_type === 'person') continue
        const k = `${m.media_type}-${m.id}`
        const had = seen.get(k)
        seen.set(k, had ? { ...had, job: [had.job, m.job].filter(Boolean).join(', ') } : m)
      }
      return [...seen.values()].sort((a, b) => (dateOf(b) || '9999').localeCompare(dateOf(a) || '9999'))
    }
    const cast = dedupe(p?.combined_credits?.cast ?? [])
    const crew = dedupe(p?.combined_credits?.crew ?? [])
    const pool = p?.known_for_department === 'Acting' ? cast : [...crew, ...cast]
    // Known for: the most voted-on titles, leaving out talk shows and the like (huge episode counts).
    const known = [...pool]
      .filter((m) => !(m.media_type === 'tv' && (m.episode_count ?? 0) > 200))
      .sort((a, b) => ((b as { vote_count?: number }).vote_count ?? 0) - ((a as { vote_count?: number }).vote_count ?? 0))
      .slice(0, 12)
    return { cast, crew, known }
  }, [p])

  const credits = tab === 'cast' || !crew.length ? cast : crew
  return (
    <Page wide header={<Header title={p?.name ?? ''} />}>
      {!p && res.loading && <ActivityIndicator color={colors.accentHi} style={{ marginTop: 40 }} />}
      {!p && res.error && <ErrorNote message={res.error} onRetry={res.reload} />}
      {p && (
        <>
          <View style={{ flexDirection: 'row', marginBottom: 20, alignItems: 'center' }}>
            <Avatar path={p.profile_path} size={120} name={p.name} />
            <View style={{ flex: 1, marginLeft: 20 }}>
              <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800' }}>{p.name}</Text>
              <Text style={{ color: colors.dim, fontSize: 14, marginTop: 4 }}>{p.known_for_department}</Text>
              {p.birthday && (
                <Text style={{ color: colors.dim, fontSize: 14, marginTop: 4 }}>
                  {`Born ${formatDate(p.birthday, true)}${p.place_of_birth ? ` in ${p.place_of_birth}` : ''}${p.deathday ? ` · Died ${formatDate(p.deathday, true)}` : ''}`}
                </Text>
              )}
            </View>
          </View>
          {p.biography ? (
            <Pressable onPress={() => setBio(!bio)} style={{ marginBottom: 24, maxWidth: 820 }}>
              <Text style={{ color: colors.text, opacity: 0.88, fontSize: 15, lineHeight: 23 }} numberOfLines={bio ? undefined : 5}>
                {p.biography}
              </Text>
            </Pressable>
          ) : null}
          <Carousel title="Known for" items={known} />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', flex: 1 }}>Credits</Text>
            {cast.length > 0 && crew.length > 0 && (
              <View style={{ width: 220 }}>
                <Segmented
                  value={tab}
                  onChange={setTab}
                  options={[
                    { label: `Acting ${cast.length}`, value: 'cast' },
                    { label: `Crew ${crew.length}`, value: 'crew' }
                  ]}
                />
              </View>
            )}
          </View>
          <PosterGrid
            items={credits}
            keyOf={(m) => `${m.media_type}-${m.id}`}
            render={(m, w) => <MediaCard m={m} width={w} sub={[yearOf(dateOf(m)) || 'TBA', m.character || m.job].filter(Boolean).join(' · ')} />}
          />
        </>
      )}
    </Page>
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
