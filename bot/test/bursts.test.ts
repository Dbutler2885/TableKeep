import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findBursts, totalSamples } from '../src/replay/bursts.ts'

/** Builds a track from a compact description: a positive count of sound, a negative count of silence. */
function track(...parts: number[]): Int16Array {
  const samples: number[] = []
  for (const part of parts) {
    for (let index = 0; index < Math.abs(part); index += 1) samples.push(part > 0 ? 100 : 0)
  }
  return Int16Array.from(samples)
}

test('a silent track has no bursts', () => {
  assert.deepEqual(findBursts(track(-50), 5), [])
})

test('sound between two long silences is one burst', () => {
  assert.deepEqual(findBursts(track(-10, 20, -10), 5), [{ start: 10, end: 30 }])
})

test('a silence longer than the gap splits two bursts', () => {
  assert.deepEqual(findBursts(track(8, -6, 4), 5), [
    { start: 0, end: 8 },
    { start: 14, end: 18 },
  ])
})

test('a silence no longer than the gap stays inside its burst', () => {
  assert.deepEqual(findBursts(track(8, -4, 4), 5), [{ start: 0, end: 16 }])
})

test('a burst running to the end of the track is closed', () => {
  assert.deepEqual(findBursts(track(-3, 7), 5), [{ start: 3, end: 10 }])
})

test('total length adds up the bursts and leaves out the silence', () => {
  assert.equal(totalSamples(findBursts(track(8, -6, 4), 5)), 12)
})
