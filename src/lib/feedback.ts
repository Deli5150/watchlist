import { Platform } from 'react-native'
import { REPO_URL } from './release'
import { desktop } from './storage'

// Report a bug or suggest a feature: written in the app and finished on GitHub. The app only builds
// a link to the repo's new-issue form (.github/ISSUE_TEMPLATE) with the fields filled in; the person
// reviews it and submits it there, signed in to their own GitHub account. No token is built into
// the app (anyone could pull it out of a public app).

export type FeedbackKind = 'bug' | 'feature'

/** The issue forms' "Where" / "For" choice for this device; it must match an option exactly. */
export function feedbackWhere(kind: FeedbackKind): string {
  if (kind === 'feature') return Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android' : 'Desktop (Mac/Windows/Linux)'
  if (Platform.OS === 'ios') return 'iPhone'
  if (Platform.OS === 'android') return 'Android'
  return desktop?.platform === 'win32' ? 'Windows' : desktop?.platform === 'linux' ? 'Linux' : 'Mac'
}

/** The link to the repo's new-issue form, filled in. */
export function feedbackUrl(kind: FeedbackKind, title: string, text: string, version: string): string {
  const q = new URLSearchParams({ template: kind === 'bug' ? 'bug.yml' : 'feature.yml', title: title.trim() })
  q.set(kind === 'bug' ? 'what' : 'idea', text.trim())
  q.set('platform', feedbackWhere(kind))
  if (kind === 'bug') {
    q.set('version', version)
    const os = Platform.OS === 'web' ? (desktop?.platform ?? 'web') : `${Platform.OS} ${String(Platform.Version)}`
    q.set('extra', `Device: ${os}`)
  }
  // GitHub rejects very long links; cut the description to fit.
  let url = `${REPO_URL}/issues/new?${q.toString()}`
  if (url.length > 7500) {
    q.set(kind === 'bug' ? 'what' : 'idea', `${text.trim().slice(0, 5000)}…`)
    url = `${REPO_URL}/issues/new?${q.toString()}`
  }
  return url
}
