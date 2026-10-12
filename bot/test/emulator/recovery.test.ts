/**
 * What happens when things go wrong mid-session, run for real against the
 * emulators: the bot process dying, storage being unreachable, the disk
 * filling up. In each case nothing that reached the journal may be lost.
 */
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { after, before, beforeEach, test } from 'node:test'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import type { Segment } from '../../src/audio/segmenter.ts'
import type { VoicePacket } from '../../src/audio/timeline.ts'
import { JournalWriter, readJournal } from '../../src/journal/journal.ts'
import { recoverSessions } from '../../src/session/recover.ts'
import { SessionRecorder, type RecorderAlarm, type RecorderOptions } from '../../src/session/recorder.ts'
import { FirestoreSessionStore, sessionPath, type SessionLocation } from '../../src/store/sessionStore.ts'
import { FIRST_STRETCH_SECONDS, JEM, PETER } from '../helpers/botProcess.ts'
import { scriptedSpeech } from '../helpers/speech.ts'
import { Voice, Wire } from '../helpers/synth.ts'

const projectId = process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev'
const SERVER = 'recovery-test-server'
const GROUP = 'recovery-test-group'
const CAMPAIGN = 'recovery-test-campaign'
const START = 1_800_000_000_000
const RATE = 48_000
const PACKET_SAMPLES = 960

/** A store whose storage, or whose record of a stop, can be made to fail. */
class FailingStore extends FirestoreSessionStore {
  storageDown = false
  stopFails = false

  override async storeSegment(location: SessionLocation, segment: Segment, file: Buffer): Promise<void> {
    if (this.storageDown) throw new Error('Storage cannot be reached.')
    return super.storeSegment(location, segment, file)
  }

  override async stopRecording(location: SessionLocation, input: { stoppedAtMs: number; reason: string }): Promise<void> {
    if (this.stopFails) throw new Error('The database cannot be reached.')
    return super.stopRecording(location, input)
  }
}

let db: Firestore
let store: FailingStore
let bucket: ReturnType<ReturnType<typeof getStorage>['bucket']>
let journalDir: string
const children: ChildProcess[] = []

before(() => {
  const app = getApps()[0] ?? initializeApp({ projectId })
  db = getFirestore(app)
  bucket = getStorage(app).bucket(`${projectId}.firebasestorage.app`)
})
after(() => {
  for (const child of children) child.kill('SIGKILL')
})

beforeEach(async () => {
  store = new FailingStore(db, bucket)
  journalDir = mkdtempSync(path.join(tmpdir(), 'tablekeep-recovery-'))
  await db.recursiveDelete(db.collection('groups').doc(GROUP))
  await bucket.deleteFiles({ prefix: `groups/${GROUP}/` })
  await db.collection('groups').doc(GROUP).set({ name: 'Home Boys', activeCampaignId: CAMPAIGN })
  await db.doc(`groups/${GROUP}/campaigns/${CAMPAIGN}`).set({ name: 'The Black Wyrm of Brandonsford' })
  await db.collection('discordServers').doc(SERVER).set({ groupId: GROUP })
})

const startInput = { discordServerId: SERVER, discordChannelId: 'voice', startedByDiscordId: JEM, startedAtMs: START }
const options = (extra: Partial<RecorderOptions> = {}): RecorderOptions => ({
  store,
  journalDir,
  journalSyncEveryMs: 0,
  connectSpeech: scriptedSpeech().connect,
  lastWordsMs: 100,
  finaliseGiveUpAfterMs: 2_000,
  ...extra,
})

async function start(extra: Partial<RecorderOptions> = {}) {
  const result = await SessionRecorder.start(startInput, options(extra))
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
  for (const packet of packets) {
    advance(packet.receivedAtMs)
    recorder.packet(packet)
  }
  advance(untilMs)
}

const session = async (location: SessionLocation) => (await db.doc(sessionPath(location)).get()).data()
const segments = async (location: SessionLocation) =>
  (await db.collection(sessionPath(location, 'segments')).orderBy('startSamples').get()).docs.map((doc) => doc.data())
const server = async () => (await db.collection('discordServers').doc(SERVER).get()).data()!
const jemSpeaks = (seconds: number, atMs = START + 1_000) => new Wire(JEM, { startMs: atMs }).send(new Voice().speak(seconds))

/** Runs the scripted bot as its own process and hands back what it says, line by line. */
function runBot(mode: 'start' | 'resume') {
  const script = path.join(import.meta.dirname, '../helpers/botProcess.ts')
  const child = spawn(process.execPath, [script, mode, journalDir, SERVER], { stdio: ['ignore', 'pipe', 'inherit'] })
  children.push(child)
  const said: Record<string, unknown>[] = []
  const waiting: { event: string; resolve: (message: Record<string, unknown>) => void }[] = []
  createInterface({ input: child.stdout! }).on('line', (line) => {
    const message = JSON.parse(line) as Record<string, unknown>
    said.push(message)
    for (const waiter of waiting.splice(0)) {
      if (waiter.event === message.event) waiter.resolve(message)
      else waiting.push(waiter)
    }
  })
  const exited = new Promise<void>((resolve) => child.on('exit', () => resolve()))
  const heard = (event: string) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const already = said.find((message) => message.event === event)
      if (already) return resolve(already)
      waiting.push({ event, resolve })
      void exited.then(() => reject(new Error(`The bot exited without saying "${event}".`)))
    })
  return { child, heard, exited }
}

test('a bot killed mid-session is replaced by one that resumes the same session with nothing lost', { timeout: 60_000 }, async () => {
  const first = runBot('start')
  const { sessionId } = (await first.heard('paused')) as { sessionId: string }
  const location: SessionLocation = { groupId: GROUP, campaignId: CAMPAIGN, sessionId }
  await first.heard('speaking')
  first.child.kill('SIGKILL')
  await first.exited

  // What the dead bot left: a journal, and in the database only what Jem said before he paused.
  const journalPath = path.join(journalDir, `${sessionId}.journal`)
  const journalled = readJournal(journalPath).records
  const jemPackets = journalled.filter((record) => record.type === 'packet').length
  const lastHeardAtMs = Math.max(...journalled.map((record) => (record.type === 'packet' ? record.packet.receivedAtMs : record.event.atMs)))
  const firstPackets = FIRST_STRETCH_SECONDS * 50
  assert.ok(jemPackets > firstPackets + 50, `only ${jemPackets} packets were journalled`)
  const before = await store.transcript(location)
  assert.deepEqual(before.map((utterance) => utterance.text), ['w0.0 w0.5 w1.0 w1.5'])
  assert.equal((await segments(location)).length, 1)
  assert.equal((await session(location))!.state, 'running')

  await new Promise((resolve) => setTimeout(resolve, 400))
  const second = runBot('resume')
  const stopped = await second.heard('stopped')
  await second.exited

  // The same session, finished; not a second one.
  assert.deepEqual([stopped.outcome, stopped.sessionId, stopped.failures], ['ended', sessionId, []])
  assert.equal((await db.collection(`groups/${GROUP}/campaigns/${CAMPAIGN}/sessions`).get()).size, 1)
  const record = (await session(location))!
  assert.deepEqual([record.state, record.audioComplete, record.transcriptComplete], ['ended', true, true])
  const startedAtMs = record.startedAt.toMillis() as number
  const samplesAt = (atMs: number) => Math.round(((atMs - startedAtMs) / 1000) * RATE)

  // Every packet journalled before the kill is in storage.
  const stored = await segments(location)
  const jemStored = stored.filter((segment) => segment.speakerId === JEM)
  assert.equal(jemStored.reduce((sum, segment) => sum + segment.packets, 0), jemPackets)

  // What was said before the kill is as it was, once. What had not been transcribed now is,
  // and only that audio was sent to the speech service to get it.
  const unheardSeconds = (jemPackets - firstPackets) * 0.02
  const after = await store.transcript(location)
  assert.deepEqual(after[0], before[0])
  assert.deepEqual(after.map((utterance) => utterance.speakerId), [JEM, JEM, PETER])
  assert.ok(after[1]!.startSamples >= before[0]!.endSamples)
  assert.equal(after[1]!.text.split(' ').length, Math.floor((unheardSeconds - 0.25) / 0.5 + 1e-9) + 1)
  assert.deepEqual(stopped.secondsSent, [Number(unheardSeconds.toFixed(2)), 1])

  // The time the bot was away is a gap on the timeline, with Jem before it and Peter after.
  const gaps = (await db.collection(sessionPath(location, 'gaps')).get()).docs.map((doc) => doc.data())
  assert.equal(gaps.length, 1)
  const gap = gaps[0]!
  assert.equal(gap.startSamples, samplesAt(lastHeardAtMs))
  assert.ok(gap.endSamples - gap.startSamples >= 0.4 * RATE, 'the gap is shorter than the time the bot was away')
  assert.ok(jemStored.every((segment) => segment.endSamples <= gap.startSamples + PACKET_SAMPLES))
  const peterStored = stored.filter((segment) => segment.speakerId === PETER)
  assert.ok(peterStored.length > 0 && peterStored.every((segment) => segment.startSamples >= gap.endSamples))

  // The bucket holds exactly the audio the records describe, and the journal is no longer needed.
  const [files] = await bucket.getFiles({ prefix: `${sessionPath(location)}/audio/` })
  assert.deepEqual(files.map((file) => file.name).sort(), stored.map((segment) => segment.objectPath as string).sort())
  for (const segment of stored) {
    const [bytes] = await bucket.file(segment.objectPath).download()
    assert.equal(createHash('sha256').update(bytes).digest('hex'), segment.sha256)
  }
  assert.deepEqual(readdirSync(journalDir), [])
})

test('a record cut short by the bot dying does not hide what is recorded after the restart', async () => {
  const dead = await start()
  deliver(dead, jemSpeaks(1), START, START + 1_500)
  await dead.settled()
  appendFileSync(dead.journalPath, Buffer.from([40, 0, 0, 0, 1, 2, 3]))

  const [recovered] = await recoverSessions(options(), START + 20_000)
  assert.equal(recovered?.outcome, 'resumed')
  const recorder = (recovered as Extract<typeof recovered, { outcome: 'resumed' }>).recorder
  recorder.reconnected(START + 20_000)
  deliver(recorder, jemSpeaks(1, START + 21_000), START + 20_000, START + 23_000)
  const outcome = await recorder.stop('stop command', START + 23_000)

  assert.equal(outcome.status, 'ended')
  assert.deepEqual(
    (await segments(recorder.location)).map((segment) => [segment.epoch, segment.startSamples / RATE, segment.endSamples / RATE]),
    [
      [0, 1, 2],
      [1, 21, 22],
    ],
  )
})

test('audio that cannot be stored stays safe in the journal and is stored once storage is back', async () => {
  const recorder = await start()
  store.storageDown = true
  deliver(recorder, jemSpeaks(1), START, START + 4_000)
  await recorder.settled()

  assert.equal(recorder.unstoredSegments, 1)
  assert.equal((await segments(recorder.location)).length, 0)
  assert.equal(readJournal(recorder.journalPath).records.filter((record) => record.type === 'packet').length, 50)

  store.storageDown = false
  recorder.tick(START + 20_000)
  await recorder.settled()

  assert.equal(recorder.unstoredSegments, 0)
  assert.equal((await segments(recorder.location)).length, 1)
  assert.equal((await recorder.stop('stop command', START + 21_000)).status, 'ended')
})

test('a session stopped while storage is down is flagged, keeps its journal, and is finished when storage returns', async () => {
  const recorder = await start()
  store.storageDown = true
  deliver(recorder, jemSpeaks(1), START, START + 4_000)

  const outcome = await recorder.stop('stop command', START + 5_000)

  assert.equal(outcome.status, 'needs-attention')
  const flagged = (await session(recorder.location))!
  assert.deepEqual([flagged.state, flagged.audioComplete], ['finalising', false])
  assert.match(flagged.needsAttention, /audio is not stored yet/)
  assert.equal(existsSync(recorder.journalPath), true)

  store.storageDown = false
  const [recovered] = await recoverSessions(options(), START + 60_000)

  assert.equal(recovered?.outcome, 'finalised')
  const finished = (await session(recorder.location))!
  assert.deepEqual([finished.state, finished.audioComplete, finished.needsAttention], ['ended', true, null])
  assert.equal((await segments(recorder.location)).length, 1)
  assert.equal(existsSync(recorder.journalPath), false)
})

test('a bot that died after journalling a stop but before recording it still ends the session and frees the server', async () => {
  const recorder = await start()
  deliver(recorder, jemSpeaks(1), START, START + 3_000)
  store.stopFails = true
  await assert.rejects(recorder.stop('stop command', START + 3_000))
  assert.deepEqual((await server()).activeSession, recorder.location)

  store.stopFails = false
  const [recovered] = await recoverSessions(options(), START + 60_000)

  assert.equal(recovered?.outcome, 'finalised')
  const record = (await session(recorder.location))!
  assert.deepEqual([record.state, record.stopReason, record.stoppedAt.toMillis()], ['ended', 'stop command', START + 3_000])
  assert.equal((await server()).activeSession, null)
})

test('a journal left behind by a session that has ended, or been deleted, is removed without the session being finished again', async () => {
  const ended = await start()
  deliver(ended, jemSpeaks(1), START, START + 3_000)
  const journal = readJournal(ended.journalPath)
  await ended.stop('stop command', START + 3_000)
  // As if the bot died after ending the session but before removing its journal.
  const leftover = path.join(journalDir, 'leftover.journal')
  const writer = new JournalWriter(leftover, 0)
  for (const record of journal.records) writer.append(record)
  writer.close()
  await db.doc(sessionPath(ended.location)).update({ recapStatus: 'done' })

  const [recovered] = await recoverSessions(options(), START + 60_000)

  assert.deepEqual([recovered?.outcome, existsSync(leftover)], ['discarded', false])
  assert.equal((await session(ended.location))!.recapStatus, 'done')

  const deleted = await start({})
  await db.recursiveDelete(db.doc(sessionPath(deleted.location)))
  const [gone] = await recoverSessions(options(), START + 60_000)
  assert.deepEqual([gone?.outcome, existsSync(deleted.journalPath)], ['discarded', false])
})

test('with the disk nearly full no session is started, and one already running raises an alarm once', async () => {
  const refused = await SessionRecorder.start(startInput, options({ freeDiskBytes: () => 500 * 1024 ** 2 }))

  assert.deepEqual(refused, { status: 'disk-full', freeBytes: 500 * 1024 ** 2 })
  assert.equal((await db.collection(`groups/${GROUP}/campaigns/${CAMPAIGN}/sessions`).get()).size, 0)
  assert.equal((await server()).activeSession, undefined)

  let freeBytes = 5 * 1024 ** 3
  const alarms: RecorderAlarm[] = []
  const recorder = await start({ freeDiskBytes: () => freeBytes, onAlarm: (alarm) => alarms.push(alarm) })
  recorder.tick(START + 1_000)
  freeBytes = 100 * 1024 ** 2
  recorder.tick(START + 20_000)
  recorder.tick(START + 40_000)

  assert.deepEqual(alarms, [{ kind: 'disk-low', freeBytes: 100 * 1024 ** 2 }])
  await recorder.stop('stop command', START + 41_000)
})
