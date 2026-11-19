import * as DocumentPicker from 'expo-document-picker'
import { copyAsync, deleteAsync, documentDirectory, readDirectoryAsync } from 'expo-file-system/legacy'
import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { desktop } from './storage'
import { useStore } from './store'

// Wallpapers behind the pages: a few built in (drawn by scripts/render-wallpapers.cjs), or a
// picture of your own. Yours stays on this device: on desktop a resized JPEG in the data folder,
// on phones a copy in the app's documents.

export const WALLPAPERS: Array<{ id: string; name: string; full: number; thumb: number }> = [
  { id: 'curtain', name: 'Curtain', full: require('../../assets/wallpapers/curtain.jpg'), thumb: require('../../assets/wallpapers/curtain-thumb.jpg') },
  { id: 'projector', name: 'Projector', full: require('../../assets/wallpapers/projector.jpg'), thumb: require('../../assets/wallpapers/projector-thumb.jpg') },
  { id: 'synthwave', name: 'Synthwave', full: require('../../assets/wallpapers/synthwave.jpg'), thumb: require('../../assets/wallpapers/synthwave-thumb.jpg') },
  { id: 'aurora', name: 'Aurora', full: require('../../assets/wallpapers/aurora.jpg'), thumb: require('../../assets/wallpapers/aurora-thumb.jpg') },
  { id: 'nebula', name: 'Nebula', full: require('../../assets/wallpapers/nebula.jpg'), thumb: require('../../assets/wallpapers/nebula-thumb.jpg') },
  { id: 'dusk', name: 'Dusk', full: require('../../assets/wallpapers/dusk.jpg'), thumb: require('../../assets/wallpapers/dusk-thumb.jpg') }
]

export type WallpaperSource = number | { uri: string }

const nativeFile = (stamp: number) => `${documentDirectory}wallpaper-${stamp}.jpg`
const WEB_KEY = 'watchlist:wallpaper'

let loaded: { stamp: number; uri: Promise<string | null>; value?: string | null } | null = null

/** Your own picture, if you've picked one (read once per picture: every page shows it). */
function loadCustom(stamp: number): Promise<string | null> {
  if (loaded?.stamp !== stamp) {
    const entry: NonNullable<typeof loaded> = { stamp, uri: readCustom(stamp).catch(() => null) }
    void entry.uri.then((v) => (entry.value = v))
    loaded = entry
  }
  return loaded.uri
}

async function readCustom(stamp: number): Promise<string | null> {
  if (desktop) return desktop.wallpaper.get()
  if (Platform.OS === 'web') {
    try {
      return localStorage.getItem(WEB_KEY)
    } catch {
      return null
    }
  }
  return stamp ? nativeFile(stamp) : null
}

/** Resizes a picked picture (web and desktop) to a JPEG data URL no wider or taller than 2560px. */
async function shrink(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.86)
}

/** Asks for a picture and makes it the wallpaper. False if nothing was picked. */
export async function importWallpaper(): Promise<boolean> {
  const res = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true })
  if (res.canceled) return false
  const asset = res.assets[0]
  const stamp = Date.now()
  if (Platform.OS === 'web') {
    const dataUrl = await shrink(asset.file ?? (await (await fetch(asset.uri)).blob()))
    if (desktop) await desktop.wallpaper.set(dataUrl)
    else localStorage.setItem(WEB_KEY, dataUrl)
  } else {
    // A new name each time, so the image cache doesn't show the old one; earlier copies go.
    const old = (await readDirectoryAsync(documentDirectory!).catch(() => [] as string[])).filter((f) => f.startsWith('wallpaper-'))
    await copyAsync({ from: asset.uri, to: nativeFile(stamp) })
    for (const f of old) await deleteAsync(`${documentDirectory}${f}`, { idempotent: true })
  }
  useStore.getState().setSettings({ wallpaper: 'custom', wallpaperStamp: stamp })
  return true
}

/** The current wallpaper's picture, or null for the theme's plain background. */
export function useWallpaper(): WallpaperSource | null {
  const id = useStore((s) => s.settings.wallpaper)
  const stamp = useStore((s) => s.settings.wallpaperStamp)
  const [custom, setCustom] = useState<string | null>(() => (loaded?.stamp === stamp ? (loaded.value ?? null) : null))
  useEffect(() => {
    if (id !== 'custom') return
    let live = true
    void loadCustom(stamp).then((uri) => live && setCustom(uri))
    return () => {
      live = false
    }
  }, [id, stamp])
  if (!id) return null
  if (id === 'custom') return custom ? { uri: custom } : null
  return WALLPAPERS.find((w) => w.id === id)?.full ?? null
}
