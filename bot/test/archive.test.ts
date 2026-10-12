import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readOggOpus, writeOggOpus } from '../src/audio/ogg.ts'
import { Segmenter, segmentFile, segmentId, type Segment } from '../src/audio/segmenter.ts'
import { SpeakerTimeline, type VoicePacket } from '../src/audio/timeline.ts'
import { SILENCE, Voice, Wire, decode, rmsDifference } from './helpers/synth.ts'

const SESSION_START = 1_000_000

/** Runs a speaker's packets through placing and cutting, and returns the finished segments. */
function archive(packets: VoicePacket[], maxSegmentSeconds?: number): Segment[] {
  const timeline = new SpeakerTimeline('jem', SESSION_START)
  const segmenter = new Segmenter(maxSegmentSeconds)
  const segments: Segment[] = []
  const take = (segment: Segment | null) => segment && segments.push(segment)
  for (const packet of packets) for (const placed of timeline.push(packet)) take(segmenter.push(placed))
  for (const placed of timeline.flush()) take(segmenter.push(placed))
  take(segmenter.flush())
  return segments
}

test('an Ogg Opus file gives back the packets it was made from', () => {
  const packets = new Voice().speak(3)
  const file = readOggOpus(writeOggOpus(packets, { preSkipSamples: 3840 }))

  assert.equal(file.channels, 2)
  assert.equal(file.preSkipSamples, 3840)
  assert.deepEqual(file.packets, packets)
})

test('a packet too large for one lacing value survives the round trip', () => {
  const large = Buffer.alloc(600, 7)
  large[0] = 0xfc
  assert.deepEqual(readOggOpus(writeOggOpus([large])).packets, [large])
})

test('a damaged Ogg file is refused, not read as audio', () => {
  const file = writeOggOpus(new Voice().speak(0.5))
  file[file.length - 10]! ^= 0xff
  assert.throws(() => readOggOpus(file), /checksum/)
  assert.throws(() => readOggOpus(file.subarray(0, file.length - 30)), /cut short|Not an Ogg page/)
})

test('one unbroken stretch of speech is one segment', () => {
  const wire = new Wire('jem', { startMs: SESSION_START + 1_000 })
  const [segment, ...rest] = archive(wire.send(new Voice().speak(2)))

  assert.equal(rest.length, 0)
  assert.equal(segment!.startedBy, 'epoch')
  assert.equal(segment!.startSamples, 48_000)
  assert.equal(segment!.endSamples, 48_000 + 2 * 48_000)
  assert.equal(segment!.packets.length, 100)
})

test('a new segment starts where the speaker went quiet, and the silence is the space between them', () => {
  const voice = new Voice()
  const wire = new Wire('jem', { startMs: SESSION_START })
  const first = wire.send([...voice.speak(1), ...Array.from({ length: 10 }, () => SILENCE)])
  wire.quiet(4)
  const second = wire.send(voice.speak(1))

  const segments = archive([...first, ...second])

  assert.deepEqual(
    segments.map((segment) => segment.startedBy),
    ['epoch', 'quiet'],
  )
  // The silence frames Discord sent to end the burst are part of what was received, so they are kept.
  assert.equal(segments[0]!.packets.length, 60)
  assert.equal(segments[1]!.startSamples - segments[0]!.endSamples, 4 * 48_000)
  assert.equal(segments[1]!.lostPacketsBefore, 0)
})

test('a lost packet starts a new segment that says how many were lost', () => {
  const packets = new Wire('jem', { startMs: SESSION_START }).send(new Voice().speak(1))

  const segments = archive([...packets.slice(0, 20), ...packets.slice(23)])

  assert.deepEqual(
    segments.map((segment) => [segment.startedBy, segment.lostPacketsBefore, segment.packets.length]),
    [
      ['epoch', 0, 20],
      ['loss', 3, 27],
    ],
  )
  assert.equal(segments[1]!.startSamples - segments[0]!.endSamples, 3 * 960)
})

test('a speaker who leaves and returns gets a segment in a new epoch', () => {
  const voice = new Voice()
  const before = new Wire('jem', { startMs: SESSION_START, sequence: 500, rtp: 90_000 }).send(voice.speak(0.5))
  const after = new Wire('jem', { startMs: SESSION_START + 8_000, sequence: 30_000, rtp: 2_000_000_000 }).send(voice.speak(0.5))

  const segments = archive([...before, ...after])

  assert.deepEqual(
    segments.map((segment) => [segment.epoch, segment.startedBy]),
    [
      [0, 'epoch'],
      [1, 'epoch'],
    ],
  )
  assert.equal(segments[1]!.startSamples, 8 * 48_000)
})

test('long continuous speech is split at the limit, with a lead-in so the join is seamless', () => {
  const wire = new Wire('jem', { startMs: SESSION_START })
  const segments = archive(wire.send(new Voice().speak(5)), 2)

  assert.deepEqual(
    segments.map((segment) => [segment.startedBy, segment.endSamples - segment.startSamples, segment.leadIn.length]),
    [
      ['epoch', 2 * 48_000, 0],
      ['split', 2 * 48_000, 4],
      ['split', 1 * 48_000, 4],
    ],
  )
  assert.equal(segments[1]!.startSamples, segments[0]!.endSamples)
  assert.equal(segments[1]!.leadInSamples, 4 * 960)
})

test('decoding each segment by itself and placing it by its record reproduces the original audio', () => {
  const voice = new Voice()
  const wire = new Wire('jem', { startMs: SESSION_START })
  const spoken = [...voice.speak(5), ...Array.from({ length: 10 }, () => SILENCE)]
  const first = wire.send(spoken)
  wire.quiet(1.5)
  const second = wire.send(voice.speak(2))
  const original = [...first, ...second]

  // What a listener with the unbroken stream would have heard, silence included.
  const reference = new Int16Array(Math.round(8.7 * 48_000))
  reference.set(decode(first.map((packet) => packet.payload)), 0)
  reference.set(decode(second.map((packet) => packet.payload)), Math.round(6.7 * 48_000))

  const rebuilt = new Int16Array(reference.length)
  const segments = archive(original, 2)
  for (const segment of segments) {
    // Through a real file, opened cold, exactly as a player or a re-transcription would.
    const file = readOggOpus(segmentFile(segment))
    rebuilt.set(decode(file.packets, file.preSkipSamples), segment.startSamples)
  }

  assert.equal(segments.length, 4)
  // The second burst is decoded cold in both, so it matches to the sample.
  const tail = Math.round(6.7 * 48_000)
  assert.equal(rmsDifference(rebuilt.subarray(tail), reference.subarray(tail)), 0)
  // Across the joins inside continuous speech the lead-in lets the decoder settle: the
  // difference is far below the signal, which has a level of several thousand.
  const difference = rmsDifference(rebuilt, reference)
  assert.ok(difference < 40, `audio differs from the original by ${difference.toFixed(1)}`)
  // Nothing clipped and nothing doubled: every stretch of the timeline that had audio still has it.
  for (const segment of segments) {
    const span = rebuilt.subarray(segment.startSamples, segment.endSamples)
    assert.ok(span.some((sample) => sample !== 0) || segment.packets.every((packet) => packet.length === 3))
  }
})

test('without the lead-in a join inside continuous speech is audibly wrong, which is what the lead-in is for', () => {
  const packets = new Voice().speak(4)
  const whole = decode(packets)
  const coldSecondHalf = decode(packets.slice(100))
  const settledSecondHalf = decode(packets.slice(96), 4 * 960)

  const cold = rmsDifference(coldSecondHalf.subarray(0, 4800), whole.subarray(100 * 960, 100 * 960 + 4800))
  const settled = rmsDifference(settledSecondHalf.subarray(0, 4800), whole.subarray(100 * 960, 100 * 960 + 4800))

  assert.ok(settled < cold / 5, `settled ${settled.toFixed(1)} against cold ${cold.toFixed(1)}`)
})

test('the same audio always gets the same segment name, and names sort in timeline order', () => {
  const wire = new Wire('jem', { startMs: SESSION_START })
  const packets = wire.send(new Voice().speak(3))
  const once = archive(packets, 1).map(segmentId)
  const again = archive(packets, 1).map(segmentId)

  assert.deepEqual(once, again)
  assert.deepEqual(once, [...once].sort())
  assert.equal(new Set(once).size, 3)
})
