/**
 * The transcriber against a real exchange with the speech service.
 *
 * `fixtures/deepgram-two-phrases.json` was recorded from the real service with
 * `scripts/record-speech-fixture.ts`, using computer-generated speech. Here the
 * same two phrases are "spoken" again, as tones of the same lengths, and the
 * service's recorded answers are played back at the points it gave them.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadSpeechFixture, RATE, replaySpeechFixture } from './helpers/speechFixture.ts'

const fixture = loadSpeechFixture('deepgram-two-phrases')
const replay = () => replaySpeechFixture(fixture)

test('each phrase comes back as one utterance, with the words the service heard', async () => {
  const { utterances } = await replay()

  assert.deepEqual(
    utterances.map((utterance) => utterance.text),
    ['The party enters Brandonsford and looks for the blacksmith.', 'Role for initiative.'],
  )
})

test('each utterance is placed where its phrase was spoken, though the service only ever saw the speech', async () => {
  const { utterances } = await replay()

  utterances.forEach((utterance, index) => {
    const phrase = fixture.phrases[index]!
    const startSeconds = utterance.startSamples / RATE
    const endSeconds = utterance.endSamples / RATE
    assert.ok(Math.abs(startSeconds - phrase.startSeconds) < 0.25, `utterance ${index} starts at ${startSeconds}`)
    assert.ok(endSeconds > startSeconds && endSeconds <= phrase.endSeconds + 0.05, `utterance ${index} ends at ${endSeconds}`)
  })
  // The second phrase came 2.5 seconds after the first; so does its utterance.
  assert.ok(utterances[1]!.startSamples - utterances[0]!.endSamples > 2 * RATE)
})

test('the whole of a phrase is sent before the service is asked to settle it', async () => {
  const { utterances } = await replay()

  // "blacksmith" is the last word of the first phrase. It is only heard whole if the
  // tail of the burst reached the service before it was asked to settle.
  assert.match(utterances[0]!.text, /blacksmith\.$/)
})

test('the checkpoint ends at the end of the last phrase and never moves backward', async () => {
  const { checkpoints } = await replay()

  assert.deepEqual(checkpoints, [...checkpoints].sort((a, b) => a - b))
  assert.ok(Math.abs(checkpoints.at(-1)! / RATE - fixture.phrases.at(-1)!.endSeconds) < 0.05)
})

test('the replay follows the recorded exchange to its end, and matches what was observed when it was recorded', async () => {
  const { connections, utterances } = await replay()

  assert.equal(connections[0]!.finished, true)
  assert.deepEqual(
    utterances.map((utterance) => utterance.text),
    fixture.observed.utterances.map((utterance) => utterance.text),
  )
  utterances.forEach((utterance, index) => {
    assert.ok(Math.abs(utterance.startSamples - fixture.observed.utterances[index]!.startSamples) < 0.1 * RATE)
  })
})
