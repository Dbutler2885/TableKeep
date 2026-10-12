/**
 * Placing one speaker's voice packets on the session timeline.
 *
 * Packets arrive over a network: mostly in order, occasionally late, doubled or
 * missing. Each carries a sequence number and a timestamp that counts samples
 * of audio and keeps counting through silence. Within one connection, that
 * timestamp says exactly where a packet belongs in time, so the clock is only
 * consulted once, to anchor the first packet of each connection.
 *
 * When a speaker leaves and returns, or the bot reconnects, the numbering
 * starts afresh from unrelated values. That begins a new epoch with a new
 * anchor.
 */
import { OPUS_SAMPLE_RATE, opusPacketSamples } from './opus.ts'

/** A voice packet as it came off the wire, decrypted. */
export type VoicePacket = {
  speakerId: string
  /** 16-bit, wraps. */
  sequence: number
  /** 32-bit count of samples at 48 kHz, wraps. */
  rtpTimestamp: number
  payload: Uint8Array
  receivedAtMs: number
}

/** A packet in its place: in order, and positioned on the session timeline. */
export type PlacedPacket = {
  speakerId: string
  epoch: number
  /** Samples at 48 kHz from the start of the session. */
  positionSamples: number
  durationSamples: number
  payload: Uint8Array
  /** How many packets immediately before this one never arrived. */
  lostBefore: number
}

export type TimelineCounts = { duplicates: number; tooLate: number; lost: number; epochs: number }

/** How many packets are held back so that a late one can still take its place. Five is a tenth of a second. */
const REORDER_WINDOW = 5
/**
 * How long a packet is held at most. Without this the last few packets of every
 * burst would wait, unarchived and untranscribed, until the speaker spoke again.
 */
const MAX_HOLD_MS = 150
/** A jump in sequence this large is a new stream, not loss. */
const NEW_STREAM_SEQUENCE_JUMP = 1_000
/** How far a packet's timestamp may disagree with the clock before it is taken for a new stream, in milliseconds. */
const NEW_STREAM_CLOCK_DISAGREEMENT_MS = 3_000

/** The shortest signed distance from `from` to `to` on a counter that wraps at `modulus`. */
function wrappedDelta(to: number, from: number, modulus: number): number {
  const delta = (((to - from) % modulus) + modulus) % modulus
  return delta > modulus / 2 ? delta - modulus : delta
}

type Held = { order: number; rtp: number; packet: VoicePacket }

export class SpeakerTimeline {
  readonly counts: TimelineCounts = { duplicates: 0, tooLate: 0, lost: 0, epochs: 0 }
  #speakerId: string
  #sessionStartMs: number
  #held: Held[] = []
  #epoch = -1
  /** The most recent packet taken in, in the unwrapped numbering of the current epoch. */
  #last: { order: number; rtp: number; receivedAtMs: number; sequence: number; rtpTimestamp: number } | null = null
  #anchor = { rtp: 0, positionSamples: 0 }
  /** The order of the last packet released, and where the audio so far ends. */
  #releasedOrder = -Infinity
  #endSamples = 0
  #needsNewEpoch = true

  constructor(speakerId: string, sessionStartMs: number) {
    this.#speakerId = speakerId
    this.#sessionStartMs = sessionStartMs
  }

  /**
   * Says that whatever arrives next belongs to a new stream, as when the
   * speaker has rejoined or the bot has reconnected. Returns what was held.
   */
  startNewEpoch(): PlacedPacket[] {
    const released = this.flush()
    this.#needsNewEpoch = true
    return released
  }

  /**
   * Takes a packet in and returns any that are now safe to release, in order.
   *
   * What is released, and what is dropped as too late, depends only on the
   * packets and their arrival times, never on when `releaseDue` happened to be
   * called. So replaying a journal of the same packets always gives the same
   * result as the live session did.
   */
  push(packet: VoicePacket): PlacedPacket[] {
    const released: PlacedPacket[] = this.releaseDue(packet.receivedAtMs)
    if (!this.#needsNewEpoch && this.#last && this.#looksLikeNewStream(packet)) {
      released.push(...this.startNewEpoch())
    }

    if (this.#needsNewEpoch || !this.#last) {
      this.#beginEpoch(packet)
      this.#held.push({ order: 0, rtp: 0, packet })
      this.#last = { order: 0, rtp: 0, receivedAtMs: packet.receivedAtMs, sequence: packet.sequence, rtpTimestamp: packet.rtpTimestamp }
    } else {
      const order = this.#last.order + wrappedDelta(packet.sequence, this.#last.sequence, 0x1_0000)
      const rtp = this.#last.rtp + wrappedDelta(packet.rtpTimestamp, this.#last.rtpTimestamp, 0x1_0000_0000)
      if (order <= this.#releasedOrder) {
        // Its place has already gone out: either a copy of one that arrived, or one counted as lost.
        this.counts.tooLate += 1
        return released
      }
      if (this.#held.some((held) => held.order === order)) {
        this.counts.duplicates += 1
        return released
      }
      this.#held.push({ order, rtp, packet })
      this.#held.sort((a, b) => a.order - b.order)
      if (order > this.#last.order) {
        this.#last = { order, rtp, receivedAtMs: packet.receivedAtMs, sequence: packet.sequence, rtpTimestamp: packet.rtpTimestamp }
      }
    }

    while (this.#held.length > REORDER_WINDOW) released.push(this.#release(this.#held.shift()!))
    return released
  }

  /** Releases packets that have been held long enough for any late one to have arrived. Call it regularly. */
  releaseDue(nowMs: number): PlacedPacket[] {
    const released: PlacedPacket[] = []
    while (this.#held.length > 0 && nowMs - this.#held[0]!.packet.receivedAtMs >= MAX_HOLD_MS) {
      released.push(this.#release(this.#held.shift()!))
    }
    return released
  }

  /** Releases everything still held, as when the speaker has gone quiet or the session is ending. */
  flush(): PlacedPacket[] {
    const released = this.#held.map((held) => this.#release(held))
    this.#held = []
    return released
  }

  #looksLikeNewStream(packet: VoicePacket): boolean {
    const last = this.#last!
    if (Math.abs(wrappedDelta(packet.sequence, last.sequence, 0x1_0000)) > NEW_STREAM_SEQUENCE_JUMP) return true
    const audioMs = (wrappedDelta(packet.rtpTimestamp, last.rtpTimestamp, 0x1_0000_0000) / OPUS_SAMPLE_RATE) * 1000
    const clockMs = packet.receivedAtMs - last.receivedAtMs
    return Math.abs(audioMs - clockMs) > NEW_STREAM_CLOCK_DISAGREEMENT_MS
  }

  #beginEpoch(first: VoicePacket): void {
    this.#epoch += 1
    this.counts.epochs += 1
    this.#needsNewEpoch = false
    this.#releasedOrder = -Infinity
    const byClock = Math.round(((first.receivedAtMs - this.#sessionStartMs) / 1000) * OPUS_SAMPLE_RATE)
    // A new stream can never begin before the audio already placed.
    this.#anchor = { rtp: 0, positionSamples: Math.max(byClock, this.#endSamples, 0) }
  }

  #release(held: Held): PlacedPacket {
    const isFirstOfEpoch = this.#releasedOrder === -Infinity
    const lostBefore = isFirstOfEpoch ? 0 : held.order - this.#releasedOrder - 1
    this.counts.lost += lostBefore
    this.#releasedOrder = held.order

    const durationSamples = opusPacketSamples(held.packet.payload)
    // Never earlier than where the audio already ends, whatever the timestamps claim.
    const positionSamples = Math.max(this.#anchor.positionSamples + (held.rtp - this.#anchor.rtp), this.#endSamples)
    this.#endSamples = positionSamples + durationSamples
    return {
      speakerId: this.#speakerId,
      epoch: this.#epoch,
      positionSamples,
      durationSamples,
      payload: held.packet.payload,
      lostBefore,
    }
  }
}
