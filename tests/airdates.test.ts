import assert from 'node:assert/strict'
import { test } from 'node:test'
import { localDate } from '../src/lib/airdates'

// TVmaze's exact air time decides the day; here "local" is US Eastern (UTC-5 in November).
const eastern = (stamp: string) => new Date(Date.parse(stamp) - 5 * 3600_000).toISOString().slice(0, 10)
const ep = (s: number, e: number, date: string) => ({ season_number: s, episode_number: e, air_date: date })

test('a late-night anime is out the day before in the US', () => {
  // TMDB: Nov 27 (Japan's calendar); TVmaze: Nov 26 "25:26" broadcast, 15:26 UTC.
  const maze = [{ s: 1, n: 22, date: '2026-11-26', stamp: '2026-11-26T15:26:00+00:00' }]
  assert.equal(localDate(ep(1, 22, '2026-11-27'), maze, eastern), '2026-11-26')
})

test('episodes match by date when TVmaze numbers seasons differently', () => {
  const maze = [
    { s: 2, n: 8, date: '2026-11-19', stamp: '2026-11-19T14:56:00+00:00' },
    { s: 2, n: 9, date: '2026-11-26', stamp: '2026-11-26T14:56:00+00:00' }
  ]
  assert.equal(localDate(ep(1, 23, '2026-11-26'), maze, eastern), '2026-11-26')
  assert.equal(localDate(ep(1, 30, '2027-01-14'), maze, eastern), null)
})
