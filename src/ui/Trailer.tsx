import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import * as ScreenOrientation from 'expo-screen-orientation'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useRef } from 'react'
import { Animated, BackHandler, Easing, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { create } from 'zustand'
import type { Video } from '../lib/tmdb'
import { openUrl } from '../screens/Settings'
import { useWide } from '../lib/layout'
import { colors } from './theme'
import { VideoFrame } from './VideoFrame'

// Trailers and clips play here, inside WatchList, over the page. "Open in YouTube" leaves the app.
// On phones the player covers the screen, Back closes it, and the phone may turn sideways while
// it's open (the app is otherwise portrait) so the video, or YouTube's full screen, fills it.

interface TrailerState {
  title: string
  videos: Video[]
  current: Video
}

const useTrailer = create<{ open: TrailerState | null }>(() => ({ open: null }))

/** YouTube videos worth showing, best first: official trailers, then teasers, clips and the rest. */
export function playableVideos(videos: Video[] | undefined): Video[] {
  const rank = (v: Video) => ({ Trailer: 0, Teaser: 1, Clip: 2, Featurette: 3 })[v.type] ?? 4
  return (videos ?? []).filter((v) => v.site === 'YouTube').sort((a, b) => rank(a) - rank(b) || Number(b.official) - Number(a.official))
}

export function playTrailer(title: string, videos: Video[], start?: Video): void {
  const list = playableVideos(videos)
  const current = start ?? list[0]
  if (current) useTrailer.setState({ open: { title, videos: list, current } })
}

export const closeTrailer = (): void => useTrailer.setState({ open: null })

export const youtubeUrl = (key: string): string => `https://www.youtube.com/watch?v=${key}`
export const youtubeThumb = (key: string): string => `https://i.ytimg.com/vi/${key}/hqdefault.jpg`

/** The player. Mounted once at the app's root. */
export function TrailerHost() {
  const open = useTrailer((s) => s.open)
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const fade = useRef(new Animated.Value(0)).current
  const wide = useWide()
  const phone = Platform.OS !== 'web'
  const landscape = phone && width > height

  useEffect(() => {
    if (!phone || !open) return
    void ScreenOrientation.unlockAsync().catch(() => null)
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeTrailer()
      return true
    })
    return () => {
      sub.remove()
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => null)
    }
  }, [phone, Boolean(open)])

  useEffect(() => {
    if (!open) return
    fade.setValue(0)
    Animated.timing(fade, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }).start()
    // Esc closes it on desktop.
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeTrailer()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open?.title, fade])

  if (!open) return null
  if (!wide) return <PhonePlayer open={open} width={width} height={height} landscape={landscape} fade={fade} />
  // As big as fits: 16:9 within the window, leaving room for the bar and the other videos.
  const others = open.videos.length > 1
  const maxW = Math.min(1100, width - 32)
  const maxH = height - insets.top - insets.bottom - (others ? 230 : 140)
  const playerW = Math.max(240, Math.min(maxW, (maxH * 16) / 9))

  return (
    <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: fade, alignItems: 'center', justifyContent: 'center', paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <Pressable accessibilityLabel="Close trailer" onPress={closeTrailer} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.94)' }} />
      <View style={{ width: playerW }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }} numberOfLines={1}>
              {open.title}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 2 }} numberOfLines={1}>
              {open.current.name}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              closeTrailer()
              openUrl(youtubeUrl(open.current.key))
            }}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', opacity: pressed ? 0.7 : 1, marginRight: 8 })}
          >
            <Ionicons name="logo-youtube" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14, marginLeft: 6 }}>Open in YouTube</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Close"
            onPress={closeTrailer}
            hitSlop={8}
            style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
          >
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>
        </View>
        <VideoFrame youtubeKey={open.current.key} style={{ width: playerW, aspectRatio: 16 / 9, borderRadius: 14 }} />
        {others && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingTop: 14 }}>
            {open.videos.map((v) => {
              const on = v.key === open.current.key
              return (
                <Pressable key={v.key} onPress={() => useTrailer.setState({ open: { ...open, current: v } })} style={{ width: 148, opacity: on ? 1 : 0.75 }}>
                  <View style={{ borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: on ? colors.accent : 'transparent' }}>
                    <Image source={{ uri: youtubeThumb(v.key) }} style={{ width: '100%', aspectRatio: 16 / 9 }} contentFit="cover" />
                  </View>
                  <Text style={{ color: '#fff', fontSize: 12, marginTop: 5 }} numberOfLines={1}>
                    {v.name}
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>{v.type}</Text>
                </Pressable>
              )
            })}
          </ScrollView>
        )}
      </View>
    </Animated.View>
  )
}

/**
 * Phones: the video across the whole width or, turned sideways, the whole screen, on black. One
 * layout for both, so turning the phone doesn't restart the video.
 */
function PhonePlayer({ open, width, height, landscape, fade }: { open: TrailerState; width: number; height: number; landscape: boolean; fade: Animated.Value }) {
  const insets = useSafeAreaInsets()
  const close = (
    <Pressable
      accessibilityLabel="Close"
      onPress={closeTrailer}
      hitSlop={10}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
    >
      <Ionicons name="close" size={22} color="#fff" />
    </Pressable>
  )
  const videoW = landscape ? Math.min(width - insets.left - insets.right - 120, ((height - insets.top - insets.bottom) * 16) / 9) : width
  return (
    <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#000', opacity: fade, paddingTop: landscape ? 0 : insets.top + 8 }}>
      <StatusBar hidden={landscape} style="light" />
      {!landscape && (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 16 }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ color: '#fff', fontSize: 19, fontWeight: '700' }} numberOfLines={1}>
              {open.title}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 2 }} numberOfLines={1}>
              {open.current.name}
            </Text>
          </View>
          {close}
        </View>
      )}
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: landscape ? 0 : 60 }}>
        <VideoFrame youtubeKey={open.current.key} style={{ width: videoW, height: (videoW * 9) / 16 }} />
        {!landscape && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
            <Ionicons name="phone-landscape-outline" size={15} color="rgba(255,255,255,0.45)" />
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginLeft: 6 }}>Turn your phone for a bigger picture</Text>
          </View>
        )}
      </View>
      {!landscape && open.videos.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }} style={{ flexGrow: 0, marginBottom: 14 }}>
          {open.videos.map((v) => {
            const on = v.key === open.current.key
            return (
              <Pressable key={v.key} onPress={() => useTrailer.setState({ open: { ...open, current: v } })} style={{ width: 150, opacity: on ? 1 : 0.75 }}>
                <View style={{ borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: on ? colors.accent : 'transparent' }}>
                  <Image source={{ uri: youtubeThumb(v.key) }} style={{ width: '100%', aspectRatio: 16 / 9 }} contentFit="cover" />
                </View>
                <Text style={{ color: '#fff', fontSize: 12.5, marginTop: 5 }} numberOfLines={1}>
                  {v.name}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11.5 }}>{v.type}</Text>
              </Pressable>
            )
          })}
        </ScrollView>
      )}
      {!landscape && (
        <Pressable
          onPress={() => {
            closeTrailer()
            openUrl(youtubeUrl(open.current.key))
          }}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 48, marginHorizontal: 16, marginBottom: insets.bottom + 16, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.12)', opacity: pressed ? 0.7 : 1 })}
        >
          <Ionicons name="logo-youtube" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15, marginLeft: 8 }}>Open in YouTube</Text>
        </Pressable>
      )}
      {landscape && <View style={{ position: 'absolute', top: insets.top + 12, left: insets.left + 12 }}>{close}</View>}
    </Animated.View>
  )
}
