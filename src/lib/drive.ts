import { emptyDoc, SYNC_FILE, type SyncDoc } from './sync'

// The sync file in Google Drive's hidden app folder, over a fetch that adds the user's access token.

const DRIVE = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

export type AuthFetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ status: number; ok: boolean; text: string }>

async function driveError(res: { status: number; text: string }, what: string): Promise<Error> {
  let e: { message?: string; status?: string; errors?: Array<{ reason?: string }> } | undefined
  try {
    e = (JSON.parse(res.text) as { error?: typeof e }).error
  } catch {}
  const reasons = [e?.status, ...(e?.errors ?? []).map((x) => x.reason)].filter(Boolean).join(' ')
  if (/SERVICE_DISABLED|accessNotConfigured/.test(reasons) || /has not been used in project|is disabled/i.test(e?.message ?? '')) {
    return new Error("The Google Drive API isn't turned on for WatchLine's Google Cloud project. Enable it at https://console.cloud.google.com/apis/library/drive.googleapis.com, wait a minute, then sync again.")
  }
  if (/insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient authentication scopes/i.test(`${reasons} ${e?.message ?? ''}`)) {
    return new Error('WatchLine wasn’t given access to its Google Drive folder. Turn Sync off and on again, and leave the Drive box ticked on Google’s page.')
  }
  return new Error(`Google Drive ${what} failed (HTTP ${res.status}${e?.message ? `: ${e.message}` : ''})`)
}

export function driveFile(authFetch: AuthFetch) {
  let fileId: string | null = null

  async function findFile(): Promise<string | null> {
    if (fileId) return fileId
    const q = encodeURIComponent(`name='${SYNC_FILE}'`)
    const res = await authFetch(`${DRIVE}/files?spaces=appDataFolder&q=${q}&fields=files(id)&pageSize=10`, { headers: { Accept: 'application/json' } })
    if (!res.ok) throw await driveError(res, 'lookup')
    fileId = (JSON.parse(res.text) as { files?: Array<{ id: string }> }).files?.[0]?.id ?? null
    return fileId
  }

  return {
    async download(): Promise<SyncDoc> {
      const id = await findFile()
      if (!id) return emptyDoc()
      const res = await authFetch(`${DRIVE}/files/${id}?alt=media`)
      if (res.status === 404) {
        fileId = null
        return emptyDoc()
      }
      if (!res.ok) throw await driveError(res, 'download')
      let doc: Partial<SyncDoc> | null = null
      try {
        doc = JSON.parse(res.text) as Partial<SyncDoc>
      } catch {}
      return { ...emptyDoc(), ...doc, entries: { ...doc?.entries }, removed: { ...doc?.removed } }
    },

    async upload(doc: SyncDoc): Promise<void> {
      const body = JSON.stringify(doc)
      const id = await findFile()
      if (id) {
        const res = await authFetch(`${UPLOAD}/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body })
        if (res.ok) return
        if (res.status !== 404) throw await driveError(res, 'upload')
        fileId = null
      }
      const boundary = `watchlist${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
      const multipart =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: SYNC_FILE, parents: ['appDataFolder'] })}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`
      const res = await authFetch(`${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart })
      if (!res.ok) throw await driveError(res, 'upload')
      fileId = (JSON.parse(res.text) as { id: string }).id
    },

    async email(): Promise<string | undefined> {
      const res = await authFetch(`${DRIVE}/about?fields=user(emailAddress)`, { headers: { Accept: 'application/json' } }).catch(() => null)
      if (!res?.ok) return undefined
      return (JSON.parse(res.text) as { user?: { emailAddress?: string } }).user?.emailAddress
    },

    reset() {
      fileId = null
    }
  }
}
