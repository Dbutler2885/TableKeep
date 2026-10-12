import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SpeakerTimeline, type PlacedPacket } from '../src/audio/timeline.ts'
import { SpeakerTranscriber, type Utterance } from '../src/speech/transcriber.ts'
import { scriptedSpeech } from './helpers/speech.ts'
import { SILENCE, Voice, Wire } from './helpers/synth.ts'

const START = 1_000_000
const RATE = 48_000

/** A transcriber for one speaker, with what it has reported so far. */
function setUp() {
  const speech = scriptedSpeech()
  const progress: { utterances: Utterance[]; checkpoint: number }[] = []
  const transcriber = new SpeakerTranscriber({
    speakerId: 'jem',
    connect: speech.connect,
    keyterms: ['Brandonsford', 'Victorf'],
    onProgress: (utterances, checkpoint) => progress.push({ utterances, checkpoint }),
  })
  const timeline = new SpeakerTimeline('jem', START)
  const voice = new Voice()
  /** Speaks for `seconds` starting `atSeconds` into the session, and returns when the last packet arrived. */
  const say = (wire: Wire, seconds: number, extra: Uint8Array[] = []): number => {
    const packets = wire.send([...voice.speak(seconds), ...extra])
    const placed: PlacedPacket[] = [...packets.flatMap((packet) => timeline.push(packet)), ...timeline.flush()]
    placed.forEach((packet, index) => transcriber.write(packet, packets[index]!.receivedAtMs))
    return packets.at(-1)!.receivedAtMs
  }
  const utterances = () => progress.flatMap((entry) => entry.utterances)
  return { speech, progress, transcriber, say, utterances }
}

test('nothing is asked of the speech service until the speaker first speaks', () => {
  const { speech, transcriber, say } = setUp()

  transcriber.tick(START + 5_000)
  assert.equal(speech.connections.length, 0)

  say(new Wire('jem', { startMs: START + 6_000 }), 0.5)
  assert.equal(speech.connections.length, 1)
  assert.deepEqual(speech.connections[0]!.keyterms, ['Brandonsford', 'Victorf'])
})

test('once a speaker has been quiet for a moment, what they said becomes an utterance placed on the session timeline', () => {
  const { speech, progress, transcriber, say, utterances } = setUp()
  const lastAt = say(new Wire('jem', { startMs: START + 10_000 }), 2)

  transcriber.tick(lastAt + 300)
  assert.equal(utterances().length, 0)
  transcriber.tick(lastAt + 800)

  assert.deepEqual(speech.connections[0]!.log, ['audio', 'finalize'])
  const [utterance] = utterances()
  assert.equal(utterance!.speakerId, 'jem')
  assert.equal(utterance!.startSamples, 10 * RATE)
  assert.equal(utterance!.endSamples, Math.round(11.9 * RATE))
  assert.equal(utterance!.text, 'w0.0 w0.5 w1.0 w1.5')
  // Everything sent has been dealt with, so the checkpoint is at the end of the audio.
  assert.equal(progress.at(-1)!.checkpoint, 12 * RATE)
})

test('speech after a long silence is placed where it was spoken, not straight after what came before', () => {
  const { transcriber, say, utterances } = setUp()
  const wire = new Wire('jem', { startMs: START + 10_000 })
  const firstEnd = say(wire, 1)
  transcriber.tick(firstEnd + 800)
  wire.quiet(30)
  const secondEnd = say(wire, 1)
  transcriber.tick(secondEnd + 800)

  const [first, second] = utterances()
  assert.equal(first!.startSamples, 10 * RATE)
  // One second of speech, thirty of silence: the service's clock says 1.0, the session says 41.
  assert.equal(second!.startSamples, 41 * RATE)
  assert.equal(second!.text, 'w1.0 w1.5')
})

test('the silence frames that end a burst are not sent for transcription', () => {
  const { speech, say } = setUp()
  say(new Wire('jem', { startMs: START }), 1, Array.from({ length: 10 }, () => SILENCE))

  assert.equal(Number(speech.connections[0]!.secondsSent.toFixed(3)), 1)
})

test('a quiet connection is kept alive', () => {
  const { speech, transcriber, say } = setUp()
  const lastAt = say(new Wire('jem', { startMs: START }), 0.5)
  for (let ms = 500; ms <= 10_000; ms += 500) transcriber.tick(lastAt + ms)

  assert.deepEqual(speech.connections[0]!.log, ['audio', 'finalize', 'keepalive', 'keepalive', 'keepalive'])
})

test('fragments the service settles one at a time are joined into one utterance when it hears the pause', () => {
  const { speech, say, utterances } = setUp()
  const wire = new Wire('jem', { startMs: START + 4_000 })
  say(wire, 1)
  const connection = speech.connections[0]!
  connection.emit({ ...connection.result(), is_final: false })
  assert.equal(utterances().length, 0)

  say(wire, 1)
  connection.emit(connection.result())
  assert.equal(utterances().length, 0)

  say(wire, 1)
  connection.emit(connection.result({ speech_final: true }))

  assert.deepEqual(
    utterances().map((utterance) => [utterance.startSamples / RATE, utterance.text]),
    [[5, 'w1.0 w1.5 w2.0 w2.5']],
  )
})

test('the checkpoint does not pass words that are still waiting to become an utterance', () => {
  const { speech, progress, say } = setUp()
  const wire = new Wire('jem', { startMs: START })
  say(wire, 2)
  const connection = speech.connections[0]!

  connection.emit(connection.result())

  // Two seconds are settled, but their words are held for an utterance in progress.
  assert.ok(progress.every((entry) => entry.checkpoint === 0 && entry.utterances.length === 0))

  say(wire, 1)
  connection.emit(connection.result({ speech_final: true }))
  assert.equal(progress.at(-1)!.checkpoint, 3 * RATE)
  assert.equal(progress.at(-1)!.utterances.length, 1)
})

test('audio the service finds no words in still moves the checkpoint', () => {
  const { speech, progress, say } = setUp()
  say(new Wire('jem', { startMs: START }), 1.5)
  const connection = speech.connections[0]!

  connection.emit({ type: 'Results', is_final: true, speech_final: true, start: 0, duration: 1.5, channel: { alternatives: [{ words: [] }] } })

  assert.deepEqual(progress, [{ utterances: [], checkpoint: 1.5 * RATE }])
})

test('a service that never answers a request to settle is not waited on for ever', () => {
  const { speech, progress, transcriber, say } = setUp()
  const lastAt = say(new Wire('jem', { startMs: START }), 1)
  speech.connections[0]!.answers = false

  transcriber.tick(lastAt + 800)
  transcriber.tick(lastAt + 3_000)
  assert.deepEqual(progress, [])
  transcriber.tick(lastAt + 5_000)

  assert.deepEqual(progress, [{ utterances: [], checkpoint: 1 * RATE }])
  // And it does not ask again for audio it has already given up on.
  transcriber.tick(lastAt + 9_000)
  assert.equal(speech.connections[0]!.log.filter((entry) => entry === 'finalize').length, 1)
})

test('closing settles the last words and closes the connection', async () => {
  const { speech, transcriber, say, utterances } = setUp()
  const lastAt = say(new Wire('jem', { startMs: START + 2_000 }), 1)

  await transcriber.close(lastAt + 20)

  assert.deepEqual(utterances().map((utterance) => utterance.text), ['w0.0 w0.5'])
  assert.equal(speech.connections[0]!.closed, true)
})
