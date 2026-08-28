/**
 * The guard rails around the try-it-now demo, against the repo's real
 * `firestore.rules` and `storage.rules`.
 *
 * This is the part of the feature that is worth being paranoid about. A demo
 * visitor is an anonymous account the internet hands out for free, so every
 * "they cannot reach that" claim in the design is a claim about these two files
 * and nothing else - not about which screens the app renders, and not about
 * which paths the client happens to build.
 *
 * Storage Rules resolve their `firestore.get()` lookups against the project the
 * emulator was started with, so this suite uses `GCLOUD_PROJECT` like the other
 * storage-touching suites (see AGENTS.md).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { getBytes, ref, uploadBytes } from 'firebase/storage'
import type { FirebaseStorage } from 'firebase/storage'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { DEMO_TEMPLATE_CAMPAIGN_ID, DEMO_TEMPLATE_GROUP_ID } from './demoConstants'

const projectId = process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev'

/**
 * `firebase emulators:exec` exports the emulator hosts it started, so a second
 * emulator suite running on shifted ports needs no edits here.
 */
function emulatorHost(variable: string, fallbackPort: number) {
  const [host, port] = (process.env[variable] ?? `127.0.0.1:${fallbackPort}`).replace(/^https?:\/\//, '').split(':')
  return { host, port: Number(port) }
}

const VISITOR_A = 'demo-visitor-a'
const VISITOR_B = 'demo-visitor-b'
const REAL_USER = 'real-user-uid'

const SANDBOX_A = 'sandbox-group-a'
const CAMPAIGN_A = 'sandbox-campaign-a'
const SANDBOX_B = 'sandbox-group-b'
const CAMPAIGN_B = 'sandbox-campaign-b'
const REAL_GROUP = 'real-group'
const REAL_CAMPAIGN = 'real-campaign'
const MAP_ID = 'shared-map'
const CHARACTER_ID = 'shared-character'

const templateMapObject = `groups/${DEMO_TEMPLATE_GROUP_ID}/campaigns/${DEMO_TEMPLATE_CAMPAIGN_ID}/maps/${MAP_ID}`
const templatePortraitObject = `groups/${DEMO_TEMPLATE_GROUP_ID}/campaigns/${DEMO_TEMPLATE_CAMPAIGN_ID}/characters/${CHARACTER_ID}/portraits/1-portrait.webp`

let testEnv: RulesTestEnvironment

/** A visitor who arrived through anonymous auth, as the rules see them. */
function visitor(uid: string) {
  return testEnv.authenticatedContext(uid, {
    firebase: { sign_in_provider: 'anonymous', identities: {} },
  })
}

/** A signed-up account, which is what every non-demo user is. */
function member(uid: string) {
  return testEnv.authenticatedContext(uid, {
    firebase: { sign_in_provider: 'password', identities: {} },
  })
}

const bytes = (size: number) => new Uint8Array(size)

const campaignDoc = (db: Firestore, groupId: string, campaignId: string, ...segments: string[]) =>
  doc(db, ['groups', groupId, 'campaigns', campaignId, ...segments].join('/'))

const storageRef = (storage: FirebaseStorage, path: string) => ref(storage, path)

beforeAll(async () => {
  const firestore = emulatorHost('FIRESTORE_EMULATOR_HOST', 8080)
  const storage = emulatorHost('FIREBASE_STORAGE_EMULATOR_HOST', 9199)

  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { ...firestore, rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8') },
    storage: { ...storage, rules: readFileSync(resolve(process.cwd(), 'storage.rules'), 'utf8') },
  })

  await testEnv.clearFirestore()

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()

    // The template. Note what is *not* here: a members collection. That absence
    // is what makes every write rule under this group false for every account.
    await setDoc(doc(db, 'groups', DEMO_TEMPLATE_GROUP_ID), { name: 'The Knight Errants' })
    await setDoc(campaignDoc(db, DEMO_TEMPLATE_GROUP_ID, DEMO_TEMPLATE_CAMPAIGN_ID), {
      name: 'The Black Wyrm of Brandonsford',
      system: 'ose',
      status: 'active',
      gmUserId: 'template-owner',
    })
    await setDoc(campaignDoc(db, DEMO_TEMPLATE_GROUP_ID, DEMO_TEMPLATE_CAMPAIGN_ID, 'maps', MAP_ID), {
      name: 'Brandonsford',
      imagePath: templateMapObject,
      // Deliberately false: a demo visitor is not a member of the template, so
      // the player-visibility gate must not be what lets them see the image.
      visibleToPlayers: false,
    })
    await setDoc(campaignDoc(db, DEMO_TEMPLATE_GROUP_ID, DEMO_TEMPLATE_CAMPAIGN_ID, 'npcPrivate', 'npc-1'), {
      gmNotes: 'The dragon is under the bridge.',
    })

    // Two sandboxes, as `createDemoSandbox` writes them.
    for (const [groupId, campaignId, uid] of [
      [SANDBOX_A, CAMPAIGN_A, VISITOR_A],
      [SANDBOX_B, CAMPAIGN_B, VISITOR_B],
    ] as const) {
      await setDoc(doc(db, 'groups', groupId), { name: 'The Knight Errants', isDemoSandbox: true, demoOwnerUid: uid })
      await setDoc(doc(db, 'groups', groupId, 'members', uid), { userId: uid, role: 'admin', status: 'active' })
      await setDoc(campaignDoc(db, groupId, campaignId), { name: 'Demo', status: 'active', gmUserId: uid })
      await setDoc(campaignDoc(db, groupId, campaignId, 'maps', MAP_ID), {
        name: 'Brandonsford',
        // The clone points at the template's object, not a copy of it.
        imagePath: templateMapObject,
        visibleToPlayers: true,
      })
      await setDoc(campaignDoc(db, groupId, campaignId, 'characters', CHARACTER_ID), {
        name: 'Ordo',
        ownerUserId: 'template-player',
        portraitPath: templatePortraitObject,
      })
    }

    // A real customer's group, which no visitor may touch.
    await setDoc(doc(db, 'groups', REAL_GROUP), { name: "Someone's real table" })
    await setDoc(doc(db, 'groups', REAL_GROUP, 'members', REAL_USER), { userId: REAL_USER, role: 'admin', status: 'active' })
    await setDoc(campaignDoc(db, REAL_GROUP, REAL_CAMPAIGN), { name: 'Real', status: 'active', gmUserId: REAL_USER })
    await setDoc(campaignDoc(db, REAL_GROUP, REAL_CAMPAIGN, 'characters', 'real-character'), {
      name: 'Private',
      ownerUserId: REAL_USER,
    })
    await setDoc(campaignDoc(db, REAL_GROUP, REAL_CAMPAIGN, 'sessionSummaries', 'summary-1'), { title: 'Session 12' })

    // A live invite into that real group, and the legacy flat campaign tree.
    await setDoc(doc(db, 'inviteCodes', 'real-invite-token'), {
      groupId: REAL_GROUP,
      groupName: "Someone's real table",
      createdBy: REAL_USER,
      revoked: false,
      redeemedBy: null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    await setDoc(doc(db, 'campaigns', 'legacy-campaign'), { name: 'Legacy', status: 'active' })

    const storageBucket = context.storage()
    await uploadBytes(storageRef(storageBucket, templateMapObject), bytes(64))
    await uploadBytes(storageRef(storageBucket, templatePortraitObject), bytes(64))
    await uploadBytes(
      storageRef(storageBucket, `groups/${SANDBOX_B}/campaigns/${CAMPAIGN_B}/maps/${MAP_ID}/fog/1.png`),
      bytes(64),
    )
  })
})

afterAll(async () => testEnv.cleanup())

describe('the template', () => {
  it('is readable by an anonymous visitor, all of it', async () => {
    const db = visitor(VISITOR_A).firestore()

    await assertSucceeds(getDoc(doc(db, 'groups', DEMO_TEMPLATE_GROUP_ID)))
    await assertSucceeds(getDoc(campaignDoc(db, DEMO_TEMPLATE_GROUP_ID, DEMO_TEMPLATE_CAMPAIGN_ID)))
    await assertSucceeds(getDocs(collection(db, 'groups', DEMO_TEMPLATE_GROUP_ID, 'campaigns', DEMO_TEMPLATE_CAMPAIGN_ID, 'maps')))
    await assertSucceeds(getDoc(campaignDoc(db, DEMO_TEMPLATE_GROUP_ID, DEMO_TEMPLATE_CAMPAIGN_ID, 'npcPrivate', 'npc-1')))
  })

  it('cannot be written by an anonymous visitor', async () => {
    const db = visitor(VISITOR_A).firestore()

    await assertFails(updateDoc(campaignDoc(db, DEMO_TEMPLATE_GROUP_ID, DEMO_TEMPLATE_CAMPAIGN_ID), { name: 'Defaced' }))
    await assertFails(updateDoc(campaignDoc(db, DEMO_TEMPLATE_GROUP_ID, DEMO_TEMPLATE_CAMPAIGN_ID, 'maps', MAP_ID), { name: 'Defaced' }))
    await assertFails(setDoc(campaignDoc(db, DEMO_TEMPLATE_GROUP_ID, DEMO_TEMPLATE_CAMPAIGN_ID, 'npcs', 'new'), { name: 'Injected', visibleToPlayers: true }))
    await assertFails(deleteDoc(campaignDoc(db, DEMO_TEMPLATE_GROUP_ID, DEMO_TEMPLATE_CAMPAIGN_ID, 'maps', MAP_ID)))
    await assertFails(setDoc(doc(db, 'groups', DEMO_TEMPLATE_GROUP_ID, 'members', VISITOR_A), { userId: VISITOR_A, role: 'admin', status: 'active' }))
  })

  it('cannot be written by a signed-up account either', async () => {
    const db = member(REAL_USER).firestore()

    await assertFails(updateDoc(campaignDoc(db, DEMO_TEMPLATE_GROUP_ID, DEMO_TEMPLATE_CAMPAIGN_ID), { name: 'Defaced' }))
    await assertFails(setDoc(doc(db, 'groups', DEMO_TEMPLATE_GROUP_ID, 'members', REAL_USER), { userId: REAL_USER, role: 'admin', status: 'active' }))
  })
})

describe('a visitor inside their own sandbox', () => {
  it('reads and writes it as the GM', async () => {
    const db = visitor(VISITOR_A).firestore()

    await assertSucceeds(getDoc(doc(db, 'groups', SANDBOX_A)))
    await assertSucceeds(getDoc(campaignDoc(db, SANDBOX_A, CAMPAIGN_A)))
    await assertSucceeds(updateDoc(campaignDoc(db, SANDBOX_A, CAMPAIGN_A, 'maps', MAP_ID), { fogImagePath: 'x' }))
    await assertSucceeds(setDoc(campaignDoc(db, SANDBOX_A, CAMPAIGN_A, 'maps', MAP_ID, 'tokens', 't1'), { x: 1, y: 2 }))
    await assertSucceeds(setDoc(campaignDoc(db, SANDBOX_A, CAMPAIGN_A, 'npcs', 'n1'), { name: 'Invented', visibleToPlayers: true }))
    // GM powers over a character the template owned, which is the whole point
    // of arriving as the GM rather than as a player.
    await assertSucceeds(updateDoc(campaignDoc(db, SANDBOX_A, CAMPAIGN_A, 'characters', CHARACTER_ID), { hpCurrent: 3 }))
    await assertSucceeds(setDoc(campaignDoc(db, SANDBOX_A, CAMPAIGN_A, 'tables', 'wandering'), { name: 'Wandering monsters' }))
  })

  it('sees only their own membership through the collection-group query', async () => {
    const db = visitor(VISITOR_A).firestore()

    const snap = await assertSucceeds(getDocs(query(
      collectionGroup(db, 'members'),
      where('userId', '==', VISITOR_A),
      where('status', '==', 'active'),
    )))

    expect(snap.docs.map((docSnap) => docSnap.ref.parent.parent?.id)).toEqual([SANDBOX_A])
  })

  it('cannot widen that query to somebody else', async () => {
    const db = visitor(VISITOR_A).firestore()

    await assertFails(getDocs(query(collectionGroup(db, 'members'), where('userId', '==', REAL_USER))))
    await assertFails(getDocs(collectionGroup(db, 'members')))
  })
})

describe("a visitor against another visitor's sandbox", () => {
  it('cannot read any of it', async () => {
    const db = visitor(VISITOR_A).firestore()

    await assertFails(getDoc(doc(db, 'groups', SANDBOX_B)))
    await assertFails(getDoc(campaignDoc(db, SANDBOX_B, CAMPAIGN_B)))
    await assertFails(getDoc(campaignDoc(db, SANDBOX_B, CAMPAIGN_B, 'maps', MAP_ID)))
    await assertFails(getDoc(campaignDoc(db, SANDBOX_B, CAMPAIGN_B, 'characters', CHARACTER_ID)))
    await assertFails(getDocs(collection(db, 'groups', SANDBOX_B, 'campaigns')))
  })

  it('cannot write any of it, including by joining it', async () => {
    const db = visitor(VISITOR_A).firestore()

    await assertFails(updateDoc(campaignDoc(db, SANDBOX_B, CAMPAIGN_B, 'maps', MAP_ID), { name: 'Vandalised' }))
    await assertFails(setDoc(campaignDoc(db, SANDBOX_B, CAMPAIGN_B, 'npcs', 'n1'), { name: 'Injected', visibleToPlayers: true }))
    await assertFails(deleteDoc(campaignDoc(db, SANDBOX_B, CAMPAIGN_B)))
    await assertFails(setDoc(doc(db, 'groups', SANDBOX_B, 'members', VISITOR_A), { userId: VISITOR_A, role: 'admin', status: 'active' }))
    await assertFails(setDoc(doc(db, 'groups', SANDBOX_B, 'members', VISITOR_A), { userId: VISITOR_A, role: 'member', status: 'active' }))
  })

  it("cannot read another visitor's painted fog out of Cloud Storage", async () => {
    const storage = visitor(VISITOR_A).storage()

    await assertFails(getBytes(storageRef(storage, `groups/${SANDBOX_B}/campaigns/${CAMPAIGN_B}/maps/${MAP_ID}/fog/1.png`)))
    await assertFails(uploadBytes(storageRef(storage, `groups/${SANDBOX_B}/campaigns/${CAMPAIGN_B}/maps/${MAP_ID}/fog/2.png`), bytes(16)))
  })
})

describe("a visitor against a real user's data", () => {
  it('cannot read the group, the campaign, or anything under it', async () => {
    const db = visitor(VISITOR_A).firestore()

    await assertFails(getDoc(doc(db, 'groups', REAL_GROUP)))
    await assertFails(getDoc(campaignDoc(db, REAL_GROUP, REAL_CAMPAIGN)))
    await assertFails(getDoc(campaignDoc(db, REAL_GROUP, REAL_CAMPAIGN, 'characters', 'real-character')))
    await assertFails(getDoc(campaignDoc(db, REAL_GROUP, REAL_CAMPAIGN, 'sessionSummaries', 'summary-1')))
    await assertFails(getDocs(collection(db, 'groups', REAL_GROUP, 'members')))
  })

  it('cannot write to it', async () => {
    const db = visitor(VISITOR_A).firestore()

    await assertFails(updateDoc(campaignDoc(db, REAL_GROUP, REAL_CAMPAIGN), { name: 'Vandalised' }))
    await assertFails(updateDoc(campaignDoc(db, REAL_GROUP, REAL_CAMPAIGN, 'characters', 'real-character'), { hpCurrent: 0 }))
    await assertFails(deleteDoc(doc(db, 'groups', REAL_GROUP)))
  })

  it('cannot enumerate the groups collection to find one', async () => {
    // The old rule allowed any signed-in account to list every group. It is now
    // membership-scoped, so this is refused for a visitor and for a real user.
    await assertFails(getDocs(collection(visitor(VISITOR_A).firestore(), 'groups')))
    await assertFails(getDocs(collection(member(REAL_USER).firestore(), 'groups')))
  })

  it('cannot use an invite link to get into one', async () => {
    const db = visitor(VISITOR_A).firestore()

    await assertFails(getDoc(doc(db, 'inviteCodes', 'real-invite-token')))
    await assertFails(updateDoc(doc(db, 'inviteCodes', 'real-invite-token'), { redeemedBy: VISITOR_A }))
    await assertFails(setDoc(doc(db, 'groups', REAL_GROUP, 'members', VISITOR_A), {
      userId: VISITOR_A,
      status: 'active',
      role: 'member',
      invitedVia: 'real-invite-token',
    }))
  })

  it('cannot reach the legacy flat campaign tree', async () => {
    const db = visitor(VISITOR_A).firestore()

    await assertFails(getDoc(doc(db, 'campaigns', 'legacy-campaign')))
    await assertFails(setDoc(doc(db, 'campaigns', 'legacy-campaign', 'members', VISITOR_A), {
      userId: VISITOR_A,
      status: 'active',
      role: 'player',
    }))
  })
})

describe('what a visitor may not create outside the sandbox', () => {
  it('cannot start a group of their own', async () => {
    const db = visitor(VISITOR_A).firestore()

    await assertFails(setDoc(doc(db, 'groups', 'visitor-made-group'), { name: 'Mine', createdBy: VISITOR_A }))
  })

  it('cannot claim a handle out of the global username index', async () => {
    const db = visitor(VISITOR_A).firestore()

    await assertFails(setDoc(doc(db, 'usernames', 'Visitor'), { uid: VISITOR_A, createdAt: new Date() }))
  })

  it('cannot mint an invite code out of the sandbox they are admin of', async () => {
    const db = visitor(VISITOR_A).firestore()

    await assertFails(setDoc(doc(db, 'inviteCodes', 'visitor-token'), {
      groupId: SANDBOX_A,
      groupName: 'Demo',
      createdBy: VISITOR_A,
      revoked: false,
      redeemedBy: null,
      expiresAt: new Date(Date.now() + 1000),
    }))
  })

  it('cannot read the session registry that tracks the ceiling', async () => {
    const db = visitor(VISITOR_A).firestore()

    await assertFails(getDoc(doc(db, 'demoSessions', VISITOR_A)))
    await assertFails(getDocs(collection(db, 'demoSessions')))
    await assertFails(setDoc(doc(db, 'demoSessions', VISITOR_A), { expiresAt: new Date(0) }))
  })
})

describe('the shared images', () => {
  it("lets a visitor read the template's map and portraits their clone points at", async () => {
    const storage = visitor(VISITOR_A).storage()

    await assertSucceeds(getBytes(storageRef(storage, templateMapObject)))
    await assertSucceeds(getBytes(storageRef(storage, templatePortraitObject)))
  })

  it('does not let a visitor overwrite them', async () => {
    const storage = visitor(VISITOR_A).storage()

    await assertFails(uploadBytes(storageRef(storage, templateMapObject), bytes(16)))
    await assertFails(uploadBytes(storageRef(storage, templatePortraitObject), bytes(16)))
  })

  it('lets the visitor write their own fog under their own sandbox', async () => {
    const storage = visitor(VISITOR_A).storage()

    await assertSucceeds(uploadBytes(
      storageRef(storage, `groups/${SANDBOX_A}/campaigns/${CAMPAIGN_A}/maps/${MAP_ID}/fog/1.png`),
      bytes(1024),
    ))
    await assertSucceeds(uploadBytes(
      storageRef(storage, `groups/${SANDBOX_A}/campaigns/${CAMPAIGN_A}/maps/${MAP_ID}/vision/1.png`),
      bytes(1024),
    ))
  })

  it('caps how large any single object a visitor uploads may be', async () => {
    const storage = visitor(VISITOR_A).storage()

    await assertFails(uploadBytes(
      storageRef(storage, `groups/${SANDBOX_A}/campaigns/${CAMPAIGN_A}/maps/oversized`),
      bytes(9 * 1024 * 1024),
    ))
  })
})
