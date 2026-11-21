import { cached } from './tmdb'

// Links straight to a title on each streaming service (The Boys on Prime Video), for the logos in
// "Where to watch". TMDB's provider list comes from JustWatch but only links to TMDB's own page;
// JustWatch's site API has each service's link. Its package ids are TMDB's provider ids.

const HOUR = 3600_000

const QUERY = `query WatchLinks($country: Country!, $language: Language!, $filter: TitleFilter) {
  popularTitles(country: $country, first: 8, filter: $filter) {
    edges { node { content(country: $country, language: $language) { externalIds { tmdbId } }
      offers(country: $country, platform: WEB) { standardWebURL package { packageId } } } }
  }
}`

interface Result {
  data?: {
    popularTitles?: {
      edges: Array<{ node: { content: { externalIds: { tmdbId: string | null } }; offers: Array<{ standardWebURL: string | null; package: { packageId: number } }> } }>
    }
  }
}

/** Each service's link to a title, by TMDB provider id (empty when JustWatch doesn't know it). */
export function watchLinks(type: 'tv' | 'movie', tmdbId: number, title: string, region: string): Promise<Record<number, string>> {
  return cached(`justwatch:${region}:${type}:${tmdbId}`, 24 * HOUR, async () => {
    const res = await fetch('https://apis.justwatch.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { country: region, language: 'en', filter: { searchQuery: title, objectTypes: [type === 'tv' ? 'SHOW' : 'MOVIE'] } } })
    })
    if (!res.ok) throw new Error(`JustWatch answered ${res.status}`)
    const json = (await res.json()) as Result
    const node = json.data?.popularTitles?.edges.find((e) => e.node.content.externalIds.tmdbId === String(tmdbId))?.node
    const links: Record<number, string> = {}
    for (const o of node?.offers ?? []) if (o.standardWebURL && !links[o.package.packageId]) links[o.package.packageId] = o.standardWebURL
    return links
  })
}
