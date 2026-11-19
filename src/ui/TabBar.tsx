import { Ionicons } from '@expo/vector-icons'
import { BlurView } from 'expo-blur'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { IconName } from './kit'
import { colors } from './theme'

import type { TabKey } from '../lib/layout'
export type { TabKey }

/** Every section, as the desktop sidebar lists them. */
export const TABS: Array<{ key: TabKey; label: string; icon: IconName }> = [
  { key: 'shows', label: 'Shows', icon: 'tv' },
  { key: 'movies', label: 'Movies', icon: 'film' },
  { key: 'library', label: 'Library', icon: 'layers' },
  { key: 'calendar', label: 'Calendar', icon: 'calendar' },
  { key: 'discover', label: 'Discover', icon: 'star' },
  { key: 'search', label: 'Search', icon: 'search' },
  { key: 'history', label: 'History', icon: 'time' },
  { key: 'settings', label: 'Settings', icon: 'settings-sharp' }
]

/** Phones: four in the bar, Search as its own round button (Calendar, History and Settings open from the screens). */
export const PHONE_TABS: TabKey[] = ['shows', 'movies', 'library', 'discover']

const glass = { borderRadius: 34, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' } as const

/** The floating glass bar at the bottom (phones). */
export function TabBar({ tab, onChange }: { tab: TabKey; onChange: (t: TabKey) => void }) {
  const insets = useSafeAreaInsets()
  const tabs = TABS.filter((t) => PHONE_TABS.includes(t.key))
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, bottom: Math.max(insets.bottom - 6, 12), flexDirection: 'row', alignItems: 'center' }}>
      <View style={[glass, { flex: 1 }]}>
        <BlurView intensity={40} tint="dark" style={{ flexDirection: 'row', padding: 5, backgroundColor: 'rgba(36,36,40,0.82)' }}>
          {tabs.map((t) => {
            const on = t.key === tab
            return (
              <Pressable
                key={t.key}
                onPress={() => onChange(t.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={{ flex: 1, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? 'rgba(0,0,0,0.45)' : 'transparent' }}
              >
                <Ionicons name={t.icon} size={22} color={on ? colors.accentHi : '#e4e2ea'} />
                <Text style={{ color: on ? colors.text : '#e4e2ea', fontSize: 11, fontWeight: '600', marginTop: 3 }}>{t.label}</Text>
              </Pressable>
            )
          })}
        </BlurView>
      </View>
      <View style={[glass, { marginLeft: 10, borderRadius: 33 }]}>
        <BlurView intensity={40} tint="dark" style={{ backgroundColor: tab === 'search' ? colors.accentSoft : 'rgba(36,36,40,0.82)' }}>
          <Pressable accessibilityLabel="Search" onPress={() => onChange('search')} style={{ width: 66, height: 66, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="search" size={26} color={tab === 'search' ? colors.accentHi : '#fff'} />
          </Pressable>
        </BlurView>
      </View>
    </View>
  )
}
