/**
 * `/join` and `/stop`, run for real against the emulators with a stand-in for
 * Discord's voice channels: who may use them, what they start and end, and who
 * ends up recorded.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { joinReply, noteReply, stopReply } from '../../src/discord/replies.ts'
import { SessionRunner, type CommandCaller, type JoinReply } from '../../src/discord/runner.ts'
import { FirestoreSessionStore, sessionPath, type SessionLocation } from '../../src/store/sessionStore.ts'
import { recoverSessions } from '../../src/session/recover.ts'
import type { RecorderOptions } from '../../src/session/recorder.ts'
import { scriptedSpeech, type ScriptedSpeech } from '../helpers/speech.ts'
import { Voice, Wire } from '../helpers/synth.ts'
import { ScriptedBoard, ScriptedVoice } from '../helpers/voice.ts'

const projectId = process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev'
const SERVER = 'discord-test-server'
const GROUP = 'discord-test-group'
const CAMPAIGN = 'discord-test-campaign'
const CHANNEL = 'tavern-voice'
const TEXT = 'tavern-text'
const START = 1_800_000_000_000

// Jem and Peter have connected their accounts and belong to the group. Nail has connected his but belongs
// to another group. Guest has connected nothing. Craig is another bot in the channel.
const JEM = { id: '111111111111111111', displayName: 'mapman', bot: false }
const PETER = { id: '222222222222222222', displayName: 'Peter', bot: false }
const NAIL = { id: '333333333333333333', displayName: 'Nail', bot: false }
const GUEST = { id: '444444444444444444', displayName: 'Drop-in Dan', bot: false }
const CRAIG = { id: '555555555555555555', displayName: 'Craig', bot: true }
const RECORDER = { id: '999999999999999999', displayName: 'Table Keep', bot: true }

let db: Firestore
let store: FirestoreSessionStore
let bucket: ReturnType<ReturnType<typeof getStorage>['bucket']>
let journalDir: string
let voice: ScriptedVoice
let board: ScriptedBoard
let speech: ScriptedSpeech
let recorderOptions: RecorderOptions
let runner: SessionRunner
let clock: number
let freeDiskBytes: number

before(() => {
  const app = getApps()[0] ?? initializeApp({ projectId })
  db = getFirestore(app)
  bucket = getStorage(app).bucket(`${projectId}.firebasestorage.app`)
  store = new FirestoreSessionStore(db, bucket)
  journalDir = mkdtempSync(path.join(tmpdir(), 'tablekeep-discord-'))
})
after(() => rmSync(journalDir, { recursive: true, force: true }))

beforeEach(async () => {
  await db.recursiveDelete(db.collection('groups').doc(GROUP))
  await bucket.deleteFiles({ prefix: `groups/${GROUP}/` })
  await db.collection('groups').doc(GROUP).set({ name: 'Home Boys', activeCampaignId: CAMPAIGN })
  await db.doc(`groups/${GROUP}/campaigns/${CAMPAIGN}`).set({ name: 'The Black Wyrm of Brandonsford' })
  await db.doc(`groups/${GROUP}/members/jem-uid`).set({ status: 'active', role: 'admin' })
  await db.doc(`groups/${GROUP}/members/peter-uid`).set({ status: 'active', role: 'member' })
  await db.collection('discordServers').doc(SERVER).set({ groupId: GROUP })
  await db.collection('discordAccounts').doc(JEM.id).set({ uid: 'jem-uid' })
  await db.collection('discordAccounts').doc(PETER.id).set({ uid: 'peter-uid' })
  await db.collection('discordAccounts').doc(NAIL.id).set({ uid: 'nail-uid' })
  await db.collection('discordAccounts').doc(GUEST.id).delete()

  clock = START
  clients = new Map()
  freeDiskBytes = 50 * 1024 ** 3
  voice = new ScriptedVoice()
  voice.channels.set(CHANNEL, [RECORDER, JEM, PETER])
  board = new ScriptedBoard()
  speech = scriptedSpeech()
  recorderOptions = {
    store,
    journalDir: mkdtempSync(path.join(journalDir, 'run-')),
    journalSyncEveryMs: 0,
    connectSpeech: speech.connect,
    lastWordsMs: 100,
    finaliseGiveUpAfterMs: 500,
    freeDiskBytes: () => freeDiskBytes,
  }
  runner = newRunner()
})

const newRunner = () => new SessionRunner({ voice, messages: board, now: () => clock, recorder: recorderOptions })

const asJem: CommandCaller = { serverId: SERVER, userId: JEM.id, voiceChannelId: CHANNEL, textChannelId: TEXT }
const sessions = async () => (await db.collection(`groups/${GROUP}/campaigns/${CAMPAIGN}/sessions`).get()).docs
const session = async (location: SessionLocation) => (await db.doc(sessionPath(location)).get()).data()!
const speakers = async (location: SessionLocation) =>
  (await db.collection(sessionPath(location, 'speakers')).get()).docs.map((doc) => [doc.data().displayName, doc.data().memberUid]).sort()

async function started(reply: JoinReply) {
  assert.equal(reply.status, 'started')
  return (reply as Extract<JoinReply, { status: 'started' }>).location
}

/** Waits for something the bot does in its own time. */
async function until(done: () => Promise<boolean>) {
  for (let tries = 0; tries < 100; tries += 1) {
    if (await done()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.fail('timed out waiting')
}

/** Lets time pass, ticking as the bot does. */
function pass(ms: number) {
  const until = clock + ms
  while (clock < until) {
    clock += 100
    runner.tick(clock)
  }
}

/** Each person's client, which numbers its packets on from wherever it had got to. */
let clients: Map<string, { wire: Wire; voice: Voice; quietSinceMs: number }>

/** Someone speaks for a while, starting now. */
function speak(speakerId: string, seconds: number) {
  let client = clients.get(speakerId)
  if (client) client.wire.quiet((clock - client.quietSinceMs) / 1000)
  else client = { wire: new Wire(speakerId, { startMs: clock }), voice: new Voice(), quietSinceMs: clock }
  clients.set(speakerId, client)
  for (const packet of client.wire.send(client.voice.speak(seconds))) {
    clock = packet.receivedAtMs
    voice.links.at(-1)!.deliver([packet])
    runner.tick(clock)
  }
  client.quietSinceMs = clock + 20
  pass(2_000)
}

test('/join starts a session in the caller\'s voice channel, under the linked group\'s current campaign, and says so aloud once', async () => {
  const reply = await runner.join(asJem)
  const location = await started(reply)

  assert.deepEqual([location.groupId, location.campaignId], [GROUP, CAMPAIGN])
  const record = await session(location)
  assert.deepEqual(
    [record.state, record.number, record.discordChannelId, record.startedByDiscordId],
    ['running', 1, CHANNEL, JEM.id],
  )
  const [link] = voice.links
  assert.deepEqual([link!.channelId, link!.announcements], [CHANNEL, 1])
  assert.equal(joinReply(reply), "Recording session 1. Use `/stop` when you're done.")

  // Someone arriving later is not told again.
  link!.arrive(GUEST)
  pass(1_000)
  assert.equal(link!.announcements, 1)
  await runner.stop(asJem)
})

test('/join is refused, with the reason, when the caller or the server is not set up for it', async () => {
  const refusal = async (caller: Partial<CommandCaller>) => {
    const reply = await runner.join({ ...asJem, ...caller })
    assert.ok(joinReply(reply).length > 20, 'the refusal says why')
    return reply.status
  }

  assert.equal(await refusal({ serverId: 'some-other-server' }), 'server-not-linked')
  assert.equal(await refusal({ userId: GUEST.id }), 'not-connected')
  assert.equal(await refusal({ userId: NAIL.id }), 'not-a-member')
  assert.equal(await refusal({ voiceChannelId: null }), 'not-in-voice')
  await db.collection('groups').doc(GROUP).update({ activeCampaignId: null })
  assert.equal(await refusal({}), 'no-current-campaign')

  assert.equal((await sessions()).length, 0)
  assert.equal(voice.links.length, 0)
})

test('a session that cannot get into the voice channel is not left running', async () => {
  voice.refuses = true

  const reply = await runner.join(asJem)

  assert.equal(reply.status, 'voice-failed')
  const [only] = await sessions()
  assert.equal(only!.data().state, 'ended')
  assert.equal((await db.collection('discordServers').doc(SERVER).get()).data()!.activeSession, null)
})

test('membership is checked each time a command is run, not remembered from the last time', async () => {
  const location = await started(await runner.join(asJem))

  await db.doc(`groups/${GROUP}/members/peter-uid`).update({ status: 'removed' })
  assert.equal((await runner.stop({ serverId: SERVER, userId: PETER.id })).status, 'not-a-member')
  assert.equal((await session(location)).state, 'running')

  await db.doc(`groups/${GROUP}/members/peter-uid`).update({ status: 'active' })
  assert.equal((await runner.stop({ serverId: SERVER, userId: PETER.id })).status, 'saved')
  assert.equal((await session(location)).state, 'ended')
})

test('a second /join while a session is running changes nothing, however it arrives', async () => {
  const [first, second] = await Promise.all([runner.join(asJem), runner.join({ ...asJem, userId: PETER.id })])
  const later = await runner.join(asJem)

  assert.deepEqual([first.status, second.status].sort(), ['already-recording', 'started'])
  assert.equal(later.status, 'already-recording')
  assert.equal((await sessions()).length, 1)
  assert.equal(voice.links.length, 1)
  assert.equal(voice.links[0]!.announcements, 1)
  await runner.stop(asJem)
})

test('/stop leaves the channel and finishes the session, and a second /stop finds nothing to stop', async () => {
  const location = await started(await runner.join(asJem))
  speak(JEM.id, 1)

  const [first, second] = await Promise.all([runner.stop(asJem), runner.stop({ serverId: SERVER, userId: PETER.id })])
  const third = await runner.stop(asJem)

  assert.deepEqual([first.status, second.status, third.status].sort(), ['not-recording', 'not-recording', 'saved'])
  assert.equal(stopReply(first.status === 'saved' ? first : second), 'Stopped. Session 1 is saved.')
  assert.equal(voice.links[0]!.left, true)
  const record = await session(location)
  assert.deepEqual([record.state, record.stopReason, record.transcriptComplete], ['ended', 'stop command', true])
  assert.equal((await store.transcript(location)).length, 1)
})

test('everyone in the channel is recorded except bots, as the group member they are or under their Discord name', async () => {
  voice.channels.set(CHANNEL, [RECORDER, CRAIG, JEM, NAIL, GUEST])
  const location = await started(await runner.join(asJem))
  for (const member of [JEM, NAIL, GUEST, CRAIG]) speak(member.id, 1)

  await runner.stop(asJem)

  assert.deepEqual(await speakers(location), [
    // Nail's account is connected, but he is not in this group, so here he is only a name.
    ['Drop-in Dan', null],
    ['Nail', null],
    ['mapman', 'jem-uid'],
  ])
  const heard = new Set((await store.transcript(location)).map((utterance) => utterance.speakerId))
  assert.deepEqual([...heard].sort(), [JEM.id, NAIL.id, GUEST.id].sort())
  const stored = await db.collection(sessionPath(location, 'segments')).get()
  assert.ok(!stored.docs.some((doc) => doc.data().speakerId === CRAIG.id))
})

test('someone who joins late is recorded, and someone who drops and returns is the same speaker', async () => {
  const location = await started(await runner.join(asJem))
  const link = voice.links[0]!
  speak(JEM.id, 1)

  link.arrive(GUEST)
  speak(GUEST.id, 1)
  link.depart(JEM.id)
  pass(3_000)
  link.arrive(JEM)
  speak(JEM.id, 1)
  await runner.stop(asJem)

  assert.deepEqual(await speakers(location), [
    ['Drop-in Dan', null],
    ['Peter', 'peter-uid'],
    ['mapman', 'jem-uid'],
  ])
  const segments = (await db.collection(sessionPath(location, 'segments')).orderBy('startSamples').get()).docs.map((doc) => doc.data())
  // Jem's two stretches are one speaker's, the second a new stream after his return.
  assert.deepEqual(
    segments.map((segment) => [segment.speakerId, segment.epoch]),
    [
      [JEM.id, 0],
      [GUEST.id, 0],
      [JEM.id, 1],
    ],
  )
})

test('a session stays with the group and campaign it started in, and its own group can still stop it', async () => {
  const location = await started(await runner.join(asJem))
  speak(JEM.id, 1)

  await db.doc(`groups/${GROUP}/campaigns/another-campaign`).set({ name: 'Another' })
  await db.collection('groups').doc(GROUP).update({ activeCampaignId: 'another-campaign' })
  await db.collection('discordServers').doc(SERVER).delete()
  speak(PETER.id, 1)
  const reply = await runner.stop(asJem)

  assert.equal(reply.status, 'saved')
  assert.deepEqual([location.groupId, location.campaignId], [GROUP, CAMPAIGN])
  assert.equal((await session(location)).state, 'ended')
  assert.equal((await store.transcript(location)).length, 2)
  assert.equal((await db.collection(`groups/${GROUP}/campaigns/another-campaign/sessions`).get()).size, 0)
})

test('a session posts one status message and edits it in place, quietly, to show that each person is being heard', async () => {
  await started(await runner.join(asJem))

  assert.deepEqual(
    board.messages.map((message) => [message.channelId, message.quiet, message.text]),
    [[TEXT, true, 'Recording session 1 - 0:00\nmapman: not heard yet, 0 lines\nPeter: not heard yet, 0 lines']],
  )

  speak(JEM.id, 1)
  speak(JEM.id, 1)
  pass(60_000)

  assert.equal(board.messages.length, 1)
  assert.ok(board.messages[0]!.edits >= 2, 'the status message was not kept up to date')
  // As it stood at the last half minute.
  assert.equal(board.messages[0]!.text, 'Recording session 1 - 1:00\nmapman: heard 56s ago, 2 lines\nPeter: not heard yet, 0 lines')
  await runner.stop(asJem)
})

test('an ordinary session leaves two messages in the channel: how it went, and that it is saved', async () => {
  await started(await runner.join(asJem))
  speak(JEM.id, 1)
  speak(PETER.id, 1)
  pass(45_000)

  await runner.stop(asJem)

  assert.deepEqual(
    board.messages.map((message) => message.text),
    ['Session 1 ended after 0:51.\nmapman: 1 line\nPeter: 1 line', 'Session 1 is saved.'],
  )
})

test('/note marks the moment the command arrived, with who wrote it', async () => {
  const location = await started(await runner.join(asJem))
  pass(75_000)

  const reply = await runner.note({ serverId: SERVER, userId: PETER.id }, '  the fight starts here ')
  const refused = await runner.note({ serverId: SERVER, userId: GUEST.id }, 'let me in')
  const empty = await runner.note(asJem, '   ')
  await runner.stop(asJem)
  const afterwards = await runner.note(asJem, 'too late')

  assert.equal(noteReply(reply), 'Noted at 1:15.')
  assert.deepEqual([refused.status, empty.status, afterwards.status], ['not-connected', 'empty', 'not-recording'])
  const markers = (await db.collection(sessionPath(location, 'markers')).get()).docs.map((doc) => doc.data())
  assert.deepEqual(markers, [{ atSamples: 75 * 48_000, text: 'the fight starts here', authorDiscordId: PETER.id, authorUid: 'peter-uid' }])
  // A note is not a channel message: it adds nothing to what the table sees.
  assert.equal(board.messages.length, 2)
})

test('a session nobody stopped ends by itself once the voice channel has had no person in it for a few minutes', async () => {
  voice.channels.set(CHANNEL, [RECORDER, CRAIG, JEM])
  const location = await started(await runner.join(asJem))
  speak(JEM.id, 1)
  const link = voice.links[0]!

  link.depart(JEM.id)
  pass(2 * 60_000)
  // Back before the time was up, then gone again: the wait starts over.
  link.arrive(JEM)
  pass(1_000)
  link.depart(JEM.id)
  pass(2 * 60_000)
  assert.equal((await session(location)).state, 'running')

  // Craig, another bot, is still there. He does not count.
  pass(70_000)
  await until(async () => (await session(location)).state === 'ended')

  assert.equal((await session(location)).stopReason, 'the voice channel was empty')
  assert.equal(link.left, true)
  assert.equal(board.messages.at(-1)!.text, 'Session 1 is saved. It ended because the voice channel was empty.')
  assert.equal((await runner.stop(asJem)).status, 'not-recording')
})

test('trouble transcribing or storing is said in the channel once, while the session is still going', async () => {
  await started(await runner.join(asJem))
  speak(JEM.id, 1)

  speech.down = true
  speech.connections[0]!.fail()
  speak(JEM.id, 1)
  pass(20_000)
  freeDiskBytes = 100 * 1024 ** 2
  pass(20_000)

  const alerts = board.messages.slice(1).map((message) => message.text)
  assert.equal(alerts.length, 2)
  assert.match(alerts[0]!, /can't reach the transcription service/)
  assert.match(alerts[1]!, /nearly out of disk space/)

  speech.down = false
  pass(60_000)
  assert.equal((await runner.stop(asJem)).status, 'saved')
  assert.equal(board.messages.length, 4)
})

test('a session saved with its transcript unfinished says so', async () => {
  await started(await runner.join(asJem))
  speak(JEM.id, 1)
  speech.down = true
  speech.connections[0]!.fail()
  speak(JEM.id, 1)

  const reply = await runner.stop(asJem)

  assert.equal(reply.status, 'saved-incomplete')
  assert.equal(stopReply(reply), 'Stopped. Session 1 is saved, but not finished yet.')
  assert.match(board.messages.at(-1)!.text, /^Session 1 is saved, but not finished yet\. The transcript is incomplete/)
})

test('a bot that restarts mid-session rejoins the channel, says so, and carries on in the same session', async () => {
  const location = await started(await runner.join(asJem))
  speak(JEM.id, 1)

  // The bot dies: its runner and its voice link are gone, and only the journal and the database remain.
  clock += 30_000
  runner = newRunner()
  const [recovered] = await recoverSessions(recorderOptions, clock)
  assert.equal(recovered?.outcome, 'resumed')
  const outcome = await runner.adopt((recovered as Extract<typeof recovered, { outcome: 'resumed' }>).recorder)

  assert.equal(outcome, 'resumed')
  assert.deepEqual([voice.links.length, voice.links[1]!.channelId, voice.links[1]!.announcements], [2, CHANNEL, 0])
  assert.match(board.messages[1]!.text, /^I restarted and have rejoined\. Session 1 is still being recorded/)
  assert.match(board.messages[2]!.text, /^Recording session 1 - 0:3\d/)

  speak(PETER.id, 1)
  assert.equal((await runner.stop(asJem)).status, 'saved')
  assert.equal((await sessions()).length, 1)
  assert.deepEqual((await store.transcript(location)).map((utterance) => utterance.speakerId), [JEM.id, PETER.id])
  assert.equal((await db.collection(sessionPath(location, 'gaps')).get()).size, 1)
})

test('a channel the bot may not write in does not stop the session being recorded', async () => {
  board.refuses = true
  const location = await started(await runner.join(asJem))
  speak(JEM.id, 1)
  pass(40_000)

  assert.equal((await runner.stop(asJem)).status, 'saved')
  assert.equal((await session(location)).state, 'ended')
  assert.equal(board.messages.length, 0)
})
