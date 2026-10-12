/**
 * The session journal: everything the bot received, in the order it arrived.
 *
 * The first thing that happens to a voice packet is that it is appended here.
 * Archiving and transcription then work from what the journal holds, so that a
 * bot that dies mid-session can be restarted and carry on from the file with
 * nothing lost that had been written.
 *
 * The file is a four-byte marker followed by records. Each record is a length,
 * a body, and a checksum of the body. A bot that dies mid-write leaves a torn
 * record at the end; a reader detects it by its length or checksum and stops
 * there, keeping everything before it.
 */
import { closeSync, fsyncSync, openSync, readFileSync, writeSync } from 'node:fs'
import { crc32 } from 'node:zlib'
import type { VoicePacket } from '../audio/timeline.ts'

const MARKER = Buffer.from('TKJ1')
const TYPE_PACKET = 1
const TYPE_EVENT = 2
/** Larger than any real record, so a length beyond it means the bytes are not a record at all. */
const MAX_RECORD_BYTES = 1_000_000

/** Something that happened in the session other than audio arriving. */
export type JournalEvent = { atMs: number } & (
  /** Where the session lives, so that the journal alone is enough to pick it up again. */
  | { kind: 'session-started'; groupId: string; campaignId: string; sessionId: string }
  | { kind: 'speaker-joined'; speakerId: string; displayName: string; memberUid?: string | null }
  | { kind: 'speaker-left'; speakerId: string }
  /** The bot lost its connection to the voice channel, and could hear nobody until it reconnected. */
  | { kind: 'disconnected' }
  | { kind: 'reconnected' }
  | { kind: 'session-stopped'; reason: string }
)

export type JournalRecord = { type: 'packet'; packet: VoicePacket } | { type: 'event'; event: JournalEvent }

function encode(record: JournalRecord): Buffer {
  if (record.type === 'event') {
    return Buffer.concat([Buffer.of(TYPE_EVENT), Buffer.from(JSON.stringify(record.event), 'utf8')])
  }
  const { packet } = record
  const speaker = Buffer.from(packet.speakerId, 'utf8')
  const head = Buffer.alloc(1 + 8 + 4 + 2 + 2)
  head.writeUInt8(TYPE_PACKET, 0)
  head.writeDoubleLE(packet.receivedAtMs, 1)
  head.writeUInt32LE(packet.rtpTimestamp >>> 0, 9)
  head.writeUInt16LE(packet.sequence & 0xffff, 13)
  head.writeUInt16LE(speaker.length, 15)
  return Buffer.concat([head, speaker, packet.payload])
}

function decode(body: Buffer): JournalRecord | null {
  const type = body.readUInt8(0)
  if (type === TYPE_EVENT) {
    return { type: 'event', event: JSON.parse(body.subarray(1).toString('utf8')) as JournalEvent }
  }
  if (type !== TYPE_PACKET || body.length < 17) return null
  const speakerLength = body.readUInt16LE(15)
  return {
    type: 'packet',
    packet: {
      receivedAtMs: body.readDoubleLE(1),
      rtpTimestamp: body.readUInt32LE(9),
      sequence: body.readUInt16LE(13),
      speakerId: body.subarray(17, 17 + speakerLength).toString('utf8'),
      payload: body.subarray(17 + speakerLength),
    },
  }
}

export class JournalWriter {
  #fd: number
  #dirty = false
  #timer: ReturnType<typeof setInterval> | null = null

  /**
   * Opens a journal for appending, creating it if need be.
   *
   * `syncEveryMs` is how often what has been written is forced through to the
   * disk itself. Between those moments a record survives the bot dying, but
   * not the whole machine losing power.
   */
  constructor(path: string, syncEveryMs = 1_000) {
    this.#fd = openSync(path, 'a')
    if (readFileSync(path).length === 0) writeSync(this.#fd, MARKER)
    if (syncEveryMs > 0) {
      this.#timer = setInterval(() => this.sync(), syncEveryMs)
      this.#timer.unref()
    }
  }

  append(record: JournalRecord): void {
    const body = encode(record)
    const frame = Buffer.alloc(4 + body.length + 4)
    frame.writeUInt32LE(body.length, 0)
    body.copy(frame, 4)
    frame.writeUInt32LE(crc32(body), 4 + body.length)
    // One write per record, so a record is either wholly in the file or its torn tail is detectable.
    writeSync(this.#fd, frame)
    this.#dirty = true
  }

  /** Forces everything written so far onto the disk. */
  sync(): void {
    if (!this.#dirty) return
    fsyncSync(this.#fd)
    this.#dirty = false
  }

  close(): void {
    if (this.#timer) clearInterval(this.#timer)
    this.sync()
    closeSync(this.#fd)
  }
}

export type JournalContents = {
  records: JournalRecord[]
  /** Bytes at the end that were not a whole, sound record: what a bot dying mid-write leaves behind. */
  tornBytes: number
}

/** Reads every sound record in a journal, stopping at the first that is torn or damaged. */
export function readJournal(path: string): JournalContents {
  const bytes = readFileSync(path)
  if (bytes.length < MARKER.length || !bytes.subarray(0, MARKER.length).equals(MARKER)) {
    return { records: [], tornBytes: bytes.length }
  }
  const records: JournalRecord[] = []
  let offset = MARKER.length
  while (offset + 4 <= bytes.length) {
    const length = bytes.readUInt32LE(offset)
    const end = offset + 4 + length + 4
    if (length === 0 || length > MAX_RECORD_BYTES || end > bytes.length) break
    const body = bytes.subarray(offset + 4, offset + 4 + length)
    if (crc32(body) !== bytes.readUInt32LE(offset + 4 + length)) break
    const record = decode(body)
    if (!record) break
    records.push(record)
    offset = end
  }
  return { records, tornBytes: bytes.length - offset }
}
