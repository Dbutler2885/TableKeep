/**
 * Recording a session, run for real: scripted voice packets go into the
 * recorder, and the test looks only at what ends up in the database, the bucket
 * and the journal on disk.
 *
 * Run with `npm run test:emulator`, which starts the Firestore and Storage
 * emulators. Nothing here reaches Discord, a speech service or a real project.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { readOggOpus } from '../../src/audio/ogg.ts'
import type { Segment } from '../../src/audio/segmenter.ts'
import type { VoicePacket } from '../../src/audio/timeline.ts'
import { readJournal } from '../../src/journal/journal.ts'
import { SessionRecorder } from '../../src/session/recorder.ts'
import { FirestoreSessionStore, sessionPath, type SessionLocation } from '../../src/store/sessionStore.ts'
import { scriptedSpeech } from '../helpers/speech.ts'
import { SILENCE, Voice, Wire, decode, rmsDifference } from '../helpers/synth.ts'

const projectId = process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev'
const SERVER = 'recording-test-server'
const GROUP = 'recording-test-group'
const CAMPAIGN = 'recording-test-campaign'
const START = 1_800_000_000_000
const JEM = '111111111111111111'
const PETER = '222222222222222222'
const RATE = 48_000

let db: Firestore
let store: FirestoreSessionStore
let bucket: ReturnType<ReturnType<typeof getStorage>['bucket']>
let journalDir: string

before(() => {
  const app = getApps()[0] ?? initializeApp({ projectId })
  db = getFirestore(app)
  bucket = getStorage(app).bucket(`${projectId}.firebasestorage.app`)
  store = new FirestoreSessionStore(db, bucket)
  journalDir = mkdtempSync(path.join(tmpdir(), 'tablekeep-recording-'))
})
after(() => rmSync(journalDir, { recursive: true, force: true }))

beforeEach(async () => {
  await db.recursiveDelete(db.collection('groups').doc(GROUP))
  await bucket.deleteFiles({ prefix: `groups/${GROUP}/` })
  await db.collection('groups').doc(GROUP).set({ name: 'Home Boys', activeCampaignId: CAMPAIGN })
  await db.doc(`groups/${GROUP}/campaigns/${CAMPAIGN}`).set({ name: 'The Black Wyrm of Brandonsford' })
  await db.collection('discordServers').doc(SERVER).set({ groupId: GROUP, guildName: 'The Tavern' })
})

const startInput = (startedAtMs = START) => ({
  discordServerId: SERVER,
  discordChannelId: 'voice-channel',
  startedByDiscordId: JEM,
  startedAtMs,
})

async function start(options: { maxSegmentSeconds?: number } = {}) {
  const result = await SessionRecorder.start(startInput(), {
    store,
    journalDir,
    journalSyncEveryMs: 0,
    connectSpeech: scriptedSpeech().connect,
    ...options,
  })
  assert.equal(result.status, 'started')
  return result as Extract<typeof result, { status: 'started' }>
}

type StoredSegment = Pick<Segment, 'speakerId' | 'epoch' | 'startSamples' | 'endSamples' | 'startedBy' | 'lostPacketsBefore'> & {
  objectPath: string
  sha256: string
  bytes: number
}

async function storedSegments(location: SessionLocation): Promise<StoredSegment[]> {
  const snap = await db.collection(sessionPath(location, 'segments')).orderBy('startSamples').get()
  return snap.docs.map((doc) => doc.data() as StoredSegment)
}

/** Rebuilds one speaker's audio from the bucket alone, placing each stored file by its record. */
async function rebuild(location: SessionLocation, speakerId: string, seconds: number): Promise<Int16Array> {
  const audio = new Int16Array(seconds * RATE)
  for (const segment of await storedSegments(location)) {
    if (segment.speakerId !== speakerId) continue
    const [bytes] = await bucket.file(segment.objectPath).download()
    assert.equal(createHash('sha256').update(bytes).digest('hex'), segment.sha256)
    const file = readOggOpus(bytes)
    audio.set(decode(file.packets, file.preSkipSamples), segment.startSamples)
  }
  return audio
}

/** Feeds packets to the recorder in the order they arrived, letting time pass between them. */
function deliver(recorder: SessionRecorder, packets: VoicePacket[], events: { atMs: number; run: () => void }[] = []) {
  const timeline = [
    ...packets.map((packet) => ({ atMs: packet.receivedAtMs, run: () => recorder.packet(packet) })),
    ...events,
  ].sort((a, b) => a.atMs - b.atMs)
  let lastTick = START
  for (const step of timeline) {
    while (step.atMs - lastTick >= 500) {
      lastTick += 500
      recorder.tick(lastTick)
    }
    step.run()
  }
}

test('a session is created under the linked group\'s current campaign, numbered, and ends when it is stopped', async () => {
  const { recorder, number } = await start()
  const session = async () => (await db.doc(sessionPath(recorder.location)).get()).data()!
  const server = async () => (await db.collection('discordServers').doc(SERVER).get()).data()!

  assert.equal(number, 1)
  assert.deepEqual([recorder.location.groupId, recorder.location.campaignId], [GROUP, CAMPAIGN])
  assert.equal((await session()).state, 'running')
  assert.equal((await session()).startedByDiscordId, JEM)
  assert.deepEqual((await server()).activeSession, recorder.location)

  await recorder.stop('stop command', START + 60_000)

  assert.equal((await session()).state, 'ended')
  assert.equal((await session()).stopReason, 'stop command')
  assert.equal((await server()).activeSession, null)
})

test('each new session in a campaign gets the next number', async () => {
  const first = await start()
  await first.recorder.stop('stop command', START + 1_000)
  const second = await start()
  await second.recorder.stop('stop command', START + 2_000)

  assert.deepEqual([first.number, second.number], [1, 2])
})

test('the first recorded session in a campaign with older recaps is numbered after the last of them', async () => {
  const summaries = db.collection(`groups/${GROUP}/campaigns/${CAMPAIGN}/sessionSummaries`)
  for (let number = 1; number <= 16; number += 1) {
    await summaries.doc(`legacy-${number}`).set({ title: `Session ${number}`, sessionNumber: number })
  }
  // An unnumbered summary counts for the number its title gives, as it does in the Notes tab's order.
  await summaries.doc('titled').set({ title: 'Session 17: The Wyrm Wakes', sessionNumber: null })
  await summaries.doc('untitled').set({ title: 'A loose note', sessionNumber: null })

  const first = await start()
  await first.recorder.stop('stop command', START + 1_000)
  const second = await start()
  await second.recorder.stop('stop command', START + 2_000)

  assert.deepEqual([first.number, second.number], [18, 19])
})

test('a session counter that has run ahead of the recaps still decides the next number', async () => {
  await db.doc(`groups/${GROUP}/campaigns/${CAMPAIGN}/sessionCounters/sessions`).set({ last: 20 })
  await db.doc(`groups/${GROUP}/campaigns/${CAMPAIGN}/sessionSummaries/legacy`).set({ title: 'Session 16', sessionNumber: 16 })

  const { recorder, number } = await start()
  await recorder.stop('stop command', START + 1_000)

  assert.equal(number, 21)
})

test('a server that is already being recorded cannot start a second session', async () => {
  const { recorder } = await start()

  const again = await SessionRecorder.start(startInput(), { store, journalDir })

  assert.deepEqual(again, { status: 'already-recording', location: recorder.location })
  await recorder.stop('stop command', START + 1_000)
})

test('two people starting at the same moment get one session between them', async () => {
  const results = await Promise.all(
    Array.from({ length: 4 }, () => SessionRecorder.start(startInput(), { store, journalDir, journalSyncEveryMs: 0 })),
  )

  assert.equal(results.filter((result) => result.status === 'started').length, 1)
  assert.equal(results.filter((result) => result.status === 'already-recording').length, 3)
  assert.equal((await db.collection(`groups/${GROUP}/campaigns/${CAMPAIGN}/sessions`).get()).size, 1)
})

test('a server no group has linked, or whose group has no current campaign, starts nothing', async () => {
  const unlinked = await SessionRecorder.start({ ...startInput(), discordServerId: 'some-other-server' }, { store, journalDir })
  await db.collection('groups').doc(GROUP).update({ activeCampaignId: null })
  const noCampaign = await SessionRecorder.start(startInput(), { store, journalDir })

  assert.deepEqual(unlinked, { status: 'server-not-linked' })
  assert.deepEqual(noCampaign, { status: 'no-current-campaign', groupId: GROUP })
  assert.equal((await db.collection(`groups/${GROUP}/campaigns/${CAMPAIGN}/sessions`).get()).size, 0)
})

test('a table talking, pausing, dropping packets, leaving and returning is stored as audio that plays back as it was spoken', async () => {
  const { recorder } = await start()
  const jemVoice = new Voice()
  const peterVoice = new Voice()

  // Jem: three seconds, the silence frames a client ends a burst with, two seconds quiet,
  // then two more seconds in which one packet never arrives.
  const jemWire = new Wire(JEM, { startMs: START + 1_000 })
  const jemFirst = jemWire.send([...jemVoice.speak(3), ...Array.from({ length: 10 }, () => SILENCE)])
  jemWire.quiet(2)
  const jemSecond = jemWire.send(jemVoice.speak(2))
  const lost = jemSecond.splice(40, 1)

  // Peter: a second and a half, then he leaves and comes back with his stream numbered afresh.
  const peterBefore = new Wire(PETER, { startMs: START + 2_000, sequence: 900, rtp: 44_000 }).send(peterVoice.speak(1.5))
  const peterAfter = new Wire(PETER, { startMs: START + 9_000, sequence: 31_000, rtp: 3_000_000_000 }).send(peterVoice.speak(1))

  // The bot loses the channel from 12 s to 14 s, and Jem speaks once it is back.
  const jemThird = new Wire(JEM, { startMs: START + 14_500, sequence: 20_000, rtp: 1_500_000_000 }).send(jemVoice.speak(1))

  const everything = [...jemFirst, ...jemSecond, ...peterBefore, ...peterAfter, ...jemThird]
  deliver(recorder, everything, [
    { atMs: START + 900, run: () => recorder.speakerJoined(JEM, 'Jem', START + 900) },
    { atMs: START + 1_900, run: () => recorder.speakerJoined(PETER, 'Peter', START + 1_900) },
    { atMs: START + 4_000, run: () => recorder.speakerLeft(PETER, START + 4_000) },
    { atMs: START + 8_900, run: () => recorder.speakerJoined(PETER, 'Peter', START + 8_900) },
    { atMs: START + 12_000, run: () => recorder.disconnected(START + 12_000) },
    { atMs: START + 14_000, run: () => recorder.reconnected(START + 14_000) },
  ])
  // Every packet that arrived is in the journal, in the order it arrived. The lost one is not.
  const journalled = readJournal(recorder.journalPath).records.flatMap((record) => (record.type === 'packet' ? [record.packet] : []))
  assert.equal(journalled.length, everything.length)
  assert.deepEqual(
    journalled.map((packet) => `${packet.speakerId}:${packet.sequence}`),
    [...everything].sort((a, b) => a.receivedAtMs - b.receivedAtMs).map((packet) => `${packet.speakerId}:${packet.sequence}`),
  )
  assert.ok(!journalled.some((packet) => packet.speakerId === JEM && packet.sequence === lost[0]!.sequence))

  await recorder.stop('stop command', START + 16_000)
  assert.deepEqual(recorder.failures, [])

  // Who was heard.
  const speakers = await db.collection(sessionPath(recorder.location, 'speakers')).get()
  assert.deepEqual(
    speakers.docs.map((doc) => [doc.id, doc.data().displayName]).sort(),
    [
      [JEM, 'Jem'],
      [PETER, 'Peter'],
    ],
  )

  // How each speaker's audio was cut, and why each piece began where it did.
  const segments = await storedSegments(recorder.location)
  const cuts = (speakerId: string) =>
    segments
      .filter((segment) => segment.speakerId === speakerId)
      .map((segment) => [segment.startedBy, segment.epoch, segment.lostPacketsBefore, segment.startSamples / RATE, segment.endSamples / RATE])
  assert.deepEqual(cuts(JEM), [
    ['epoch', 0, 0, 1, 4.2], // three seconds and the ten silence frames
    ['quiet', 0, 0, 6.2, 7], // up to the lost packet
    ['loss', 0, 1, 7.02, 8.2], // after it, one packet's width later
    ['epoch', 1, 0, 14.5, 15.5], // after the bot came back
  ])
  assert.deepEqual(cuts(PETER), [
    ['epoch', 0, 0, 2, 3.5],
    ['epoch', 1, 0, 9, 10],
  ])

  // The stretch the bot could not hear is recorded as that, and as nothing else.
  const gaps = await db.collection(sessionPath(recorder.location, 'gaps')).get()
  assert.deepEqual(
    gaps.docs.map((doc) => doc.data()),
    [{ startSamples: 12 * RATE, endSamples: 14 * RATE, reason: 'not-connected' }],
  )

  // Playing the bucket back reproduces what each person said, where they said it.
  const jemReference = new Int16Array(16 * RATE)
  jemReference.set(decode(jemFirst.map((packet) => packet.payload)), 1 * RATE)
  jemReference.set(decode(jemSecond.slice(0, 40).map((packet) => packet.payload)), 6.2 * RATE)
  jemReference.set(decode(jemSecond.slice(40).map((packet) => packet.payload)), 7.02 * RATE)
  jemReference.set(decode(jemThird.map((packet) => packet.payload)), 14.5 * RATE)
  assert.equal(rmsDifference(await rebuild(recorder.location, JEM, 16), jemReference), 0)

  const peterReference = new Int16Array(16 * RATE)
  peterReference.set(decode(peterBefore.map((packet) => packet.payload)), 2 * RATE)
  peterReference.set(decode(peterAfter.map((packet) => packet.payload)), 9 * RATE)
  assert.equal(rmsDifference(await rebuild(recorder.location, PETER, 16), peterReference), 0)
})

test('a speaker who goes quiet has their audio stored without waiting for them to speak again', async () => {
  const { recorder } = await start()
  const packets = new Wire(JEM, { startMs: START + 1_000 }).send(new Voice().speak(1))
  deliver(recorder, packets)

  recorder.tick(START + 4_000)
  await recorder.settled()

  assert.equal((await storedSegments(recorder.location)).length, 1)
  await recorder.stop('stop command', START + 5_000)
})

test('long continuous speech is stored in pieces that still play back as one', async () => {
  const { recorder } = await start({ maxSegmentSeconds: 2 })
  const packets = new Wire(JEM, { startMs: START }).send(new Voice().speak(7))
  deliver(recorder, packets)
  await recorder.stop('stop command', START + 8_000)

  const segments = await storedSegments(recorder.location)
  assert.deepEqual(
    segments.map((segment) => [segment.startedBy, (segment.endSamples - segment.startSamples) / RATE]),
    [
      ['epoch', 2],
      ['split', 2],
      ['split', 2],
      ['split', 1],
    ],
  )
  const reference = decode(packets.map((packet) => packet.payload))
  const difference = rmsDifference(await rebuild(recorder.location, JEM, 7), reference)
  assert.ok(difference < 40, `audio differs from the original by ${difference.toFixed(1)}`)
})

test('storing the same segment twice leaves one record and one file', async () => {
  const { recorder } = await start()
  const segment: Segment = {
    speakerId: JEM,
    epoch: 0,
    startSamples: 48_000,
    endSamples: 96_000,
    startedBy: 'epoch',
    lostPacketsBefore: 0,
    packets: new Voice().speak(1),
    leadIn: [],
    leadInSamples: 0,
  }
  const file = Buffer.from('the same bytes both times')

  await store.storeSegment(recorder.location, segment, file)
  await store.storeSegment(recorder.location, segment, file)

  assert.equal((await storedSegments(recorder.location)).length, 1)
  const [files] = await bucket.getFiles({ prefix: `${sessionPath(recorder.location)}/audio/` })
  assert.equal(files.length, 1)
  await recorder.stop('stop command', START + 1_000)
})
