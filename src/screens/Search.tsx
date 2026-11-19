import { useEffect, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { useAsync } from '../lib/hooks'
import { list, search, type MediaSummary } from '../lib/tmdb'
import { useRootNav } from '../nav'
import { EmptyNote, Page, SearchField } from '../ui/kit'
import { Avatar, MediaCard, PosterGrid } from '../ui/media'
import { PressableScale } from '../ui/motion'
import { colors } from '../ui/theme'
import { ErrorNote } from './Discover'

// Search shows, movies and people on TMDB.

export default function Search({ active }: { active?: boolean }) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])
  const results = useAsync(() => (debounced ? search(debounced) : Promise.resolve(null)), [debounced])
  const trending = useAsync(() => list('trending'), [])
  const titles = results.data?.results.filter((r) => r.media_type !== 'person') ?? []
  const people = results.data?.results.filter((r) => r.media_type === 'person') ?? []

  return (
    <Page wide bottomSpace={110}>
      <Text style={{ color: colors.text, fontSize: 34, fontWeight: '800', marginTop: 34, marginBottom: 16 }}>Search</Text>
      {/* Re-mounted when the tab is shown, so it gets the keyboard focus. */}
      <SearchField key={String(active)} value={query} onChange={setQuery} placeholder="Shows, movies and people" autoFocus={active} style={{ marginBottom: 22, height: 46, maxWidth: 640 }} />
      {debounced ? (
        <>
          {results.loading && !results.data && <ActivityIndicator color={colors.accentHi} style={{ marginTop: 30 }} />}
          {results.error && <ErrorNote message={results.error} onRetry={results.reload} />}
          {people.length > 0 && <People people={people} />}
          {titles.length > 0 && <PosterGrid items={titles} keyOf={(m) => `${m.media_type}-${m.id}`} render={(m, w) => <MediaCard m={m} width={w} />} />}
          {results.data && !titles.length && !people.length && <EmptyNote>{`Nothing found for “${debounced}”.`}</EmptyNote>}
        </>
      ) : (
        <>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', marginBottom: 12 }}>Trending</Text>
          <PosterGrid items={trending.data?.results ?? []} keyOf={(m) => `${m.media_type}-${m.id}`} render={(m, w) => <MediaCard m={m} width={w} />} />
        </>
      )}
    </Page>
  )
}

function People({ people }: { people: MediaSummary[] }) {
  const nav = useRootNav()
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
      {people.slice(0, 8).map((p) => (
        <PressableScale key={p.id} onPress={() => nav.push('Person', { id: p.id })} style={{ width: 92, alignItems: 'center' }}>
          <Avatar path={p.profile_path} size={76} name={p.name} />
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600', marginTop: 6, textAlign: 'center' }} numberOfLines={2}>
            {p.name}
          </Text>
          <Text style={{ color: colors.dim, fontSize: 11, marginTop: 1 }}>{p.known_for_department}</Text>
        </PressableScale>
      ))}
    </View>
  )
}
