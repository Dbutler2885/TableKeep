/**
 * The transcriber losing its connection mid-sentence, against a real exchange
 * with the speech service.
 *
 * `fixtures/deepgram-reconnect.json` was recorded from the real service with
 * `scripts/record-speech-fixture.ts reconnect`, using computer-generated
 * speech. The connection was cut a second into the second phrase, and the
 * fixture holds both the connection that was lost and the one opened after it.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SPEECH_SAMPLE_RATE } from '../src/speech/transcriber.ts'
import { loadSpeechFixture, RATE, replaySpeechFixture } from './helpers/speechFixture.ts'

const fixture = loadSpeechFixture('deepgram-reconnect')
const replay = () => replaySpeechFixture(fixture)
const [first, second] = fixture.phrases as [(typeof fixture.phrases)[0], (typeof fixture.phrases)[0]]

test('a sentence cut off by a lost connection comes back whole, once, from the connection opened after it', async () => {
  const { connections, utterances } = await replay()

  assert.equal(connections.length, 2)
  assert.deepEqual(
    utterances.map((utterance) => utterance.text),
    ['The party enters Brandonsford and looks for the blacksmith.', 'Goblin draws a rusty blade and charges at the wizard.'],
  )
})

test('the service is asked again when its first answer stops short, so the end of the sentence is not lost', async () => {
  const { utterances } = await replay()

  // Catching up, the audio is sent faster than it was spoken, and the service's first answer
  // to being asked to settle covered only part of it. The sentence must run to its last word.
  const settles = fixture.exchanges[1]!.filter((entry) => entry.by === 'client' && entry.action === 'finalize')
  assert.ok(settles.length > 1, 'the recorded service answered in full the first time')
  assert.match(utterances[1]!.text, /wizard\.$/)
  assert.ok(Math.abs(utterances[1]!.endSamples / RATE - second.endSeconds) < 0.25)
})

test('the sentence is placed where it was spoken, though it was transcribed late and on a new clock', async () => {
  const { utterances } = await replay()

  assert.ok(Math.abs(utterances[1]!.startSamples / RATE - second.startSeconds) < 0.25)
  assert.ok(utterances[1]!.startSamples >= utterances[0]!.endSamples)
})

test('only what had not been transcribed is sent to the new connection', async () => {
  await replay()

  const sentSeconds = (exchange: (typeof fixture.exchanges)[0]) =>
    exchange.reduce((sum, entry) => sum + (entry.by === 'client' && entry.action === 'audio' ? entry.samples : 0), 0) / SPEECH_SAMPLE_RATE
  // The first phrase was settled before the cut, so the second connection hears the second phrase alone.
  assert.ok(Math.abs(sentSeconds(fixture.exchanges[1]!) - (second.endSeconds - second.startSeconds)) < 0.05)
  assert.ok(sentSeconds(fixture.exchanges[0]!) > first.endSeconds - first.startSeconds)
})

test('the replay follows both recorded exchanges to their ends, and matches what was observed when they were recorded', async () => {
  const { connections, utterances, checkpoints } = await replay()

  assert.deepEqual(connections.map((connection) => connection.finished), [true, true])
  assert.deepEqual(
    utterances.map((utterance) => utterance.text),
    fixture.observed.utterances.map((utterance) => utterance.text),
  )
  assert.deepEqual(checkpoints, [...checkpoints].sort((a, b) => a - b))
  assert.ok(Math.abs(checkpoints.at(-1)! / RATE - second.endSeconds) < 0.05)
})
