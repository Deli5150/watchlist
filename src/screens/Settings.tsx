import { Image } from 'expo-image'
import * as Linking from 'expo-linking'
import { Pressable, Share, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'
import { LANGUAGES } from '../lib/defaults'
import { REPO_URL } from '../lib/release'
import { desktop } from '../lib/storage'
import { useStore } from '../lib/store'
import { useUpdate } from '../lib/updater'
import { useRootNav } from '../nav'
import { Group, GroupTitle, Page, Row, Toggle } from '../ui/kit'
import { showMenu } from '../ui/overlays'
import { colors, display, THEMES } from '../ui/theme'
import { VERSION } from '../version'
import { Wordmark } from '../ui/Sidebar'
import { regionName } from './more'

export const openUrl = (url: string): void => {
  if (desktop) desktop.openExternal(url)
  else void Linking.openURL(url)
}

export const plural = (n: number, word: string): string => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`

const MARK_PREVIOUS = { ask: 'Ask', always: 'Always', never: 'Never' } as const

export default function Settings() {
  const nav = useRootNav()
  const { settings, setSettings, items, watches, sync } = useStore(useShallow((s) => ({ settings: s.settings, setSettings: s.setSettings, items: s.items, watches: s.watches, sync: s.sync })))
  const update = useUpdate()
  const updateValue = update.state === 'available' || update.state === 'ready' ? `${update.version} available` : `v${VERSION}`
  return (
    <Page bottomSpace={120}>
      <Text style={[display(40), { marginTop: 30, marginBottom: 16 }]}>Settings</Text>
      <View style={{ borderRadius: 24, borderWidth: 2, borderColor: colors.accent, backgroundColor: colors.accentSoft, padding: 18, marginBottom: 22, flexDirection: 'row', alignItems: 'center' }}>
        <Image source={require('../../assets/icon.png')} style={{ width: 44, height: 44, borderRadius: 11 }} />
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={display(22)}>
            WATCHLIST <Text style={{ color: colors.accentHi }}>FREE FOREVER</Text>
          </Text>
          <Text style={{ color: colors.text, fontSize: 14, marginTop: 2, opacity: 0.85 }}>{`${plural(items.filter((i) => i.type === 'tv').length, 'show')} · ${plural(items.filter((i) => i.type === 'movie').length, 'movie')} · ${watches.length.toLocaleString()} watched. No premium, no ads.`}</Text>
        </View>
      </View>

      <GroupTitle>Appearance & Customization</GroupTitle>
      <Group>
        <Row icon="contrast" label="Theme" value={THEMES[settings.theme]?.name} onPress={() => nav.navigate('Appearance')} />
        <Row icon="language-outline" label="Titles and descriptions" value={LANGUAGES.find((l) => l.code === settings.language)?.name ?? settings.language} onPress={() => nav.navigate('Language')} />
        <Row
          icon="checkmark-done-outline"
          label="Mark earlier episodes too"
          sub="When you mark an episode with unwatched ones before it"
          value={MARK_PREVIOUS[settings.markPrevious]}
          accessory="updown"
          onPress={() =>
            showMenu(
              'Mark earlier episodes too',
              (Object.keys(MARK_PREVIOUS) as Array<keyof typeof MARK_PREVIOUS>).map((k) => ({ label: MARK_PREVIOUS[k], selected: settings.markPrevious === k, onPress: () => setSettings({ markPrevious: k }) }))
            )
          }
        />
      </Group>

      <GroupTitle>Where to Watch & Notifications</GroupTitle>
      <Group>
        <Row icon="globe-outline" label="Region" value={regionName(settings.region)} onPress={() => nav.navigate('Region')} />
        <Row icon="notifications-outline" label="New episode alerts" sub="On the morning a show you follow gets a new episode" accessory="none" right={<Toggle value={settings.notifications} onChange={(notifications) => setSettings({ notifications })} />} />
      </Group>

      <GroupTitle>Your Data</GroupTitle>
      <Group>
        <Row icon="sync" label="Sync with Google" value={sync.enabled ? 'On' : 'Off'} onPress={() => nav.navigate('Sync')} />
        <Row icon="archive-outline" label="Backups" onPress={() => nav.navigate('Data')} />
      </Group>

      <GroupTitle>Support & Info</GroupTitle>
      <Group>
        <Row icon="sparkles-outline" label="What's New" onPress={() => nav.navigate('WhatsNew')} />
        <Row icon="cloud-download-outline" label="Updates" value={updateValue} onPress={() => nav.navigate('Updates')} />
        <Row icon="help-buoy-outline" label="Report a bug or request a feature" onPress={() => nav.navigate('Feedback')} />
        <Row icon="tv-outline" label="About WatchList" onPress={() => nav.navigate('About')} />
        <Row icon="share-outline" label="Share WatchList" accessory="none" onPress={() => void Share.share({ message: `I keep track of my shows and movies with WatchList: ${REPO_URL}` })} />
        <Row icon="logo-github" label="Source code" value="GitHub" accessory="external" onPress={() => openUrl(REPO_URL)} />
      </Group>

      <Pressable onPress={() => openUrl('https://www.themoviedb.org')} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingHorizontal: 6 }}>
        <View style={{ width: 62, height: 46, borderRadius: 8, backgroundColor: '#0d253f', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#90cea1', fontSize: 15, fontWeight: '900', letterSpacing: 1 }}>TMDB</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>Data provided by TMDB</Text>
          <Text style={{ color: colors.dim, fontSize: 13, marginTop: 2 }}>WatchList is not endorsed or certified by TMDB. Streaming data by JustWatch.</Text>
        </View>
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 22, paddingHorizontal: 6 }}>
        <Image source={require('../../assets/icon.png')} style={{ width: 30, height: 30, borderRadius: 8 }} />
        <Wordmark size={24} style={{ marginLeft: 10, flex: 1 }} />
        <View style={{ backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 12, height: 28, justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>{`Version ${VERSION}`}</Text>
        </View>
      </View>
    </Page>
  )
}
