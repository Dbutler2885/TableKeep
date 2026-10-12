/**
 * The bot process.
 *
 *   node --env-file-if-exists=.env.local src/main.ts
 *
 * Needs DISCORD_BOT_TOKEN and DEEPGRAM_API_KEY, from the environment or, on
 * the server, from the project's secrets.
 *
 * It writes to the emulators, and refuses to start without them. Only the
 * deployed bot writes to the real project, and it says so with
 * TABLEKEEP_WRITE_LIVE=yes: nothing run from a checkout can do it by accident.
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

const projectId = process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev'
const usingEmulators = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST)
const live = process.env.TABLEKEEP_WRITE_LIVE === 'yes'
if (usingEmulators === live) {
  throw new Error(
    usingEmulators
      ? 'TABLEKEEP_WRITE_LIVE is set while the emulators are too. Choose one.'
      : 'The emulators are not running, or FIRESTORE_EMULATOR_HOST and FIREBASE_STORAGE_EMULATOR_HOST are not set. The bot only writes to the real project when deployed.',
  )
}

/** Reads a secret from the project, as the server's own identity. */
async function projectSecret(name: string): Promise<string> {
  const metadata = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token'
  const token = (await (await fetch(metadata, { headers: { 'Metadata-Flavor': 'Google' } })).json()) as { access_token: string }
  const url = `https://secretmanager.googleapis.com/v1/projects/${projectId}/secrets/${name}/versions/latest:access`
  const response = await fetch(url, { headers: { authorization: `Bearer ${token.access_token}` } })
  if (!response.ok) throw new Error(`Could not read the secret ${name} (${response.status}).`)
  const body = (await response.json()) as { payload: { data: string } }
  return Buffer.from(body.payload.data, 'base64').toString('utf8').trim()
}

async function required(name: string): Promise<string> {
  const value = process.env[name] ?? (live ? await projectSecret(name) : '')
  if (!value) throw new Error(`${name} is not set.`)
  return value
}

const log = (message: string, detail: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), message, ...detail }))

const here = path.dirname(fileURLToPath(import.meta.url))
const app = initializeApp({ projectId })
const store = new FirestoreSessionStore(
  getFirestore(app),
  getStorage(app).bucket(process.env.STORAGE_BUCKET ?? `${projectId}.firebasestorage.app`),
)

const recorder: RecorderOptions = {
  store,
  journalDir: process.env.JOURNAL_DIR ?? path.join(here, '../data.local/journals'),
  connectSpeech: connectDeepgram({ apiKey: await required('DEEPGRAM_API_KEY') }),
  onAlarm: (alarm) => log('alarm', alarm),
}
const discord = new DiscordBot({
  token: await required('DISCORD_BOT_TOKEN'),
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
log('ready', { project: projectId, writing: live ? 'the real project' : 'the emulators' })
