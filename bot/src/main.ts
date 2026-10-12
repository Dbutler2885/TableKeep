/**
 * The bot process.
 *
 *   node --env-file-if-exists=.env.local src/main.ts
 *
 * Needs DISCORD_BOT_TOKEN and DEEPGRAM_API_KEY. It writes to whichever
 * Firebase project its environment points at: the emulators when their host
 * variables are set, otherwise the project of its credentials.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { DiscordBot } from './discord/dysnomia.ts'
import { SessionRunner } from './discord/runner.ts'
import { recoverSessions } from './session/recover.ts'
import type { RecorderOptions } from './session/recorder.ts'
import { connectDeepgram } from './speech/deepgram.ts'
import { FirestoreSessionStore } from './store/sessionStore.ts'

const TICK_MS = 100
/** How often sessions that could not be finished are tried again. */
const RECOVER_EVERY_MS = 5 * 60 * 1000

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set.`)
  return value
}

const log = (message: string, detail: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), message, ...detail }))

const here = path.dirname(fileURLToPath(import.meta.url))
const projectId = process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev'
const app = initializeApp({ projectId })
const store = new FirestoreSessionStore(
  getFirestore(app),
  getStorage(app).bucket(process.env.STORAGE_BUCKET ?? `${projectId}.firebasestorage.app`),
)

const recorder: RecorderOptions = {
  store,
  journalDir: process.env.JOURNAL_DIR ?? path.join(here, '../data.local/journals'),
  connectSpeech: connectDeepgram({ apiKey: required('DEEPGRAM_API_KEY') }),
  onAlarm: (alarm) => log('alarm', alarm),
}
const discord = new DiscordBot({
  token: required('DISCORD_BOT_TOKEN'),
  announcementPath: path.join(here, '../assets/now-recording.ogg'),
  log,
})
const runner = new SessionRunner({ voice: discord, messages: discord, recorder })

/** Finishes or resumes whatever an earlier run of the bot left on the disk. */
async function recover(): Promise<void> {
  const recovered = await recoverSessions({ ...recorder, recording: runner.recording }, Date.now())
  for (const journal of recovered) {
    if (journal.outcome === 'resumed') {
      log('session picked up', { sessionId: journal.recorder.location.sessionId, outcome: await runner.adopt(journal.recorder) })
    } else {
      log('journal recovered', { journal: path.basename(journal.journalPath), outcome: journal.outcome })
    }
  }
}

await discord.connect()
log('connected to Discord', { as: discord.client.user.username, servers: discord.client.guilds.map((guild) => guild.name) })
await recover()
discord.serve(runner)
setInterval(() => runner.tick(), TICK_MS)
setInterval(() => void recover().catch((error: unknown) => log('recovery failed', { error: String(error) })), RECOVER_EVERY_MS)
log('ready', { project: projectId, emulators: Boolean(process.env.FIRESTORE_EMULATOR_HOST) })
