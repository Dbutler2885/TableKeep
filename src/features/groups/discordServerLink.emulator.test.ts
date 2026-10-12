/**
 * Linking a Discord server to a group, run for real against a live Firestore
 * emulator: the actual link and unlink logic through the admin SDK, and the
 * actual security rules for what a client may then read and write.
 *
 * `functions/src/discordServerLink.ts` takes its Firestore handle, its clock
 * and its way of asking Discord which server was chosen as arguments, so this
 * suite can drive it without importing `functions/src/index.ts` and without
 * Discord.
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
  DISCORD_CONNECT_STATES_COLLECTION,
  DISCORD_CONNECT_STATE_TTL_MS,
  beginDiscordConnect,
  completeDiscordConnect,
} from '../../../functions/src/discordConnect'
import {
  DISCORD_SERVERS_COLLECTION,
  beginDiscordServerLink,
  completeDiscordServerLink,
  unlinkDiscordServer,
  type DiscordServer,
} from '../../../functions/src/discordServerLink'
import { emulatorPort } from '../../../vitest.emulatorEndpoint'

// The admin SDK resolves its project from GCLOUD_PROJECT, so the rules contexts
// have to share that id or the two sides would read different namespaces.
const projectId = process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev'

const NOW = 1_800_000_000_000
const homeBoys = 'server-link-home-boys'
const ogGroup = 'server-link-og-group'
const gm = 'server-link-gm'
const player = 'server-link-player'
const otherGm = 'server-link-other-gm'
const outsider = 'server-link-outsider'

const tavern: DiscordServer = { id: '900000000000000001', name: 'The Tavern' }
const cellar: DiscordServer = { id: '900000000000000002', name: 'The Cellar' }

type AdminFirestore = ReturnType<typeof adminFirestore>

let db: AdminFirestore
let testEnv: RulesTestEnvironment

const integration = (groupId: string) => db.collection('groups').doc(groupId).collection('integrations').doc('discord')
const linkedServerOf = async (groupId: string) => (await integration(groupId).get()).data()
const groupOf = async (server: DiscordServer) =>
  (await db.collection(DISCORD_SERVERS_COLLECTION).doc(server.id).get()).data()?.groupId as string | undefined

async function seedGroup(groupId: string, admin: string, members: string[] = []) {
  await db.collection('groups').doc(groupId).set({ name: groupId, createdBy: admin })
  await db.collection('groups').doc(groupId).collection('members').doc(admin).set({ userId: admin, role: 'admin', status: 'active' })
  for (const member of members) {
    await db.collection('groups').doc(groupId).collection('members').doc(member).set({ userId: member, role: 'member', status: 'active' })
  }
}

/** Starts a link as `uid` for `groupId` and finishes it as though they chose `server` on Discord. */
async function link(uid: string, groupId: string, server: DiscordServer) {
  const state = await beginDiscordServerLink(db, { uid, groupId }, NOW)
  if (!state) return { outcome: 'refused_to_start' as const }
  return completeDiscordServerLink(db, { state, code: 'code', nowMs: NOW, resolveServer: async () => server })
}

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
  await Promise.all([DISCORD_SERVERS_COLLECTION, DISCORD_CONNECT_STATES_COLLECTION].map(clearCollection))
  for (const groupId of [homeBoys, ogGroup]) await db.recursiveDelete(db.collection('groups').doc(groupId))
  await seedGroup(homeBoys, gm, [player])
  await seedGroup(ogGroup, otherGm)
})

describe('linking a Discord server to a group', () => {
  it('records the server against the group, findable from either side', async () => {
    const result = await link(gm, homeBoys, tavern)

    expect(result).toEqual({ outcome: 'server_linked', groupId: homeBoys })
    expect(await linkedServerOf(homeBoys)).toMatchObject({ guildId: tavern.id, guildName: 'The Tavern', linkedBy: gm })
    expect(await groupOf(tavern)).toBe(homeBoys)
  })

  it('does not let someone who is not an admin of the group start a link', async () => {
    expect(await beginDiscordServerLink(db, { uid: player, groupId: homeBoys }, NOW)).toBeNull()
    expect(await beginDiscordServerLink(db, { uid: outsider, groupId: homeBoys }, NOW)).toBeNull()
    expect(await beginDiscordServerLink(db, { uid: otherGm, groupId: homeBoys }, NOW)).toBeNull()
  })

  it('refuses a server that is already linked to a different group', async () => {
    await link(gm, homeBoys, tavern)

    const result = await link(otherGm, ogGroup, tavern)

    expect(result.outcome).toBe('server_taken')
    expect(await groupOf(tavern)).toBe(homeBoys)
    expect(await linkedServerOf(ogGroup)).toBeUndefined()
  })

  it('lets a server be linked again once the group that held it has been deleted', async () => {
    await link(gm, homeBoys, tavern)
    await db.recursiveDelete(db.collection('groups').doc(homeBoys))

    const result = await link(otherGm, ogGroup, tavern)

    expect(result.outcome).toBe('server_linked')
    expect(await groupOf(tavern)).toBe(ogGroup)
  })

  it('replaces the old server when a group links a different one, and frees the old one', async () => {
    await link(gm, homeBoys, tavern)

    await link(gm, homeBoys, cellar)

    expect(await linkedServerOf(homeBoys)).toMatchObject({ guildId: cellar.id })
    expect(await groupOf(tavern)).toBeUndefined()
    expect((await link(otherGm, ogGroup, tavern)).outcome).toBe('server_linked')
  })

  it('links nothing if the person stopped being an admin before they came back from Discord', async () => {
    const state = await beginDiscordServerLink(db, { uid: gm, groupId: homeBoys }, NOW)
    await db.collection('groups').doc(homeBoys).collection('members').doc(gm).update({ role: 'member' })

    const result = await completeDiscordServerLink(db, {
      state: state!,
      code: 'code',
      nowMs: NOW,
      resolveServer: async () => tavern,
    })

    expect(result.outcome).toBe('not_group_admin')
    expect(await groupOf(tavern)).toBeUndefined()
  })

  it('accepts a link only once', async () => {
    const state = await beginDiscordServerLink(db, { uid: gm, groupId: homeBoys }, NOW)
    const finish = (server: DiscordServer) =>
      completeDiscordServerLink(db, { state: state!, code: 'code', nowMs: NOW, resolveServer: async () => server })

    expect((await finish(tavern)).outcome).toBe('server_linked')
    expect((await finish(cellar)).outcome).toBe('invalid_state')
    expect(await linkedServerOf(homeBoys)).toMatchObject({ guildId: tavern.id })
  })

  it('refuses a link that was left too long before being approved', async () => {
    const state = await beginDiscordServerLink(db, { uid: gm, groupId: homeBoys }, NOW)

    const result = await completeDiscordServerLink(db, {
      state: state!,
      code: 'code',
      nowMs: NOW + DISCORD_CONNECT_STATE_TTL_MS,
      resolveServer: async () => tavern,
    })

    expect(result.outcome).toBe('expired')
    expect(await groupOf(tavern)).toBeUndefined()
  })

  it('links nothing when Discord does not say which server was chosen', async () => {
    const state = await beginDiscordServerLink(db, { uid: gm, groupId: homeBoys }, NOW)

    const result = await completeDiscordServerLink(db, {
      state: state!,
      code: 'code',
      nowMs: NOW,
      resolveServer: async () => {
        throw new Error('no guild in the answer')
      },
    })

    expect(result.outcome).toBe('discord_error')
    expect(await linkedServerOf(homeBoys)).toBeUndefined()
  })

  it('does not accept an account-connection link as a server link, or the other way round', async () => {
    const accountState = await beginDiscordConnect(db, gm, NOW)
    const serverState = await beginDiscordServerLink(db, { uid: gm, groupId: homeBoys }, NOW)

    const asServer = await completeDiscordServerLink(db, {
      state: accountState,
      code: 'code',
      nowMs: NOW,
      resolveServer: async () => tavern,
    })
    const asAccount = await completeDiscordConnect(db, {
      state: serverState!,
      code: 'code',
      nowMs: NOW,
      identify: async () => ({ id: '1', username: 'gm', displayName: 'GM' }),
    })

    expect(asServer.outcome).toBe('invalid_state')
    expect(asAccount.outcome).toBe('invalid_state')
    expect(await groupOf(tavern)).toBeUndefined()
  })
})

describe('unlinking a Discord server', () => {
  it('removes the link from both sides', async () => {
    await link(gm, homeBoys, tavern)

    await unlinkDiscordServer(db, homeBoys)

    expect(await linkedServerOf(homeBoys)).toBeUndefined()
    expect(await groupOf(tavern)).toBeUndefined()
  })

  it('does nothing for a group with no server linked', async () => {
    await expect(unlinkDiscordServer(db, ogGroup)).resolves.toBeUndefined()
  })
})

describe('what a client may do with a server link', () => {
  beforeEach(async () => {
    await link(gm, homeBoys, tavern)
  })

  const as = (uid: string) => testEnv.authenticatedContext(uid).firestore()
  const integrationDoc = (uid: string, groupId: string) => doc(as(uid), 'groups', groupId, 'integrations', 'discord')

  it('lets any member of the group see which server is linked', async () => {
    const snap = await assertSucceeds(getDoc(integrationDoc(player, homeBoys)))
    expect(snap.data()?.guildName).toBe('The Tavern')
  })

  it('does not let someone outside the group see it', async () => {
    await assertFails(getDoc(integrationDoc(outsider, homeBoys)))
    await assertFails(getDoc(integrationDoc(otherGm, homeBoys)))
  })

  it('does not let even the group admin write or remove the link directly', async () => {
    await assertFails(setDoc(integrationDoc(gm, homeBoys), { guildId: cellar.id }))
    await assertFails(deleteDoc(integrationDoc(gm, homeBoys)))
    await assertFails(setDoc(integrationDoc(otherGm, ogGroup), { guildId: tavern.id }))
  })

  it('keeps the server index out of reach', async () => {
    await assertFails(getDoc(doc(as(gm), DISCORD_SERVERS_COLLECTION, tavern.id)))
    await assertFails(setDoc(doc(as(otherGm), DISCORD_SERVERS_COLLECTION, tavern.id), { groupId: ogGroup }))
  })
})
