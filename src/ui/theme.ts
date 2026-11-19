import { Platform } from 'react-native'

// Colour themes. `colors` is one shared object that every component reads while rendering;
// applyTheme() swaps its values and the app re-renders from the root (App.tsx keys it on the theme).

export interface Palette {
  name: string
  bg: string
  bgGlow: string
  card: string
  cardHi: string
  field: string
  border: string
  separator: string
  text: string
  dim: string
  faint: string
  accent: string
  accentHi: string
  /** Text and icons drawn on `accent`. */
  onAccent: string
  accentSoft: string
  /** A deep version of the accent, for small filled badges with white icons. */
  accentDeep: string
  danger: string
  success: string
  today: string
}

const hexA = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

/** A dark theme from its background tint and accent. */
function theme(name: string, bg: string, surface: string, accent: string, accentHi: string, accentDeep: string, onAccent = '#ffffff'): Palette {
  return {
    name,
    bg,
    bgGlow: hexA(accent, 0.2),
    card: hexA(surface, 0.86),
    cardHi: hexA(surface, 1),
    field: hexA(surface, 1),
    border: 'rgba(255,255,255,0.07)',
    separator: 'rgba(255,255,255,0.08)',
    text: '#ffffff',
    dim: '#9a97a3',
    faint: '#64616d',
    accent,
    accentHi,
    onAccent,
    accentSoft: hexA(accent, 0.2),
    accentDeep,
    danger: '#ff5f6d',
    success: '#3ddc84',
    today: hexA(accent, 0.36)
  }
}

export const THEMES: Record<string, Palette> = {
  cinema: theme('Cinema', '#0a0a0c', '#1a1a1f', '#ff4d5e', '#ff8a95', '#8a1d2a'),
  graphite: theme('Graphite', '#0c0c0d', '#1c1c1f', '#e6e6e9', '#ffffff', '#3a3a3f', '#111113'),
  marquee: theme('Marquee', '#0c0a06', '#211d15', '#f5b83d', '#f8d88c', '#7a5c14', '#241a02'),
  violet: theme('Violet', '#09080e', '#1a1824', '#8b7cf6', '#a99cff', '#4a3aa8'),
  ocean: theme('Ocean', '#070a10', '#151b26', '#3d9bff', '#7cbcff', '#1d4f8f'),
  teal: theme('Teal', '#060c0c', '#142020', '#2dd4bf', '#7ae8da', '#0f6b62', '#05221f'),
  forest: theme('Forest', '#070b08', '#161f19', '#3ccf7e', '#82e3ad', '#1b6b40', '#06210f'),
  ember: theme('Ember', '#0d0806', '#231915', '#ff8a4c', '#ffb084', '#8a3a12'),
  rose: theme('Rose', '#0d0709', '#23171b', '#ff6b9a', '#ff9dbc', '#8a2347')
}

export const DEFAULT_THEME = 'cinema'

export const colors: Palette = { ...THEMES[DEFAULT_THEME] }

export function applyTheme(id: string): void {
  Object.assign(colors, THEMES[id] ?? THEMES[DEFAULT_THEME])
}

export const radius = { card: 22, row: 18, pill: 999 }

export const font = {
  family: Platform.select({ web: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif', default: undefined })
}

/** Widest the content gets on a desktop window. */
export const MAX_WIDTH = 1180
