import { Ionicons } from '@expo/vector-icons'
import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'
import { useAsync } from '../lib/hooks'
import { useStore } from '../lib/store'
import { search, type MediaSummary } from '../lib/tmdb'
import { useRootNav } from '../nav'
import { Page, SearchField, Segmented } from '../ui/kit'
import { Avatar, MediaCard, PosterGrid } from '../ui/media'
import { PressableScale } from '../ui/motion'
import { colors, display } from '../ui/theme'
import { ErrorNote } from './Discover'

// Search: your library, or all of TMDB (shows, movies and people), with your recent searches.

export default function Search({ active }: { active?: boolean }) {
  const { scope, recent, items, setSettings } = useStore(useShallow((s) => ({ scope: s.settings.searchScope, recent: s.settings.recentSearches, items: s.items, setSettings: s.setSettings })))
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])
  // Remember a search once it has settled for a moment.
  useEffect(() => {
    if (debounced.length < 2 || scope !== 'discover') return
    const t = setTimeout(() => setSettings({ recentSearches: [debounced, ...recent.filter((r) => r.toLowerCase() !== debounced.toLowerCase())].slice(0, 8) }), 1500)
    return () => clearTimeout(t)
  }, [debounced, scope])

  const results = useAsync(() => (debounced && scope === 'discover' ? search(debounced) : Promise.resolve(null)), [debounced, scope])
  const titles = results.data?.results.filter((r) => r.media_type !== 'person') ?? []
  const people = results.data?.results.filter((r) => r.media_type === 'person') ?? []
  const mine = useMemo(() => {
    const q = debounced.toLowerCase()
    return q ? items.filter((i) => i.title.toLowerCase().includes(q)) : []
  }, [items, debounced])

  return (
    <Page wide bottomSpace={120}>
      <Text style={[display(40), { marginTop: 30, marginBottom: 16 }]}>Search</Text>
      <View style={{ maxWidth: 640, marginBottom: 14 }}>
        <Segmented
          value={scope}
          onChange={(searchScope) => setSettings({ searchScope })}
          options={[
            { label: 'My Library', value: 'library' },
            { label: 'Discover', value: 'discover' }
          ]}
        />
      </View>
      {/* Re-mounted when the tab is shown, so it gets the keyboard focus. */}
      <SearchField key={String(active)} value={query} onChange={setQuery} placeholder={scope === 'library' ? 'Search your library' : 'Shows, movies and people'} autoFocus={active} style={{ marginBottom: 22, height: 46, maxWidth: 640 }} />

      {scope === 'library' ? (
        debounced ? (
          mine.length ? (
            <PosterGrid
              items={mine}
              keyOf={(i) => i.id}
              render={(i, w) => <MediaCard m={{ id: i.tmdbId, media_type: i.type, title: i.title, poster_path: i.poster, backdrop_path: i.backdrop, release_date: i.year ? `${i.year}-01-01` : undefined }} width={w} />}
            />
          ) : (
            <Empty icon="layers" title="Nothing in your library" sub={`No shows or movies called “${debounced}”. Try Discover.`} />
          )
        ) : (
          <Empty icon="layers" title="Search your library" sub="Find shows and movies you’ve added, wherever they are." />
        )
      ) : debounced ? (
        <>
          {results.loading && !results.data && <ActivityIndicator color={colors.accentHi} style={{ marginTop: 30 }} />}
          {results.error && <ErrorNote message={results.error} onRetry={results.reload} />}
          {people.length > 0 && <People people={people} />}
          {titles.length > 0 && <PosterGrid items={titles} keyOf={(m) => `${m.media_type}-${m.id}`} render={(m, w) => <MediaCard m={m} width={w} />} />}
          {results.data && !titles.length && !people.length && <Empty icon="search" title="Nothing found" sub={`Nothing on TMDB matches “${debounced}”.`} />}
        </>
      ) : (
        <>
          <Empty icon="search" title="Find something…" />
          {recent.length > 0 && (
            <View style={{ alignSelf: 'center', width: '100%', maxWidth: 380 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Ionicons name="time-outline" size={15} color={colors.dim} />
                <Text style={{ color: colors.dim, fontSize: 12.5, fontWeight: '800', letterSpacing: 1, marginLeft: 6, flex: 1 }}>RECENT SEARCHES</Text>
                <Pressable onPress={() => setSettings({ recentSearches: [] })} hitSlop={8}>
                  <Text style={{ color: colors.accentHi, fontWeight: '700' }}>Clear</Text>
                </Pressable>
              </View>
              <View style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
                {recent.map((r, i) => (
                  <Pressable key={r} onPress={() => setQuery(r)} style={(state) => ({ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 46, borderTopWidth: i ? 1 : 0, borderColor: colors.separator, backgroundColor: (state as { hovered?: boolean }).hovered ? colors.cardHi : 'transparent' })}>
                    <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>{r}</Text>
                    <Ionicons name="arrow-up-outline" size={16} color={colors.dim} style={{ transform: [{ rotate: '45deg' }] }} />
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </>
      )}
    </Page>
  )
}

function Empty({ icon, title, sub }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; sub?: string }) {
  return (
    <View style={{ alignItems: 'center', marginTop: 40, marginBottom: 30 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={28} color={colors.text} />
      </View>
      <Text style={[display(26), { marginTop: 12 }]}>{title}</Text>
      {sub ? <Text style={{ color: colors.dim, fontSize: 15, marginTop: 6, textAlign: 'center', maxWidth: 360, lineHeight: 21 }}>{sub}</Text> : null}
    </View>
  )
}

function People({ people }: { people: MediaSummary[] }) {
  const nav = useRootNav()
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
      {people.slice(0, 8).map((p) => (
        <PressableScale key={p.id} onPress={() => nav.push('Person', { id: p.id })} style={{ width: 92, alignItems: 'center' }}>
          <Avatar path={p.profile_path} size={76} name={p.name} />
          <Text style={[display(15), { marginTop: 6, textAlign: 'center' }]} numberOfLines={2}>
            {p.name}
          </Text>
          <Text style={{ color: colors.dim, fontSize: 11, marginTop: 1 }}>{p.known_for_department}</Text>
        </PressableScale>
      ))}
    </View>
  )
}
