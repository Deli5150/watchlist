import { Ionicons } from '@expo/vector-icons'
import { memo, useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'
import { MOVIE_STATUS_LABEL, STATUS_LABEL, useShows } from '../lib/library'
import { showProgress, watchIndex } from '../lib/progress'
import { useStore } from '../lib/store'
import type { LibraryItem, LibrarySort, MediaType, Status } from '../lib/types'
import { EmptyNote, Page, SearchField, Segmented } from '../ui/kit'
import { Chip, Poster, PosterGrid, ProgressBar, useOpenTitle } from '../ui/media'
import { PressableScale } from '../ui/motion'
import { showMenu } from '../ui/overlays'
import { colors } from '../ui/theme'

// Library: every show or movie you've added, by status.

type Filter = 'all' | Status | 'favorites'

const SHOW_FILTERS: Filter[] = ['all', 'watching', 'planned', 'completed', 'paused', 'dropped', 'favorites']
const MOVIE_FILTERS: Filter[] = ['all', 'planned', 'completed', 'favorites']

const SORTS: Array<{ value: LibrarySort; label: string }> = [
  { value: 'recent', label: 'Recently watched' },
  { value: 'added', label: 'Recently added' },
  { value: 'title', label: 'Title' },
  { value: 'rating', label: 'Your rating' },
  { value: 'year', label: 'Release year' }
]

export default function Library() {
  const { items, watches, type, sort, setSettings } = useStore(
    useShallow((s) => ({ items: s.items, watches: s.watches, type: s.settings.libraryType, sort: s.settings.librarySort, setSettings: s.setSettings }))
  )
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const labels = type === 'movie' ? MOVIE_STATUS_LABEL : STATUS_LABEL
  const filters = type === 'movie' ? MOVIE_FILTERS : SHOW_FILTERS

  const list = useMemo(() => {
    const idx = watchIndex(watches)
    const q = query.trim().toLowerCase()
    const out = items.filter(
      (i) => i.type === type && (filter === 'all' || (filter === 'favorites' ? i.favorite : i.status === filter)) && (!q || i.title.toLowerCase().includes(q))
    )
    const last = (i: LibraryItem) => idx.last.get(i.id) ?? i.statusAt
    const by: Record<LibrarySort, (a: LibraryItem, b: LibraryItem) => number> = {
      recent: (a, b) => last(b) - last(a),
      added: (a, b) => b.addedAt - a.addedAt,
      title: (a, b) => a.title.localeCompare(b.title),
      rating: (a, b) => b.rating - a.rating || a.title.localeCompare(b.title),
      year: (a, b) => (b.year || '0').localeCompare(a.year || '0')
    }
    return out.sort(by[sort])
  }, [items, watches, type, filter, query, sort])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, favorites: 0 }
    for (const i of items) {
      if (i.type !== type) continue
      c.all++
      c[i.status] = (c[i.status] ?? 0) + 1
      if (i.favorite) c.favorites++
    }
    return c
  }, [items, type])

  return (
    <Page wide bottomSpace={110}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 34, marginBottom: 16 }}>
        <Text style={{ color: colors.text, fontSize: 34, fontWeight: '800', flex: 1 }}>Library</Text>
        <Pressable
          onPress={() => showMenu('Sort by', SORTS.map((s) => ({ label: s.label, selected: s.value === sort, onPress: () => setSettings({ librarySort: s.value }) })))}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', padding: 6 }}
        >
          <Ionicons name="swap-vertical" size={18} color={colors.accentHi} />
          <Text style={{ color: colors.accentHi, fontWeight: '600', marginLeft: 4 }}>{SORTS.find((s) => s.value === sort)?.label}</Text>
        </Pressable>
      </View>
      <View style={{ maxWidth: 360, marginBottom: 14 }}>
        <Segmented<MediaType>
          value={type}
          onChange={(libraryType) => {
            setSettings({ libraryType })
            setFilter('all')
          }}
          options={[
            { label: 'Shows', value: 'tv' },
            { label: 'Movies', value: 'movie' }
          ]}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }} style={{ marginBottom: 12 }}>
        {filters.map((f) => (
          <Chip key={f} on={f === filter} onPress={() => setFilter(f)} label={`${f === 'all' ? 'All' : f === 'favorites' ? 'Favorites' : labels[f]}${counts[f] ? `  ${counts[f]}` : ''}`} />
        ))}
      </ScrollView>
      {counts.all > 8 && <SearchField value={query} onChange={setQuery} placeholder={`Filter your ${type === 'movie' ? 'movies' : 'shows'}`} style={{ marginBottom: 16, maxWidth: 420 }} />}
      {list.length ? (
        <PosterGrid items={list} keyOf={(i) => i.id} render={(i, w) => <LibraryCard item={i} width={w} />} />
      ) : (
        <EmptyNote>{counts.all ? 'Nothing here.' : type === 'movie' ? 'Movies you add show up here.' : 'Shows you add show up here.'}</EmptyNote>
      )}
    </Page>
  )
}

/** A poster in the library, with the show's progress under it. */
const LibraryCard = memo(function LibraryCard({ item, width }: { item: LibraryItem; width: number }) {
  const open = useOpenTitle()
  const show = useShows((s) => (item.type === 'tv' ? s[item.tmdbId] : undefined))
  const watched = useStore((s) => (item.type === 'tv' ? watchIndex(s.watches).episodes.get(item.id) : undefined))
  const p = show ? showProgress(show, item, watched) : null
  return (
    <PressableScale onPress={() => open(item.type, item.tmdbId)}>
      <View>
        <Poster path={item.poster} title={item.title} width={width} />
        {item.favorite && (
          <View style={{ position: 'absolute', top: 6, right: 6 }}>
            <Ionicons name="heart" size={18} color={colors.accent} />
          </View>
        )}
        {item.type === 'movie' && item.status === 'completed' && (
          <View style={{ position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark" size={13} color="#06210f" />
          </View>
        )}
      </View>
      {p && p.total > 0 && <ProgressBar value={p.watched / p.total} style={{ marginTop: 7 }} />}
      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600', marginTop: 7 }} numberOfLines={1}>
        {item.title}
      </Text>
      <Text style={{ color: colors.dim, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
        {p && p.total ? `${p.watched}/${p.total} episodes` : item.year}
      </Text>
    </PressableScale>
  )
})
