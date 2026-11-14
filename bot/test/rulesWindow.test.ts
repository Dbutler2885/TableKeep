import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TranscriptWindow, transcriptText, type TranscriptLine } from '../src/rules/transcriptWindow.ts'

const RATE = 48_000

/** A line said from `fromSeconds` to `toSeconds` into the session. */
const said = (speaker: string, text: string, fromSeconds: number, toSeconds = fromSeconds + 2): TranscriptLine => ({
  speaker,
  text,
  startSamples: fromSeconds * RATE,
  endSamples: toSeconds * RATE,
})
const texts = (window: TranscriptLine[]) => window.map((line) => line.text)

test('lines that arrive out of order across speakers are put back in the order they were said', () => {
  const window = new TranscriptWindow({ windowSeconds: 90, maxChars: 4_000 })
  window.add([said('Peter', 'second', 20)])
  window.add([said('Ann', 'first', 10), said('Ann', 'third', 30)])

  assert.deepEqual(texts(window.at(40 * RATE)), ['first', 'second', 'third'])
})

test('the window reaches back only so far from now, measured on the session timeline', () => {
  const window = new TranscriptWindow({ windowSeconds: 90, maxChars: 4_000 })
  window.add([said('Ann', 'long ago', 0, 5), said('Ann', 'at the edge', 15, 20), said('Peter', 'just now', 98)])

  // At 110 seconds the window opens at 20: a line that ended at 20 is in it, one that ended at 5 is not.
  assert.deepEqual(texts(window.at(110 * RATE)), ['at the edge', 'just now'])
})

test('lines replayed from long ago, as after a restart, are never in the window', () => {
  const window = new TranscriptWindow({ windowSeconds: 90, maxChars: 4_000 })
  window.add([said('Ann', 'an hour ago', 60, 62)])

  assert.deepEqual(window.at(3_600 * RATE), [])
})

test('a window that has been dealt with is not offered again; only what was said after it is', () => {
  const window = new TranscriptWindow({ windowSeconds: 90, maxChars: 4_000 })
  window.add([said('Peter', 'Does a shield count against arrows?', 10), said('Ann', 'Good question', 13)])
  window.settle(window.at(20 * RATE))

  assert.deepEqual(window.at(25 * RATE), [])
  window.add([said('Jem', 'Can I reload and shoot?', 26)])
  assert.deepEqual(texts(window.at(30 * RATE)), ['Can I reload and shoot?'])
})

test('a line still being said when the window was settled, but ending after it, is offered again', () => {
  const window = new TranscriptWindow({ windowSeconds: 90, maxChars: 4_000 })
  window.add([said('Peter', 'question', 10, 12)])
  window.settle(window.at(13 * RATE))
  // Ann started talking before Peter finished, but her line ended later and only arrived now.
  window.add([said('Ann', 'overlapping', 11, 15)])

  assert.deepEqual(texts(window.at(16 * RATE)), ['overlapping'])
})

test('a window with more text than it may hold keeps the most recent lines, and always the latest', () => {
  const window = new TranscriptWindow({ windowSeconds: 90, maxChars: 40 })
  window.add([said('Ann', 'a'.repeat(20), 10), said('Peter', 'b'.repeat(20), 20), said('Jem', 'c'.repeat(20), 30)])
  assert.deepEqual(texts(window.at(40 * RATE)), ['c'.repeat(20)])

  const tight = new TranscriptWindow({ windowSeconds: 90, maxChars: 10 })
  tight.add([said('Ann', 'x'.repeat(50), 10)])
  assert.deepEqual(texts(tight.at(20 * RATE)), ['x'.repeat(50)])
})

test('empty lines are dropped, and a window reads as one line per speaker turn', () => {
  const window = new TranscriptWindow({ windowSeconds: 90, maxChars: 4_000 })
  window.add([said('Ann', '  ', 5), said('Ann', ' I attack. ', 10), said('Dave', 'Roll it.', 12)])

  assert.equal(transcriptText(window.at(20 * RATE)), 'Ann: I attack.\nDave: Roll it.')
})
