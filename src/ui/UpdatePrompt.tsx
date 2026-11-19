import { FadeIn } from './motion'
import { useShallow } from 'zustand/react/shallow'
import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import * as Linking from 'expo-linking'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { create } from 'zustand'
import { useStore } from '../lib/store'
import { downloadUpdate, installUpdate, useUpdate } from '../lib/updater'
import { desktop } from '../lib/storage'
import { Sheet } from './overlays'
import { colors } from './theme'

// The "Update available" sheet, shown when a check finds a new version (and from Settings → Updates).
// On an iPhone, Update opens a chooser: a sideloading app (AltStore, SideStore, Feather, FlareStore)
// installs the new .ipa straight from the release, or the .ipa is downloaded to sideload by hand.
// Elsewhere Update downloads and installs in place. "Later" waits a day; "Skip" never offers that version.

const DAY = 24 * 3600_000

export const useUpdatePrompt = create<{ open: boolean; page: 'prompt' | 'choose'; forceChooser: boolean }>(() => ({ open: false, page: 'prompt', forceChooser: false }))

/** Opens the sheet (from Settings → Updates, or the iPhone's Update button there). */
export const openUpdatePrompt = (page: 'prompt' | 'choose' = 'prompt'): void => useUpdatePrompt.setState({ open: true, page })

interface Sideloader {
  name: string
  icon: number
  scheme: string
  url: (ipa: string) => string
}

/** Each app's own link for installing an .ipa from a URL. */
export const SIDELOADERS: Sideloader[] = [
  { name: 'AltStore', icon: require('../../assets/sideload/altstore.png'), scheme: 'altstore://', url: (ipa) => `altstore://install?url=${encodeURIComponent(ipa)}` },
  { name: 'SideStore', icon: require('../../assets/sideload/sidestore.png'), scheme: 'sidestore://', url: (ipa) => `sidestore://install?url=${encodeURIComponent(ipa)}` },
  { name: 'Feather', icon: require('../../assets/sideload/feather.png'), scheme: 'feather://', url: (ipa) => `feather://install/${ipa}` },
  { name: 'FlareStore', icon: require('../../assets/sideload/flarestore.png'), scheme: 'flarestore://', url: (ipa) => `flarestore://downloadApp=${ipa}` }
]

function ChoiceRow({ icon, iconNode, title, sub, onPress }: { icon?: number; iconNode?: React.ReactNode; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', backgroundColor: pressed ? colors.field : colors.cardHi, borderRadius: 18, padding: 12, marginBottom: 10 })}>
      {icon !== undefined ? <Image source={icon} style={{ width: 46, height: 46, borderRadius: 11 }} /> : iconNode}
      <View style={{ flex: 1, marginLeft: 14 }}>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>{title}</Text>
        <Text style={{ color: colors.dim, fontSize: 14, marginTop: 1 }}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.faint} />
    </Pressable>
  )
}

export function UpdatePrompt() {
  const u = useUpdate()
  const { open, page, forceChooser } = useUpdatePrompt()
  const { settings, setSettings, loaded } = useStore(useShallow((s) => ({ settings: s.settings, setSettings: s.setSettings, loaded: s.loaded })))
  const [notes, setNotes] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const ios = (Platform.OS === 'ios' && !desktop) || forceChooser

  // Offer each new version once it's found, unless skipped or put off for now.
  useEffect(() => {
    if (!loaded || u.state !== 'available' || !u.version) return
    if (settings.skippedVersion === u.version) return
    if (settings.laterVersion === u.version && Date.now() < settings.laterUntil) return
    useUpdatePrompt.setState({ open: true, page: 'prompt' })
  }, [loaded, u.state, u.version, settings.skippedVersion, settings.laterVersion, settings.laterUntil])

  const close = () => {
    useUpdatePrompt.setState({ open: false, page: 'prompt' })
    setNotes(false)
    setMessage(null)
  }
  const later = () => {
    if (u.version) setSettings({ laterVersion: u.version, laterUntil: Date.now() + DAY })
    close()
  }
  const skip = () => {
    if (u.version) setSettings({ skippedVersion: u.version })
    close()
  }
  const update = () => {
    if (ios) return useUpdatePrompt.setState({ page: 'choose' })
    if (u.state === 'ready') void installUpdate()
    else
      void downloadUpdate().then(() => {
        if (useUpdate.getState().state === 'ready') void installUpdate()
      })
  }

  const openIn = async (s: Sideloader) => {
    setMessage(null)
    if (!u.assetUrl) return setMessage('This release has no iPhone file yet.')
    const link = s.url(u.assetUrl)
    try {
      if (Platform.OS === 'ios' && !(await Linking.canOpenURL(s.scheme))) return setMessage(`${s.name} isn’t installed on this iPhone.`)
      await Linking.openURL(link)
      close()
    } catch {
      setMessage(`Couldn’t open ${s.name}.`)
    }
  }

  const downloadIpa = async () => {
    setMessage(null)
    if (u.state !== 'ready') await downloadUpdate()
    if (useUpdate.getState().state === 'ready') await installUpdate()
  }

  const busy = u.state === 'downloading' || u.state === 'installing'
  const card = { backgroundColor: colors.bg, borderRadius: 34, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' as const }

  return (
    <Sheet visible={open} maxWidth={520} onClose={page === 'choose' ? () => useUpdatePrompt.setState({ page: 'prompt' }) : later} dismissable={page === 'prompt'}>
          <View style={[card, { paddingHorizontal: 20, paddingBottom: 18, paddingTop: 10, maxHeight: '100%' }]}>
            <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', marginBottom: 10 }} />
            {page === 'prompt' ? (
              <FadeIn key="prompt" from={-24}>
                <View style={{ alignItems: 'center' }}>
                  <Image source={require('../../assets/icon.png')} style={{ width: 76, height: 76, borderRadius: 18, marginTop: 8 }} />
                  <View style={{ marginTop: 14, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.accentSoft }}>
                    <Text style={{ color: colors.accentHi, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 }}>NEW RELEASE</Text>
                  </View>
                  <Text style={{ color: colors.text, fontSize: 32, fontWeight: '800', marginTop: 10 }}>Update available</Text>
                  <Text style={{ color: colors.dim, fontSize: 16, textAlign: 'center', marginTop: 6, lineHeight: 22 }}>See what’s new and get the latest version of WatchList.</Text>
                  <Text style={{ fontSize: 15, marginTop: 8 }}>
                    <Text style={{ color: colors.faint }}>{`${u.current} → `}</Text>
                    <Text style={{ color: colors.accentHi, fontWeight: '700' }}>{u.version}</Text>
                  </Text>
                  <Pressable onPress={() => setNotes(!notes)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16 }}>
                    <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>Release Notes</Text>
                    <Ionicons name={notes ? 'chevron-down' : 'chevron-forward'} size={17} color={colors.text} style={{ marginLeft: 4 }} />
                  </Pressable>
                </View>
                {notes && (
                  <ScrollView style={{ maxHeight: 260, marginTop: 12, backgroundColor: colors.cardHi, borderRadius: 16 }} contentContainerStyle={{ padding: 14 }}>
                    <Text style={{ color: colors.text, lineHeight: 21 }}>{(u.notes || 'No notes for this release.').replace(/^#+\s*/gm, '').replace(/\*\*/g, '')}</Text>
                  </ScrollView>
                )}
                {u.error ? <Text style={{ color: colors.danger, textAlign: 'center', marginTop: 12 }}>{u.error}</Text> : null}
                <Pressable onPress={update} disabled={busy} style={({ pressed }) => ({ marginTop: 22, height: 54, borderRadius: 27, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', opacity: pressed || busy ? 0.75 : 1, flexDirection: 'row' })}>
                  {busy && <ActivityIndicator color={colors.onAccent} style={{ marginRight: 8 }} />}
                  <Text style={{ color: colors.onAccent, fontSize: 17, fontWeight: '700' }}>
                    {u.state === 'downloading' ? `Downloading ${Math.round((u.progress ?? 0) * 100)}%` : u.state === 'installing' ? 'Installing…' : u.state === 'ready' && !ios ? 'Install and restart' : 'Update'}
                  </Text>
                </Pressable>
                <View style={{ flexDirection: 'row', marginTop: 6 }}>
                  <Pressable onPress={later} style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
                    <Text style={{ color: colors.dim, fontSize: 16 }}>Later</Text>
                  </Pressable>
                  <Pressable onPress={skip} style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
                    <Text style={{ color: colors.faint, fontSize: 16 }}>Skip this version</Text>
                  </Pressable>
                </View>
              </FadeIn>
            ) : (
              <FadeIn key="choose" from={32}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <Pressable onPress={() => useUpdatePrompt.setState({ page: 'prompt' })} hitSlop={10} style={{ width: 36 }} accessibilityLabel="Back">
                    <Ionicons name="chevron-back" size={26} color={colors.text} />
                  </Pressable>
                  <Text style={{ flex: 1, textAlign: 'center', color: colors.text, fontSize: 30, fontWeight: '800' }}>Update WatchList</Text>
                  <View style={{ width: 36 }} />
                </View>
                <Text style={{ color: colors.dim, fontSize: 16, textAlign: 'center', marginTop: 6, marginBottom: 20 }}>Choose how you’d like to update.</Text>
                {SIDELOADERS.map((s) => (
                  <ChoiceRow key={s.name} icon={s.icon} title={s.name} sub={`Continue in ${s.name}`} onPress={() => void openIn(s)} />
                ))}
                <View style={{ height: 1, backgroundColor: colors.separator, marginVertical: 8 }} />
                <ChoiceRow
                  iconNode={
                    <View style={{ width: 46, height: 46, borderRadius: 11, backgroundColor: '#8e8e93', alignItems: 'center', justifyContent: 'center' }}>
                      {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="arrow-down" size={26} color="#fff" />}
                    </View>
                  }
                  title={u.state === 'downloading' ? `Downloading ${Math.round((u.progress ?? 0) * 100)}%` : 'Download IPA'}
                  sub="Save for manual installation"
                  onPress={() => void downloadIpa()}
                />
                {message && <Text style={{ color: colors.danger, textAlign: 'center', marginTop: 4 }}>{message}</Text>}
                <Pressable onPress={close} style={{ alignItems: 'center', paddingVertical: 14, marginTop: 12 }}>
                  <Text style={{ color: colors.dim, fontSize: 17 }}>Cancel</Text>
                </Pressable>
              </FadeIn>
            )}
          </View>
    </Sheet>
  )
}
