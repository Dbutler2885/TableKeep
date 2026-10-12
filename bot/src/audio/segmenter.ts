/**
 * Cutting one speaker's placed packets into archive segments.
 *
 * A segment is one unbroken run of audio. A new one begins wherever the run
 * breaks: the speaker went quiet, a packet was lost, their stream restarted, or
 * the run simply reached its length limit. Silence is not stored; it is the
 * space between two segments on the timeline.
 */
import { writeOggOpus } from './ogg.ts'
import { OPUS_SAMPLE_RATE } from './opus.ts'
import type { PlacedPacket } from './timeline.ts'

/** Why a segment began where it did. */
export type SegmentStart =
  /** The first audio of an epoch: the speaker's first words, or their first after rejoining. */
  | 'epoch'
  /** The speaker had been quiet. */
  | 'quiet'
  /** One or more packets before it never arrived. */
  | 'loss'
  /** The run before it reached the length limit; the audio is continuous across the join. */
  | 'split'

export type Segment = {
  speakerId: string
  epoch: number
  startSamples: number
  endSamples: number
  startedBy: SegmentStart
  /** Packets missing immediately before this segment. Zero unless it was started by loss. */
  lostPacketsBefore: number
  packets: Uint8Array[]
  /**
   * The last packets of the run before, when this segment continues it.
   * A decoder needs them to be settled by the time it reaches the true start.
   */
  leadIn: Uint8Array[]
  leadInSamples: number
}

export const DEFAULT_MAX_SEGMENT_SECONDS = 60
/** Four packets is 80 ms, the lead-in the Opus specification asks a decoder be given. */
const LEAD_IN_PACKETS = 4

export class Segmenter {
  #maxSamples: number
  #open: Segment | null = null
  /** Where the audio so far ends, which outlives a flush so the next segment knows how it follows on. */
  #last: { epoch: number; endSamples: number } | null = null
  /** The tail of the audio so far, kept in case the next segment continues it. */
  #recent: PlacedPacket[] = []

  constructor(maxSegmentSeconds = DEFAULT_MAX_SEGMENT_SECONDS) {
    this.#maxSamples = maxSegmentSeconds * OPUS_SAMPLE_RATE
  }

  /** Takes the next packet, in order, and returns a segment if one has just been completed. */
  push(packet: PlacedPacket): Segment | null {
    const open = this.#open
    const last = this.#last
    let finished: Segment | null = null
    let startedBy: SegmentStart | null = null

    if (!last || packet.epoch !== last.epoch) {
      startedBy = 'epoch'
    } else if (packet.lostBefore > 0) {
      startedBy = 'loss'
    } else if (packet.positionSamples !== last.endSamples) {
      startedBy = 'quiet'
    } else if (!open || open.endSamples - open.startSamples >= this.#maxSamples) {
      // Continuous with what came before, but that segment is full or already closed.
      startedBy = 'split'
    }

    if (startedBy) {
      finished = this.#open
      const leadIn = startedBy === 'split' ? this.#recent.slice(-LEAD_IN_PACKETS) : []
      this.#open = {
        speakerId: packet.speakerId,
        epoch: packet.epoch,
        startSamples: packet.positionSamples,
        endSamples: packet.positionSamples,
        startedBy,
        lostPacketsBefore: startedBy === 'loss' ? packet.lostBefore : 0,
        packets: [],
        leadIn: leadIn.map((recent) => recent.payload),
        leadInSamples: leadIn.reduce((sum, recent) => sum + recent.durationSamples, 0),
      }
    }

    const current = this.#open!
    current.packets.push(packet.payload)
    current.endSamples = packet.positionSamples + packet.durationSamples
    this.#last = { epoch: packet.epoch, endSamples: current.endSamples }
    this.#recent.push(packet)
    if (this.#recent.length > LEAD_IN_PACKETS) this.#recent.shift()
    return finished
  }

  /** Completes the segment in progress, as when the speaker has gone quiet or the session is ending. */
  flush(): Segment | null {
    const finished = this.#open
    this.#open = null
    return finished
  }
}

/** A stable name for a segment: the same audio always gets the same one. */
export function segmentId(segment: Pick<Segment, 'speakerId' | 'epoch' | 'startSamples'>): string {
  return `${segment.speakerId}-${String(segment.epoch).padStart(3, '0')}-${String(segment.startSamples).padStart(12, '0')}`
}

/** The segment as a standalone Ogg Opus file. */
export function segmentFile(segment: Segment): Buffer {
  return writeOggOpus([...segment.leadIn, ...segment.packets], { preSkipSamples: segment.leadInSamples })
}
