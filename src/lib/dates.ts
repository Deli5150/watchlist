// Calendar helpers on local YYYY-MM-DD strings.

const pad = (n: number): string => String(n).padStart(2, '0')
const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const today = (): string => ymd(new Date())

/** Noon local time, so adding days never trips over daylight saving changes. */
export function toDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1, 12)
}

export const daysInMonth = (y: number, m0: number): number => new Date(y, m0 + 1, 0).getDate()

export function addDays(s: string, n: number): string {
  const d = toDate(s)
  d.setDate(d.getDate() + n)
  return ymd(d)
}

export function addMonths(s: string, n: number, day?: number): string {
  const [y, m, d] = s.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = total - ny * 12
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(day ?? d, daysInMonth(ny, nm)))}`
}

/** A watch time (ms) as its local date. */
export const dateOfTime = (ms: number): string => ymd(new Date(ms))

/** A local date at the given time of day (default: now's), as ms. */
export function timeOnDate(date: string, base = new Date()): number {
  const d = toDate(date)
  d.setHours(base.getHours(), base.getMinutes(), base.getSeconds(), 0)
  return d.getTime()
}

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
