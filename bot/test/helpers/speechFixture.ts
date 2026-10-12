/**
 * Speaking a recorded fixture's phrases through the transcriber again, with the
 * clock simulated and the service's recorded answers played back.
 *
 * The fixtures were recorded from the real service with
 * `scripts/record-speech-fixture.ts`, using computer-generated speech. Here the
 * phrases are tones of the same lengths: the service's answers are what matter.
 */
import { readFileSync } from 'node:fs'
import { SpeakerTimeline, type VoicePacket } from '../../src/audio/timeline.ts'
import { SpeakerTranscriber, type Utterance } from '../../src/speech/transcriber.ts'
import { ReplayedConnection, type RecordedEntry } from './speech.ts'
import { Voice, Wire } from './synth.ts'

export type SpeechFixture = {
  keyterms: string[]
  phrases: { text: string; startSeconds: number; endSeconds: number }[]
  /** One list per connection the transcriber opened, in order. */
  exchanges: RecordedEntry[][]
  observed: { utterances: Utterance[]; checkpoints: number[] }
}

export const START = 1_000_000
export const RATE = 48_000

export function loadSpeechFixture(name: string): SpeechFixture {
  const fixture = JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8')) as SpeechFixture & {
    exchange?: RecordedEntry[]
  }
  return { ...fixture, exchanges: fixture.exchanges ?? [fixture.exchange!] }
}

export async function replaySpeechFixture(fixture: SpeechFixture) {
  const connections: ReplayedConnection[] = []
  const utterances: Utterance[] = []
  const checkpoints: number[] = []
  const transcriber = new SpeakerTranscriber({
    speakerId: 'narrator',
    connect: () => {
      const exchange = fixture.exchanges[connections.length]
      if (!exchange) throw new Error('The transcriber opened more connections than were recorded.')
      const connection = new ReplayedConnection(exchange)
      connections.push(connection)
      return connection
    },
    keyterms: fixture.keyterms,
    onProgress: (finished, checkpoint) => {
      utterances.push(...finished)
      checkpoints.push(checkpoint)
    },
  })
  const timeline = new SpeakerTimeline('narrator', START)
  const voice = new Voice()
  const packets: VoicePacket[] = fixture.phrases.flatMap((phrase, index) =>
    new Wire('narrator', {
      startMs: START + phrase.startSeconds * 1000,
      sequence: 100 + index * 5_000,
      rtp: Math.round(phrase.startSeconds * RATE),
    }).send(voice.speak(phrase.endSeconds - phrase.startSeconds)),
  )

  const endMs = START + (fixture.phrases.at(-1)!.endSeconds + 2) * 1000
  let next = 0
  for (let now = START; now <= endMs; now += 20) {
    while (next < packets.length && packets[next]!.receivedAtMs <= now) {
      for (const placed of timeline.push(packets[next]!)) transcriber.write(placed, now)
      next += 1
    }
    for (const placed of timeline.releaseDue(now)) transcriber.write(placed, now)
    transcriber.tick(now)
  }
  await transcriber.close(endMs)
  return { connections, utterances, checkpoints }
}
