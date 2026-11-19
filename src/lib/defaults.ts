import { getLocales } from 'expo-localization'
import type { AppData, Settings } from './types'

/** TMDB languages WatchList offers (the same ones Showline translates into). */
export const LANGUAGES: Array<{ code: string; name: string }> = [
  { code: 'en-US', name: 'English' },
  { code: 'es-ES', name: 'Español' },
  { code: 'fr-FR', name: 'Français' },
  { code: 'de-DE', name: 'Deutsch' },
  { code: 'it-IT', name: 'Italiano' },
  { code: 'pt-BR', name: 'Português (Brasil)' },
  { code: 'ja-JP', name: '日本語' },
  { code: 'zh-CN', name: '简体中文' }
]

function deviceRegion(): string {
  try {
    return getLocales()[0]?.regionCode?.toUpperCase() || 'US'
  } catch {
    return 'US'
  }
}

function deviceLanguage(): string {
  try {
    const tag = getLocales()[0]?.languageTag ?? 'en-US'
    const lang = tag.split('-')[0]
    return LANGUAGES.find((l) => l.code === tag)?.code ?? LANGUAGES.find((l) => l.code.startsWith(`${lang}-`))?.code ?? 'en-US'
  } catch {
    return 'en-US'
  }
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'cinema',
  region: deviceRegion(),
  language: deviceLanguage(),
  notifications: true,
  checkUpdates: true,
  librarySort: 'recent',
  libraryType: 'tv',
  calendarView: 'list',
  searchScope: 'discover',
  recentSearches: [],
  markPrevious: 'ask',
  lastSeenVersion: '',
  skippedVersion: '',
  laterVersion: '',
  laterUntil: 0
}

export const emptyData = (): AppData => ({ version: 1, items: [], watches: [], settings: { ...DEFAULT_SETTINGS } })
