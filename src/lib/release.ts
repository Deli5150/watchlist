// Where WatchLine's updates come from: the GitHub repo's Releases (published by scripts/release.mjs).
// desktop/updater.cjs has the same file-name patterns for the desktop installs.

export const RELEASE_REPO = 'Deli5150/watchlist'
export const REPO_URL = `https://github.com/${RELEASE_REPO}`
export const RELEASES_PAGE = `${REPO_URL}/releases/latest`
export const LATEST_RELEASE_API = `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`

export interface GitHubRelease {
  tag_name: string
  body?: string
  html_url: string
  draft?: boolean
  prerelease?: boolean
  assets: Array<{ name: string; browser_download_url: string; size: number; digest?: string | null }>
}

export interface ReleaseInfo {
  version: string
  notes: string
  page: string
  asset?: { name: string; url: string; size: number; sha256?: string }
}

export type UpdateState = 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'ready' | 'installing' | 'error'

export interface UpdateStatus {
  current: string
  state: UpdateState
  /** Whether this install can download and install updates itself. */
  inApp: boolean
  version?: string
  notes?: string
  page?: string
  progress?: number
  error?: string
  lastCheck?: number
  /** The new version's file for this platform (the .ipa on an iPhone, for the sideloading apps). */
  assetUrl?: string
}

const parts = (v: string): number[] =>
  v
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0)

export function compareVersions(a: string, b: string): number {
  const x = parts(a)
  const y = parts(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d) return d
  }
  return 0
}

/** The release, if newer than `current`, with the asset matching `pattern` (if any). */
export function newerRelease(release: GitHubRelease, current: string, pattern: RegExp | null): ReleaseInfo | null {
  if (release.draft || release.prerelease) return null
  const version = release.tag_name.replace(/^v/i, '')
  if (compareVersions(version, current) <= 0) return null
  const file = pattern ? release.assets.find((a) => pattern.test(a.name)) : undefined
  return {
    version,
    notes: (release.body ?? '').trim(),
    page: release.html_url,
    asset: file && {
      name: file.name,
      url: file.browser_download_url,
      size: file.size,
      sha256: file.digest?.startsWith('sha256:') ? file.digest.slice(7) : undefined
    }
  }
}
