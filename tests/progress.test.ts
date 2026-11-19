import assert from 'node:assert/strict'
import { test } from 'node:test'
import { airedEpisodes, daysUntil, showProgress, unwatchedBefore, watchIndex } from '../src/lib/progress'
import { emptyMeta, merge, stampChanges, emptyDoc } from '../src/lib/sync'
import type { Watch } from '../src/lib/types'

const ep = (s: number, e: number) => ({ season_number: s, episode_number: e }) as never
const show = {
  status: 'Returning Series',
  seasons: [
    { season_number: 0, episode_count: 3 },
    { season_number: 1, episode_count: 3 },
    { season_number: 2, episode_count: 4 }
  ] as never,
  last_episode_to_air: ep(2, 2)
}
const w = (s: number, e: number, at = 1): Watch => ({ id: `tv:1:${s}:${e}`, itemId: 'tv:1', season: s, episode: e, at, runtime: 30 })

test('aired episodes skip specials, unaired and skipped seasons', () => {
  assert.equal(airedEpisodes(show).length, 5)
  assert.deepEqual(airedEpisodes(show, [1]), [
    { season: 2, episode: 1 },
    { season: 2, episode: 2 }
  ])
})

test('up next follows the furthest watched episode', () => {
  const idx = watchIndex([w(1, 1), w(1, 3)])
  const p = showProgress(show, { skippedSeasons: [] }, idx.episodes.get('tv:1'))
  assert.deepEqual(p.next, { season: 2, episode: 1 })
  assert.equal(p.watched, 2)
  assert.equal(p.total, 5)
  assert.equal(p.left, 2)
})

test('caught up, and finished only when the show ended', () => {
  const all = [w(1, 1), w(1, 2), w(1, 3), w(2, 1), w(2, 2)]
  const p = showProgress(show, { skippedSeasons: [] }, watchIndex(all).episodes.get('tv:1'))
  assert.equal(p.next, null)
  assert.ok(p.caughtUp)
  assert.ok(!p.finished)
  assert.ok(showProgress({ ...show, status: 'Ended' }, { skippedSeasons: [] }, watchIndex(all).episodes.get('tv:1')).finished)
})

test('unwatched episodes before a target', () => {
  const idx = watchIndex([w(1, 2)])
  assert.deepEqual(unwatchedBefore(show, { skippedSeasons: [] }, idx.episodes.get('tv:1'), { season: 2, episode: 1 }), [
    { season: 1, episode: 1 },
    { season: 1, episode: 3 }
  ])
})

test('daysUntil', () => {
  assert.equal(daysUntil('2026-03-01', '2026-02-27'), 2)
  assert.equal(daysUntil('2026-01-01', '2026-01-02'), -1)
})

test('sync: watches merge from two devices and deletions win', () => {
  const settings = { theme: 'cinema' } as never
  const a = { items: [], watches: [w(1, 1, 10)], settings }
  let metaA = stampChanges({ items: [], watches: [], settings }, a, emptyMeta(), 100)!
  const first = merge(a, metaA, emptyDoc(), 100)
  metaA = first.meta
  // Device B adds an episode; device A later removes S1E1.
  const b = { items: [], watches: [w(1, 2, 20)], settings }
  const metaB = stampChanges({ items: [], watches: [], settings }, b, emptyMeta(), 150)!
  const second = merge(b, metaB, first.doc, 200)
  assert.equal(second.data.watches.length, 2)
  const removed = stampChanges(a, { ...a, watches: [] }, metaA, 300)!
  const third = merge({ ...a, watches: [] }, removed, second.doc, 300)
  assert.deepEqual(third.data.watches.map((x) => x.id), ['tv:1:1:2'])
})
