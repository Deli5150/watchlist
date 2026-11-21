import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from './store'
import { localizeSeasons } from './airdates'
import { season as fetchSeason, type SeasonDetails } from './tmdb'

export interface Async<T> {
  data: T | undefined
  error: string | null
  loading: boolean
  reload: () => void
}

/** Runs an async request when its deps change (and when the TMDB language changes). */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): Async<T> {
  const language = useStore((s) => s.settings.language)
  const region = useStore((s) => s.settings.region)
  const [state, setState] = useState<{ data: T | undefined; error: string | null; loading: boolean }>({ data: undefined, error: null, loading: true })
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn
  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fnRef
      .current()
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((e: Error) => live && setState((s) => ({ data: s.data, error: e.message, loading: false })))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, language, region, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { ...state, reload }
}

export function useSeason(tvId: number | undefined, n: number | undefined): SeasonDetails | undefined {
  const raw = useAsync(() => (tvId && n !== undefined ? fetchSeason(tvId, n) : Promise.resolve(undefined)), [tvId, n]).data
  const one = useMemo(() => (raw ? [raw] : undefined), [raw])
  return useLocalSeasons(tvId, one)?.[0]
}

/**
 * Seasons as TMDB has them, then with air dates moved to your calendar once TVmaze answers. `list`
 * must keep its identity between renders (memoize it).
 */
export function useLocalSeasons<S extends SeasonDetails>(tvId: number | undefined, list: S[] | undefined): S[] | undefined {
  const local = useAsync(async () => (tvId && list ? { from: list, to: await localizeSeasons(tvId, list) } : undefined), [tvId, list])
  return local.data && local.data.from === list ? local.data.to : list
}
