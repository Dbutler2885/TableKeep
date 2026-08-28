/**
 * The demo sandbox lifecycle, run for real: the actual clone and the actual
 * expiry sweep, through the admin SDK, against a live Firestore emulator.
 *
 * `functions/src/demoSessions.ts` takes its Firestore handle, its clock and its
 * storage deleter as arguments precisely so this suite can drive it without
 * importing `functions/src/index.ts` - which registers HTTP triggers - and
 * without racing the one other suite that does.
 *
 * The admin SDK finds the emulator through `FIRESTORE_EMULATOR_HOST` and its
 * project through `GCLOUD_PROJECT`, both exported by `firebase emulators:exec`.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { adminFirestore } from '../../../functions/src/adminApp'
import { createDemoSandbox, sweepExpiredDemoSandboxes } from '../../../functions/src/demoSessions'
import {
  DEMO_MAX_LIVE_SANDBOXES,
  DEMO_SESSIONS_COLLECTION,
  DEMO_TEMPLATE_CAMPAIGN_ID,
  DEMO_TEMPLATE_GROUP_ID,
} from '../../../functions/src/demoConstants'
import { demoSessionExpiresAtMs } from '../../../functions/src/demoClone'

const MAP_ID = 'brandonsford'
const CHARACTER_ID = 'ordo'
const NOW = 1_800_000_000_000

const templateMapObject = `groups/${DEMO_TEMPLATE_GROUP_ID}/campaigns/${DEMO_TEMPLATE_CAMPAIGN_ID}/maps/${MAP_ID}`
const templatePortrait = `groups/${DEMO_TEMPLATE_GROUP_ID}/campaigns/${DEMO_TEMPLATE_CAMPAIGN_ID}/characters/${CHARACTER_ID}/portraits/1-ordo.webp`

// `firebase-admin` resolves out of `functions/node_modules`, which a module
// under `src/` cannot reach, so the handle and its type both come from the Cloud
// Functions package. Timestamps go in as plain `Date`s for the same reason: the
// admin SDK converts them on the way through.
type AdminFirestore = ReturnType<typeof adminFirestore>
type AdminTimestamp = { toMillis: () => number }

let db: AdminFirestore

/** Records the prefixes the sweep asked Cloud Storage to clear. */
function storageDeleterSpy() {
  const prefixes: string[] = []
  return {
    prefixes,
    delete: async (prefix: string) => {
      prefixes.push(prefix)
    },
  }
}

const templateCampaign = () =>
  db.collection('groups').doc(DEMO_TEMPLATE_GROUP_ID).collection('campaigns').doc(DEMO_TEMPLATE_CAMPAIGN_ID)

async function seedTemplate() {
  await db.collection('groups').doc(DEMO_TEMPLATE_GROUP_ID).set({
    name: 'The Knight Errants',
    activeCampaignId: DEMO_TEMPLATE_CAMPAIGN_ID,
  })
  await templateCampaign().set({
    name: 'The Black Wyrm of Brandonsford',
    system: 'ose',
    status: 'draft',
    gmUserId: 'template-owner',
    createdBy: 'template-owner',
    enabledTabs: ['character', 'maps', 'npcs'],
  })
  await templateCampaign().collection('maps').doc(MAP_ID).set({
    name: 'Brandonsford',
    imagePath: templateMapObject,
    fogImagePath: `${templateMapObject}/fog/1.png`,
    visibleToPlayers: true,
  })
  await templateCampaign().collection('maps').doc(MAP_ID).collection('tokens').doc('t1').set({ x: 4, y: 9 })
  await templateCampaign().collection('characters').doc(CHARACTER_ID).set({
    name: 'Ordo',
    ownerUserId: 'template-player-2',
    ownerUsername: 'Marisol',
    portraitPath: templatePortrait,
  })
  await templateCampaign().collection('npcs').doc('gill').set({ name: 'Farmer Gill', visibleToPlayers: true })
  await templateCampaign().collection('npcPrivate').doc('gill').set({ gmNotes: 'Knows the ford.' })
  await templateCampaign().collection('items').doc('sword').set({ name: 'Sword' })
  await templateCampaign().collection('tables').doc('wandering').set({ name: 'Wandering' })
  await templateCampaign().collection('tables').doc('wandering').collection('history').doc('h1').set({ roll: 7 })
  await templateCampaign().collection('sessionSummaries').doc('s1').set({ title: 'Session 1' })
  await templateCampaign().collection('sharedNotes').doc('n1').set({ body: 'The bridge is out.' })

  // Per-user scratch and in-flight requests that a clone must NOT carry over.
  await templateCampaign().collection('userState').doc('template-player-2').set({ currentCharacterId: CHARACTER_ID })
  await templateCampaign().collection('pendingTransfers').doc('p1').set({ itemName: 'Sword' })
}

async function wipe() {
  for (const groupSnap of (await db.collection('groups').get()).docs) {
    await db.recursiveDelete(groupSnap.ref)
  }
  for (const sessionSnap of (await db.collection(DEMO_SESSIONS_COLLECTION).get()).docs) {
    await sessionSnap.ref.delete()
  }
}

beforeAll(() => {
  db = adminFirestore()
})

beforeEach(async () => {
  await wipe()
  await seedTemplate()
})

afterEach(wipe)

describe('handing a visitor a sandbox', () => {
  it('copies the campaign, keeps every document id, and hands it over as GM', async () => {
    const result = await createDemoSandbox(db, 'visitor-1', NOW)
    expect(result.status).toBe('created')
    if (result.status !== 'created') return

    const { groupId, campaignId } = result.sandbox
    const campaign = db.collection('groups').doc(groupId).collection('campaigns').doc(campaignId)

    const group = await db.collection('groups').doc(groupId).get()
    expect(group.data()).toMatchObject({
      name: 'The Knight Errants',
      activeCampaignId: campaignId,
      isDemoSandbox: true,
      demoOwnerUid: 'visitor-1',
    })

    const membership = await db.collection('groups').doc(groupId).collection('members').doc('visitor-1').get()
    expect(membership.data()).toMatchObject({ userId: 'visitor-1', role: 'admin', status: 'active' })

    expect((await campaign.get()).data()).toMatchObject({
      name: 'The Black Wyrm of Brandonsford',
      system: 'ose',
      enabledTabs: ['character', 'maps', 'npcs'],
      status: 'active',
      gmUserId: 'visitor-1',
      groupId,
    })

    // The content, under the template's own ids.
    expect((await campaign.collection('maps').get()).docs.map((d) => d.id)).toEqual([MAP_ID])
    expect((await campaign.collection('maps').doc(MAP_ID).collection('tokens').get()).docs.map((d) => d.id)).toEqual(['t1'])
    expect((await campaign.collection('characters').get()).docs.map((d) => d.id)).toEqual([CHARACTER_ID])
    expect((await campaign.collection('npcs').get()).docs.map((d) => d.id)).toEqual(['gill'])
    expect((await campaign.collection('npcPrivate').get()).docs.map((d) => d.id)).toEqual(['gill'])
    expect((await campaign.collection('items').get()).docs.map((d) => d.id)).toEqual(['sword'])
    expect((await campaign.collection('tables').doc('wandering').collection('history').get()).docs.map((d) => d.id)).toEqual(['h1'])
    expect((await campaign.collection('sessionSummaries').get()).docs.map((d) => d.id)).toEqual(['s1'])
    expect((await campaign.collection('sharedNotes').get()).docs.map((d) => d.id)).toEqual(['n1'])
  })

  it('points the clone at the shared images rather than copies of them', async () => {
    const result = await createDemoSandbox(db, 'visitor-1', NOW)
    if (result.status !== 'created') throw new Error(`expected a sandbox, got ${result.status}`)
    const campaign = db
      .collection('groups')
      .doc(result.sandbox.groupId)
      .collection('campaigns')
      .doc(result.sandbox.campaignId)

    const map = await campaign.collection('maps').doc(MAP_ID).get()
    const character = await campaign.collection('characters').doc(CHARACTER_ID).get()

    expect(map.data()?.imagePath).toBe(templateMapObject)
    expect(map.data()?.fogImagePath).toBe(`${templateMapObject}/fog/1.png`)
    expect(character.data()?.portraitPath).toBe(templatePortrait)
    // Which is to say: nothing under the clone's own storage prefix yet. The
    // first object there is the fog the visitor paints, which `useFogTools`
    // writes to a path built from the campaign they are currently in.
    expect(map.data()?.imagePath.startsWith(`groups/${result.sandbox.groupId}/`)).toBe(false)
  })

  it('leaves per-user scratch and in-flight transfers behind', async () => {
    const result = await createDemoSandbox(db, 'visitor-1', NOW)
    if (result.status !== 'created') throw new Error(`expected a sandbox, got ${result.status}`)
    const campaign = db
      .collection('groups')
      .doc(result.sandbox.groupId)
      .collection('campaigns')
      .doc(result.sandbox.campaignId)

    expect((await campaign.collection('userState').get()).empty).toBe(true)
    expect((await campaign.collection('pendingTransfers').get()).empty).toBe(true)
  })

  it('does not touch the template', async () => {
    await createDemoSandbox(db, 'visitor-1', NOW)

    expect((await templateCampaign().get()).data()).toMatchObject({
      status: 'draft',
      gmUserId: 'template-owner',
    })
    expect((await templateCampaign().collection('maps').doc(MAP_ID).get()).data()?.imagePath).toBe(templateMapObject)
  })

  it('registers the sandbox with an expiry one lifetime out', async () => {
    const result = await createDemoSandbox(db, 'visitor-1', NOW)
    if (result.status !== 'created') throw new Error(`expected a sandbox, got ${result.status}`)

    const session = await db.collection(DEMO_SESSIONS_COLLECTION).doc('visitor-1').get()
    expect(session.data()?.groupId).toBe(result.sandbox.groupId)
    expect((session.data()?.expiresAt as AdminTimestamp).toMillis()).toBe(demoSessionExpiresAtMs(NOW))
    expect(result.sandbox.expiresAtMs).toBe(demoSessionExpiresAtMs(NOW))
  })
})

describe('one sandbox per visitor', () => {
  it('resumes the sandbox a returning visitor already has', async () => {
    const first = await createDemoSandbox(db, 'visitor-1', NOW)
    const second = await createDemoSandbox(db, 'visitor-1', NOW + 60_000)

    expect(second.status).toBe('resumed')
    if (first.status !== 'created' || second.status !== 'resumed') return
    expect(second.sandbox.groupId).toBe(first.sandbox.groupId)
    expect(second.sandbox.campaignId).toBe(first.sandbox.campaignId)
    expect((await db.collection('groups').get()).docs.filter((d) => d.data().isDemoSandbox)).toHaveLength(1)
  })

  it('gives a visitor a fresh one once theirs has been swept', async () => {
    const first = await createDemoSandbox(db, 'visitor-1', NOW)
    if (first.status !== 'created') throw new Error('expected a sandbox')
    const spy = storageDeleterSpy()
    await sweepExpiredDemoSandboxes(db, spy.delete, demoSessionExpiresAtMs(NOW) + 1)

    const second = await createDemoSandbox(db, 'visitor-1', demoSessionExpiresAtMs(NOW) + 2)

    expect(second.status).toBe('created')
    if (second.status !== 'created') return
    expect(second.sandbox.groupId).not.toBe(first.sandbox.groupId)
  })
})

describe('the ceiling', () => {
  it('turns a visitor away once the live sandboxes are all taken', async () => {
    const batch = db.batch()
    for (let index = 0; index < DEMO_MAX_LIVE_SANDBOXES; index += 1) {
      batch.set(db.collection(DEMO_SESSIONS_COLLECTION).doc(`filler-${index}`), {
        uid: `filler-${index}`,
        groupId: `filler-group-${index}`,
        campaignId: 'c',
        createdAt: new Date(NOW),
        expiresAt: new Date(demoSessionExpiresAtMs(NOW)),
      })
    }
    await batch.commit()

    const result = await createDemoSandbox(db, 'visitor-1', NOW)

    expect(result).toEqual({
      status: 'full',
      liveSandboxes: DEMO_MAX_LIVE_SANDBOXES,
      limit: DEMO_MAX_LIVE_SANDBOXES,
    })
    expect((await db.collection(DEMO_SESSIONS_COLLECTION).doc('visitor-1').get()).exists).toBe(false)
  })

  it('counts sandboxes that are still live, not rows the sweep has not reached', async () => {
    const batch = db.batch()
    for (let index = 0; index < DEMO_MAX_LIVE_SANDBOXES; index += 1) {
      batch.set(db.collection(DEMO_SESSIONS_COLLECTION).doc(`stale-${index}`), {
        uid: `stale-${index}`,
        groupId: `stale-group-${index}`,
        campaignId: 'c',
        createdAt: new Date(NOW - 10_000_000),
        expiresAt: new Date(NOW - 1),
      })
    }
    await batch.commit()

    const result = await createDemoSandbox(db, 'visitor-1', NOW)

    expect(result.status).toBe('created')
  })

  it('reports a missing template rather than handing out an empty sandbox', async () => {
    await db.recursiveDelete(db.collection('groups').doc(DEMO_TEMPLATE_GROUP_ID))

    expect(await createDemoSandbox(db, 'visitor-1', NOW)).toEqual({ status: 'template-missing' })
  })
})

describe('expiry', () => {
  it('deletes an expired sandbox whole, documents and storage', async () => {
    const expired = await createDemoSandbox(db, 'visitor-1', NOW)
    if (expired.status !== 'created') throw new Error('expected a sandbox')
    const spy = storageDeleterSpy()

    const { removedGroupIds } = await sweepExpiredDemoSandboxes(db, spy.delete, demoSessionExpiresAtMs(NOW) + 1)

    expect(removedGroupIds).toEqual([expired.sandbox.groupId])
    expect(spy.prefixes).toEqual([`groups/${expired.sandbox.groupId}/`])
    expect((await db.collection('groups').doc(expired.sandbox.groupId).get()).exists).toBe(false)
    expect((await db.collection(DEMO_SESSIONS_COLLECTION).doc('visitor-1').get()).exists).toBe(false)
    // Recursive: the campaign and its subcollections went too.
    const orphans = await db
      .collection('groups')
      .doc(expired.sandbox.groupId)
      .collection('campaigns')
      .doc(expired.sandbox.campaignId)
      .collection('maps')
      .get()
    expect(orphans.empty).toBe(true)
  })

  it('leaves a sandbox that is still live alone', async () => {
    const live = await createDemoSandbox(db, 'visitor-live', NOW)
    if (live.status !== 'created') throw new Error('expected a sandbox')
    const spy = storageDeleterSpy()

    const { removedGroupIds } = await sweepExpiredDemoSandboxes(db, spy.delete, NOW + 60_000)

    expect(removedGroupIds).toEqual([])
    expect(spy.prefixes).toEqual([])
    expect((await db.collection('groups').doc(live.sandbox.groupId).get()).exists).toBe(true)
  })

  it('leaves the template and a real user\'s group alone', async () => {
    await db.collection('groups').doc('someones-real-group').set({ name: 'Real' })
    await db.collection('groups').doc('someones-real-group').collection('campaigns').doc('c').set({ name: 'Real' })
    await createDemoSandbox(db, 'visitor-1', NOW)
    const spy = storageDeleterSpy()

    await sweepExpiredDemoSandboxes(db, spy.delete, demoSessionExpiresAtMs(NOW) + 1)

    expect((await db.collection('groups').doc(DEMO_TEMPLATE_GROUP_ID).get()).exists).toBe(true)
    expect((await templateCampaign().collection('maps').get()).docs.map((d) => d.id)).toEqual([MAP_ID])
    expect((await db.collection('groups').doc('someones-real-group').get()).exists).toBe(true)
    expect(spy.prefixes).not.toContain('groups/someones-real-group/')
    expect(spy.prefixes).not.toContain(`groups/${DEMO_TEMPLATE_GROUP_ID}/`)
  })

  it('only ever clears storage under the sandbox it is deleting', async () => {
    const first = await createDemoSandbox(db, 'visitor-1', NOW)
    const second = await createDemoSandbox(db, 'visitor-2', NOW + 1)
    if (first.status !== 'created' || second.status !== 'created') throw new Error('expected sandboxes')
    const spy = storageDeleterSpy()

    await sweepExpiredDemoSandboxes(db, spy.delete, demoSessionExpiresAtMs(NOW + 1) + 1)

    expect(spy.prefixes.sort()).toEqual([
      `groups/${first.sandbox.groupId}/`,
      `groups/${second.sandbox.groupId}/`,
    ].sort())
  })
})
