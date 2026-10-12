/**
 * Synthetic voice for tests: tones encoded to Opus the way a Discord client
 * sends them, 20 ms to a packet. No real conversation is ever used as a fixture.
 */
import { createRequire } from 'node:module'
import type { VoicePacket } from '../../src/audio/timeline.ts'

const require = createRequire(import.meta.url)
const { OpusEncoder } = require('@discordjs/opus') as {
  OpusEncoder: new (rate: number, channels: number) => { encode(pcm: Buffer): Buffer; decode(packet: Buffer): Buffer }
}

export const FRAME_SAMPLES = 960
const RATE = 48_000
const CHANNELS = 2

/** A voice that encodes one continuous stream, as one person's client does. */
export class Voice {
  #codec = new OpusEncoder(RATE, CHANNELS)
  #phase = 0
  #samplesSpoken = 0

  /** Encodes `seconds` of a wavering tone and returns its packets. */
  speak(seconds: number, hertz = 220): Buffer[] {
    const packets: Buffer[] = []
    for (let frame = 0; frame < Math.round((seconds * RATE) / FRAME_SAMPLES); frame += 1) {
      const pcm = Buffer.alloc(FRAME_SAMPLES * CHANNELS * 2)
      for (let index = 0; index < FRAME_SAMPLES; index += 1) {
        // The pitch and loudness drift, so that every stretch of the tone differs from every other.
        const t = this.#samplesSpoken / RATE
        this.#phase += (2 * Math.PI * (hertz + 60 * Math.sin(t * 1.7))) / RATE
        const value = Math.round(9000 * (0.6 + 0.4 * Math.sin(t * 3.1)) * Math.sin(this.#phase))
        pcm.writeInt16LE(value, index * 4)
        pcm.writeInt16LE(value, index * 4 + 2)
        this.#samplesSpoken += 1
      }
      packets.push(this.#codec.encode(pcm))
    }
    return packets
  }
}

/** Decodes packets with a fresh decoder, as a player opening a file does, into one channel of samples. */
export function decode(packets: Uint8Array[], skipSamples = 0): Int16Array {
  const codec = new OpusEncoder(RATE, CHANNELS)
  const frames = packets.map((packet) => codec.decode(Buffer.from(packet)))
  const stereo = Buffer.concat(frames)
  const mono = new Int16Array(stereo.length / 4)
  for (let index = 0; index < mono.length; index += 1) mono[index] = stereo.readInt16LE(index * 4)
  return mono.subarray(skipSamples)
}

/** The root-mean-square difference between two signals over the samples they share. */
export function rmsDifference(left: Int16Array, right: Int16Array): number {
  const length = Math.min(left.length, right.length)
  let sum = 0
  for (let index = 0; index < length; index += 1) sum += (left[index]! - right[index]!) ** 2
  return Math.sqrt(sum / Math.max(length, 1))
}

/**
 * Turns packets into the stream a bot would receive: numbered, timestamped, and
 * arriving 20 ms apart starting at `startMs`.
 */
export class Wire {
  #speakerId: string
  #sequence: number
  #rtp: number
  #clockMs: number

  constructor(speakerId: string, options: { startMs: number; sequence?: number; rtp?: number }) {
    this.#speakerId = speakerId
    this.#sequence = options.sequence ?? 100
    this.#rtp = options.rtp ?? 5_000
    this.#clockMs = options.startMs
  }

  send(payloads: Uint8Array[]): VoicePacket[] {
    return payloads.map((payload) => {
      const packet: VoicePacket = {
        speakerId: this.#speakerId,
        sequence: this.#sequence & 0xffff,
        rtpTimestamp: this.#rtp >>> 0,
        payload,
        receivedAtMs: this.#clockMs,
      }
      this.#sequence += 1
      this.#rtp += FRAME_SAMPLES
      this.#clockMs += 20
      return packet
    })
  }

  /** The speaker says nothing for a while: time passes and the timestamp counts on, but nothing is sent. */
  quiet(seconds: number): void {
    this.#rtp += Math.round(seconds * RATE)
    this.#clockMs += seconds * 1000
  }
}

export const SILENCE = Buffer.of(0xf8, 0xff, 0xfe)
