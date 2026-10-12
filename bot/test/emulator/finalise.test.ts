/**
 * Stopping and finishing a session, run for real against the emulators:
 * what state the session ends in, what happens when the speech service was
 * unavailable, and that the work can be picked up again from the journal.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import type { VoicePacket } from '../../src/audio/timeline.ts'
import { finaliseSession } from '../../src/session/finalise.ts'
import { SessionRecorder } from '../../src/session/recorder.ts'
import { FirestoreSessionStore, sessionPath, transcriptObjectPath, type SessionLocation } from '../../src/store/sessionStore.ts'
import { scriptedSpeech, type ScriptedSpeech } from '../helpers/speech.ts'
import { Voice, Wire } from '../helpers/synth.ts'

const projectId = process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev'
const SERVER = 'finalise-test-server'
const GROUP = 'finalise-test-group'
const CAMPAIGN = 'finalise-test-campaign'
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
  journalDir = mkdtempSync(path.join(tmpdir(), 'tablekeep-finalise-'))
})
after(() => rmSync(journalDir, { recursive: true, force: true }))

beforeEach(async () => {
  await db.recursiveDelete(db.collection('groups').doc(GROUP))
  await bucket.deleteFiles({ prefix: `groups/${GROUP}/` })
  await db.collection('groups').doc(GROUP).set({ name: 'Home Boys', activeCampaignId: CAMPAIGN })
  await db.doc(`groups/${GROUP}/campaigns/${CAMPAIGN}`).set({ name: 'The Black Wyrm of Brandonsford' })
  await db.collection('discordServers').doc(SERVER).set({ groupId: GROUP })
})

const startInput = { discordServerId: SERVER, discordChannelId: 'voice', startedByDiscordId: JEM, startedAtMs: START }

async function start(speech: ScriptedSpeech) {
  const result = await SessionRecorder.start(startInput, {
    store,
    journalDir,
    journalSyncEveryMs: 0,
    connectSpeech: speech.connect,
    // Short waits, so that a test of an outage does not take as long as a real one.
    lastWordsMs: 100,
    finaliseGiveUpAfterMs: 100,
  })
  assert.equal(result.status, 'started')
  return (result as Extract<typeof result, { status: 'started' }>).recorder
}

function deliver(recorder: SessionRecorder, packets: VoicePacket[], fromMs: number, untilMs: number) {
  let clock = fromMs
  const advance = (to: number) => {
    while (to - clock >= 100) {
      clock += 100
      recorder.tick(clock)
    }
  }
  for (const packet of [...packets].sort((a, b) => a.receivedAtMs - b.receivedAtMs)) {
    advance(packet.receivedAtMs)
    recorder.packet(packet)
  }
  advance(untilMs)
}

const session = async (location: SessionLocation) => (await db.doc(sessionPath(location)).get()).data()!
const said = async (location: SessionLocation) =>
  (await store.transcript(location)).map((utterance) => [utterance.speakerId, utterance.startSamples / RATE, utterance.text])
const segmentCount = async (location: SessionLocation) => (await db.collection(sessionPath(location, 'segments')).get()).size

/** A session in which the speech service fails after Jem's first sentence and is still down when it is stopped. */
async function recordedThroughAnOutage() {
  const speech = scriptedSpeech()
  const recorder = await start(speech)
  recorder.speakerJoined(JEM, 'Jem', START + 500)
  recorder.speakerJoined(PETER, 'Peter', START + 600)
  const jemVoice = new Voice()
  const jemWire = new Wire(JEM, { startMs: START + 1_000 })
  deliver(recorder, jemWire.send(jemVoice.speak(2)), START, START + 5_000)

  speech.down = true
  speech.connections[0]!.fail()
  jemWire.quiet(3)
  const later = [...jemWire.send(jemVoice.speak(2)), ...new Wire(PETER, { startMs: START + 9_000 }).send(new Voice().speak(1))]
  deliver(recorder, later, START + 5_000, START + 12_000)

  const outcome = await recorder.stop('stop command', START + 12_000)
  return { speech, recorder, outcome }
}

test('a stopped session ends with its audio stored, its transcript complete and saved as text, and a recap waiting to be written', async () => {
  const speech = scriptedSpeech()
  const recorder = await start(speech)
  recorder.speakerJoined(JEM, 'Jem', START + 500)
  recorder.speakerJoined(PETER, 'Peter', START + 600)
  const packets = [
    ...new Wire(JEM, { startMs: START + 1_000 }).send(new Voice().speak(2)),
    ...new Wire(PETER, { startMs: START + 4_000 }).send(new Voice().speak(1)),
  ]
  deliver(recorder, packets, START, START + 6_000)

  const outcome = await recorder.stop('stop command', START + 6_000)

  assert.deepEqual(outcome, { status: 'ended', location: recorder.location })
  const record = await session(recorder.location)
  assert.deepEqual(
    [record.state, record.audioComplete, record.transcriptComplete, record.recapStatus, record.needsAttention],
    ['ended', true, true, 'pending', null],
  )
  assert.equal(record.endedAt.toMillis(), START + 6_000)

  const [text] = await bucket.file(transcriptObjectPath(recorder.location)).download()
  assert.equal(text.toString('utf8'), '[00:01] Jem: w0.0 w0.5 w1.0 w1.5\n[00:04] Peter: w0.0 w0.5')

  // With everything safe in the database and the bucket, the journal has done its job.
  assert.equal(existsSync(recorder.journalPath), false)
})

test('the last words spoken before the stop are in the transcript', async () => {
  const recorder = await start(scriptedSpeech())
  const packets = new Wire(JEM, { startMs: START + 1_000 }).send(new Voice().speak(2))
  // Stopped the instant the last packet arrives: nothing has been settled, and some packets are still held.
  for (const packet of packets) recorder.packet(packet)

  await recorder.stop('stop command', packets.at(-1)!.receivedAtMs)

  assert.deepEqual(await said(recorder.location), [[JEM, 1, 'w0.0 w0.5 w1.0 w1.5']])
  assert.equal((await session(recorder.location)).state, 'ended')
})

test('stopping twice finishes the session once', async () => {
  const recorder = await start(scriptedSpeech())
  deliver(recorder, new Wire(JEM, { startMs: START + 1_000 }).send(new Voice().speak(1)), START, START + 3_000)

  const [first, second] = await Promise.all([recorder.stop('stop command', START + 3_000), recorder.stop('stop command', START + 3_500)])

  assert.equal(first, second)
  assert.equal((await session(recorder.location)).stoppedAt.toMillis(), START + 3_000)
})

test('if the speech service is down when a session is stopped, the audio is safe, the session is flagged, and its recap is held back', async () => {
  const { recorder, outcome } = await recordedThroughAnOutage()

  assert.equal(outcome.status, 'needs-attention')
  const record = await session(recorder.location)
  assert.deepEqual([record.state, record.audioComplete, record.transcriptComplete, record.recapStatus], ['finalising', false, false, 'delayed'])
  assert.match(record.needsAttention, /speech service could not be reached/)
  // What was said before the outage is there; what was said during it is not, yet.
  assert.deepEqual(await said(recorder.location), [[JEM, 1, 'w0.0 w0.5 w1.0 w1.5']])
  assert.equal(await segmentCount(recorder.location), 3)
  // The journal is kept, because it is what the rest of the transcript will be made from.
  assert.equal(existsSync(recorder.journalPath), true)
})

test('a session still finalising does not stop the server starting a new one', async () => {
  const { recorder } = await recordedThroughAnOutage()

  const next = await SessionRecorder.start({ ...startInput, startedAtMs: START + 60_000 }, { store, journalDir, journalSyncEveryMs: 0 })

  assert.equal(next.status, 'started')
  assert.equal((await session(recorder.location)).state, 'finalising')
})

test('once the speech service is back, finishing the session again completes the transcript from the saved audio', async () => {
  const { speech, recorder } = await recordedThroughAnOutage()
  speech.down = false

  // As a restarted bot would: a new store, and nothing but the journal's path to go on.
  const restarted = new FirestoreSessionStore(db, bucket)
  const outcome = await finaliseSession({
    store: restarted,
    journalPath: recorder.journalPath,
    connectSpeech: speech.connect,
    giveUpAfterMs: 5_000,
    nowMs: START + 90_000,
  })

  assert.deepEqual(outcome, { status: 'ended', location: recorder.location })
  assert.deepEqual(await said(recorder.location), [
    [JEM, 1, 'w0.0 w0.5 w1.0 w1.5'],
    // Said while the service was down, transcribed afterwards, and placed where it was spoken.
    [JEM, 6, 'w0.0 w0.5 w1.0 w1.5'],
    [PETER, 9, 'w0.0 w0.5'],
  ])
  const record = await session(recorder.location)
  assert.deepEqual([record.state, record.transcriptComplete, record.needsAttention], ['ended', true, null])
  assert.equal(await segmentCount(recorder.location), 3)
  assert.equal(existsSync(recorder.journalPath), false)
  // Only the audio that had no transcript was sent to the service the second time.
  const resent = speech.connections.slice(1).reduce((sum, connection) => sum + connection.secondsSent, 0)
  assert.equal(Number(resent.toFixed(2)), 3)
})

test('finishing a session again stores any audio that is in the journal but missing from the bucket', async () => {
  const { speech, recorder } = await recordedThroughAnOutage()
  const segments = await db.collection(sessionPath(recorder.location, 'segments')).get()
  const lost = segments.docs[1]!
  await bucket.file(lost.data().objectPath).delete()
  await lost.ref.delete()
  speech.down = false

  await finaliseSession({ store, journalPath: recorder.journalPath, connectSpeech: speech.connect, giveUpAfterMs: 5_000 })

  assert.equal(await segmentCount(recorder.location), 3)
  const [exists] = await bucket.file(lost.data().objectPath).exists()
  assert.equal(exists, true)
  assert.equal((await session(recorder.location)).state, 'ended')
})

test('a session whose recording has not been stopped is not finished by mistake', async () => {
  const recorder = await start(scriptedSpeech())
  deliver(recorder, new Wire(JEM, { startMs: START + 1_000 }).send(new Voice().speak(1)), START, START + 3_000)

  const outcome = await finaliseSession({ store, journalPath: recorder.journalPath })

  assert.deepEqual(outcome, { status: 'not-ready', reason: 'recording has not been stopped' })
  assert.equal((await session(recorder.location)).state, 'running')
  await recorder.stop('stop command', START + 4_000)
})
