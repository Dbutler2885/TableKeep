// The Clocks rules against the real `firestore.rules`. The GM sees every clock
// and alone chooses who else sees one, as with handouts. A player sees a clock
// shown to everyone or to them, and may fill, empty, edit and delete it with
// no GM gate, but never change who sees it; a clock a player makes is shown to
// everyone. Nobody outside the group sees anything. The rules also hold the
// clock's shape. The writes go through the app's own write helpers, and a
// player's list goes through the app's own query.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, or, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, type Firestore } from 'firebase/firestore'
import { emulatorPort } from '../../../../vitest.emulatorEndpoint'
import { firestoreRules } from '../../../../vitest.firestoreRules'
import { emptyLubecClockFields, hiddenLubecClockSharing, sharedLubecClockSharing, type LubecClock, type LubecClockSharing } from './lubecClock'
import { createLubecClock, deleteLubecClock, saveLubecClock, setLubecClockPiece } from './lubecClockWrites'

const GROUP = 'clock-group'
const CAMPAIGN = 'clock-campaign'
const root = `groups/${GROUP}/campaigns/${CAMPAIGN}`
const scope = { groupId: GROUP, campaignId: CAMPAIGN }

let env: RulesTestEnvironment
const dbFor = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore
const records = (uid: string) => ({ db: dbFor(uid), scope })
const clockRef = (uid: string, id: string) => doc(dbFor(uid), `${root}/clocks/${id}`)
const playerList = (uid: string) => getDocs(query(collection(dbFor(uid), `${root}/clocks`), or(where('visibility', '==', 'all'), where('viewerUids', 'array-contains', uid))))

const toAlice: LubecClockSharing = { visibility: 'some', characterIds: ['wayne'], viewerUids: ['alice'] }

const clock = (id = 'sheriff', over: Partial<LubecClock> = {}): LubecClock => ({
  ...emptyLubecClockFields(), ...sharedLubecClockSharing(), id, name: 'Sheriff', pieces: 4, filled: [], started: false, createdAtMs: 0, ...over,
})

const seedClock = (id: string, over: Record<string, unknown> = {}) => env.withSecurityRulesDisabled(async (admin) => {
  await setDoc(doc(admin.firestore(), `${root}/clocks/${id}`), {
    ...emptyLubecClockFields(), ...sharedLubecClockSharing(), name: 'Sheriff', pieces: 4, filled: [], started: false,
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

// The campaign's GM is an ordinary member whose uid the campaign names; `admin` is a group admin, who is a GM by role.
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (admin) => {
    for (const uid of ['gm', 'admin', 'alice', 'bob', 'removed']) {
      await setDoc(doc(admin.firestore(), `groups/${GROUP}/members/${uid}`), {
        userId: uid, role: uid === 'admin' ? 'admin' : 'member', status: uid === 'removed' ? 'inactive' : 'active',
      })
    }
    await setDoc(doc(admin.firestore(), root), { gmUserId: 'gm', system: 'lubec' })
  })
})

afterAll(async () => { await env?.cleanup() })

describe('who sees a clock', () => {
  beforeEach(async () => {
    await seedClock('hidden', hiddenLubecClockSharing())
    await seedClock('all', sharedLubecClockSharing())
    await seedClock('alice-only', { ...toAlice, viewerUids: ['alice', 'removed'] })
  })

  it.each(['gm', 'admin'])('lets %s read and list every clock, hidden ones included', async (uid) => {
    for (const id of ['hidden', 'all', 'alice-only']) await assertSucceeds(getDoc(clockRef(uid, id)))
    expect((await assertSucceeds(getDocs(collection(dbFor(uid), `${root}/clocks`)))).size).toBe(3)
  })

  it('shows a player the clocks shown to everyone and to them, and no others', async () => {
    await assertSucceeds(getDoc(clockRef('alice', 'all')))
    await assertSucceeds(getDoc(clockRef('alice', 'alice-only')))
    await assertFails(getDoc(clockRef('alice', 'hidden')))
    expect((await assertSucceeds(playerList('alice'))).docs.map((d) => d.id).sort()).toEqual(['alice-only', 'all'])
  })

  it('keeps another player off a clock shown to someone else', async () => {
    await assertFails(getDoc(clockRef('bob', 'alice-only')))
    await assertFails(getDoc(clockRef('bob', 'hidden')))
    expect((await assertSucceeds(playerList('bob'))).docs.map((d) => d.id)).toEqual(['all'])
  })

  it('refuses a player the whole list, which would include clocks not shown to them', async () => {
    await assertFails(getDocs(collection(dbFor('alice'), `${root}/clocks`)))
  })

  it.each(['removed', 'outsider'])('refuses %s even a clock shown to everyone, or to them', async (uid) => {
    await assertFails(getDoc(clockRef(uid, 'all')))
    await assertFails(getDoc(clockRef(uid, 'alice-only')))
    await assertFails(playerList(uid))
  })

  it('refuses someone signed out', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `${root}/clocks/all`)))
  })
})

describe('what a player may do', () => {
  it('lets a player fill, empty, edit and delete a clock shown to them', async () => {
    await seedClock('alice-only', toAlice)
    const shown = clock('alice-only', toAlice)
    await assertSucceeds(setLubecClockPiece(records('alice'), shown, 3, true))
    await assertSucceeds(setLubecClockPiece(records('alice'), shown, 0, true))
    await assertSucceeds(setLubecClockPiece(records('alice'), shown, 3, false))
    await assertSucceeds(saveLubecClock(records('alice'), { ...shown, filled: [0] }, { ...emptyLubecClockFields(), name: 'Deputy', pieces: 2 }, null))
    expect(await readClock('alice-only')).toMatchObject({ name: 'Deputy', pieces: 2, filled: [0], started: true, ...toAlice })
    await assertSucceeds(deleteLubecClock(records('alice'), shown))
  })

  it('refuses a player any write to a clock not shown to them', async () => {
    await seedClock('hidden', hiddenLubecClockSharing())
    await seedClock('alice-only', toAlice)
    for (const id of ['hidden', 'alice-only']) {
      await assertFails(setLubecClockPiece(records('bob'), clock(id), 1, true))
      await assertFails(saveLubecClock(records('bob'), clock(id), { ...emptyLubecClockFields(), name: 'Mine' }, null))
      await assertFails(deleteLubecClock(records('bob'), clock(id)))
    }
  })

  it.each([
    ['hide it', hiddenLubecClockSharing()],
    ['show it only to themselves', { visibility: 'some', characterIds: ['wayne'], viewerUids: ['alice'] }],
  ] as const)('refuses a player who tries to %s', async (_label, sharing) => {
    await seedClock('all')
    await assertFails(saveLubecClock(records('alice'), clock('all'), { ...emptyLubecClockFields(), name: 'Sheriff' }, sharing))
  })

  it('refuses a player who adds someone to a clock shown to them', async () => {
    await seedClock('alice-only', toAlice)
    await assertFails(updateDoc(clockRef('alice', 'alice-only'), { viewerUids: ['alice', 'bob'], updatedAt: serverTimestamp() }))
  })

  it('lets a player make a clock shown to everyone, and nothing else', async () => {
    const id = await assertSucceeds(createLubecClock(records('alice'), { ...emptyLubecClockFields(), name: 'Mine' }, sharedLubecClockSharing()))
    expect(await readClock(id)).toMatchObject({ name: 'Mine', visibility: 'all', viewerUids: [] })
    await assertFails(createLubecClock(records('alice'), { ...emptyLubecClockFields(), name: 'Secret' }, hiddenLubecClockSharing()))
    await assertFails(createLubecClock(records('alice'), { ...emptyLubecClockFields(), name: 'Mine only' }, toAlice))
  })

  it.each(['removed', 'outsider'])('refuses %s any write', async (uid) => {
    await seedClock('all')
    await assertFails(createLubecClock(records(uid), { ...emptyLubecClockFields(), name: 'Mine' }, sharedLubecClockSharing()))
    await assertFails(setLubecClockPiece(records(uid), clock('all'), 1, true))
    await assertFails(deleteLubecClock(records(uid), clock('all')))
  })
})

describe('what the GM may do', () => {
  it.each(['gm', 'admin'])('lets %s make a hidden clock, show it to chosen players, then to everyone, and delete it', async (uid) => {
    const id = await assertSucceeds(createLubecClock(records(uid), { ...emptyLubecClockFields(), name: 'Sheriff' }, hiddenLubecClockSharing()))
    const made = clock(id, hiddenLubecClockSharing())
    await assertSucceeds(setLubecClockPiece(records(uid), made, 2, true))
    await assertSucceeds(saveLubecClock(records(uid), made, { ...emptyLubecClockFields(), name: 'Sheriff' }, toAlice))
    await assertSucceeds(getDoc(clockRef('alice', id)))
    await assertFails(getDoc(clockRef('bob', id)))
    await assertSucceeds(saveLubecClock(records(uid), made, { ...emptyLubecClockFields(), name: 'Sheriff' }, sharedLubecClockSharing()))
    await assertSucceeds(getDoc(clockRef('bob', id)))
    await assertSucceeds(deleteLubecClock(records(uid), made))
  })

  it('lets the GM fill and delete a hidden clock', async () => {
    await seedClock('hidden', hiddenLubecClockSharing())
    await assertSucceeds(setLubecClockPiece(records('gm'), clock('hidden'), 1, true))
    await assertSucceeds(deleteDoc(clockRef('gm', 'hidden')))
  })
})

describe('the shape of a clock', () => {
  const valid = () => ({
    ...emptyLubecClockFields(), ...sharedLubecClockSharing(), name: 'Sheriff', pieces: 4, filled: [], started: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  })

  it('accepts a whole clock, with every piece filled in any order', async () => {
    await assertSucceeds(setDoc(clockRef('gm', 'c1'), valid()))
    await assertSucceeds(setDoc(clockRef('gm', 'c2'), { ...valid(), filled: [3, 0, 2, 1] }))
  })

  it.each([
    ['no name', { name: '' }],
    ['a name past 100 characters', { name: 'x'.repeat(101) }],
    ['a description past 1000 characters', { description: 'x'.repeat(1001) }],
    ['a note past 500 characters', { whenEmpty: 'x'.repeat(501) }],
    ['no pieces', { pieces: 0 }],
    ['eleven pieces', { pieces: 11 }],
    ['a fraction of a piece', { pieces: 2.5 }],
    ['a fill that is a count, not pieces', { filled: 2 }],
    ['a piece past the last', { filled: [4] }],
    ['a piece below the first', { filled: [-1] }],
    ['a piece that is not a whole number', { filled: [1.5] }],
    ['a piece named as text', { filled: ['1'] }],
    ['a piece filled twice', { filled: [1, 1] }],
    ['a started flag that is not a flag', { started: 'yes' }],
    ['a visibility it does not know', { visibility: 'gm' }],
    ['viewers on a clock shown to everyone', { viewerUids: ['alice'] }],
    ['viewers on a hidden clock', { visibility: 'hidden', viewerUids: ['alice'] }],
    ['viewers that are not a list', { visibility: 'some', viewerUids: 'alice' }],
    ['a field it does not have', { owner: 'alice' }],
    ['a creation time from the client', { createdAt: Timestamp.fromMillis(5) }],
  ])('refuses %s', async (_label, over) => {
    await assertFails(setDoc(clockRef('gm', 'c1'), { ...valid(), ...over }))
  })

  it('refuses a clock missing one of its fields', async () => {
    const { whenFull: _whenFull, ...partial } = valid()
    await assertFails(setDoc(clockRef('gm', 'c1'), partial))
    const { visibility: _visibility, ...unshared } = valid()
    await assertFails(setDoc(clockRef('gm', 'c2'), unshared))
  })

  it('refuses filling a piece the clock does not have', async () => {
    await seedClock('all')
    await assertFails(setLubecClockPiece(records('alice'), clock('all'), 4, true))
  })

  it('lets two people fill different pieces at once without losing either', async () => {
    await seedClock('all')
    await Promise.all([
      assertSucceeds(setLubecClockPiece(records('alice'), clock('all'), 1, true)),
      assertSucceeds(setLubecClockPiece(records('gm'), clock('all'), 3, true)),
    ])
    expect(((await readClock('all'))?.filled as number[]).sort()).toEqual([1, 3])
  })

  it('refuses an edit that cuts the pieces below a filled one without emptying it', async () => {
    await seedClock('all', { pieces: 6, filled: [0, 5] })
    await assertFails(updateDoc(clockRef('alice', 'all'), { pieces: 3, updatedAt: serverTimestamp() }))
  })

  it('refuses an edit that rewrites when the clock was made, or leaves its update time stale', async () => {
    await seedClock('all')
    await assertFails(updateDoc(clockRef('gm', 'all'), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(clockRef('gm', 'all'), { filled: [1] }))
  })
})
