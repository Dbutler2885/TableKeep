/**
 * Reading and writing Ogg Opus files.
 *
 * An archived segment is a standard Ogg Opus file, so that any player or tool
 * can open it without knowing anything about the recorder. Putting Opus packets
 * into an Ogg file changes nothing about the audio: the packets go in exactly
 * as Discord delivered them.
 *
 * Only what the recorder needs is here: one logical stream, packets small
 * enough that each fits in a page, and no seeking.
 */
import { OPUS_SAMPLE_RATE, opusPacketSamples } from './opus.ts'

const CAPTURE_PATTERN = Buffer.from('OggS')
const MAX_SEGMENTS_PER_PAGE = 255
/** Close a page after about this many packets, so that a reader never waits long for one. */
const PACKETS_PER_PAGE = 50

/** Ogg's checksum: CRC-32 with polynomial 0x04c11db7, no reflection, starting from zero. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index << 24
    for (let bit = 0; bit < 8; bit += 1) value = value & 0x80000000 ? (value << 1) ^ 0x04c11db7 : value << 1
    table[index] = value >>> 0
  }
  return table
})()

function oggChecksum(bytes: Uint8Array): number {
  let crc = 0
  for (const byte of bytes) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ byte) & 0xff]!) >>> 0
  return crc
}

function page(options: {
  serial: number
  sequence: number
  granule: bigint
  packets: Uint8Array[]
  first?: boolean
  last?: boolean
}): Buffer {
  const lacing: number[] = []
  for (const packet of options.packets) {
    let remaining = packet.length
    while (remaining >= 255) {
      lacing.push(255)
      remaining -= 255
    }
    lacing.push(remaining)
  }
  if (lacing.length > MAX_SEGMENTS_PER_PAGE) throw new Error('Too much audio for one Ogg page.')

  const header = Buffer.alloc(27 + lacing.length)
  CAPTURE_PATTERN.copy(header, 0)
  header.writeUInt8(0, 4) // stream structure version
  header.writeUInt8((options.first ? 0x02 : 0) | (options.last ? 0x04 : 0), 5)
  header.writeBigUInt64LE(BigInt.asUintN(64, options.granule), 6)
  header.writeUInt32LE(options.serial, 14)
  header.writeUInt32LE(options.sequence, 18)
  header.writeUInt32LE(0, 22) // checksum, filled in below
  header.writeUInt8(lacing.length, 26)
  Buffer.from(lacing).copy(header, 27)

  const whole = Buffer.concat([header, ...options.packets])
  whole.writeUInt32LE(oggChecksum(whole), 22)
  return whole
}

export type OggOpusOptions = {
  /** Channels declared in the file's header. Discord's voice is stereo. */
  channels?: number
  /**
   * Samples at the start of the file that a decoder must decode but not play.
   *
   * A decoder needs a few packets to settle. When a file begins in the middle
   * of continuous speech, the packets just before the true start are included
   * so the decoder is settled by the time it reaches it, and this says how much
   * of the file that lead-in is.
   */
  preSkipSamples?: number
  serial?: number
}

/** Builds a complete Ogg Opus file from Opus packets, in order. */
export function writeOggOpus(packets: Uint8Array[], options: OggOpusOptions = {}): Buffer {
  const channels = options.channels ?? 2
  const preSkip = options.preSkipSamples ?? 0
  const serial = options.serial ?? 1

  const head = Buffer.alloc(19)
  head.write('OpusHead', 0, 'ascii')
  head.writeUInt8(1, 8) // version
  head.writeUInt8(channels, 9)
  head.writeUInt16LE(preSkip, 10)
  head.writeUInt32LE(OPUS_SAMPLE_RATE, 12) // the rate of the original input, for information only
  head.writeInt16LE(0, 16) // output gain
  head.writeUInt8(0, 18) // channel mapping family: mono or stereo

  const vendor = Buffer.from('tablekeep', 'utf8')
  const tags = Buffer.alloc(8 + 4 + vendor.length + 4)
  tags.write('OpusTags', 0, 'ascii')
  tags.writeUInt32LE(vendor.length, 8)
  vendor.copy(tags, 12)
  tags.writeUInt32LE(0, 12 + vendor.length) // no comments

  const pages: Buffer[] = [
    page({ serial, sequence: 0, granule: 0n, packets: [head], first: true }),
    page({ serial, sequence: 1, granule: 0n, packets: [tags] }),
  ]

  let sequence = 2
  let granule = 0n
  let pending: Uint8Array[] = []
  let pendingLacing = 0
  const flush = (last: boolean) => {
    if (pending.length === 0 && !last) return
    pages.push(page({ serial, sequence, granule, packets: pending, last }))
    sequence += 1
    pending = []
    pendingLacing = 0
  }

  packets.forEach((packet, index) => {
    const lacing = Math.floor(packet.length / 255) + 1
    if (pending.length >= PACKETS_PER_PAGE || pendingLacing + lacing > MAX_SEGMENTS_PER_PAGE) flush(false)
    pending.push(packet)
    pendingLacing += lacing
    // A page's position is the count of samples up to the end of its last packet.
    granule += BigInt(opusPacketSamples(packet))
    if (index === packets.length - 1) flush(true)
  })
  if (packets.length === 0) flush(true)

  return Buffer.concat(pages)
}

export type OggOpusFile = {
  channels: number
  preSkipSamples: number
  /** The audio packets, without the two header packets. */
  packets: Buffer[]
}

/** Reads an Ogg Opus file back into its packets. Throws if a page is damaged. */
export function readOggOpus(file: Uint8Array): OggOpusFile {
  const bytes = Buffer.from(file.buffer, file.byteOffset, file.byteLength)
  const packets: Buffer[] = []
  let partial: Buffer[] = []
  let offset = 0

  while (offset < bytes.length) {
    if (offset + 27 > bytes.length || !bytes.subarray(offset, offset + 4).equals(CAPTURE_PATTERN)) {
      throw new Error(`Not an Ogg page at byte ${offset}.`)
    }
    const segmentCount = bytes.readUInt8(offset + 26)
    const lacing = bytes.subarray(offset + 27, offset + 27 + segmentCount)
    const bodyLength = lacing.reduce((sum, value) => sum + value, 0)
    const end = offset + 27 + segmentCount + bodyLength
    if (end > bytes.length) throw new Error(`Ogg page at byte ${offset} is cut short.`)

    const whole = Buffer.from(bytes.subarray(offset, end))
    const stored = whole.readUInt32LE(22)
    whole.writeUInt32LE(0, 22)
    if (oggChecksum(whole) !== stored) throw new Error(`Ogg page at byte ${offset} fails its checksum.`)

    let cursor = offset + 27 + segmentCount
    for (const length of lacing) {
      partial.push(bytes.subarray(cursor, cursor + length))
      cursor += length
      // A lacing value under 255 ends a packet; exactly 255 means it carries on.
      if (length < 255) {
        packets.push(Buffer.concat(partial))
        partial = []
      }
    }
    offset = end
  }

  const [head, tags, ...audio] = packets
  if (!head || head.subarray(0, 8).toString('ascii') !== 'OpusHead') throw new Error('Missing the Opus header.')
  if (!tags || tags.subarray(0, 8).toString('ascii') !== 'OpusTags') throw new Error('Missing the Opus tags.')
  return { channels: head.readUInt8(9), preSkipSamples: head.readUInt16LE(10), packets: audio }
}
