import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isSilenceFrame, opusPacketSamples } from '../src/audio/opus.ts'
import { SpeakerTimeline, type PlacedPacket, type VoicePacket } from '../src/audio/timeline.ts'
import { FRAME_SAMPLES, SILENCE, Voice, Wire } from './helpers/synth.ts'

const SESSION_START = 1_000_000

/** Runs packets through a timeline and returns everything it places, in the order it releases them. */
function place(packets: VoicePacket[], timeline = new SpeakerTimeline('jem', SESSION_START)): PlacedPacket[] {
  return [...packets.flatMap((packet) => timeline.push(packet)), ...timeline.flush()]
}

test('a Discord voice packet covers 20 ms, and so does the silence frame', () => {
  const [packet] = new Voice().speak(0.02)
  assert.equal(opusPacketSamples(packet!), FRAME_SAMPLES)
  assert.equal(opusPacketSamples(SILENCE), FRAME_SAMPLES)
  assert.equal(isSilenceFrame(SILENCE), true)
  assert.equal(isSilenceFrame(packet!), false)
  assert.equal(opusPacketSamples(Buffer.alloc(0)), 0)
})

test('packets that arrive in order are placed one after another from when the first arrived', () => {
  const wire = new Wire('jem', { startMs: SESSION_START + 2_000 })
  const placed = place(wire.send(new Voice().speak(0.2)))

  assert.equal(placed.length, 10)
  assert.equal(placed[0]!.positionSamples, 2 * 48_000)
  assert.deepEqual(
    placed.map((packet) => packet.positionSamples - placed[0]!.positionSamples),
    [0, 960, 1920, 2880, 3840, 4800, 5760, 6720, 7680, 8640],
  )
  assert.ok(placed.every((packet) => packet.lostBefore === 0 && packet.epoch === 0))
})

test('audio after a silence is placed by its own timestamp, not by when it arrived', () => {
  const voice = new Voice()
  const wire = new Wire('jem', { startMs: SESSION_START })
  const first = wire.send(voice.speak(0.1))
  wire.quiet(2.5)
  const second = wire.send(voice.speak(0.1))
  // The network delivers the second burst a little late; the timestamp still says where it belongs.
  for (const packet of second) packet.receivedAtMs += 180

  const placed = place([...first, ...second])

  assert.equal(placed[5]!.positionSamples - placed[4]!.positionSamples, 960 + 2.5 * 48_000)
  assert.equal(placed[5]!.lostBefore, 0)
})

test('a packet that arrives late is put back in its place', () => {
  const packets = new Wire('jem', { startMs: SESSION_START }).send(new Voice().speak(0.2))
  const shuffled = [packets[0]!, packets[2]!, packets[1]!, ...packets.slice(3)]

  const placed = place(shuffled)

  assert.deepEqual(
    placed.map((packet) => packet.payload),
    packets.map((packet) => packet.payload),
  )
  assert.ok(placed.every((packet) => packet.lostBefore === 0))
})

test('a packet delivered twice is kept once', () => {
  const packets = new Wire('jem', { startMs: SESSION_START }).send(new Voice().speak(0.2))
  const timeline = new SpeakerTimeline('jem', SESSION_START)

  const placed = place([...packets.slice(0, 4), packets[3]!, ...packets.slice(4)], timeline)

  assert.equal(placed.length, 10)
  assert.equal(timeline.counts.duplicates, 1)
})

test('a packet that never arrives is counted on the one after it, and leaves its space on the timeline', () => {
  const packets = new Wire('jem', { startMs: SESSION_START }).send(new Voice().speak(0.2))
  const timeline = new SpeakerTimeline('jem', SESSION_START)

  const placed = place([...packets.slice(0, 4), ...packets.slice(6)], timeline)

  assert.equal(placed.length, 8)
  assert.equal(placed[4]!.lostBefore, 2)
  assert.equal(placed[4]!.positionSamples - placed[3]!.positionSamples, 3 * 960)
  assert.equal(timeline.counts.lost, 2)
})

test('a packet that turns up after its place has gone out is dropped, not placed out of order', () => {
  const packets = new Wire('jem', { startMs: SESSION_START }).send(new Voice().speak(0.4))
  const timeline = new SpeakerTimeline('jem', SESSION_START)
  const straggler = packets[2]!

  const placed = place([...packets.slice(0, 2), ...packets.slice(3), straggler], timeline)

  assert.equal(placed.length, 19)
  assert.equal(timeline.counts.tooLate, 1)
  const positions = placed.map((packet) => packet.positionSamples)
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b))
})

test('a speaker who leaves and comes back starts a new epoch, placed by the clock', () => {
  const voice = new Voice()
  const before = new Wire('jem', { startMs: SESSION_START, sequence: 500, rtp: 90_000 }).send(voice.speak(0.2))
  // On return Discord numbers the stream afresh, from unrelated values.
  const after = new Wire('jem', { startMs: SESSION_START + 10_000, sequence: 14_817, rtp: 3_587_463_000 }).send(voice.speak(0.2))
  const timeline = new SpeakerTimeline('jem', SESSION_START)

  const placed = place([...before, ...after], timeline)

  assert.equal(placed.length, 20)
  assert.deepEqual([placed[9]!.epoch, placed[10]!.epoch], [0, 1])
  assert.equal(placed[10]!.positionSamples, 10 * 48_000)
  assert.equal(placed[10]!.lostBefore, 0)
  assert.equal(timeline.counts.lost, 0)
  assert.equal(timeline.counts.epochs, 2)
})

test('being told the stream restarted begins a new epoch even when the numbers happen to line up', () => {
  const voice = new Voice()
  const wire = new Wire('jem', { startMs: SESSION_START })
  const timeline = new SpeakerTimeline('jem', SESSION_START)

  const first = wire.send(voice.speak(0.1)).flatMap((packet) => timeline.push(packet))
  const held = timeline.startNewEpoch()
  const second = [...wire.send(voice.speak(0.1)).flatMap((packet) => timeline.push(packet)), ...timeline.flush()]

  assert.equal(first.length + held.length, 5)
  assert.ok([...first, ...held].every((packet) => packet.epoch === 0))
  assert.ok(second.every((packet) => packet.epoch === 1))
})

test('the sequence number and timestamp wrapping round is not mistaken for a restart or a loss', () => {
  const wire = new Wire('jem', { startMs: SESSION_START, sequence: 0xffff - 2, rtp: 0xffff_ffff - 2 * 960 })
  const timeline = new SpeakerTimeline('jem', SESSION_START)

  const placed = place(wire.send(new Voice().speak(0.2)), timeline)

  assert.equal(placed.length, 10)
  assert.ok(placed.every((packet) => packet.epoch === 0 && packet.lostBefore === 0))
  assert.equal(placed[9]!.positionSamples - placed[0]!.positionSamples, 9 * 960)
})

test('a new epoch never begins before audio already placed', () => {
  const voice = new Voice()
  const before = new Wire('jem', { startMs: SESSION_START, sequence: 10, rtp: 10 }).send(voice.speak(1))
  // The clock says the return was almost at once, sooner than the audio already placed ends.
  const after = new Wire('jem', { startMs: SESSION_START + 500, sequence: 40_000, rtp: 2_000_000_000 }).send(voice.speak(0.1))

  const placed = place([...before, ...after])

  assert.equal(placed[50]!.epoch, 1)
  assert.equal(placed[50]!.positionSamples, 48_000)
})

test('the last packets of a burst are let go after a moment, without waiting for the speaker to speak again', () => {
  const packets = new Wire('jem', { startMs: SESSION_START }).send(new Voice().speak(0.4))
  const timeline = new SpeakerTimeline('jem', SESSION_START)
  const duringBurst = packets.flatMap((packet) => timeline.push(packet))
  const lastArrival = packets.at(-1)!.receivedAtMs

  assert.equal(duringBurst.length, 15)
  assert.equal(timeline.releaseDue(lastArrival + 50).length, 0)
  const tail = timeline.releaseDue(lastArrival + 250)

  assert.equal(tail.length, 5)
  assert.deepEqual(
    [...duringBurst, ...tail].map((packet) => packet.payload),
    packets.map((packet) => packet.payload),
  )
  assert.deepEqual(timeline.flush(), [])
})
