/**
 * Records a real exchange with the speech service, for use as a test fixture.
 *
 *   node --env-file=.env.local scripts/record-speech-fixture.ts
 *
 * The speech is computer-generated (the macOS `say` command), so the fixture
 * holds nobody's voice or conversation. It needs macOS, ffmpeg and a Deepgram
 * key, and only has to be run again if the service's protocol changes.
 *
 * Two phrases are spoken with a pause between, through the real transcriber at
 * real speed. Everything the transcriber asked of the service and everything
 * the service answered is saved in order.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SpeakerTimeline, type VoicePacket } from '../src/audio/timeline.ts'
import { connectDeepgram } from '../src/speech/deepgram.ts'
import { SpeakerTranscriber, type SpeechConnection, type Utterance } from '../src/speech/transcriber.ts'

const require = createRequire(import.meta.url)
const { OpusEncoder } = require('@discordjs/opus') as {
  OpusEncoder: new (rate: number, channels: number) => { encode(pcm: Buffer): Buffer }
}

const PHRASES = ['The party enters Brandonsford and looks for the blacksmith.', 'Roll for initiative.']
const PAUSE_SECONDS = 2.5
const LEAD_SECONDS = 3
const KEYTERMS = ['Brandonsford']
const FRAME_BYTES = 960 * 2 * 2

const apiKey = process.env.DEEPGRAM_API_KEY
if (!apiKey) throw new Error('DEEPGRAM_API_KEY is not set.')

/** One phrase as Opus packets, 20 ms each, the way a Discord client sends them. */
function speak(phrase: string, dir: string, encoder: InstanceType<typeof OpusEncoder>): Buffer[] {
  const aiff = path.join(dir, 'phrase.aiff')
  execFileSync('say', ['-o', aiff, phrase])
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', aiff, '-ar', '48000', '-ac', '2', '-f', 's16le', '-'], { maxBuffer: 2 ** 28 })
  const packets: Buffer[] = []
  for (let offset = 0; offset + FRAME_BYTES <= pcm.length; offset += FRAME_BYTES) {
    packets.push(encoder.encode(pcm.subarray(offset, offset + FRAME_BYTES)))
  }
  return packets
}

type Entry =
  | { by: 'client'; action: 'audio'; samples: number }
  | { by: 'client'; action: 'finalize' | 'keepalive' | 'close' }
  | { by: 'service'; message: Record<string, unknown> }

const exchange: Entry[] = []
const connectReal = connectDeepgram({ apiKey })

/** Passes everything through to the real service and writes it down. */
function recording(real: SpeechConnection): SpeechConnection {
  const wrapper: SpeechConnection = {
    onmessage: null,
    sendAudio(samples) {
      const last = exchange.at(-1)
      if (last?.by === 'client' && last.action === 'audio') last.samples += samples.length
      else exchange.push({ by: 'client', action: 'audio', samples: samples.length })
      real.sendAudio(samples)
    },
    finalize() {
      exchange.push({ by: 'client', action: 'finalize' })
      real.finalize()
    },
    keepAlive() {
      exchange.push({ by: 'client', action: 'keepalive' })
      real.keepAlive()
    },
    async close() {
      exchange.push({ by: 'client', action: 'close' })
      await real.close()
    },
  }
  real.onmessage = (message) => {
    // The request id and model details identify the account's request and are not needed.
    if (message.type === 'Results') delete (message as { metadata?: unknown }).metadata
    if (message.type !== 'Metadata') exchange.push({ by: 'service', message })
    wrapper.onmessage?.(message)
  }
  return wrapper
}

const dir = mkdtempSync(path.join(tmpdir(), 'tablekeep-fixture-'))
const encoder = new OpusEncoder(48_000, 2)
const startMs = Date.now()
const packets: VoicePacket[] = []
const phrases: { text: string; startSeconds: number; endSeconds: number }[] = []
let atSeconds = LEAD_SECONDS
let sequence = 100
for (const text of PHRASES) {
  const spoken = speak(text, dir, encoder)
  phrases.push({ text, startSeconds: atSeconds, endSeconds: atSeconds + spoken.length * 0.02 })
  for (const payload of spoken) {
    packets.push({ speakerId: 'narrator', sequence: sequence++ & 0xffff, rtpTimestamp: Math.round(atSeconds * 48_000), payload, receivedAtMs: startMs + atSeconds * 1000 })
    atSeconds += 0.02
  }
  atSeconds += PAUSE_SECONDS
}
rmSync(dir, { recursive: true, force: true })

const utterances: Utterance[] = []
const checkpoints: number[] = []
const timeline = new SpeakerTimeline('narrator', startMs)
const transcriber = new SpeakerTranscriber({
  speakerId: 'narrator',
  connect: (options) => recording(connectReal(options)),
  keyterms: KEYTERMS,
  onProgress: (finished, checkpoint) => {
    utterances.push(...finished)
    checkpoints.push(checkpoint)
  },
})

console.log(`Speaking ${PHRASES.length} phrases over ${atSeconds.toFixed(1)} seconds...`)
let next = 0
await new Promise<void>((resolve) => {
  const timer = setInterval(() => {
    const now = Date.now()
    while (next < packets.length && packets[next]!.receivedAtMs <= now) {
      for (const placed of timeline.push(packets[next]!)) transcriber.write(placed, now)
      next += 1
    }
    for (const placed of timeline.releaseDue(now)) transcriber.write(placed, now)
    transcriber.tick(now)
    if (now - startMs > (atSeconds + 2) * 1000) {
      clearInterval(timer)
      resolve()
    }
  }, 20)
})
await transcriber.close(Date.now())

const fixture = {
  description: 'A real exchange with Deepgram nova-3, recorded with scripts/record-speech-fixture.ts from computer-generated speech.',
  keyterms: KEYTERMS,
  phrases,
  exchange,
  observed: { utterances, checkpoints },
}
writeFileSync(new URL('../test/fixtures/deepgram-two-phrases.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n')
console.log(`Saved ${exchange.length} entries.`)
for (const utterance of utterances) console.log(`  ${(utterance.startSamples / 48_000).toFixed(2)}-${(utterance.endSamples / 48_000).toFixed(2)}  ${utterance.text}`)
console.log('  phrases were spoken at', phrases.map((phrase) => `${phrase.startSeconds.toFixed(2)}-${phrase.endSeconds.toFixed(2)}`).join(', '))
console.log('  bytes', readFileSync(new URL('../test/fixtures/deepgram-two-phrases.json', import.meta.url)).length)
