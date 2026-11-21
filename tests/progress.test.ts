import assert from 'node:assert/strict'
import { test } from 'node:test'
import { airedEpisodes, countdown, daysUntil, inCaughtUp, renumbered, seasonStarts, showProgress, unwatchedBefore, watchIndex } from '../src/lib/progress'
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

// One Piece-style numbering: TMDB counts episodes on from the season before.
const counted = {
  status: 'Returning Series',
  seasons: [
    { season_number: 1, episode_count: 3 },
    { season_number: 2, episode_count: 4 },
    { season_number: 3, episode_count: 2 }
  ] as never,
  last_episode_to_air: ep(3, 8)
}

test('shows numbered across seasons start each season where the last one ended', () => {
  assert.deepEqual([...seasonStarts(counted)], [[1, 1], [2, 4], [3, 8]])
  assert.deepEqual(airedEpisodes(counted).map((e) => `${e.season}:${e.episode}`), ['1:1', '1:2', '1:3', '2:4', '2:5', '2:6', '2:7', '3:8'])
  // Marking 3:8 (as the show page does) leaves nothing to watch.
  const idx = watchIndex([w(3, 8)])
  const p = showProgress(counted, { skippedSeasons: [] }, idx.episodes.get('tv:1'))
  assert.equal(p.next, null)
  assert.ok(p.caughtUp)
  // A normal show is left alone.
  assert.deepEqual([...seasonStarts(show)], [[1, 1], [2, 1]])
})

test('episodes saved under a season’s own numbers move to the show’s', () => {
  assert.deepEqual(renumbered(counted, [{ season: 2, episode: 1 }, { season: 2, episode: 5 }, { season: 1, episode: 2 }]), [{ from: { season: 2, episode: 1 }, to: { season: 2, episode: 4 } }])
  assert.equal(renumbered(show, [{ season: 2, episode: 1 }]), null)
})

test('countdowns to release dates', () => {
  assert.deepEqual(countdown('2026-11-26', '2026-11-21'), ['5', 'days'])
  assert.deepEqual(countdown('2027-10-15', '2026-11-21'), ['11', 'months'])
  assert.deepEqual(countdown('2028-12-01', '2026-11-21'), ['2', 'years'])
  assert.deepEqual(countdown('2026-11-21', '2026-11-21'), ['Today', ''])
})

test('caught up: watching and caught up, or finished but still running', () => {
  const p = (watched: number, caughtUp: boolean) => ({ watched, total: 5, next: caughtUp ? null : { season: 2, episode: 3 }, caughtUp, finished: false, left: 0 })
  assert.ok(inCaughtUp({ status: 'watching' }, { status: 'Returning Series' }, p(5, true)))
  assert.ok(!inCaughtUp({ status: 'watching' }, { status: 'Returning Series' }, p(3, false)))
  // Finished, then new episodes came out: still listed under Caught Up.
  assert.ok(inCaughtUp({ status: 'completed' }, { status: 'Returning Series' }, p(4, false)))
  // Finished and ended: Finished.
  assert.ok(!inCaughtUp({ status: 'completed' }, { status: 'Ended' }, p(5, true)))
})
