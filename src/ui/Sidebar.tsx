import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { Pressable, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'
import { useTab } from '../lib/layout'
import { useStore } from '../lib/store'
import { useSyncBusy } from '../lib/syncRunner'
import { TABS, type TabKey } from './TabBar'
import { colors } from './theme'

/** The desktop app's navigation, on the left of the window. */
export function Sidebar({ onTab }: { onTab: (t: TabKey) => void }) {
  const tab = useTab((s) => s.tab)
  const { sync, shows, movies } = useStore(
    useShallow((s) => ({ sync: s.sync, shows: s.items.filter((i) => i.type === 'tv' && i.status === 'watching').length, movies: s.items.filter((i) => i.type === 'movie' && i.status === 'planned').length }))
  )
  const syncing = useSyncBusy()
  return (
    <View style={{ width: 224, backgroundColor: colors.cardHi, borderRightWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingTop: 22, paddingBottom: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, marginBottom: 26 }}>
        <Image source={require('../../assets/icon.png')} style={{ width: 30, height: 30, borderRadius: 8 }} />
        <Text style={{ color: colors.text, fontSize: 19, fontWeight: '800', marginLeft: 10 }}>WatchList</Text>
      </View>
      {TABS.map((t) => {
        const on = t.key === tab
        return (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            onPress={() => onTab(t.key)}
            style={(state) => ({
              flexDirection: 'row',
              alignItems: 'center',
              height: 40,
              borderRadius: 10,
              paddingHorizontal: 10,
              marginBottom: 4,
              backgroundColor: on ? colors.accentSoft : (state as { hovered?: boolean }).hovered || state.pressed ? 'rgba(255,255,255,0.05)' : 'transparent'
            })}
          >
            <Ionicons name={t.icon} size={18} color={on ? colors.accentHi : colors.dim} />
            <Text style={{ color: on ? colors.text : colors.dim, fontSize: 15, fontWeight: on ? '600' : '500', marginLeft: 12 }}>{t.label}</Text>
          </Pressable>
        )
      })}
      <View style={{ flex: 1 }} />
      <View style={{ paddingHorizontal: 6 }}>
        <Text style={{ color: colors.dim, fontSize: 13 }}>{`${shows} watching · ${movies} ${movies === 1 ? 'movie' : 'movies'} to watch`}</Text>
        {sync.enabled && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
            <Ionicons name={sync.error ? 'cloud-offline-outline' : 'cloud-done-outline'} size={14} color={sync.error ? colors.danger : colors.dim} />
            <Text style={{ color: colors.dim, fontSize: 12, marginLeft: 6 }}>{syncing ? 'Syncing…' : sync.error ? 'Sync needs attention' : 'Synced with Google'}</Text>
          </View>
        )}
      </View>
    </View>
  )
}
