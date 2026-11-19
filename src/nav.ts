import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { ListKind } from './lib/tmdb'
import type { MediaType } from './lib/types'

export type RootParams = {
  Tabs: undefined
  Title: { type: MediaType; id: number }
  Season: { id: number; season: number }
  Scorecard: { id: number }
  Person: { id: number }
  Collection: { id: number }
  Browse: { title: string; list?: ListKind; genre?: { type: MediaType; id: number } }
  Appearance: undefined
  Region: undefined
  Language: undefined
  Data: undefined
  Sync: undefined
  Updates: undefined
  WhatsNew: undefined
  Feedback: undefined
  About: undefined
}

export const useRootNav = () => useNavigation<NativeStackNavigationProp<RootParams>>()
