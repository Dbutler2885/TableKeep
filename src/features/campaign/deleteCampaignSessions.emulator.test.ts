/**
 * Deleting a campaign's recorded sessions, run for real: the actual cleanup
 * through the admin SDK against a live Firestore emulator.
 *
 * `functions/src/campaignSessions.ts` takes its Firestore handle and its
 * storage deleter as arguments, so this suite can drive it without importing
 * `functions/src/index.ts`, which registers triggers.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { adminFirestore } from '../../../functions/src/adminApp'
import { deleteCampaignSessions } from '../../../functions/src/campaignSessions'

const groupId = 'delete-sessions-group'
const doomed = 'delete-sessions-doomed'
const kept = 'delete-sessions-kept'

type AdminFirestore = ReturnType<typeof adminFirestore>
let db: AdminFirestore

/** Records the prefixes the cleanup asked Cloud Storage to clear. */
function storageDeleterSpy() {
  const prefixes: string[] = []
  return {
    prefixes,
    delete: async (prefix: string) => {
      prefixes.push(prefix)
    },
  }
}

const campaign = (campaignId: string) => db.collection('groups').doc(groupId).collection('campaigns').doc(campaignId)

/** A campaign with one recorded session, as the session bot leaves it. */
async function seedSession(campaignId: string) {
  const session = campaign(campaignId).collection('sessions').doc('s1')
  await campaign(campaignId).set({ name: campaignId })
  await campaign(campaignId).collection('sessionCounters').doc('sessions').set({ last: 1 })
  await session.set({ number: 1, state: 'ended' })
  await session.collection('speakers').doc('111').set({ displayName: 'Jem' })
  await session.collection('segments').doc('111-000-000000048000').set({ startSamples: 48_000 })
  await session.collection('gaps').doc('000000096000').set({ reason: 'not-connected' })
  await session.collection('transcripts').doc('live').collection('utterances').doc('u1').set({ text: 'I search the room.' })
  await session.collection('transcripts').doc('live').collection('checkpoints').doc('111').set({ samples: 96_000 })
  await campaign(campaignId).collection('sessionSummaries').doc('sum1').set({ title: 'Session 1' })
}

async function countUnder(campaignId: string, ...path: string[]) {
  let ref: FirebaseFirestore.CollectionReference | FirebaseFirestore.DocumentReference = campaign(campaignId)
  for (const [index, segment] of path.entries()) {
    ref = index % 2 === 0 ? (ref as FirebaseFirestore.DocumentReference).collection(segment) : (ref as FirebaseFirestore.CollectionReference).doc(segment)
  }
  return (await (ref as FirebaseFirestore.CollectionReference).get()).size
}

beforeAll(() => {
  db = adminFirestore()
})

beforeEach(async () => {
  await db.recursiveDelete(db.collection('groups').doc(groupId))
  await db.collection('discordServers').doc('delete-sessions-server').delete()
  await seedSession(doomed)
  await seedSession(kept)
})

describe('clearing a deleted campaign\'s sessions', () => {
  it('removes its sessions with everything under them, and its numbering', async () => {
    await deleteCampaignSessions(db, storageDeleterSpy().delete, groupId, doomed)

    expect(await countUnder(doomed, 'sessions')).toBe(0)
    expect(await countUnder(doomed, 'sessions', 's1', 'speakers')).toBe(0)
    expect(await countUnder(doomed, 'sessions', 's1', 'segments')).toBe(0)
    expect(await countUnder(doomed, 'sessions', 's1', 'gaps')).toBe(0)
    expect(await countUnder(doomed, 'sessions', 's1', 'transcripts', 'live', 'utterances')).toBe(0)
    expect(await countUnder(doomed, 'sessions', 's1', 'transcripts', 'live', 'checkpoints')).toBe(0)
    expect(await countUnder(doomed, 'sessionCounters')).toBe(0)
  })

  it('asks storage to clear that campaign\'s session audio and nothing wider', async () => {
    const storage = storageDeleterSpy()

    await deleteCampaignSessions(db, storage.delete, groupId, doomed)

    expect(storage.prefixes).toEqual([`groups/${groupId}/campaigns/${doomed}/sessions/`])
  })

  it('leaves another campaign in the same group untouched', async () => {
    await deleteCampaignSessions(db, storageDeleterSpy().delete, groupId, doomed)

    expect(await countUnder(kept, 'sessions')).toBe(1)
    expect(await countUnder(kept, 'sessions', 's1', 'transcripts', 'live', 'utterances')).toBe(1)
    expect(await countUnder(kept, 'sessionCounters')).toBe(1)
  })

  it('leaves what the app itself deletes to the app', async () => {
    await deleteCampaignSessions(db, storageDeleterSpy().delete, groupId, doomed)

    expect(await countUnder(doomed, 'sessionSummaries')).toBe(1)
  })

  it('frees a Discord server that was recording into the campaign', async () => {
    const server = db.collection('discordServers').doc('delete-sessions-server')
    await server.set({ groupId, activeSession: { groupId, campaignId: doomed, sessionId: 's1' } })

    await deleteCampaignSessions(db, storageDeleterSpy().delete, groupId, doomed)

    expect((await server.get()).data()).toEqual({ groupId, activeSession: null })
  })

  it('leaves a server recording into a different campaign alone', async () => {
    const server = db.collection('discordServers').doc('delete-sessions-server')
    await server.set({ groupId, activeSession: { groupId, campaignId: kept, sessionId: 's1' } })

    await deleteCampaignSessions(db, storageDeleterSpy().delete, groupId, doomed)

    expect((await server.get()).data()?.activeSession?.campaignId).toBe(kept)
  })
})
