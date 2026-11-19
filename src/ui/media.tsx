import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { memo, useState, type ReactNode } from 'react'
import { Platform, Pressable, ScrollView, Text, View, type LayoutChangeEvent, type ViewStyle } from 'react-native'
import { itemId } from '../lib/library'
import { useStore } from '../lib/store'
import { dateOf, img, titleOf, yearOf, type MediaSummary } from '../lib/tmdb'
import type { MediaType } from '../lib/types'
import { useRootNav } from '../nav'
import { PressableScale } from './motion'
import { colors } from './theme'

// Posters, rows and grids of shows and movies.

export const POSTER_RATIO = 1.5

/** A poster picture (or the title on a plain card when there's none). */
export const Poster = memo(function Poster({ path, title, width, radius = 10, style }: { path: string | null | undefined; title?: string; width: number | `${number}%`; radius?: number; style?: ViewStyle }) {
  const uri = img(path, typeof width === 'number' && width <= 100 ? 'w185' : 'w342')
  return (
    <View style={[{ width, aspectRatio: 1 / POSTER_RATIO, borderRadius: radius, overflow: 'hidden', backgroundColor: colors.cardHi, borderWidth: 1, borderColor: colors.border }, style]}>
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} recyclingKey={uri} />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 }}>
          <Ionicons name="film-outline" size={22} color={colors.faint} />
          {title ? (
            <Text style={{ color: colors.dim, fontSize: 12, textAlign: 'center', marginTop: 6 }} numberOfLines={3}>
              {title}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  )
})

export function ProgressBar({ value, height = 4, style, track = 'rgba(255,255,255,0.14)' }: { value: number; height?: number; style?: ViewStyle; track?: string }) {
  return (
    <View style={[{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }, style]}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height: '100%', backgroundColor: colors.accent, borderRadius: height / 2 }} />
    </View>
  )
}

/** Opens a show or movie's page. */
export function useOpenTitle() {
  const nav = useRootNav()
  return (type: MediaType, id: number) => nav.push('Title', { type, id })
}

/** A small mark on posters of titles already in your library. */
function InLibraryMark({ id }: { id: string }) {
  const status = useStore((s) => s.items.find((i) => i.id === id)?.status)
  if (!status) return null
  return (
    <View style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: status === 'completed' ? colors.success : colors.accent, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={status === 'completed' ? 'checkmark' : 'bookmark'} size={12} color={status === 'completed' ? '#06210f' : colors.onAccent} />
    </View>
  )
}

/** A poster with its title and year under it. */
export const MediaCard = memo(function MediaCard({ m, width, sub, onPress, footer }: { m: MediaSummary; width: number; sub?: string; onPress?: () => void; footer?: ReactNode }) {
  const open = useOpenTitle()
  const type = (m.media_type === 'movie' ? 'movie' : 'tv') as MediaType
  return (
    <PressableScale onPress={onPress ?? (() => open(type, m.id))} style={{ width }}>
      <View>
        <Poster path={m.poster_path} title={titleOf(m)} width={width} />
        <InLibraryMark id={itemId(type, m.id)} />
      </View>
      {footer}
      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600', marginTop: 7 }} numberOfLines={1}>
        {titleOf(m)}
      </Text>
      <Text style={{ color: colors.dim, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
        {sub ?? [yearOf(dateOf(m)), m.media_type === 'movie' ? 'Movie' : 'TV'].filter(Boolean).join(' · ')}
      </Text>
    </PressableScale>
  )
})

/** A titled, sideways-scrolling row of posters. */
export function Carousel({ title, items, onSeeAll, width = 132, sub }: { title: string; items: MediaSummary[]; onSeeAll?: () => void; width?: number; sub?: (m: MediaSummary) => string | undefined }) {
  if (!items.length) return null
  return (
    <View style={{ marginBottom: 26 }}>
      <SectionHeader title={title} onSeeAll={onSeeAll} />
      <ScrollView horizontal showsHorizontalScrollIndicator={Platform.OS === 'web'} contentContainerStyle={{ gap: 12, paddingBottom: Platform.OS === 'web' ? 10 : 0 }}>
        {items.map((m) => (
          <MediaCard key={`${m.media_type}-${m.id}`} m={m} width={width} sub={sub?.(m)} />
        ))}
      </ScrollView>
    </View>
  )
}

export function SectionHeader({ title, onSeeAll, right }: { title: string; onSeeAll?: () => void; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', flex: 1 }}>{title}</Text>
      {right}
      {onSeeAll && (
        <Pressable onPress={onSeeAll} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: colors.accentHi, fontSize: 14, fontWeight: '600' }}>See all</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.accentHi} />
        </Pressable>
      )}
    </View>
  )
}

/** How many poster columns fit, and how wide each is. */
export function useGrid(min = 128, gap = 14, minColumns = 3) {
  const [width, setWidth] = useState(0)
  const columns = Math.max(minColumns, Math.floor((width + gap) / (min + gap)))
  const cell = width ? Math.floor((width - gap * (columns - 1)) / columns) : 0
  return { onLayout: (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width), columns, cell, gap }
}

/** Posters in rows that fill the width. */
export function PosterGrid<T>({ items, render, keyOf, min = 128, minColumns = 3 }: { items: T[]; render: (item: T, width: number) => ReactNode; keyOf: (item: T) => string; min?: number; minColumns?: number }) {
  const { onLayout, cell, gap } = useGrid(min, 14, minColumns)
  return (
    <View onLayout={onLayout} style={{ flexDirection: 'row', flexWrap: 'wrap', gap, rowGap: 18 }}>
      {cell > 0 &&
        items.map((item) => (
          <View key={keyOf(item)} style={{ width: cell }}>
            {render(item, cell)}
          </View>
        ))}
    </View>
  )
}

/** A wide picture (backdrop or episode still) with a dark fade at the bottom. */
export function Still({ path, style, children, size = 'w780' }: { path: string | null | undefined; style?: ViewStyle; children?: ReactNode; size?: 'w300' | 'w780' | 'w1280' }) {
  const uri = img(path, size)
  return (
    <View style={[{ aspectRatio: 16 / 9, backgroundColor: colors.cardHi, overflow: 'hidden' }, style]}>
      {uri ? <Image source={{ uri }} style={{ position: 'absolute', width: '100%', height: '100%' }} contentFit="cover" transition={150} /> : null}
      {children ? (
        <>
          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)']} locations={[0.35, 1]} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
          {children}
        </>
      ) : null}
    </View>
  )
}

export function Chip({ label, on, onPress, icon }: { label: string; on?: boolean; onPress?: () => void; icon?: React.ComponentProps<typeof Ionicons>['name'] }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        height: 32,
        paddingHorizontal: 13,
        borderRadius: 16,
        backgroundColor: on ? colors.accent : 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: on ? colors.accent : colors.border,
        opacity: pressed ? 0.7 : 1
      })}
    >
      {icon && <Ionicons name={icon} size={14} color={on ? colors.onAccent : colors.dim} style={{ marginRight: 5 }} />}
      <Text style={{ color: on ? colors.onAccent : colors.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  )
}

/** A round profile picture (cast, crew, people). */
export function Avatar({ path, size = 64, name }: { path: string | null | undefined; size?: number; name?: string }) {
  const uri = img(path, 'w185')
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: colors.cardHi, alignItems: 'center', justifyContent: 'center' }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} />
      ) : (
        <Text style={{ color: colors.dim, fontSize: size * 0.34, fontWeight: '600' }}>{(name ?? '?').split(' ').map((w) => w[0]).slice(0, 2).join('')}</Text>
      )}
    </View>
  )
}

/** TMDB's 0–10 score as a star and one decimal. */
export function Score({ value, size = 13 }: { value: number | undefined; size?: number }) {
  if (!value) return null
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Ionicons name="star" size={size} color="#f5c518" />
      <Text style={{ color: colors.text, fontSize: size, fontWeight: '600', marginLeft: 3 }}>{value.toFixed(1)}</Text>
    </View>
  )
}
