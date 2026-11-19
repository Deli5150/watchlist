import { Ionicons } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import { cacheDirectory, EncodingType, readAsStringAsync, writeAsStringAsync } from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { Image } from 'expo-image'
import { useMemo, useState } from 'react'
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'
import { CHANGELOG } from '../data/changelog'
import { dateOfTime } from '../lib/dates'
import { LANGUAGES } from '../lib/defaults'
import { feedbackUrl, type FeedbackKind } from '../lib/feedback'
import { googleAvailable } from '../lib/google'
import { useAsync } from '../lib/hooks'
import { formatDate } from '../lib/progress'
import { RELEASES_PAGE, REPO_URL } from '../lib/release'
import { cacheClear, desktop } from '../lib/storage'
import { exportData, normalize, useStore } from '../lib/store'
import { syncNow, turnOffSync, turnOnSync, useSyncBusy } from '../lib/syncRunner'
import { tmdb } from '../lib/tmdb'
import type { AppData } from '../lib/types'
import { importWallpaper, useWallpaper, WALLPAPERS } from '../lib/wallpaper'
import { checkForUpdates, downloadUpdate, installUpdate, useUpdate } from '../lib/updater'
import { Field, Group, Header, Page, Row, SearchField, SectionLabel, Segmented, Toggle } from '../ui/kit'
import { confirm } from '../ui/overlays'
import { colors, THEMES } from '../ui/theme'
import { openUpdatePrompt } from '../ui/UpdatePrompt'
import { VERSION } from '../version'
import { openUrl } from './Settings'

// The screens under Settings.

// ── Appearance ──────────────────────────────────────────────────────────────────────────────────

const DIMS = [
  { label: 'Light', value: '0.35' },
  { label: 'Medium', value: '0.55' },
  { label: 'Dark', value: '0.75' }
]

/** A wallpaper to pick: its picture (or the theme's colour), name, and a tick when it's on. */
function WallpaperTile({ name, on, onPress, children }: { name: string; on: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable accessibilityLabel={`Wallpaper: ${name}`} onPress={onPress} style={{ width: '33.33%', padding: 5 }}>
      <View style={{ aspectRatio: 4 / 3, borderRadius: 14, overflow: 'hidden', borderWidth: 2, borderColor: on ? colors.accent : colors.border, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        {children}
        {on && (
          <View style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark" size={14} color={colors.onAccent} />
          </View>
        )}
      </View>
      <Text style={{ color: on ? colors.text : colors.dim, fontSize: 13, marginTop: 6, textAlign: 'center', fontWeight: on ? '700' : '500' }}>{name}</Text>
    </Pressable>
  )
}

export function AppearanceScreen() {
  const { theme, wallpaper, dim, blur, stamp, setSettings } = useStore(
    useShallow((s) => ({ theme: s.settings.theme, wallpaper: s.settings.wallpaper, dim: s.settings.wallpaperDim, blur: s.settings.wallpaperBlur, stamp: s.settings.wallpaperStamp, setSettings: s.setSettings }))
  )
  const current = useWallpaper()
  const [note, setNote] = useState<string | null>(null)
  const pickOwn = () => {
    setNote(null)
    importWallpaper().catch((e: Error) => setNote(`That picture couldn’t be used: ${e.message}`))
  }
  return (
    <Page header={<Header title="Theme & Wallpaper" />}>
      <SectionLabel>Theme</SectionLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5, marginBottom: 20 }}>
        {Object.entries(THEMES).map(([id, t]) => {
          const on = theme === id
          return (
            <Pressable key={id} onPress={() => setSettings({ theme: id })} style={{ width: '33.33%', padding: 5 }}>
              <View style={{ borderRadius: 16, backgroundColor: t.bg, borderWidth: 2, borderColor: on ? t.accent : colors.border, padding: 14, alignItems: 'center' }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 6, borderColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
                  {on && <Ionicons name="checkmark" size={14} color={t.accent} />}
                </View>
                <Text style={{ color: '#fff', fontSize: 13, marginTop: 8, fontWeight: on ? '700' : '500' }}>{t.name}</Text>
              </View>
            </Pressable>
          )
        })}
      </View>
      <SectionLabel>Wallpaper</SectionLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5, marginBottom: 12 }}>
        <WallpaperTile name="None" on={!wallpaper} onPress={() => setSettings({ wallpaper: '' })}>
          <Ionicons name="color-palette-outline" size={24} color={colors.accent} />
        </WallpaperTile>
        {WALLPAPERS.map((w) => (
          <WallpaperTile key={w.id} name={w.name} on={wallpaper === w.id} onPress={() => setSettings({ wallpaper: w.id })}>
            <Image source={w.thumb} style={StyleSheet.absoluteFill} contentFit="cover" />
          </WallpaperTile>
        ))}
        <WallpaperTile name={stamp ? 'Your picture' : 'Import…'} on={wallpaper === 'custom'} onPress={() => (stamp && wallpaper !== 'custom' ? setSettings({ wallpaper: 'custom' }) : pickOwn())}>
          {wallpaper === 'custom' && current ? <Image source={current} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
          {!(wallpaper === 'custom' && current) && <Ionicons name="image-outline" size={26} color={colors.dim} />}
        </WallpaperTile>
      </View>
      {note && <Text style={{ color: colors.danger, fontSize: 13, marginBottom: 12, paddingHorizontal: 4 }}>{note}</Text>}
      <Group>
        <Row icon="images-outline" label={stamp ? 'Choose another picture…' : 'Import your own picture…'} sub="A photo or image from this device" onPress={pickOwn} />
        {wallpaper ? (
          <Row icon="contrast-outline" label="Darken" right={<View style={{ width: 210 }}><Segmented options={DIMS} value={String(dim)} onChange={(v) => setSettings({ wallpaperDim: Number(v) })} /></View>} />
        ) : null}
        {wallpaper ? <Row icon="water-outline" label="Blur" right={<Toggle value={blur} onChange={(v) => setSettings({ wallpaperBlur: v })} />} /> : null}
      </Group>
      <Text style={{ color: colors.faint, fontSize: 13, lineHeight: 18, paddingHorizontal: 4 }}>The wallpaper shows behind your pages on this device. Your own picture stays on this device and isn’t synced.</Text>
    </Page>
  )
}

// ── Region and language ─────────────────────────────────────────────────────────────────────────

export function RegionScreen() {
  const { region, setSettings } = useStore(useShallow((s) => ({ region: s.settings.region, setSettings: s.setSettings })))
  const [query, setQuery] = useState('')
  const res = useAsync(() => tmdb<{ results: Array<{ iso_3166_1: string; english_name: string }> }>('/watch/providers/regions', {}, 7 * 24 * 3600_000), [])
  const list = useMemo(
    () =>
      (res.data?.results ?? [])
        .map((r) => ({ code: r.iso_3166_1, name: r.english_name }))
        .filter((r) => !query || r.name.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [res.data, query]
  )
  return (
    <Page header={<Header title="Region" />}>
      <Text style={{ color: colors.dim, fontSize: 14, marginBottom: 14, lineHeight: 20 }}>“Where to watch” shows the streaming services, rentals and purchases available in this country.</Text>
      <SearchField value={query} onChange={setQuery} placeholder="Search countries" style={{ marginBottom: 14 }} />
      {res.loading && !res.data && <ActivityIndicator color={colors.accentHi} />}
      <Group>
        {list.map((r) => (
          <Row key={r.code} label={r.name} accessory="none" onPress={() => setSettings({ region: r.code })} right={r.code === region ? <Ionicons name="checkmark" size={18} color={colors.accentHi} /> : undefined} />
        ))}
      </Group>
    </Page>
  )
}

export function LanguageScreen() {
  const { language, setSettings } = useStore(useShallow((s) => ({ language: s.settings.language, setSettings: s.setSettings })))
  return (
    <Page header={<Header title="Language" />}>
      <Text style={{ color: colors.dim, fontSize: 14, marginBottom: 14, lineHeight: 20 }}>Show and movie titles, descriptions and episode names come in this language when TMDB has a translation.</Text>
      <Group>
        {LANGUAGES.map((l) => (
          <Row key={l.code} label={l.name} accessory="none" onPress={() => setSettings({ language: l.code })} right={l.code === language ? <Ionicons name="checkmark" size={18} color={colors.accentHi} /> : undefined} />
        ))}
      </Group>
    </Page>
  )
}

// ── Data ────────────────────────────────────────────────────────────────────────────────────────

async function saveText(name: string, content: string, mime: string): Promise<void> {
  if (desktop) {
    await desktop.saveFile(name, content)
    return
  }
  if (Platform.OS === 'web') {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([content], { type: mime }))
    a.download = name
    a.click()
    return
  }
  const uri = `${cacheDirectory}${name}`
  await writeAsStringAsync(uri, content)
  await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: name })
}

const csvCell = (v: string | number): string => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))

export function DataScreen() {
  const { items, watches, replaceAll, eraseAll } = useStore(useShallow((s) => ({ items: s.items, watches: s.watches, replaceAll: s.replaceAll, eraseAll: s.eraseAll })))
  const [note, setNote] = useState<string | null>(null)
  const stamp = new Date().toISOString().slice(0, 10)

  const exportJson = () => void saveText(`WatchLine-${stamp}.json`, JSON.stringify(exportData(), null, 2), 'application/json')
  const exportCsv = () => {
    const byId = new Map(items.map((i) => [i.id, i]))
    const rows = [
      ['Watched', 'Type', 'Title', 'Season', 'Episode', 'Minutes', 'TMDB id'],
      ...[...watches]
        .sort((a, b) => b.at - a.at)
        .map((w) => {
          const i = byId.get(w.itemId)
          return [new Date(w.at).toISOString(), i?.type === 'movie' ? 'Movie' : 'Episode', i?.title ?? '', w.season ?? '', w.episode ?? '', w.runtime, i?.tmdbId ?? '']
        })
    ]
    void saveText(`WatchLine-history-${stamp}.csv`, rows.map((r) => r.map(csvCell).join(',')).join('\n'), 'text/csv')
  }
  const importJson = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', '*/*'], copyToCacheDirectory: true })
    if (res.canceled) return
    const asset = res.assets[0]
    try {
      const text = asset.file ? await asset.file.text() : await readAsStringAsync(asset.uri, { encoding: EncodingType.UTF8 })
      const raw = JSON.parse(text) as Partial<AppData>
      if (!Array.isArray(raw.items)) throw new Error('not a backup')
      const data = normalize(raw)
      confirm('Replace your library?', `This backup has ${data.items.length} titles and ${data.watches.length} watched episodes and movies. What’s in WatchLine now is replaced.`, 'Replace', () => {
        replaceAll(data)
        setNote(`Restored ${data.items.length} titles.`)
      })
    } catch {
      setNote('That file isn’t a WatchLine backup.')
    }
  }

  return (
    <Page header={<Header title="Backup and import" />}>
      <SectionLabel>Backup</SectionLabel>
      <Group>
        <Row icon="download-outline" label="Export backup" sub="Your library and history, as a JSON file" onPress={exportJson} />
        <Row icon="push-outline" label="Restore backup" sub="From a WatchLine JSON file" onPress={() => void importJson()} />
        <Row icon="grid-outline" label="Export history" sub="Everything you watched, as CSV" onPress={exportCsv} />
      </Group>
      {note && <Text style={{ color: colors.dim, textAlign: 'center', marginBottom: 14 }}>{note}</Text>}
      <Group>
        <Row
          icon="refresh-outline"
          label="Clear TMDB cache"
          sub="Downloads show and movie details again"
          accessory="none"
          onPress={() => void cacheClear().then(() => setNote('Cache cleared. Details are downloaded again as you browse.'))}
        />
        <Row
          icon="trash-outline"
          iconColor={colors.danger}
          label="Erase all data"
          danger
          accessory="none"
          onPress={() => confirm('Erase everything?', 'Your whole library and watch history are deleted. Export a backup first if you might want them.', 'Erase all', eraseAll)}
        />
      </Group>
      <Text style={{ color: colors.faint, fontSize: 13, lineHeight: 18 }}>Your library stays on this device (and in your Google Drive if Sync is on). WatchLine only talks to TMDB to look up shows and movies.</Text>
    </Page>
  )
}

// ── What's New, Updates ─────────────────────────────────────────────────────────────────────────

export function WhatsNew() {
  return (
    <Page header={<Header title="What's New" />}>
      {CHANGELOG.map((v) => (
        <View key={v.version} style={{ marginBottom: 20 }}>
          <SectionLabel>{`Version ${v.version} · ${formatDate(v.date, true)}`}</SectionLabel>
          <Group>
            {v.items.map((item, i) => (
              <Row key={i} label={item} icon="sparkles" iconColor={colors.accentHi} />
            ))}
          </Group>
        </View>
      ))}
    </Page>
  )
}

export function UpdatesScreen() {
  const u = useUpdate()
  const { settings, setSettings } = useStore(useShallow((s) => ({ settings: s.settings, setSettings: s.setSettings })))
  const busy = u.state === 'checking' || u.state === 'downloading' || u.state === 'installing'
  const message =
    u.state === 'checking'
      ? 'Checking…'
      : u.state === 'latest'
        ? 'WatchLine is up to date.'
        : u.state === 'available'
          ? `Version ${u.version} is available.`
          : u.state === 'downloading'
            ? `Downloading ${Math.round((u.progress ?? 0) * 100)}%`
            : u.state === 'ready'
              ? `Version ${u.version} is ready to install.`
              : u.state === 'installing'
                ? 'Installing… WatchLine will restart.'
                : u.state === 'error'
                  ? u.error
                  : 'Check for a new version.'
  const isIos = Platform.OS === 'ios' && !desktop
  return (
    <Page header={<Header title="Updates" />}>
      <View style={{ alignItems: 'center', marginVertical: 22 }}>
        <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700' }}>WatchLine {VERSION}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          {busy && <ActivityIndicator color={colors.accentHi} style={{ marginRight: 8 }} />}
          <Text style={{ color: u.state === 'error' ? colors.danger : colors.dim, fontSize: 15, textAlign: 'center' }}>{message}</Text>
        </View>
        {u.error && u.state !== 'error' && <Text style={{ color: colors.danger, marginTop: 6, textAlign: 'center' }}>{u.error}</Text>}
      </View>
      <Group>
        {isIos && (u.state === 'available' || u.state === 'ready') ? (
          <Row icon="cloud-download" iconColor={colors.accentHi} label={`Update to ${u.version}`} sub="AltStore, SideStore, Feather, FlareStore or the .ipa" onPress={() => openUpdatePrompt('choose')} />
        ) : (u.state === 'available' && u.inApp) || u.state === 'ready' ? (
          u.state === 'ready' ? (
            <Row icon="checkmark-circle" iconColor={colors.success} label={isIos ? 'Save the new app (.ipa)' : 'Install and restart'} accessory="none" onPress={() => void installUpdate()} />
          ) : (
            <Row icon="cloud-download" iconColor={colors.accentHi} label={`Download ${u.version}`} accessory="none" onPress={() => void downloadUpdate()} />
          )
        ) : u.state === 'available' ? (
          <Row icon="open-outline" label="Open the download page" accessory="external" onPress={() => openUrl(u.page ?? RELEASES_PAGE)} />
        ) : (
          <Row icon="refresh" label="Check for updates" accessory="none" onPress={() => void checkForUpdates()} />
        )}
        <Row label="Check automatically" accessory="none" right={<Toggle value={settings.checkUpdates} onChange={(checkUpdates) => setSettings({ checkUpdates })} />} />
      </Group>
      {u.notes && (u.state === 'available' || u.state === 'ready') ? (
        <>
          <SectionLabel>{`What's new in ${u.version}`}</SectionLabel>
          <View style={{ backgroundColor: colors.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.text, lineHeight: 21 }}>{u.notes.replace(/^#+\s*/gm, '').replace(/\*\*/g, '')}</Text>
          </View>
        </>
      ) : null}
      <Row label="All releases" accessory="external" onPress={() => openUrl(RELEASES_PAGE)} />
    </Page>
  )
}

// ── Sync ────────────────────────────────────────────────────────────────────────────────────────

function ago(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return formatDate(dateOfTime(ms))
}

export function SyncScreen() {
  const sync = useStore((s) => s.sync)
  const busy = useSyncBusy()
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const turnOn = async () => {
    setError(null)
    setWorking(true)
    try {
      await turnOnSync()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setWorking(false)
    }
  }

  return (
    <Page header={<Header title="Sync with Google" />}>
      <View style={{ alignItems: 'center', marginVertical: 18 }}>
        <Ionicons name={sync.enabled ? 'cloud-done' : 'cloud-outline'} size={48} color={sync.enabled ? colors.accentHi : colors.dim} />
        <Text style={{ color: colors.dim, fontSize: 15, textAlign: 'center', marginTop: 10, lineHeight: 21 }}>
          Keep your library and watch history the same on every device: your Mac, PC and Android phone. WatchLine keeps them in a private folder in your Google Drive that only WatchLine can see.
        </Text>
      </View>
      {sync.enabled ? (
        <>
          <Group>
            <Row label="Signed in as" value={sync.email ?? 'Google account'} accessory="none" />
            <Row label="Last synced" value={busy ? 'Syncing…' : sync.lastSync ? ago(sync.lastSync) : 'Not yet'} accessory="none" right={busy ? <ActivityIndicator color={colors.accentHi} style={{ marginLeft: 8 }} /> : undefined} />
            <Row label="Sync now" icon="refresh" iconColor={colors.accentHi} accessory="none" onPress={() => void syncNow()} />
          </Group>
          {sync.error && <Text style={{ color: colors.danger, textAlign: 'center', marginBottom: 14 }}>{sync.error}</Text>}
          <Group>
            <Row
              label="Turn off Sync"
              danger
              accessory="none"
              onPress={() => confirm('Turn off Sync?', 'This device stops syncing and signs out of Google. Your library stays here and on your other devices.', 'Turn off', () => void turnOffSync())}
            />
          </Group>
        </>
      ) : (
        <>
          <Group>
            <Row
              label={working ? 'Waiting for Google…' : 'Sign in with Google'}
              icon="logo-google"
              iconColor={colors.accentHi}
              accessory="none"
              onPress={working ? undefined : () => void turnOn()}
              right={working ? <ActivityIndicator color={colors.accentHi} /> : undefined}
            />
          </Group>
          {error && <Text style={{ color: colors.danger, textAlign: 'center', marginBottom: 14 }}>{error}</Text>}
          {desktop && <Text style={{ color: colors.faint, fontSize: 13, textAlign: 'center' }}>Google’s sign-in opens in your browser. Come back here when it’s done.</Text>}
          {!googleAvailable() && <Text style={{ color: colors.faint, fontSize: 13, textAlign: 'center', marginTop: 8 }}>This copy of WatchLine was built without a Google client, so Sync isn’t available.</Text>}
        </>
      )}
    </Page>
  )
}

// ── Feedback, About ─────────────────────────────────────────────────────────────────────────────

export function FeedbackScreen() {
  const [kind, setKind] = useState<FeedbackKind>('bug')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const ready = title.trim().length > 2 && text.trim().length > 2
  return (
    <Page header={<Header title="Feedback" />}>
      <Segmented<FeedbackKind>
        value={kind}
        onChange={setKind}
        options={[
          { label: 'Report a bug', value: 'bug' },
          { label: 'Request a feature', value: 'feature' }
        ]}
      />
      <Text style={{ color: colors.dim, fontSize: 14, marginVertical: 14, lineHeight: 20 }}>
        {kind === 'bug' ? 'Say what you did, what you expected, and what happened instead. Your WatchLine version and device are added for you.' : 'What should WatchLine do, and why would it help?'}
      </Text>
      <Field value={title} onChangeText={setTitle} placeholder={kind === 'bug' ? 'Short summary, e.g. "Up Next skips an episode"' : 'Short summary, e.g. "Widgets"'} style={{ marginBottom: 12 }} />
      <Field value={text} onChangeText={setText} placeholder={kind === 'bug' ? 'What happened' : 'The idea'} multiline style={{ marginBottom: 18, minHeight: 160 }} />
      <Group>
        <Row
          label="Continue on GitHub"
          sub="Opens the filled-in form; submit it there with your GitHub account"
          icon="logo-github"
          iconColor={ready ? colors.accentHi : colors.faint}
          accessory="external"
          onPress={ready ? () => openUrl(feedbackUrl(kind, title, text, VERSION)) : undefined}
        />
      </Group>
      <Group>
        <Row label="See open reports and ideas" icon="list" accessory="external" onPress={() => openUrl(`${REPO_URL}/issues`)} />
      </Group>
    </Page>
  )
}

export function AboutScreen() {
  return (
    <Page header={<Header title="About" />}>
      <View style={{ alignItems: 'center', marginVertical: 18 }}>
        <Text style={{ color: colors.text, fontSize: 26, fontWeight: '800' }}>WatchLine {VERSION}</Text>
        <Text style={{ color: colors.dim, fontSize: 15, marginTop: 6, textAlign: 'center' }}>Track the shows and movies you watch.</Text>
      </View>
      <SectionLabel>Data sources</SectionLabel>
      <Group>
        <Row
          label="The Movie Database (TMDB)"
          sub="Shows, movies, episodes, people, ratings and artwork. This product uses the TMDB API but is not endorsed or certified by TMDB."
          accessory="external"
          onPress={() => openUrl('https://www.themoviedb.org')}
        />
        <Row label="JustWatch" sub="Where to watch: streaming, rental and purchase availability, through TMDB." accessory="external" onPress={() => openUrl('https://www.justwatch.com')} />
      </Group>
      <Group>
        <Row label="Source code" sub="MIT license" icon="logo-github" accessory="external" onPress={() => openUrl(REPO_URL)} />
        <Row label="Privacy" accessory="external" onPress={() => openUrl('https://deli5150.github.io/watchlist/privacy.html')} />
      </Group>
    </Page>
  )
}
