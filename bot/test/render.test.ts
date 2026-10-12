import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderTranscript } from '../src/session/render.ts'
import type { Utterance } from '../src/speech/transcriber.ts'

const RATE = 48_000
const say = (speakerId: string, startSeconds: number, endSeconds: number, text: string): Utterance => ({
  speakerId,
  startSamples: startSeconds * RATE,
  endSamples: endSeconds * RATE,
  text,
})
const names = new Map([
  ['1', 'Jem'],
  ['2', 'Peter'],
])

test('each stretch of speech is one line with its time and the speaker\'s name', () => {
  const text = renderTranscript([say('1', 65, 68, 'I search the room.'), say('2', 70, 71, 'Roll for it.')], names)

  assert.equal(text, '[01:05] Jem: I search the room.\n[01:10] Peter: Roll for it.')
})

test('pieces from one speaker with only a short pause between them are joined into one line', () => {
  const text = renderTranscript(
    [say('1', 10, 12, 'I search the room,'), say('1', 13.5, 15, 'starting with the desk.'), say('1', 18, 19, 'Anything?')],
    names,
  )

  assert.equal(text, '[00:10] Jem: I search the room, starting with the desk.\n[00:18] Jem: Anything?')
})

test('someone else speaking in between keeps the lines apart, and lines follow the order of speech', () => {
  const text = renderTranscript(
    [say('1', 13, 14, 'Second half.'), say('2', 12.2, 12.6, 'Go on.'), say('1', 10, 12, 'First half.')],
    names,
  )

  assert.equal(text, '[00:10] Jem: First half.\n[00:12] Peter: Go on.\n[00:13] Jem: Second half.')
})

test('a speaker with no known name is shown by their id, and a long session shows hours', () => {
  const text = renderTranscript([say('9', 3_725, 3_726, 'Hello.')], names)

  assert.equal(text, '[1:02:05] 9: Hello.')
})
