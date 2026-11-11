// The Clocks rules against the real `firestore.rules`: every active member of
// the group may read, make, edit, fill, empty and delete a clock, with no GM
// gate; nobody else may; and the rules hold the clock's shape, so its fill
// stays between empty and full and its text within its limits. The writes go
// through the app's own write helpers.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc, type Firestore } from 'firebase/firestore'
import { emulatorPort } from '../../../../vitest.emulatorEndpoint'
import { firestoreRules } from '../../../../vitest.firestoreRules'
import { emptyLubecClockFields, type LubecClock } from './lubecClock'
import { createLubecClock, deleteLubecClock, saveLubecClock, setLubecClockFill, stepLubecClock } from './lubecClockWrites'

const GROUP = 'clock-group'
const CAMPAIGN = 'clock-campaign'
const root = `groups/${GROUP}/campaigns/${CAMPAIGN}`
const scope = { groupId: GROUP, campaignId: CAMPAIGN }

let env: RulesTestEnvironment
const dbFor = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore
const records = (uid: string) => ({ db: dbFor(uid), scope })
const clockRef = (uid: string, id: string) => doc(dbFor(uid), `${root}/clocks/${id}`)

const clock = (over: Partial<LubecClock> = {}): LubecClock => ({
  ...emptyLubecClockFields(), id: 'sheriff', name: 'Sheriff', pieces: 4, filled: 0, started: false, createdAtMs: 0, ...over,
})

const seedClock = (id: string, over: Record<string, unknown> = {}) => env.withSecurityRulesDisabled(async (admin) => {
  await setDoc(doc(admin.firestore(), `${root}/clocks/${id}`), {
    ...emptyLubecClockFields(), name: 'Sheriff', pieces: 4, filled: 0, started: false,
    createdAt: Timestamp.fromMillis(1000), updatedAt: Timestamp.fromMillis(1000), ...over,
  })
})

const readClock = async (id: string) => {
  let data: Record<string, unknown> | undefined
  await env.withSecurityRulesDisabled(async (admin) => { data = (await getDoc(doc(admin.firestore(), `${root}/clocks/${id}`))).data() })
  return data
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-lubec-clocks',
    firestore: { host: '127.0.0.1', port: emulatorPort('FIRESTORE_EMULATOR_HOST', 8080), rules: firestoreRules() },
  })
}, 30000)

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (admin) => {
    for (const uid of ['gm', 'alice', 'removed']) {
      await setDoc(doc(admin.firestore(), `groups/${GROUP}/members/${uid}`), {
        userId: uid, role: uid === 'gm' ? 'admin' : 'member', status: uid === 'removed' ? 'inactive' : 'active',
      })
    }
    await setDoc(doc(admin.firestore(), root), { gmUserId: 'gm', system: 'lubec' })
  })
})

afterAll(async () => { await env?.cleanup() })

describe('who may use the clocks', () => {
  it.each(['gm', 'alice'])('lets %s make, list, edit, fill, empty and delete a clock', async (uid) => {
    const id = await assertSucceeds(createLubecClock(records(uid), { ...emptyLubecClockFields(), name: 'Sheriff', whenFull: 'He calls the parents' }))
    await assertSucceeds(getDocs(collection(dbFor(uid), `${root}/clocks`)))
    const made = clock({ id })
    await assertSucceeds(setLubecClockFill(records(uid), made, 3))
    await assertSucceeds(stepLubecClock(records(uid), made, 1))
    await assertSucceeds(stepLubecClock(records(uid), made, -1))
    await assertSucceeds(saveLubecClock(records(uid), { ...made, filled: 3 }, { ...emptyLubecClockFields(), name: 'Deputy', pieces: 2 }))
    expect(await readClock(id)).toMatchObject({ name: 'Deputy', pieces: 2, filled: 2, started: true, whenFull: '' })
    await assertSucceeds(deleteLubecClock(records(uid), made))
    expect(await readClock(id)).toBeUndefined()
  })

  it.each(['removed', 'outsider'])('refuses %s every read and write', async (uid) => {
    await seedClock('sheriff')
    await assertFails(getDoc(clockRef(uid, 'sheriff')))
    await assertFails(getDocs(collection(dbFor(uid), `${root}/clocks`)))
    await assertFails(createLubecClock(records(uid), { ...emptyLubecClockFields(), name: 'Mine' }))
    await assertFails(setLubecClockFill(records(uid), clock(), 1))
    await assertFails(deleteLubecClock(records(uid), clock()))
  })

  it('refuses someone signed out', async () => {
    await seedClock('sheriff')
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `${root}/clocks/sheriff`)))
  })
})

describe('the shape of a clock', () => {
  const valid = () => ({
    ...emptyLubecClockFields(), name: 'Sheriff', pieces: 4, filled: 0, started: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  })

  it('accepts a whole clock', async () => {
    await assertSucceeds(setDoc(clockRef('alice', 'c1'), valid()))
  })

  it.each([
    ['no name', { name: '' }],
    ['a name past 100 characters', { name: 'x'.repeat(101) }],
    ['a description past 1000 characters', { description: 'x'.repeat(1001) }],
    ['a note past 500 characters', { whenEmpty: 'x'.repeat(501) }],
    ['no pieces', { pieces: 0 }],
    ['eleven pieces', { pieces: 11 }],
    ['a fraction of a piece', { pieces: 2.5 }],
    ['a fill past full', { filled: 5 }],
    ['a fill below empty', { filled: -1 }],
    ['a started flag that is not a flag', { started: 'yes' }],
    ['a field it does not have', { owner: 'alice' }],
    ['a creation time from the client', { createdAt: Timestamp.fromMillis(5) }],
  ])('refuses %s', async (_label, over) => {
    await assertFails(setDoc(clockRef('alice', 'c1'), { ...valid(), ...over }))
  })

  it('refuses a clock missing one of its fields', async () => {
    const { whenFull: _whenFull, ...partial } = valid()
    await assertFails(setDoc(clockRef('alice', 'c1'), partial))
  })

  it('refuses a step past full, which is how the second of two steps on an almost-full clock fails', async () => {
    await seedClock('sheriff', { filled: 4, started: true })
    await assertFails(stepLubecClock(records('alice'), clock({ filled: 3 }), 1))
    await seedClock('sheriff', { filled: 0 })
    await assertFails(stepLubecClock(records('alice'), clock({ filled: 1 }), -1))
  })

  it('refuses an edit that cuts the pieces below the fill without moving the fill', async () => {
    await seedClock('sheriff', { pieces: 6, filled: 5 })
    await assertFails(updateDoc(clockRef('alice', 'sheriff'), { pieces: 3, updatedAt: serverTimestamp() }))
  })

  it('refuses an edit that rewrites when the clock was made, or leaves its update time stale', async () => {
    await seedClock('sheriff')
    await assertFails(updateDoc(clockRef('alice', 'sheriff'), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(clockRef('alice', 'sheriff'), { filled: 1 }))
  })

  it('lets a member delete a clock someone else made', async () => {
    await seedClock('sheriff')
    await assertSucceeds(deleteDoc(clockRef('alice', 'sheriff')))
  })
})
