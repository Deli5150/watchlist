import { DarkTheme, NavigationContainer, StackActions, createNavigationContainerRef, type NavigationState } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { BarlowSemiCondensed_600SemiBold, BarlowSemiCondensed_700Bold, useFonts } from '@expo-google-fonts/barlow-semi-condensed'
import { StatusBar } from 'expo-status-bar'
import { memo, useEffect, useRef } from 'react'
import { ActivityIndicator, Animated, AppState, Easing, Platform, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useTab, useWide, type TabKey } from './src/lib/layout'
import { refreshLibrary, useShows } from './src/lib/library'
import { desktop } from './src/lib/storage'
import { useStore } from './src/lib/store'
import { startSync, syncNow } from './src/lib/syncRunner'
import { scheduleAlerts } from './src/lib/upcoming'
import { autoCheck, startUpdater, useUpdate } from './src/lib/updater'
import type { RootParams } from './src/nav'
import Calendar from './src/screens/Calendar'
import Discover, { Browse } from './src/screens/Discover'
import History from './src/screens/History'
import Library, { LibraryList } from './src/screens/Library'
import Movies from './src/screens/Movies'
import Shows from './src/screens/Shows'
import { AboutScreen, AppearanceScreen, DataScreen, FeedbackScreen, LanguageScreen, RegionScreen, SyncScreen, UpdatesScreen, WhatsNew } from './src/screens/more'
import Person, { Collection } from './src/screens/Person'
import Search from './src/screens/Search'
import { Scorecard } from './src/screens/Season'
import Settings from './src/screens/Settings'
import Title from './src/screens/Title'
import { OverlayHost } from './src/ui/overlays'
import { Sidebar } from './src/ui/Sidebar'
import { TabBar, TABS } from './src/ui/TabBar'
import { applyTheme, colors, DEFAULT_THEME, THEMES } from './src/ui/theme'
import { ToastHost } from './src/ui/toast'
import { TrailerHost } from './src/ui/Trailer'
import { UpdatePrompt, useUpdatePrompt } from './src/ui/UpdatePrompt'

const Root = createNativeStackNavigator<RootParams>()
const nav = createNavigationContainerRef<RootParams>()

// Development: preview the update sheet without a real release (the desktop screenshot hook calls it).
if (__DEV__ && typeof globalThis !== 'undefined') {
  ;(globalThis as { __watchlistPreviewUpdate?: (iphone: boolean) => void }).__watchlistPreviewUpdate = (iphone) => {
    useUpdatePrompt.setState({ forceChooser: iphone })
    useUpdate.setState({ state: 'available', version: '1.1.0', notes: '## What’s new\n- A preview of the update sheet', assetUrl: 'https://github.com/Deli5150/watchlist/releases/download/v1.1.0/WatchList-1.1.0.ipa' })
  }
}

// Memoized: switching tabs re-renders the tab bar, not the screens.
const SCREENS: Record<TabKey, React.ComponentType<{ active?: boolean }>> = {
  shows: memo(Shows),
  movies: memo(Movies),
  library: memo(Library),
  calendar: memo(Calendar),
  discover: memo(Discover),
  search: memo(Search),
  history: memo(History),
  settings: memo(Settings)
}

/** One tab's screen: mounted the first time it's shown, then kept (with its scroll and state) and faded in. */
function TabPane({ active, k }: { active: boolean; k: TabKey }) {
  const opacity = useRef(new Animated.Value(active ? 1 : 0)).current
  const seen = useRef(active)
  if (active) seen.current = true
  useEffect(() => {
    if (!active) return
    opacity.setValue(0)
    Animated.timing(opacity, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }).start()
  }, [active, opacity])
  if (!seen.current) return null
  const Screen = SCREENS[k]
  return (
    <Animated.View style={{ flex: 1, display: active ? 'flex' : 'none', opacity }}>
      <Screen active={active} />
    </Animated.View>
  )
}

function Tabs() {
  const { tab, set: setTab } = useTab()
  const wide = useWide()
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {TABS.map((t) => (
        <TabPane key={t.key} k={t.key} active={tab === t.key} />
      ))}
      {!wide && <TabBar tab={tab} onChange={setTab} />}
    </View>
  )
}

/** Desktop: the sidebar beside the screens. */
function Shell({ children }: { children: React.ReactNode }) {
  const wide = useWide()
  if (!wide) return <>{children}</>
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg }}>
      <Sidebar
        onTab={(t) => {
          useTab.getState().set(t)
          if (nav.isReady() && nav.canGoBack()) nav.dispatch(StackActions.popToTop())
        }}
        onFeedback={() => nav.isReady() && nav.navigate('Feedback')}
      />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  )
}

/** Keeps the desktop's new-episode alerts scheduled. Its own component, so only it re-renders. */
function Alerts() {
  const shows = useShows()
  const items = useStore((s) => s.items)
  const notifications = useStore((s) => s.settings.notifications)
  useEffect(() => {
    const t = setTimeout(() => void scheduleAlerts(useShows.getState()), 3000)
    return () => clearTimeout(t)
  }, [shows, items, notifications])
  return null
}

export default function App() {
  const storeLoaded = useStore((s) => s.loaded)
  // The condensed headline font; carry on without it if it can't load.
  const [fontsLoaded, fontError] = useFonts({ BarlowSemiCondensed_600SemiBold, BarlowSemiCondensed_700Bold })
  const loaded = storeLoaded && (fontsLoaded || Boolean(fontError))
  const themeId = useStore((s) => s.settings.theme)
  const checkUpdates = useStore((s) => s.settings.checkUpdates)
  const wide = useWide()
  // Navigation state, kept so changing the theme (which re-creates the screens) stays where you are.
  const navState = useRef<NavigationState | undefined>(undefined)

  if (colors.name !== (THEMES[themeId] ?? THEMES[DEFAULT_THEME]).name) applyTheme(themeId)
  const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, primary: colors.accent } }

  // Desktop: the page behind the app (it shows under macOS's title bar) follows the theme.
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.body.style.backgroundColor = colors.bg
  }, [themeId])

  useEffect(() => {
    void useStore.getState().hydrate()
    startUpdater()
  }, [])

  useEffect(() => {
    if (!loaded) return
    startSync()
    desktop?.updater.setAuto(checkUpdates)
    autoCheck(checkUpdates)
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return
      autoCheck(useStore.getState().settings.checkUpdates)
      void syncNow()
      void refreshLibrary()
    })
    // Shows' episode lists change as new episodes air: refresh them now and then.
    const timer = setInterval(() => void refreshLibrary(true), 3 * 3600_000)
    return () => {
      sub.remove()
      clearInterval(timer)
    }
  }, [loaded, checkUpdates])

  return (
    <SafeAreaProvider style={{ backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      {!loaded ? (
        <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <Shell key={`${themeId}-${wide}`}>
          <NavigationContainer ref={nav} theme={theme} initialState={navState.current} onStateChange={(st) => (navState.current = st)}>
            <Root.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: wide ? 'fade' : undefined }}>
              <Root.Screen name="Tabs" component={Tabs} />
              <Root.Screen name="Title" component={Title} />
              <Root.Screen name="LibraryList" component={LibraryList} />
              <Root.Screen name="Scorecard" component={Scorecard} />
              <Root.Screen name="Person" component={Person} />
              <Root.Screen name="Collection" component={Collection} />
              <Root.Screen name="Browse" component={Browse} />
              <Root.Screen name="Appearance" component={AppearanceScreen} />
              <Root.Screen name="Region" component={RegionScreen} />
              <Root.Screen name="Language" component={LanguageScreen} />
              <Root.Screen name="Data" component={DataScreen} />
              <Root.Screen name="Sync" component={SyncScreen} />
              <Root.Screen name="Updates" component={UpdatesScreen} />
              <Root.Screen name="WhatsNew" component={WhatsNew} />
              <Root.Screen name="Feedback" component={FeedbackScreen} />
              <Root.Screen name="About" component={AboutScreen} />
            </Root.Navigator>
          </NavigationContainer>
        </Shell>
      )}
      {loaded && <UpdatePrompt />}
      {loaded && <Alerts />}
      <TrailerHost />
      <ToastHost />
      <OverlayHost />
    </SafeAreaProvider>
  )
}
