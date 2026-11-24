import { Asset } from 'expo-asset'
import { Image } from 'react-native'
import CATALOGUE from '../../assets/app-icons/icons.json'
import { APP_ICON_DOCK, APP_ICON_THUMBS } from './appIconImages'

// WatchList's icons for Settings → App Icon: the monitor in other colours, and in eight art styles.
// The pictures are drawn by the icon generator into assets/app-icons (thumbnails, the macOS dock
// icon, and Android's launcher icons, which plugins/withAppIcons.js puts in the app).

export type IconGroup = 'Colours' | 'Art Styles'
export interface IconInfo {
  id: string
  name: string
  group: IconGroup
}

export const ICONS: IconInfo[] = CATALOGUE as IconInfo[]

export function AppIcon({ id, size = 60 }: { id: string; size?: number }) {
  return <Image source={APP_ICON_THUMBS[id] ?? APP_ICON_THUMBS.default} style={{ width: size, height: size, borderRadius: size * 0.225 }} />
}

/** The dock icon for `id` as a PNG data URL (desktop). */
export async function dockIcon(id: string): Promise<string> {
  const asset = Asset.fromModule(APP_ICON_DOCK[id] ?? APP_ICON_DOCK.default)
  const blob = await (await fetch(asset.uri)).blob()
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}
