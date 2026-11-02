import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch, type Firestore } from 'firebase/firestore'
import { emulatorPort } from '../../../vitest.emulatorEndpoint'
import { firestoreRules } from '../../../vitest.firestoreRules'
import { saveSheetIntention } from '../character/characterStore/sheetIntentionTransaction'
import type { SheetIntention } from '../character/characterStore/sheetIntentionTypes'

const root = 'groups/combat-rules/campaigns/lubec'
const fight = { status: 'live', participantUserIds: ['player', 'inactive', 'outsider'], state: { round: 1 }, updatedAt: new Date(0) }
const storedSheet = { ownerUserId: 'player', system: 'lubec', schemaVersion: 1, schemaWrittenAt: new Date(123), name: 'Wayne', lubec: { counters: { stress: 2 } }, futureField: { kept: true } }
const intention: SheetIntention = { operationId: 'stress', baseRevision: 0, edits: [{ kind: 'delta', path: ['lubec', 'counters', 'stress'], base: 2, amount: 1 }] }
let env: RulesTestEnvironment
const as = (uid: string): Firestore => env.authenticatedContext(uid).firestore()
const ref = (db: Firestore, path: string) => doc(db, root, path)
const anonymous = (): Firestore => env.unauthenticatedContext().firestore()

async function seed(path: string, data: object) {
  await env.withSecurityRulesDisabled(async (context) => { await setDoc(ref(context.firestore(), path), data) })
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev',
    firestore: { host: '127.0.0.1', port: emulatorPort('FIRESTORE_EMULATOR_HOST', 8080), rules: firestoreRules() },
  })
})
afterAll(async () => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    for (const [uid, role, status] of [['admin', 'admin', 'active'], ['gm', 'member', 'active'], ['player', 'member', 'active'], ['spectator', 'member', 'active'], ['inactive', 'admin', 'inactive']]) {
      await setDoc(doc(db, 'groups/combat-rules/members', uid), { userId: uid, role, status })
    }
    await setDoc(doc(db, root), { system: 'lubec', gmUserId: 'gm' })
    await setDoc(ref(db, 'combatControl/current'), { activeFightId: 'fight' })
    await setDoc(ref(db, 'combats/fight'), fight)
    await setDoc(ref(db, 'characters/hero'), storedSheet)
    await setDoc(ref(db, 'npcSheets/npc'), { ...storedSheet, ownerUserId: 'player' })
    await setDoc(ref(db, 'gmItems/ball'), { status: 'library', name: 'Dodgeball' })
  })
})

describe('shared fight authority', () => {
  it.each(['admin', 'gm', 'player', 'spectator'])('%s reads control, fights and immutable collections, including by query', async (uid) => {
    const db = as(uid)
    for (const path of ['combatControl/current', 'combats/fight', 'combats/fight/log/roll', 'combats/fight/commands/action']) {
      await assertSucceeds(getDoc(ref(db, path)))
    }
    for (const path of ['combats', 'combats/fight/log', 'combats/fight/commands']) {
      await assertSucceeds(getDocs(collection(db, root, path)))
    }
  })

  it.each(['outsider', 'inactive', 'unauthenticated'])('denies %s every fight operation even when listed as a participant', async (uid) => {
    const db = uid === 'unauthenticated' ? anonymous() : as(uid)
    for (const path of ['combatControl/current', 'combats/fight', 'combats/fight/log/roll', 'combats/fight/commands/action']) {
      await seed(path, path === 'combats/fight' ? fight : { value: 1 })
      await assertFails(getDoc(ref(db, path)))
      await assertFails(setDoc(ref(db, path + '-new'), { ...fight }))
      await assertFails(updateDoc(ref(db, path), { state: { round: 2 } }))
      await assertFails(deleteDoc(ref(db, path)))
    }
  })

  it.each(['admin', 'gm'])('%s controls the active pointer and fight lifecycle', async (uid) => {
    const db = as(uid)
    await assertSucceeds(deleteDoc(ref(db, 'combatControl/current')))
    await assertSucceeds(setDoc(ref(db, 'combatControl/current'), { activeFightId: null }))
    await assertSucceeds(updateDoc(ref(db, 'combatControl/current'), { activeFightId: 'new' }))
    await assertSucceeds(setDoc(ref(db, 'combats/new'), fight))
    await assertSucceeds(updateDoc(ref(db, 'combats/new'), { participantUserIds: ['spectator'], status: 'ended' }))
    await assertSucceeds(deleteDoc(ref(db, 'combats/new')))
    await assertFails(setDoc(ref(db, 'combatControl/other'), { activeFightId: 'new' }))
  })

  it.each(['player', 'spectator'])('%s cannot create/delete fights or write control', async (uid) => {
    const db = as(uid)
    await assertFails(setDoc(ref(db, 'combats/new'), fight))
    await assertFails(deleteDoc(ref(db, 'combats/fight')))
    await assertFails(updateDoc(ref(db, 'combatControl/current'), { activeFightId: null }))
    await assertFails(deleteDoc(ref(db, 'combatControl/current')))
    await assertSucceeds(deleteDoc(ref(as('gm'), 'combatControl/current')))
    await assertFails(setDoc(ref(db, 'combatControl/current'), { activeFightId: 'fight' }))
  })

  it('allows participants only state/updatedAt, leaves dice and engine semantics to the trusted table', async () => {
    const db = as('player')
    await assertSucceeds(updateDoc(ref(db, 'combats/fight'), { state: { round: 2, reportedDice: 99 }, updatedAt: serverTimestamp() }))
    expect((await getDoc(ref(db, 'combats/fight'))).data()?.state).toEqual({ round: 2, reportedDice: 99 })
    for (const fields of [{ status: 'ended' }, { participantUserIds: ['player', 'spectator'] }, { gmUserId: 'player' }, { forged: true }]) {
      await assertFails(updateDoc(ref(db, 'combats/fight'), { state: {}, ...fields }))
    }
    await assertFails(updateDoc(ref(as('spectator'), 'combats/fight'), { state: {} }))
    await seed('combats/fight', { ...fight, status: 'ended' })
    await assertFails(updateDoc(ref(db, 'combats/fight'), { state: {}, updatedAt: serverTimestamp() }))
  })

  describe.each(['log', 'commands'])('immutable %s', (child) => {
    it.each(['admin', 'gm', 'player'])('%s creates but cannot replace a committed entry; only GMs delete it', async (uid) => {
      const db = as(uid)
      const path = `combats/fight/${child}/entry`
      await assertSucceeds(setDoc(ref(db, path), { result: 1 }))
      await assertFails(updateDoc(ref(db, path), { result: 2 }))
      await assertFails(setDoc(ref(db, path), { result: 1 }))
      if (uid === 'player') await assertFails(deleteDoc(ref(db, path)))
      await assertSucceeds(deleteDoc(ref(as('gm'), path)))
      await seed(path, { result: 1 })
      await assertSucceeds(deleteDoc(ref(as('admin'), path)))
    })

    it('denies spectator, ended-participant and missing-parent creates', async () => {
      await assertFails(setDoc(ref(as('spectator'), `combats/fight/${child}/forged`), { result: 1 }))
      await seed('combats/fight', { ...fight, status: 'ended' })
      await assertFails(setDoc(ref(as('player'), `combats/fight/${child}/late`), { result: 1 }))
      await assertFails(setDoc(ref(as('player'), `combats/missing/${child}/orphan`), { result: 1 }))
    })
  })
})

describe.each(['characters/hero', 'npcSheets/npc'])('sheet fence at %s', (path) => {
  const writers = path.startsWith('characters') ? ['player', 'gm', 'admin'] : ['gm', 'admin']

  it.each(writers)('%s commits a real intention from a legacy missing revision and replays its receipt', async (uid) => {
    const db = as(uid)
    const original = await assertSucceeds(saveSheetIntention(db, ref(db, path), intention))
    expect(original).toMatchObject({ status: 'committed', revision: 1 })
    expect(await saveSheetIntention(db, ref(db, path), intention)).toEqual(original)
    const second = { ...intention, operationId: 'second', baseRevision: 1 }
    expect(await saveSheetIntention(db, ref(db, path), second)).toMatchObject({ status: 'committed', revision: 2 })
    expect((await getDoc(ref(db, path))).data()).toMatchObject({ sheetRevision: 2, futureField: { kept: true }, lubec: { counters: { stress: 4 } } })
    expect((await getDoc(ref(db, path))).data()?.schemaWrittenAt.toMillis()).toBe(123)
    expect(await getDocs(collection(db, root, path, 'writeReceipts'))).toHaveProperty('size', 2)
  })

  it.each(writers)('%s cannot use an obsolete whole-sheet replacement, even with a fresh schema stamp', async (uid) => {
    const db = as(uid)
    await assertFails(setDoc(ref(db, path), { ...storedSheet, schemaWrittenAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(ref(db, path), { sheetRevision: 1, name: 'Current' }))
    await assertFails(setDoc(ref(db, path), { ...storedSheet, sheetRevision: 1, schemaWrittenAt: serverTimestamp() }))
    for (const revision of [0, 1, 3, 2.5, '2', null]) {
      await assertFails(updateDoc(ref(db, path), { sheetRevision: revision, name: 'Stale' }))
    }
    await assertSucceeds(updateDoc(ref(db, path), { sheetRevision: 2 }))
  })

  it.each(writers)('%s reads/creates immutable receipts and tears them down atomically with the sheet', async (uid) => {
    const db = as(uid)
    const receipt = ref(db, `${path}/writeReceipts/edit`)
    await assertSucceeds(setDoc(receipt, { intention, outcome: { status: 'committed', revision: 1 } }))
    await assertSucceeds(getDoc(receipt))
    await assertSucceeds(getDocs(collection(db, root, path, 'writeReceipts')))
    await assertFails(updateDoc(receipt, { outcome: { revision: 9 } }))
    await assertFails(setDoc(receipt, { intention }))
    const teardown = writeBatch(db)
    teardown.delete(receipt)
    teardown.delete(ref(db, path))
    await assertSucceeds(teardown.commit())
    expect((await getDoc(ref(as('gm'), path))).exists()).toBe(false)
  })

  it('rebases concurrent authenticated devices with both edits and immutable receipts surviving', async () => {
    const first = as(writers[0])
    const second = as('admin')
    const rename: SheetIntention = { operationId: 'rename', baseRevision: 0, edits: [{ kind: 'set', path: ['name'], base: { exists: true, value: 'Wayne' }, value: 'Wayne Gardner' }] }
    const results = await Promise.all([
      saveSheetIntention(first, ref(first, path), intention),
      saveSheetIntention(second, ref(second, path), rename),
    ])
    expect(results.map((result) => result.status)).toEqual(['committed', 'committed'])
    expect((await getDoc(ref(first, path))).data()).toMatchObject({ name: 'Wayne Gardner', sheetRevision: 2, lubec: { counters: { stress: 3 } } })
    expect(await getDocs(collection(first, root, path, 'writeReceipts'))).toHaveProperty('size', 2)
  })

  it('does not give spectators, inactive owners, outsiders or participants another owner/NPC sheet or receipts', async () => {
    const denied = ['spectator', 'inactive', 'outsider']
    if (path.startsWith('npcSheets')) denied.push('player')
    for (const uid of denied) {
      const db = as(uid)
      await assertFails(updateDoc(ref(db, path), { name: 'Forged', sheetRevision: 1 }))
      const receipt = ref(db, `${path}/writeReceipts/forged`)
      await seed(`${path}/writeReceipts/forged`, { intention })
      await assertFails(getDoc(receipt))
      await assertFails(getDocs(collection(db, root, path, 'writeReceipts')))
      await assertFails(setDoc(ref(db, `${path}/writeReceipts/new`), { intention }))
      await assertFails(updateDoc(receipt, { intention: {} }))
      await assertFails(deleteDoc(receipt))
    }
  })

  it.each([-1, 1.5, '1', null])('refuses a corrupt stored revision %s instead of treating it as legacy zero', async (revision) => {
    await seed(path, { ...storedSheet, sheetRevision: revision })
    await assertFails(updateDoc(ref(as('gm'), path), { sheetRevision: 1 }))
  })
})

describe('sheet and gear authority stays scoped', () => {
  it('refuses a retired member who still owns a sheet, including their receipts', async () => {
    await seed('characters/hero', { ...storedSheet, ownerUserId: 'inactive' })
    await assertFails(updateDoc(ref(as('inactive'), 'characters/hero'), { sheetRevision: 1 }))
    await assertFails(setDoc(ref(as('inactive'), 'characters/hero/writeReceipts/stale'), { intention }))
  })

  it('keeps the schema floor and stamp while accepting a revisioned repair with a fresh stamp', async () => {
    const db = as('player')
    await assertFails(updateDoc(ref(db, 'characters/hero'), { sheetRevision: 1, schemaVersion: 0, schemaWrittenAt: serverTimestamp() }))
    await assertFails(updateDoc(ref(db, 'characters/hero'), { sheetRevision: 1, schemaVersion: 1.5 }))
    await assertFails(updateDoc(ref(db, 'characters/hero'), { sheetRevision: 1, schemaWrittenAt: new Date(456) }))
    await assertSucceeds(updateDoc(ref(db, 'characters/hero'), { sheetRevision: 1, schemaWrittenAt: serverTimestamp() }))
  })

  it('leaves current OSE/VtM saves writable without revisions', async () => {
    for (const system of ['ose', 'vtm']) {
      await env.withSecurityRulesDisabled(async (context) => { await updateDoc(doc(context.firestore(), root), { system }) })
      await assertSucceeds(updateDoc(ref(as('player'), 'characters/hero'), { name: system, schemaWrittenAt: serverTimestamp() }))
      await assertSucceeds(updateDoc(ref(as('gm'), 'npcSheets/npc'), { name: system }))
    }
  })

  it('does not let a sheet system field bypass the campaign revision fence', async () => {
    await assertFails(updateDoc(ref(as('player'), 'characters/hero'), { system: 'ose', schemaWrittenAt: serverTimestamp() }))
  })

  it('allows a protocol-conformant gear drop, but never another owner, NPC, or GM library mutation', async () => {
    const db = as('player')
    const batch = writeBatch(db)
    batch.update(ref(db, 'characters/hero'), { sheetRevision: 1, 'lubec.gear': { items: [] } })
    batch.set(ref(db, 'characters/hero/writeReceipts/drop'), { intention })
    batch.set(ref(db, 'gmItems/dropped'), { status: 'dropped', droppedByUserId: 'player' })
    await assertSucceeds(batch.commit())
    await assertFails(updateDoc(ref(db, 'npcSheets/npc'), { sheetRevision: 1 }))
    await seed('characters/other', { ...storedSheet, ownerUserId: 'spectator' })
    await assertFails(updateDoc(ref(db, 'characters/other'), { sheetRevision: 1 }))
    await assertFails(updateDoc(ref(db, 'gmItems/ball'), { name: 'Forged' }))
    await assertFails(deleteDoc(ref(db, 'gmItems/ball')))
    await assertFails(setDoc(ref(db, 'gmItems/new-library'), { status: 'library' }))
  })
})
