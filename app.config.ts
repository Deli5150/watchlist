import type { ExpoConfig } from 'expo/config'
import { version } from './package.json'

const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? ''

// Android's versionCode from the version: 1.2.3 → 10203.
const [major, minor, patch] = version.split('.').map(Number)

const config: ExpoConfig = {
  name: 'WatchList',
  slug: 'watchlist',
  scheme: 'watchlist',
  version,
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0a0a0c',
  ios: {
    bundleIdentifier: 'app.watchlist.tracker',
    supportsTablet: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // The update chooser checks which sideloading apps are installed (src/ui/UpdatePrompt.tsx).
      LSApplicationQueriesSchemes: ['altstore', 'sidestore', 'feather', 'flarestore']
    }
  },
  android: {
    package: 'app.watchlist.tracker',
    versionCode: major * 10000 + minor * 100 + patch,
    adaptiveIcon: { backgroundColor: '#d9334a', foregroundImage: './assets/android-icon-foreground.png', monochromeImage: './assets/android-icon-monochrome.png' },
    permissions: ['POST_NOTIFICATIONS', 'SCHEDULE_EXACT_ALARM', 'REQUEST_INSTALL_PACKAGES'],
    predictiveBackGestureEnabled: false
  },
  web: { favicon: './assets/favicon.png', output: 'single', bundler: 'metro' },
  plugins: [
    // First, so it runs after expo-notifications has added the push entitlement.
    './plugins/withoutPushEntitlement',
    ['expo-notifications', { color: '#ff4d5e' }],
    'expo-sharing',
    'expo-localization',
    'expo-image',
    './plugins/withReleaseSigning',
    './plugins/withoutCodeShrinking',
    './plugins/withPhoneArchitectures',
    // Settings → App Icon on Android: the alternate icons in assets/app-icons (modules/app-icons).
    ['./plugins/withAppIcons', { ios: false }],
    // Google's sign-in on iPhone needs its client's URL scheme (Sync with Google).
    ...(IOS_CLIENT_ID ? [['@react-native-google-signin/google-signin', { iosUrlScheme: IOS_CLIENT_ID.split('.').reverse().join('.') }] as [string, object]] : ['@react-native-google-signin/google-signin'])
  ]
}

export default config
