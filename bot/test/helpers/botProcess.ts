/**
 * A bot recording a scripted session in real time, as a process of its own, so
 * that a test can kill it the way a crash would and start another in its place.
 *
 *   node botProcess.ts start <journalDir> <serverId>    records until it is killed
 *   node botProcess.ts resume <journalDir>              picks up what the first left, then stops the session
 *
 * It says what it has done as lines of JSON on its output.
 */
import { fileURLToPath } from 'node:url'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import type { VoicePacket } from '../../src/audio/timeline.ts'
import { recoverSessions } from '../../src/session/recover.ts'
import { SessionRecorder, type RecorderOptions } from '../../src/session/recorder.ts'
import { FirestoreSessionStore } from '../../src/store/sessionStore.ts'
import { scriptedSpeech } from './speech.ts'
import { Voice, Wire } from './synth.ts'

export const JEM = '111111111111111111'
export const PETER = '222222222222222222'
/** How long Jem speaks before pausing, and so how much of what he says is transcribed before the bot is killed. */
export const FIRST_STRETCH_SECONDS = 2

const say = (message: Record<string, unknown>) => console.log(JSON.stringify(message))
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const [mode, journalDir, serverId] = process.argv.slice(2)
  const projectId = process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev'
  const app = initializeApp({ projectId })
  const speech = scriptedSpeech()
  const options: RecorderOptions = {
    store: new FirestoreSessionStore(getFirestore(app), getStorage(app).bucket(`${projectId}.firebasestorage.app`)),
    journalDir: journalDir!,
    connectSpeech: speech.connect,
    lastWordsMs: 2_000,
    finaliseGiveUpAfterMs: 5_000,
  }

  let recorder: SessionRecorder
  /** Delivers packets at the moments they are timed for. */
  const play = async (packets: VoicePacket[], onPacket?: (index: number) => void) => {
    for (const [index, packet] of packets.entries()) {
      while (Date.now() < packet.receivedAtMs) {
        recorder.tick(Date.now())
        await sleep(5)
      }
      recorder.packet(packet)
      onPacket?.(index)
    }
  }
  const idle = async (ms: number) => {
    const until = Date.now() + ms
    while (Date.now() < until) {
      recorder.tick(Date.now())
      await sleep(20)
    }
  }

  if (mode === 'start') {
    const voice = new Voice()
    const first = voice.speak(FIRST_STRETCH_SECONDS)
    const second = voice.speak(30)
    const result = await SessionRecorder.start(
      { discordServerId: serverId!, discordChannelId: 'voice', startedByDiscordId: JEM, startedAtMs: Date.now() },
      options,
    )
    if (result.status !== 'started') throw new Error(`Could not start: ${result.status}`)
    recorder = result.recorder
    recorder.speakerJoined(JEM, 'Jem', Date.now())

    const spokeAtMs = Date.now() + 100
    const wire = new Wire(JEM, { startMs: spokeAtMs })
    await play(wire.send(first))
    // Long enough for what he said to be transcribed and stored.
    await idle(2_500)
    await recorder.settled()
    say({ event: 'paused', sessionId: recorder.location.sessionId })

    wire.quiet((Date.now() + 50 - (spokeAtMs + FIRST_STRETCH_SECONDS * 1000)) / 1000)
    // He is mid-sentence, a second in, when the test kills this process.
    await play(wire.send(second), (index) => {
      if (index === 50) say({ event: 'speaking' })
    })
    return
  }

  const recovered = await recoverSessions(options, Date.now())
  const resumed = recovered.find((journal) => journal.outcome === 'resumed')
  if (!resumed) throw new Error(`Nothing was resumed: ${JSON.stringify(recovered.map((journal) => journal.outcome))}`)
  recorder = resumed.recorder
  recorder.reconnected(Date.now())
  recorder.speakerJoined(PETER, 'Peter', Date.now())
  await play(new Wire(PETER, { startMs: Date.now() + 100 }).send(new Voice().speak(1)))
  await idle(2_000)
  const outcome = await recorder.stop('stop command', Date.now())
  say({
    event: 'stopped',
    outcome: outcome.status,
    sessionId: recorder.location.sessionId,
    failures: recorder.failures.map(String),
    // How much audio the speech service was sent after the restart, connection by connection.
    secondsSent: speech.connections.map((connection) => Number(connection.secondsSent.toFixed(2))),
  })
  process.exit(0)
}

// A test imports this file for the names above; only as a process of its own does it record anything.
if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
