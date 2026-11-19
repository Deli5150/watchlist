import { Image } from 'expo-image'
import * as Linking from 'expo-linking'
import { Pressable, Share, Text } from 'react-native'
import { useShallow } from 'zustand/react/shallow'
import { LANGUAGES } from '../lib/defaults'
import { REPO_URL } from '../lib/release'
import { desktop } from '../lib/storage'
import { useStore } from '../lib/store'
import { useUpdate } from '../lib/updater'
import { useRootNav } from '../nav'
import { Group, Page, Row, Toggle } from '../ui/kit'
import { showMenu } from '../ui/overlays'
import { colors, THEMES } from '../ui/theme'
import { VERSION } from '../version'
import { regionName } from './more'

export const openUrl = (url: string): void => {
  if (desktop) desktop.openExternal(url)
  else void Linking.openURL(url)
}

const MARK_PREVIOUS = { ask: 'Ask', always: 'Always', never: 'Never' } as const

export default function Settings() {
  const nav = useRootNav()
  const { settings, setSettings, items, watches, sync } = useStore(useShallow((s) => ({ settings: s.settings, setSettings: s.setSettings, items: s.items, watches: s.watches, sync: s.sync })))
  const update = useUpdate()
  const updateValue = update.state === 'available' || update.state === 'ready' ? `${update.version} available` : `v${VERSION}`
  return (
    <Page bottomSpace={110}>
      <Text style={{ color: colors.text, fontSize: 34, fontWeight: '800', marginTop: 34, marginBottom: 16 }}>Settings</Text>
      <Group>
        <Row label="WatchList" sub={`${items.filter((i) => i.type === 'tv').length} shows · ${items.filter((i) => i.type === 'movie').length} movies · ${watches.length} watched`} accessory="none" />
      </Group>
      <Group>
        <Row icon="color-palette-outline" label="Appearance" value={THEMES[settings.theme]?.name} onPress={() => nav.navigate('Appearance')} />
        <Row icon="globe-outline" label="Where to watch region" value={regionName(settings.region)} onPress={() => nav.navigate('Region')} />
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
        <Row icon="notifications-outline" label="New episode alerts" sub="On the morning a show you follow gets a new episode" accessory="none" right={<Toggle value={settings.notifications} onChange={(notifications) => setSettings({ notifications })} />} />
      </Group>
      <Group>
        <Row icon="sync" label="Sync with Google" value={sync.enabled ? 'On' : 'Off'} onPress={() => nav.navigate('Sync')} />
        <Row icon="folder-outline" label="Backup and import" onPress={() => nav.navigate('Data')} />
      </Group>
      <Group>
        <Row icon="sparkles-outline" label="What's New" onPress={() => nav.navigate('WhatsNew')} />
        <Row icon="cloud-download-outline" label="Updates" value={updateValue} onPress={() => nav.navigate('Updates')} />
        <Row icon="chatbubble-ellipses-outline" label="Report a bug or request a feature" onPress={() => nav.navigate('Feedback')} />
        <Row icon="information-circle-outline" label="About and credits" onPress={() => nav.navigate('About')} />
        <Row icon="share-outline" label="Share WatchList" accessory="none" onPress={() => void Share.share({ message: `I keep track of my shows and movies with WatchList: ${REPO_URL}` })} />
        <Row icon="logo-github" label="Source code" value="GitHub" accessory="external" onPress={() => openUrl(REPO_URL)} />
      </Group>
      <Pressable onPress={() => openUrl(REPO_URL)} style={{ alignItems: 'center', marginTop: 16 }}>
        <Text style={{ color: colors.accentHi, fontSize: 17, fontWeight: '700' }}>WatchList {VERSION}</Text>
        <Image source={require('../../assets/icon.png')} style={{ width: 54, height: 54, borderRadius: 13, marginTop: 10 }} />
      </Pressable>
    </Page>
  )
}
