import { Platform, useWindowDimensions } from 'react-native'
import { create } from 'zustand'

/** The desktop app (and a wide browser window) gets the wide layout: a sidebar and side-by-side panes. */
export function useWide(): boolean {
  const { width } = useWindowDimensions()
  return Platform.OS === 'web' && width >= 860
}

export type TabKey = 'shows' | 'movies' | 'library' | 'calendar' | 'discover' | 'search' | 'history' | 'settings'

/** The selected main section (tab bar on phones, sidebar on desktop). */
export const useTab = create<{ tab: TabKey; set: (t: TabKey) => void }>((set) => ({ tab: 'shows', set: (tab) => set({ tab }) }))
