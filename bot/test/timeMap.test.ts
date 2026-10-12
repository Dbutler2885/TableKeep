import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TimeMap } from '../src/replay/timeMap.ts'
import { UtteranceBuilder } from '../src/replay/utterances.ts'

test('with nothing sent, a time is returned unchanged', () => {
  assert.equal(new TimeMap().toSession(3), 3)
})

test('continuous audio maps straight onto the session', () => {
  const map = new TimeMap()
  map.append(0, 10)
  map.append(10, 10)
  assert.equal(map.toSession(14.5), 14.5)
  assert.equal(map.streamSeconds, 20)
})

test('a time inside a later burst lands at that burst on the session', () => {
  const map = new TimeMap()
  map.append(5, 2) // service clock 0-2 is session 5-7
  map.append(60, 3) // service clock 2-5 is session 60-63
  assert.equal(map.toSession(1), 6)
  assert.equal(map.toSession(3.5), 61.5)
})

test('a time on the join between bursts is the end of the earlier or the start of the later', () => {
  const map = new TimeMap()
  map.append(5, 2)
  map.append(60, 3)
  assert.equal(map.toSession(2, 'end'), 7)
  assert.equal(map.toSession(2, 'start'), 60)
})

test('a time past everything sent is held at the end of the last burst', () => {
  const map = new TimeMap()
  map.append(5, 2)
  assert.equal(map.toSession(9), 7)
})

test('an utterance spanning two bursts starts in the first and ends in the second', () => {
  const map = new TimeMap()
  map.append(5, 2)
  map.append(60, 3)
  const builder = new UtteranceBuilder(map)
  builder.accept({
    type: 'Results',
    is_final: true,
    channel: { alternatives: [{ words: [{ word: 'roll', punctuated_word: 'Roll', start: 0.5, end: 1 }] }] },
  })
  builder.accept({
    type: 'Results',
    is_final: true,
    speech_final: true,
    channel: { alternatives: [{ words: [{ word: 'initiative', punctuated_word: 'initiative.', start: 2.5, end: 3.5 }] }] },
  })
  assert.deepEqual(builder.finished(), [{ start: 5.5, end: 61.5, text: 'Roll initiative.' }])
})

test('unsettled fragments are ignored', () => {
  const builder = new UtteranceBuilder(new TimeMap())
  builder.accept({
    type: 'Results',
    is_final: false,
    channel: { alternatives: [{ words: [{ word: 'maybe', start: 0, end: 1 }] }] },
  })
  builder.close()
  assert.deepEqual(builder.finished(), [])
})

test('a word the service places just across a join belongs to the burst that holds most of it', () => {
  const map = new TimeMap()
  map.append(3, 3.04) // service clock 0-3.04 is session 3-6.04
  map.append(8.54, 1.04) // service clock 3.04-4.08 is session 8.54-9.58

  const span = (start: number, end: number) => {
    const placed = map.spanToSession(start, end)
    return [Number(placed.start.toFixed(3)), Number(placed.end.toFixed(3))]
  }

  // The first word after a long pause, timed by the service as starting a little before the join.
  assert.deepEqual(span(2.92, 3.32), [8.54, 8.82])
  // The last word before the pause, timed as ending a little after it.
  assert.deepEqual(span(2.6, 3.1), [5.6, 6.04])
  // A word well inside a burst is simply translated.
  assert.deepEqual(span(1, 1.5), [4, 4.5])
})
