import { Platform } from 'react-native'
import type { AuthFetch } from './drive'
import { desktop } from './storage'

// Signing in to Google for Sync, with access to WatchLine's own folder in your Drive and nothing else.
// The desktop app signs in through your browser (desktop/google.cjs, a loopback redirect); phones
// use Google's own sign-in (iOS and Android need their OAuth clients in the Cloud project; see
// README → Sync with Google).

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? ''

export class SignedOutError extends Error {}

let configured = false
async function native() {
  const mod = await import('@react-native-google-signin/google-signin')
  if (!configured) {
    configured = true
    mod.GoogleSignin.configure({ scopes: [DRIVE_SCOPE], ...(IOS_CLIENT_ID ? { iosClientId: IOS_CLIENT_ID } : {}) })
  }
  return mod
}

/** Whether this copy of WatchLine can sign in to Google. */
export function googleAvailable(): boolean {
  if (desktop) return desktop.google.configured
  if (Platform.OS === 'android') return true
  if (Platform.OS === 'ios') return Boolean(IOS_CLIENT_ID)
  return false
}

/** Signs in (opening Google's page) and returns the account's email address. */
export async function googleSignIn(): Promise<string | undefined> {
  if (desktop) return desktop.google.signIn()
  const { GoogleSignin, isCancelledResponse, isErrorWithCode, statusCodes } = await native()
  try {
    if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
    const res = await GoogleSignin.signIn()
    if (isCancelledResponse(res)) throw new Error('Sign-in was cancelled')
    if (!res.data.scopes.includes(DRIVE_SCOPE)) {
      const added = await GoogleSignin.addScopes({ scopes: [DRIVE_SCOPE] })
      if (!added || isCancelledResponse(added) || !added.data.scopes.includes(DRIVE_SCOPE)) throw new Error('WatchLine needs access to its Drive folder to sync. Try again and leave the box ticked.')
    }
    return res.data.user.email
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new Error('Sync needs Google Play services')
      if (Platform.OS === 'android' && /DEVELOPER_ERROR|10:/.test(String(e.message)))
        throw new Error('Sync isn’t set up for this Android build yet: it needs an Android OAuth client in the Google Cloud project (see README → Sync with Google).')
    }
    throw e
  }
}

export async function googleSignOut(): Promise<void> {
  if (desktop) return desktop.google.signOut()
  const { GoogleSignin } = await native()
  await GoogleSignin.revokeAccess().catch(() => null)
  await GoogleSignin.signOut().catch(() => null)
}

/** Fetch as the signed-in user. Throws SignedOutError when the sign-in is gone. */
export const googleFetch: AuthFetch = async (url, init = {}) => {
  if (desktop) {
    const res = await desktop.google.fetch(url, init)
    if (res.status === 401) throw new SignedOutError('Google sign-in expired')
    return res
  }
  const { GoogleSignin } = await native()
  for (let attempt = 0; ; attempt++) {
    if (!GoogleSignin.getCurrentUser()) {
      const silent = await GoogleSignin.signInSilently().catch(() => null)
      if (!silent || silent.type !== 'success') throw new SignedOutError('Not signed in to Google')
    }
    const { accessToken } = await GoogleSignin.getTokens()
    const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${accessToken}` } })
    if (res.status === 401 && attempt === 0) {
      await GoogleSignin.clearCachedAccessToken(accessToken).catch(() => null)
      continue
    }
    if (res.status === 401) throw new SignedOutError('Google sign-in expired')
    return { status: res.status, ok: res.ok, text: await res.text() }
  }
}
