/**
 * Connecting a Discord account, run for real against a live Firestore
 * emulator: the actual connect and disconnect logic through the admin SDK, and
 * the actual security rules for what a client may then read and write.
 *
 * `functions/src/discordConnect.ts` takes its Firestore handle, its clock and
 * its way of asking Discord who someone is as arguments, so this suite can
 * drive it without importing `functions/src/index.ts` and without Discord.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { adminFirestore } from '../../../functions/src/adminApp'
import {
  DISCORD_ACCOUNTS_COLLECTION,
  DISCORD_CONNECT_STATES_COLLECTION,
  DISCORD_CONNECT_STATE_TTL_MS,
  DISCORD_LINKS_COLLECTION,
  beginDiscordConnect,
  completeDiscordConnect,
  disconnectDiscord,
  type DiscordIdentity,
} from '../../../functions/src/discordConnect'
import { emulatorPort } from '../../../vitest.emulatorEndpoint'

// The admin SDK resolves its project from GCLOUD_PROJECT, so the rules contexts
// have to share that id or the two sides would read different namespaces.
const projectId = process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev'

const NOW = 1_800_000_000_000
const jem = 'discord-connect-jem'
const peter = 'discord-connect-peter'

const jemOnDiscord: DiscordIdentity = { id: '111111111111111111', username: 'mapman', displayName: 'Jem' }
const jemsSecondAccount: DiscordIdentity = { id: '222222222222222222', username: 'mapman_alt', displayName: 'Jem (alt)' }

type AdminFirestore = ReturnType<typeof adminFirestore>

let db: AdminFirestore
let testEnv: RulesTestEnvironment

const identifyAs = (identity: DiscordIdentity) => async () => identity

/** Starts a connection for `uid` and finishes it as the given Discord account. */
async function connect(uid: string, identity: DiscordIdentity) {
  const state = await beginDiscordConnect(db, uid, NOW)
  return completeDiscordConnect(db, { state, code: 'code', nowMs: NOW, identify: identifyAs(identity) })
}

const linkOf = async (uid: string) => (await db.collection(DISCORD_LINKS_COLLECTION).doc(uid).get()).data()
const ownerOf = async (discordId: string) =>
  (await db.collection(DISCORD_ACCOUNTS_COLLECTION).doc(discordId).get()).data()?.uid as string | undefined

async function clearCollection(name: string) {
  const snap = await db.collection(name).get()
  await Promise.all(snap.docs.map((docSnap) => docSnap.ref.delete()))
}

beforeAll(async () => {
  db = adminFirestore()
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: emulatorPort('FIRESTORE_EMULATOR_HOST', 8080),
      rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
    },
  })
})

afterAll(async () => {
  await testEnv?.cleanup()
})

beforeEach(async () => {
  await Promise.all(
    [DISCORD_LINKS_COLLECTION, DISCORD_ACCOUNTS_COLLECTION, DISCORD_CONNECT_STATES_COLLECTION].map(clearCollection),
  )
})

describe('connecting a Discord account', () => {
  it('stores the permanent Discord ID against the account that started the connection', async () => {
    const result = await connect(jem, jemOnDiscord)

    expect(result).toEqual({ outcome: 'connected', uid: jem })
    expect(await linkOf(jem)).toMatchObject({ discordId: jemOnDiscord.id, username: 'mapman', displayName: 'Jem' })
    expect(await ownerOf(jemOnDiscord.id)).toBe(jem)
  })

  it('keeps the connection when the person renames themselves on Discord and connects again', async () => {
    await connect(jem, jemOnDiscord)
    const renamed = { ...jemOnDiscord, username: 'cartographer', displayName: 'Jem the Bold' }

    const result = await connect(jem, renamed)

    expect(result.outcome).toBe('connected')
    expect(await linkOf(jem)).toMatchObject({ discordId: jemOnDiscord.id, username: 'cartographer' })
    expect(await ownerOf(jemOnDiscord.id)).toBe(jem)
  })

  it('refuses a Discord account that is already connected to someone else', async () => {
    await connect(jem, jemOnDiscord)

    const result = await connect(peter, jemOnDiscord)

    expect(result.outcome).toBe('already_linked')
    expect(await linkOf(peter)).toBeUndefined()
    expect(await ownerOf(jemOnDiscord.id)).toBe(jem)
  })

  it('replaces the old Discord account when a person connects a different one, and frees the old one', async () => {
    await connect(jem, jemOnDiscord)

    await connect(jem, jemsSecondAccount)

    expect(await linkOf(jem)).toMatchObject({ discordId: jemsSecondAccount.id })
    expect(await ownerOf(jemOnDiscord.id)).toBeUndefined()
    expect((await connect(peter, jemOnDiscord)).outcome).toBe('connected')
  })

  it('accepts a connection link only once', async () => {
    const state = await beginDiscordConnect(db, jem, NOW)
    const finish = () =>
      completeDiscordConnect(db, { state, code: 'code', nowMs: NOW, identify: identifyAs(jemOnDiscord) })

    expect((await finish()).outcome).toBe('connected')
    await disconnectDiscord(db, jem)

    expect((await finish()).outcome).toBe('invalid_state')
    expect(await linkOf(jem)).toBeUndefined()
  })

  it('refuses a link this app never issued, without asking Discord anything', async () => {
    let asked = false
    const result = await completeDiscordConnect(db, {
      state: 'a-state-that-was-never-issued-by-this-app',
      code: 'code',
      nowMs: NOW,
      identify: async () => {
        asked = true
        return jemOnDiscord
      },
    })

    expect(result.outcome).toBe('invalid_state')
    expect(asked).toBe(false)
  })

  it('refuses a link that was left too long before being approved', async () => {
    const state = await beginDiscordConnect(db, jem, NOW)

    const result = await completeDiscordConnect(db, {
      state,
      code: 'code',
      nowMs: NOW + DISCORD_CONNECT_STATE_TTL_MS,
      identify: identifyAs(jemOnDiscord),
    })

    expect(result.outcome).toBe('expired')
    expect(await linkOf(jem)).toBeUndefined()
  })

  it('connects nothing when Discord cannot say who approved', async () => {
    const state = await beginDiscordConnect(db, jem, NOW)

    const result = await completeDiscordConnect(db, {
      state,
      code: 'code',
      nowMs: NOW,
      identify: async () => {
        throw new Error('Discord is down')
      },
    })

    expect(result.outcome).toBe('discord_error')
    expect(await linkOf(jem)).toBeUndefined()
  })

  it('connects the account that started the link, whoever finishes it', async () => {
    // The state, not the browser that returns from Discord, decides whose account is connected.
    const state = await beginDiscordConnect(db, jem, NOW)

    const result = await completeDiscordConnect(db, {
      state,
      code: 'code',
      nowMs: NOW,
      identify: identifyAs(jemOnDiscord),
    })

    expect(result.uid).toBe(jem)
    expect(await linkOf(peter)).toBeUndefined()
  })
})

describe('disconnecting a Discord account', () => {
  it('removes the connection and frees the Discord account', async () => {
    await connect(jem, jemOnDiscord)

    await disconnectDiscord(db, jem)

    expect(await linkOf(jem)).toBeUndefined()
    expect(await ownerOf(jemOnDiscord.id)).toBeUndefined()
  })

  it('does nothing for someone who was never connected', async () => {
    await expect(disconnectDiscord(db, peter)).resolves.toBeUndefined()
  })
})

describe('what a client may do with Discord connections', () => {
  beforeEach(async () => {
    await connect(jem, jemOnDiscord)
  })

  const as = (uid: string) => testEnv.authenticatedContext(uid).firestore()

  it('lets a person read their own connection', async () => {
    const snap = await assertSucceeds(getDoc(doc(as(jem), DISCORD_LINKS_COLLECTION, jem)))
    expect(snap.data()?.discordId).toBe(jemOnDiscord.id)
  })

  it("does not let a person read someone else's connection", async () => {
    await assertFails(getDoc(doc(as(peter), DISCORD_LINKS_COLLECTION, jem)))
  })

  it('does not let a person write a Discord ID onto their own account', async () => {
    await assertFails(setDoc(doc(as(peter), DISCORD_LINKS_COLLECTION, peter), { discordId: jemOnDiscord.id }))
    await assertFails(setDoc(doc(as(jem), DISCORD_LINKS_COLLECTION, jem), { discordId: jemsSecondAccount.id }))
  })

  it('does not let a person delete their connection except through the app', async () => {
    await assertFails(deleteDoc(doc(as(jem), DISCORD_LINKS_COLLECTION, jem)))
  })

  it('keeps the reverse index and connections in progress out of reach', async () => {
    const state = await beginDiscordConnect(db, peter, NOW)

    await assertFails(getDoc(doc(as(jem), DISCORD_ACCOUNTS_COLLECTION, jemOnDiscord.id)))
    await assertFails(setDoc(doc(as(peter), DISCORD_ACCOUNTS_COLLECTION, jemOnDiscord.id), { uid: peter }))
    await assertFails(getDoc(doc(as(peter), DISCORD_CONNECT_STATES_COLLECTION, state)))
    await assertFails(setDoc(doc(as(peter), DISCORD_CONNECT_STATES_COLLECTION, 'x'.repeat(40)), { uid: jem }))
  })
})
