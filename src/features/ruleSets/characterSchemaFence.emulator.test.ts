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
import { applyGrantToCharacter } from '../character/lib/grantTransaction'
import { readCharacterStoreDoc } from '../character/characterStore/characterStoreRecord'
import { characterStoreSaveFields, newCharacterStoreFields } from '../character/characterStore/characterStoreWrites'
import { vtmCharacterStore } from '../character/vtmCharacterRecord'
import { oseCharacterStore } from '../character/lib/storedCharacterRecord'
import type { VtmCharacterRecord } from '../character/vtmTypes'
import { defaultTokenIcon } from '../character/lib/characterSheetLayout'
import { emulatorPort } from '../../../vitest.emulatorEndpoint'
import { firestoreRules } from '../../../vitest.firestoreRules'
import { withCharacterSchemaFloors } from '../../../scripts/floor-rehearsal/floors.mjs'

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
  lubec: { system: 'lubec' },
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

const oseStore = oseCharacterStore({ userId: ownerUid, currentUsername: ownerUid })
const oseSaveFields = (): DocumentData => characterStoreSaveFields(oseStore, oseRecord())

// What code from before version stamping writes: the current writers' fields
// without the two schema fields.
const withoutSchemaStamp = ({ schemaVersion: _version, schemaWrittenAt: _writtenAt, ...fields }: DocumentData): DocumentData => fields

// The document `useCharacterRoster`'s "add character" wrote before stamping.
const oseCreateFields = (): DocumentData => {
  const { className, details: _details, id: _id, portraitUrl: _portraitUrl, ...rest } = oseRecord()
  return { ...rest, class: className, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
}

// An OSE character stored as code before stamping left it, with no schema fields.
const storedOseCharacter = (): DocumentData => ({ ...oseCreateFields(), details: oseRecord().details })

const vtmRecord = (): VtmCharacterRecord =>
  readCharacterStoreDoc(vtmCharacterStore, characterId, { system: 'vtm', name: 'Lucien', ownerUserId: ownerUid }, undefined)!

// The old merge saves and VtM create, with no schema fields.
const oldOseSaveFields = (): DocumentData => withoutSchemaStamp(oseSaveFields())
const oldVtmSaveFields = (): DocumentData => withoutSchemaStamp(characterStoreSaveFields(vtmCharacterStore, vtmRecord()))
const oldVtmCreateFields = (): DocumentData => withoutSchemaStamp(newCharacterStoreFields(vtmCharacterStore, vtmRecord()))

const storedVtmCharacter = (): DocumentData => oldVtmCreateFields()

// Old fields with a schema stamp added.
const stamped = (fields: DocumentData, schemaVersion: unknown = 1): DocumentData =>
  ({ ...fields, schemaVersion, schemaWrittenAt: serverTimestamp() })

// An OSE character the migration stamped at version 1, some time ago.
const migratedOseCharacter = (): DocumentData =>
  ({ ...storedOseCharacter(), schemaVersion: 1, schemaWrittenAt: new Date('2026-01-01T00:00:00Z') })

// The rules with every floor named here. Under `npm run rehearse:floors`,
// `firestoreRules()` is the raised copy, so the committed floors are read from
// `firestore.rules` itself.
const committedRules = () => firestoreRules({})
const withFloors = (floors: Record<string, number>) => withCharacterSchemaFloors(committedRules(), floors)

// A Lubec character as a current writer stores it, some time ago.
const storedLubecCharacter = (): DocumentData =>
  ({ system: 'lubec', name: 'Ilse', ownerUserId: ownerUid, schemaVersion: 1, schemaWrittenAt: new Date('2026-01-01T00:00:00Z') })

// A new Lubec character as a current writer would create it.
const lubecCreateFields = (): DocumentData =>
  stamped({ system: 'lubec', name: 'Ilse', ownerUserId: ownerUid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })

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

const create = (testEnv: RulesTestEnvironment, campaign: CampaignKey, fields: DocumentData) =>
  setDoc(doc(asUser(testEnv, ownerUid), ...characterPath(campaign, 'new-character')), fields)

const save = (testEnv: RulesTestEnvironment, campaign: CampaignKey, fields: DocumentData, uid = ownerUid) =>
  setDoc(doc(asUser(testEnv, uid), ...characterPath(campaign)), fields, { merge: true })

// The grant panel's character write, through the real grant transaction,
// which stamps the version and refuses a character not at it.
const grant = (db: Firestore, campaign: CampaignKey) => runTransaction(db, (tx) =>
  applyGrantToCharacter(tx, doc(db, ...characterPath(campaign)), {
    target: oseRecord(),
    xpAmount: 10,
    goldAmount: 5,
    campaignEntries: [],
    templateEntries: [],
    overflowGoldDocId: 'overflow-gold',
  }))

// A grant's or an approval's character write as code before stamping made
// it: read the character, then merge an item into its inventory.
const oldTransaction = (db: Firestore, campaign: CampaignKey) => runTransaction(db, async (tx) => {
  const ref = doc(db, ...characterPath(campaign))
  const details = ((await tx.get(ref)).data()?.details ?? {}) as Record<string, unknown>
  const inventory = (details.inventory ?? []) as CharacterInventoryItem[]
  tx.set(ref, { details: { ...details, inventory: [...inventory, rope] } }, { merge: true })
})

// The floors the fence first shipped with: landing it changed nothing for OSE
// and VtM players, and code from before stamping still passes until they rise.
describe('character writes with the OSE and VtM floors at 0', () => {
  let testEnv: RulesTestEnvironment

  beforeAll(async () => {
    testEnv = await startEnvironment('floors-zero', withFloors({ ose: 0, vtm: 0, lubec: 1 }))
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  describe('in an OSE campaign', () => {
    beforeEach(() => seed(testEnv, { ose: storedOseCharacter() }))

    it("passes the old create", async () => {
      await assertSucceeds(setDoc(doc(asUser(testEnv, ownerUid), ...characterPath('ose', 'new-character')), oseCreateFields()))
    })

    it("passes the old merge save, by the owner and by the GM", async () => {
      for (const uid of [ownerUid, gmUid]) {
        await assertSucceeds(setDoc(doc(asUser(testEnv, uid), ...characterPath('ose')), oldOseSaveFields(), { merge: true }))
      }
    })

    it("passes the old grant and approval write", async () => {
      await assertSucceeds(oldTransaction(asUser(testEnv, gmUid), 'ose'))
    })

    it("passes the current stamped merge save", async () => {
      await assertSucceeds(setDoc(doc(asUser(testEnv, ownerUid), ...characterPath('ose')), oseSaveFields(), { merge: true }))
    })

    it('refuses a save by another player', async () => {
      await assertFails(setDoc(doc(asUser(testEnv, otherMemberUid), ...characterPath('ose')), oldOseSaveFields(), { merge: true }))
      await assertFails(setDoc(doc(asUser(testEnv, otherMemberUid), ...characterPath('ose')), oseSaveFields(), { merge: true }))
    })
  })

  describe('in a VtM campaign', () => {
    beforeEach(() => seed(testEnv, { vtm: storedVtmCharacter() }))

    it("passes the old create and the current stamped create", async () => {
      const db = asUser(testEnv, ownerUid)
      await assertSucceeds(setDoc(doc(db, ...characterPath('vtm', 'new-character')), oldVtmCreateFields()))
      await assertSucceeds(setDoc(doc(db, ...characterPath('vtm', 'new-character')), newCharacterStoreFields(vtmCharacterStore, vtmRecord())))
    })

    it("passes the old merge save, by the owner and by the GM, and the current stamped one", async () => {
      for (const uid of [ownerUid, gmUid]) {
        await assertSucceeds(setDoc(doc(asUser(testEnv, uid), ...characterPath('vtm')), oldVtmSaveFields(), { merge: true }))
      }
      await assertSucceeds(setDoc(doc(asUser(testEnv, ownerUid), ...characterPath('vtm')), characterStoreSaveFields(vtmCharacterStore, vtmRecord()), { merge: true }))
    })
  })
})

describe('character writes with the OSE floor at 1', () => {
  let testEnv: RulesTestEnvironment

  beforeAll(async () => {
    testEnv = await startEnvironment('ose-floor', withFloors({ ose: 1, vtm: 0, lubec: 1 }))
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  beforeEach(() => seed(testEnv, {
    ose: migratedOseCharacter(),
    vtm: storedVtmCharacter(),
    missing: migratedOseCharacter(),
    empty: migratedOseCharacter(),
    unregistered: migratedOseCharacter(),
  }))

  it("refuses the old create and the old merge save, even on a version 1 document", async () => {
    await assertFails(create(testEnv, 'ose', oseCreateFields()))
    await assertFails(save(testEnv, 'ose', oldOseSaveFields()))
    await assertFails(save(testEnv, 'ose', oldOseSaveFields(), gmUid))
    await assertFails(oldTransaction(asUser(testEnv, gmUid), 'ose'))
  })

  it('refuses a version 0 write with a fresh write time', async () => {
    await assertFails(create(testEnv, 'ose', stamped(oseCreateFields(), 0)))
    await assertFails(save(testEnv, 'ose', stamped(oldOseSaveFields(), 0)))
  })

  it('refuses a write that keeps the stored stamp, or a version that is not a whole number', async () => {
    await assertFails(save(testEnv, 'ose', { ...oldOseSaveFields(), schemaVersion: 1 }))
    await assertFails(save(testEnv, 'ose', stamped(oldOseSaveFields(), 1.5)))
    await assertFails(save(testEnv, 'ose', stamped(oldOseSaveFields(), '1')))
  })

  it('allows a current create, the current merge save and grant, and a stamped transaction', async () => {
    await assertSucceeds(create(testEnv, 'ose', newCharacterStoreFields(oseStore, oseRecord())))
    await assertSucceeds(save(testEnv, 'ose', oseSaveFields()))
    await assertSucceeds(save(testEnv, 'ose', oseSaveFields(), gmUid))
    await assertSucceeds(grant(asUser(testEnv, gmUid), 'ose'))
    const db = asUser(testEnv, gmUid)
    await assertSucceeds(runTransaction(db, async (tx) => {
      const ref = doc(db, ...characterPath('ose'))
      const details = ((await tx.get(ref)).data()?.details ?? {}) as Record<string, unknown>
      tx.set(ref, stamped({ details: { ...details, inventory: [rope] } }), { merge: true })
    }))
  })

  it('still refuses a stamped save by another player', async () => {
    await assertFails(save(testEnv, 'ose', oseSaveFields(), otherMemberUid))
  })

  it('uses the OSE floor for a missing, empty or unregistered campaign value', async () => {
    for (const campaign of ['missing', 'empty', 'unregistered'] as const) {
      await assertFails(save(testEnv, campaign, oldOseSaveFields()))
      await assertFails(create(testEnv, campaign, oseCreateFields()))
      await assertSucceeds(save(testEnv, campaign, oseSaveFields()))
    }
  })

  it("uses the VtM floor in a VtM campaign, which is still 0", async () => {
    await assertSucceeds(save(testEnv, 'vtm', oldVtmSaveFields()))
    await assertSucceeds(create(testEnv, 'vtm', oldVtmCreateFields()))
  })
})

describe('character writes with the VtM floor at 1', () => {
  let testEnv: RulesTestEnvironment

  beforeAll(async () => {
    testEnv = await startEnvironment('vtm-floor', withFloors({ ose: 0, vtm: 1, lubec: 1 }))
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  beforeEach(() => seed(testEnv, {
    ose: storedOseCharacter(),
    vtm: storedVtmCharacter(),
    missing: storedOseCharacter(),
    empty: storedOseCharacter(),
    unregistered: storedOseCharacter(),
  }))

  it("refuses the old VtM create and merge save, and allows the current stamped ones", async () => {
    await assertFails(create(testEnv, 'vtm', oldVtmCreateFields()))
    await assertFails(save(testEnv, 'vtm', oldVtmSaveFields()))
    await assertSucceeds(create(testEnv, 'vtm', newCharacterStoreFields(vtmCharacterStore, vtmRecord())))
    await assertSucceeds(save(testEnv, 'vtm', characterStoreSaveFields(vtmCharacterStore, vtmRecord())))
  })

  it('leaves every OSE campaign on the OSE floor, still 0', async () => {
    for (const campaign of ['ose', 'missing', 'empty', 'unregistered'] as const) {
      await assertSucceeds(save(testEnv, campaign, oldOseSaveFields()))
    }
    await assertSucceeds(oldTransaction(asUser(testEnv, gmUid), 'ose'))
  })
})

// Lubec's floor is 1 from the day the fence lands: no old code ever wrote a
// Lubec character, and OSE code from before stamping would write OSE fields
// into one.
// Lubec at 1 beside OSE and VtM at 0, so an OSE campaign shows the Lubec floor
// does not reach past its own rule set.
describe('character writes into a Lubec campaign, with only the Lubec floor at 1', () => {
  let testEnv: RulesTestEnvironment

  beforeAll(async () => {
    testEnv = await startEnvironment('lubec-floor', withFloors({ ose: 0, vtm: 0, lubec: 1 }))
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  beforeEach(() => seed(testEnv, { lubec: storedLubecCharacter(), ose: storedOseCharacter() }))

  it('refuses an OSE-shaped create and merge save, by the owner and by the GM', async () => {
    await assertFails(create(testEnv, 'lubec', oseCreateFields()))
    await assertFails(save(testEnv, 'lubec', oldOseSaveFields()))
    await assertFails(save(testEnv, 'lubec', oldOseSaveFields(), gmUid))
    await assertFails(oldTransaction(asUser(testEnv, gmUid), 'lubec'))
  })

  it('refuses a version 0 write with a fresh write time', async () => {
    await assertFails(create(testEnv, 'lubec', { ...lubecCreateFields(), schemaVersion: 0 }))
    await assertFails(save(testEnv, 'lubec', stamped({ name: 'Ilse Brandt' }, 0)))
  })

  it('allows a current create and a stamped merge save', async () => {
    await assertSucceeds(create(testEnv, 'lubec', lubecCreateFields()))
    await assertSucceeds(save(testEnv, 'lubec', stamped({ name: 'Ilse Brandt' })))
    await assertSucceeds(save(testEnv, 'lubec', stamped({ name: 'Ilse Brandt' }), gmUid))
  })

  it("still passes the old OSE create and merge save in an OSE campaign", async () => {
    await assertSucceeds(create(testEnv, 'ose', oseCreateFields()))
    await assertSucceeds(save(testEnv, 'ose', oldOseSaveFields()))
  })
})

describe.each([
  ['as committed', 'deletes-committed', committedRules],
  ['with every floor at 1', 'deletes-raised', () => withFloors({ ose: 1, vtm: 1, lubec: 1 })],
])('character deletes with the floors %s', (_name, label, rules) => {
  let testEnv: RulesTestEnvironment

  beforeAll(async () => {
    testEnv = await startEnvironment(label, rules())
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  beforeEach(() => seed(testEnv, { ose: storedOseCharacter(), vtm: storedVtmCharacter(), lubec: storedLubecCharacter() }))

  it('lets the owner and the GM delete, and nobody else', async () => {
    for (const campaign of ['ose', 'vtm', 'lubec'] as const) {
      await assertFails(deleteDoc(doc(asUser(testEnv, otherMemberUid), ...characterPath(campaign))))
      await assertFails(deleteDoc(doc(asUser(testEnv, outsiderUid), ...characterPath(campaign))))
      await assertFails(deleteDoc(doc(testEnv.unauthenticatedContext().firestore(), ...characterPath(campaign))))
    }
    await assertSucceeds(deleteDoc(doc(asUser(testEnv, ownerUid), ...characterPath('ose'))))
    await assertSucceeds(deleteDoc(doc(asUser(testEnv, gmUid), ...characterPath('vtm'))))
    await assertSucceeds(deleteDoc(doc(asUser(testEnv, ownerUid), ...characterPath('lubec'))))
  })
})
