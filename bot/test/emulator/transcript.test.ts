/**
 * The live transcript, run for real against the Firestore emulator: scripted
 * voice goes into the recorder with a stand-in speech service, and the test
 * looks only at the utterances and checkpoints that end up in the database.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, type Firestore, type Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import type { VoicePacket } from '../../src/audio/timeline.ts'
import { SessionRecorder } from '../../src/session/recorder.ts'
import type { Utterance } from '../../src/speech/transcriber.ts'
import { FirestoreSessionStore, UtteranceConflictError, sessionPath, type SessionLocation } from '../../src/store/sessionStore.ts'
import { scriptedSpeech } from '../helpers/speech.ts'
import { Voice, Wire } from '../helpers/synth.ts'

const projectId = process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev'
const SERVER = 'transcript-test-server'
const GROUP = 'transcript-test-group'
const CAMPAIGN = 'transcript-test-campaign'
const START = 1_800_000_000_000
const JEM = '111111111111111111'
const PETER = '222222222222222222'
const RATE = 48_000

let db: Firestore
let store: FirestoreSessionStore
let journalDir: string

before(() => {
  const app = getApps()[0] ?? initializeApp({ projectId })
  db = getFirestore(app)
  store = new FirestoreSessionStore(db, getStorage(app).bucket(`${projectId}.firebasestorage.app`))
  journalDir = mkdtempSync(path.join(tmpdir(), 'tablekeep-transcript-'))
})
after(() => rmSync(journalDir, { recursive: true, force: true }))

beforeEach(async () => {
  await db.recursiveDelete(db.collection('groups').doc(GROUP))
  await db.collection('groups').doc(GROUP).set({ name: 'Home Boys', activeCampaignId: CAMPAIGN })
  const campaign = db.doc(`groups/${GROUP}/campaigns/${CAMPAIGN}`)
  await campaign.set({ name: 'The Black Wyrm of Brandonsford' })
  await campaign.collection('characters').doc('c1').set({ name: 'Victorf' })
  await campaign.collection('characters').doc('c2').set({ name: 'Thrillho' })
  await campaign.collection('npcs').doc('n1').set({ name: 'Eric the Town Reeve' })
  await campaign.collection('npcs').doc('n2').set({ name: '  ' })
  await db.collection('discordServers').doc(SERVER).set({ groupId: GROUP })
})

async function start(speech = scriptedSpeech()) {
  const result = await SessionRecorder.start(
    { discordServerId: SERVER, discordChannelId: 'voice', startedByDiscordId: JEM, startedAtMs: START },
    { store, journalDir, journalSyncEveryMs: 0, connectSpeech: speech.connect },
  )
  assert.equal(result.status, 'started')
  return { ...(result as Extract<typeof result, { status: 'started' }>), speech }
}

type StoredUtterance = Utterance & { committedAt: Timestamp }

async function transcript(location: SessionLocation): Promise<StoredUtterance[]> {
  const snap = await db.collection(sessionPath(location, 'transcripts', 'live', 'utterances')).orderBy('startSamples').get()
  return snap.docs.map((doc) => doc.data() as StoredUtterance)
}

async function checkpoint(location: SessionLocation, speakerId: string): Promise<number | undefined> {
  return (await db.doc(sessionPath(location, 'transcripts', 'live', 'checkpoints', speakerId)).get()).data()?.samples as number | undefined
}

/** Feeds packets to the recorder in the order they arrived, with the clock ticking between them. */
function deliver(recorder: SessionRecorder, packets: VoicePacket[], untilMs: number) {
  const ordered = [...packets].sort((a, b) => a.receivedAtMs - b.receivedAtMs)
  let clock = START
  const advance = (to: number) => {
    while (to - clock >= 250) {
      clock += 250
      recorder.tick(clock)
    }
  }
  for (const packet of ordered) {
    advance(packet.receivedAtMs)
    recorder.packet(packet)
  }
  advance(untilMs)
}

test('what each person says becomes utterances under the session, attributed and placed in time', async () => {
  const { recorder, speech } = await start()
  const jemWire = new Wire(JEM, { startMs: START + 2_000 })
  const jemVoice = new Voice()
  const jemFirst = jemWire.send(jemVoice.speak(2))
  jemWire.quiet(6)
  const jemSecond = jemWire.send(jemVoice.speak(1))
  const peter = new Wire(PETER, { startMs: START + 5_000 }).send(new Voice().speak(1.5))

  deliver(recorder, [...jemFirst, ...jemSecond, ...peter], START + 12_000)
  await recorder.stop('stop command', START + 12_000)
  assert.deepEqual(recorder.failures, [])

  const said = await transcript(recorder.location)
  assert.deepEqual(
    said.map((utterance) => [utterance.speakerId, utterance.startSamples / RATE, utterance.endSamples / RATE, utterance.text]),
    [
      [JEM, 2, 3.9, 'w0.0 w0.5 w1.0 w1.5'],
      [PETER, 5, 6.4, 'w0.0 w0.5 w1.0'],
      // Jem's second burst: two seconds into his own audio, ten into the session.
      [JEM, 10, 10.9, 'w2.0 w2.5'],
    ],
  )
  assert.ok(said.every((utterance) => typeof utterance.committedAt.toMillis() === 'number'))

  // Each speaker's audio has been dealt with to its end.
  assert.equal(await checkpoint(recorder.location, JEM), 11 * RATE)
  assert.equal(await checkpoint(recorder.location, PETER), 6.5 * RATE)

  // One connection each, both closed.
  assert.equal(speech.connections.length, 2)
  assert.ok(speech.connections.every((connection) => connection.closed))
})

test('utterances line up with the stored audio they came from', async () => {
  const { recorder } = await start()
  const wire = new Wire(JEM, { startMs: START + 3_000 })
  const voice = new Voice()
  const first = wire.send(voice.speak(1))
  wire.quiet(4)
  const second = wire.send(voice.speak(1))

  deliver(recorder, [...first, ...second], START + 10_000)
  await recorder.stop('stop command', START + 10_000)

  const segments = (await db.collection(sessionPath(recorder.location, 'segments')).orderBy('startSamples').get()).docs.map((doc) => doc.data())
  const said = await transcript(recorder.location)
  assert.equal(segments.length, 2)
  assert.equal(said.length, 2)
  said.forEach((utterance, index) => {
    assert.ok(utterance.startSamples >= segments[index]!.startSamples)
    assert.ok(utterance.endSamples <= segments[index]!.endSamples)
  })
})

test('the campaign\'s character and NPC names are offered to the speech service', async () => {
  const { recorder, speech } = await start()
  deliver(recorder, new Wire(JEM, { startMs: START + 1_000 }).send(new Voice().speak(0.5)), START + 3_000)
  await recorder.stop('stop command', START + 3_000)

  assert.deepEqual([...speech.connections[0]!.keyterms].sort(), ['Eric the Town Reeve', 'Thrillho', 'Victorf'])
})

test('a session with no speech service still has its audio stored, and is flagged as lacking a transcript', async () => {
  const result = await SessionRecorder.start(
    { discordServerId: SERVER, discordChannelId: 'voice', startedByDiscordId: JEM, startedAtMs: START },
    { store, journalDir, journalSyncEveryMs: 0 },
  )
  assert.equal(result.status, 'started')
  const { recorder } = result as Extract<typeof result, { status: 'started' }>
  deliver(recorder, new Wire(JEM, { startMs: START + 1_000 }).send(new Voice().speak(1)), START + 4_000)
  const outcome = await recorder.stop('stop command', START + 4_000)

  assert.equal(outcome.status, 'needs-attention')
  assert.equal((await db.collection(sessionPath(recorder.location, 'segments')).get()).size, 1)
  assert.deepEqual(await transcript(recorder.location), [])
  const session = (await db.doc(sessionPath(recorder.location)).get()).data()!
  assert.equal(session.state, 'finalising')
  assert.match(session.needsAttention, /transcript is incomplete/)
})

test('publishing the same utterance twice leaves one, and never moves the checkpoint back', async () => {
  const { recorder } = await start()
  const utterance: Utterance = { speakerId: JEM, startSamples: 96_000, endSamples: 144_000, text: 'I search the room.' }

  await store.publishUtterances(recorder.location, JEM, [utterance], 150_000)
  await store.publishUtterances(recorder.location, JEM, [utterance], 120_000)

  assert.deepEqual((await transcript(recorder.location)).map((stored) => stored.text), ['I search the room.'])
  assert.equal(await checkpoint(recorder.location, JEM), 150_000)
  await recorder.stop('stop command', START + 1_000)
})

test('a different utterance under the same identity is refused, and nothing from that write is kept', async () => {
  const { recorder } = await start()
  const original: Utterance = { speakerId: JEM, startSamples: 96_000, endSamples: 144_000, text: 'I search the room.' }
  const other: Utterance = { speakerId: JEM, startSamples: 200_000, endSamples: 240_000, text: 'Anything there?' }
  await store.publishUtterances(recorder.location, JEM, [original], 150_000)

  await assert.rejects(
    store.publishUtterances(recorder.location, JEM, [other, { ...original, text: 'I search the broom.' }], 300_000),
    UtteranceConflictError,
  )

  assert.deepEqual((await transcript(recorder.location)).map((stored) => stored.text), ['I search the room.'])
  assert.equal(await checkpoint(recorder.location, JEM), 150_000)
  await recorder.stop('stop command', START + 1_000)
})
