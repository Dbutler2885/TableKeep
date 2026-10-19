/**
 * The character schema fence in `firestore.rules` (Spec A 5.8), run against
 * the emulator with the floors as committed and with floors substituted.
 */
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  deleteDoc,
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import type { CharacterInventoryItem, CharacterRecord } from '../../types/app'
import { characterSaveFields } from '../character/lib/characterWrites'
import { applyGrantToCharacter } from '../character/lib/grantTransaction'
import { readVtmCharacterDoc } from '../character/vtmCharacterRecord'
import { newVtmCharacterFields, vtmCharacterSaveFields } from '../character/vtmCharacterWrites'
import type { VtmCharacterRecord } from '../character/vtmTypes'
import { defaultTokenIcon } from '../character/lib/characterSheetLayout'
import { emulatorPort } from '../../../vitest.emulatorEndpoint'
import { firestoreRules } from '../../../vitest.firestoreRules'

const groupId = 'fence-group'
const gmUid = 'fence-gm'
const ownerUid = 'fence-owner'
const otherMemberUid = 'fence-other-member'
const outsiderUid = 'fence-outsider'
const characterId = 'fence-character'

// One campaign per stored `system` the fence has to resolve.
const campaigns = {
  ose: { system: 'ose' },
  vtm: { system: 'vtm' },
  missing: {},
  empty: { system: '' },
  unregistered: { system: 'pathfinder' },
} as const
type CampaignKey = keyof typeof campaigns

const characterPath = (campaign: CampaignKey, id = characterId) =>
  ['groups', groupId, 'campaigns', campaign, 'characters', id] as const

const oseRecord = (): CharacterRecord => ({
  id: characterId,
  name: 'Ada',
  ownerUserId: ownerUid,
  ownerUsername: ownerUid,
  creationMode: 'new',
  creationModeExplicit: true,
  creationStatus: 'active',
  className: 'Fighter',
  level: 1,
  hpCurrent: 6,
  hpMax: 6,
  ac: 10,
  xp: 0,
  portraitPath: '',
  portraitUrl: null,
  portraitFocusX: 50,
  portraitFocusY: 50,
  tokenIcon: defaultTokenIcon,
  details: {
    abilityScores: { STR: '10', INT: '10', WIS: '10', DEX: '10', CON: '10', CHA: '10' },
    inventory: [],
  } as unknown as CharacterRecord['details'],
})

// The document `useCharacterRoster`'s "add character" writes today.
const oseCreateFields = (): DocumentData => {
  const { className, details: _details, id: _id, portraitUrl: _portraitUrl, ...rest } = oseRecord()
  return { ...rest, class: className, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
}

// An OSE character stored as today's code leaves it, with no schema fields.
const storedOseCharacter = (): DocumentData => ({ ...oseCreateFields(), details: oseRecord().details })

const vtmRecord = (): VtmCharacterRecord =>
  readVtmCharacterDoc(characterId, { system: 'vtm', name: 'Lucien', ownerUserId: ownerUid }, undefined)!

const storedVtmCharacter = (): DocumentData => newVtmCharacterFields(vtmRecord())

const rope: CharacterInventoryItem = { id: 'rope-1', name: 'Rope', costGp: 1, qty: 1, kind: 'general' } as CharacterInventoryItem

async function startEnvironment(label: string, rules: string) {
  return initializeTestEnvironment({
    projectId: `homeboyshouse-character-fence-${label}`,
    firestore: { host: '127.0.0.1', port: emulatorPort('FIRESTORE_EMULATOR_HOST', 8080), rules },
  })
}

async function seed(testEnv: RulesTestEnvironment, characters: Partial<Record<CampaignKey, DocumentData>>) {
  await testEnv.clearFirestore()
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'groups', groupId), { createdBy: gmUid })
    const members = [[gmUid, 'admin'], [ownerUid, 'member'], [otherMemberUid, 'member']] as const
    for (const [uid, role] of members) {
      await setDoc(doc(db, 'groups', groupId, 'members', uid), { userId: uid, role, status: 'active' })
    }
    for (const [campaign, fields] of Object.entries(campaigns)) {
      await setDoc(doc(db, 'groups', groupId, 'campaigns', campaign), { ...fields, createdBy: gmUid, gmUserId: gmUid })
    }
    for (const [campaign, fields] of Object.entries(characters)) {
      await setDoc(doc(db, ...characterPath(campaign as CampaignKey)), fields)
    }
  })
}

const asUser = (testEnv: RulesTestEnvironment, uid: string) => testEnv.authenticatedContext(uid).firestore()

// The grant panel's character write, through the real grant transaction.
const grant = (db: Firestore, campaign: CampaignKey) => runTransaction(db, (tx) =>
  applyGrantToCharacter(tx, doc(db, ...characterPath(campaign)), {
    target: oseRecord(),
    xpAmount: 10,
    goldAmount: 5,
    campaignEntries: [],
    templateEntries: [],
    overflowGoldDocId: 'overflow-gold',
  }))

// An approval's character write, as `useItemApprovals` makes it: read the
// character, then merge the approved item into its inventory.
const approve = (db: Firestore, campaign: CampaignKey) => runTransaction(db, async (tx) => {
  const ref = doc(db, ...characterPath(campaign))
  const details = ((await tx.get(ref)).data()?.details ?? {}) as Record<string, unknown>
  const inventory = (details.inventory ?? []) as CharacterInventoryItem[]
  tx.set(ref, { details: { ...details, inventory: [...inventory, rope] } }, { merge: true })
})

describe("today's character writes", () => {
  let testEnv: RulesTestEnvironment

  beforeAll(async () => {
    testEnv = await startEnvironment('today', firestoreRules())
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  describe('in an OSE campaign', () => {
    beforeEach(() => seed(testEnv, { ose: storedOseCharacter() }))

    it("passes today's create", async () => {
      await assertSucceeds(setDoc(doc(asUser(testEnv, ownerUid), ...characterPath('ose', 'new-character')), oseCreateFields()))
    })

    it("passes today's merge save, by the owner and by the GM", async () => {
      for (const uid of [ownerUid, gmUid]) {
        await assertSucceeds(setDoc(doc(asUser(testEnv, uid), ...characterPath('ose')), characterSaveFields(oseRecord()), { merge: true }))
      }
    })

    it("passes today's grant and approval", async () => {
      await assertSucceeds(grant(asUser(testEnv, gmUid), 'ose'))
      await assertSucceeds(approve(asUser(testEnv, gmUid), 'ose'))
    })

    it('refuses a save by another player', async () => {
      await assertFails(setDoc(doc(asUser(testEnv, otherMemberUid), ...characterPath('ose')), characterSaveFields(oseRecord()), { merge: true }))
    })
  })

  describe('in a VtM campaign', () => {
    beforeEach(() => seed(testEnv, { vtm: storedVtmCharacter() }))

    it("passes today's create", async () => {
      const db = asUser(testEnv, ownerUid)
      await assertSucceeds(setDoc(doc(db, ...characterPath('vtm', 'new-character')), newVtmCharacterFields(vtmRecord())))
    })

    it("passes today's merge save, by the owner and by the GM", async () => {
      for (const uid of [ownerUid, gmUid]) {
        await assertSucceeds(setDoc(doc(asUser(testEnv, uid), ...characterPath('vtm')), vtmCharacterSaveFields(vtmRecord()), { merge: true }))
      }
    })
  })
})

describe.each([
  ['today', 'deletes-today', () => firestoreRules()],
])('character deletes %s', (_name, label, rules) => {
  let testEnv: RulesTestEnvironment

  beforeAll(async () => {
    testEnv = await startEnvironment(label, rules())
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  beforeEach(() => seed(testEnv, { ose: storedOseCharacter(), vtm: storedVtmCharacter() }))

  it('lets the owner and the GM delete, and nobody else', async () => {
    for (const campaign of ['ose', 'vtm'] as const) {
      await assertFails(deleteDoc(doc(asUser(testEnv, otherMemberUid), ...characterPath(campaign))))
      await assertFails(deleteDoc(doc(asUser(testEnv, outsiderUid), ...characterPath(campaign))))
      await assertFails(deleteDoc(doc(testEnv.unauthenticatedContext().firestore(), ...characterPath(campaign))))
    }
    await assertSucceeds(deleteDoc(doc(asUser(testEnv, ownerUid), ...characterPath('ose'))))
    await assertSucceeds(deleteDoc(doc(asUser(testEnv, gmUid), ...characterPath('vtm'))))
  })
})
