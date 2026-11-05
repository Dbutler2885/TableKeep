/**
 * Round 1's Movement and Declare through the real transaction adapter and the
 * real Firestore rules, with the GM and two players on separate clients:
 * a contest for the last ball settled by the GM's workspace, hands filled
 * before settlement, a lost acknowledgement retried, both answers to a Leave,
 * Run's empty declaration, and Declare waiting on a delayed due wound while
 * independent actions commit side by side.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, runTransaction, setDoc, updateDoc, type Firestore } from 'firebase/firestore'
import { emulatorPort } from '../../../../vitest.emulatorEndpoint'
import { firestoreRules } from '../../../../vitest.firestoreRules'
import { lubecCharacterSheet } from '../../ruleSets/lubec/sheetFixtures'
import { commitCombatCommand, type CombatTransactionOptions } from './combatTransaction'
import { combatCommandJournal, createCombatCommand, type CombatJournalStorage } from './commandJournal'
import type { CombatCommand, CombatFight, CombatOutcome, CombatState } from './engine/types'
import { drainCombatWounds } from './woundDelivery'
import type { CombatWound } from './woundTypes'

const scope = { groupId: 'rounds', campaignId: 'gym' }
const root = 'groups/rounds/campaigns/gym'
const FIGHT = 'fight-rounds'
const HERO = 'character:hero'
const DOTTIE = 'character:dottie'
const ROY = 'npc:roy'
let env: RulesTestEnvironment
const as = (uid: string): Firestore => env.authenticatedContext(uid).firestore()
const ref = (db: Firestore, path: string) => doc(db, root, path)
const ball = (id: string, slot: number) => ({ id, kind: 'weapon', mode: 'thrown', name: 'Dodgeball', carrier: 'hands', slot, size: 1, qty: 1, weight: 'normal', note: '', impact: 0, wounds: ['blunt'], table: 'dodgeball', catchChance: 50, catchPutsThrowerOut: true })
const sheet = (name: string, ownerUserId: string, items: object[] = []) => ({
  system: 'lubec', name, ownerUserId, creationStatus: 'active', schemaVersion: 1, sheetRevision: 2, schemaWrittenAt: new Date(123),
  lubec: lubecCharacterSheet({ base: { ...lubecCharacterSheet().base, Handle: 45 }, skills: { free: 'Athletics', picked: ['Throwing Arm'] }, gear: { items } as never }),
})

function storage(): CombatJournalStorage {
  const entries = new Map<string, string>()
  return { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value) }, removeItem: (key) => { entries.delete(key) }, key: (index) => [...entries.keys()][index] ?? null, get length() { return entries.size } }
}
const options = (userId: string, extra: Partial<CombatTransactionOptions> = {}): CombatTransactionOptions => ({ userId, journal: combatCommandJournal(storage(), userId), ...extra })
const readFight = async (db: Firestore) => (await getDoc(ref(db, `combats/${FIGHT}`))).data() as CombatFight
const readSheet = async (db: Firestore, path: string) => (await getDoc(ref(db, path))).data() as { sheetRevision: number; lubec: { gear: { items: { id: string; name: string; carrier: string }[] } } }
const seed = (path: string, data: object) => env.withSecurityRulesDisabled(async (context) => { await setDoc(ref(context.firestore(), path), data) })
const patchState = (change: (state: CombatState) => Partial<CombatState>) => env.withSecurityRulesDisabled(async (context) => {
  const db = context.firestore()
  const { state } = (await getDoc(ref(db, `combats/${FIGHT}`))).data() as CombatFight
  await updateDoc(ref(db, `combats/${FIGHT}`), { state: { ...state, ...change(state) } })
})

async function command(db: Firestore, id: string, actorKey: string | null, payload: CombatCommand['payload']): Promise<CombatCommand> {
  const { state } = await readFight(db)
  const sequence = state.combatants.find((actor) => actor.key === actorKey)?.interactionSequence ?? 0
  return createCombatCommand({ ...scope, id, fightId: FIGHT, round: state.round, phase: state.phase, stageInstanceId: state.stageInstanceId, actorKey, interactionSequence: sequence }, payload, () => 'seed')
}
const commit = (db: Firestore, next: CombatCommand, userId: string, extra: Partial<CombatTransactionOptions> = {}): Promise<CombatOutcome> =>
  commitCombatCommand(db, next, options(userId, extra))
const act = async (uid: string, id: string, actorKey: string | null, payload: CombatCommand['payload']) =>
  commit(as(uid), await command(as(uid), id, actorKey, payload), uid)

const ORDER = [DOTTIE, HERO, ROY]
/** Round 1 begins as initiative left it: Dottie fastest, then Wayne, then Roy, everyone asked for Movement. */
const toMovement = () => patchState(() => ({
  round: 1, phase: 'movement', stageInstanceId: 'movement-1', order: ORDER, movementComplete: false,
  pendingActions: ORDER.map((combatantKey) => ({ combatantKey, action: 'movement' as const })),
}))

const claim = { choice: 'pickup', pickup: { itemId: 'floor-ball', qty: 1 } }
const stay = { choice: 'stay', pickup: null }

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev', firestore: { host: '127.0.0.1', port: emulatorPort('FIRESTORE_EMULATOR_HOST', 8080), rules: firestoreRules() } })
})
afterAll(async () => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    for (const [uid, role] of [['gm', 'admin'], ['player', 'member'], ['player2', 'member'], ['spectator', 'member']]) {
      await setDoc(doc(db, 'groups/rounds/members', uid), { userId: uid, role, status: 'active' })
    }
    await setDoc(ref(db, ''), { system: 'lubec', gmUserId: 'gm' })
    await setDoc(ref(db, 'characters/hero'), sheet('Wayne', 'player'))
    await setDoc(ref(db, 'characters/dottie'), sheet('Dottie', 'player2'))
    await setDoc(ref(db, 'npcSheets/roy'), sheet('Roy', 'gm', [ball('roy-ball', 0)]))
    await setDoc(ref(db, 'npcs/roy'), { name: 'Roy Carver', portraitPath: '' })
    await setDoc(ref(db, 'gmItems/floor-ball'), { name: 'Dodgeball', kind: 'weapon', mode: 'thrown', status: 'dropped', qty: 1, size: 1, impact: 0, wounds: ['blunt'], table: 'dodgeball', catchChance: 50, catchPutsThrowerOut: true })
  })
  const start = createCombatCommand({ ...scope, id: 'start', fightId: FIGHT, round: 0, phase: 'setup', stageInstanceId: 'setup', actorKey: null, interactionSequence: 0 },
    { type: 'start', combatants: [{ kind: 'character', sheetId: 'hero' }, { kind: 'character', sheetId: 'dottie' }, { kind: 'npc', sheetId: 'roy' }], floor: [{ itemId: 'floor-ball', status: 'dropped', qty: 1 }], dodgeball: true }, () => 'seed')
  expect(await commit(as('gm'), start, 'gm')).toMatchObject({ ok: true })
  await toMovement()
})

describe('Movement between the GM and two players', () => {
  it('keeps two players\' concurrent confirmations, and a later confirmation writes nobody\'s sheet', async () => {
    const [mine, hers] = await Promise.all([
      act('player', 'move-hero', HERO, { type: 'move', ...claim }),
      act('player2', 'move-dottie', DOTTIE, { type: 'move', ...claim }),
    ])
    expect([mine, hers]).toEqual([expect.objectContaining({ ok: true }), expect.objectContaining({ ok: true })])
    const { state } = await readFight(as('spectator'))
    expect(state.combatants.filter((entry) => entry.movement).map((entry) => entry.key).sort()).toEqual([DOTTIE, HERO])
    expect((await readSheet(as('gm'), 'characters/hero')).sheetRevision).toBe(2)
    expect((await readSheet(as('gm'), 'characters/dottie')).sheetRevision).toBe(2)
    expect(await act('player', 'move-roy', ROY, { type: 'move', ...stay })).toEqual({ ok: false, reason: 'That combatant belongs to someone else.' })
  })

  it('gives the last ball to the next claimant when the faster one\'s hands filled, settles once across a lost acknowledgement, and is the GM\'s alone', async () => {
    expect(await act('player2', 'move-dottie', DOTTIE, { type: 'move', ...claim })).toMatchObject({ ok: true })
    expect(await act('gm', 'npcs', null, { type: 'npcMovement', choices: { [ROY]: stay } })).toMatchObject({ ok: true })
    expect(await act('player', 'move-hero', HERO, { type: 'move', ...claim })).toMatchObject({ ok: true })
    expect((await readFight(as('player'))).state).toMatchObject({ movementComplete: true, pendingActions: [] })
    const dottie = (await getDoc(ref(as('gm'), 'characters/dottie'))).data()!
    await seed('characters/dottie', { ...dottie, sheetRevision: 3, lubec: { ...dottie.lubec, gear: { items: [ball('dottie-a', 0), ball('dottie-b', 1)] } } })
    expect(await act('player', 'settle-player', null, { type: 'settleMovement' })).toEqual({ ok: false, reason: 'Only the GM can do that.' })
    const gm = as('gm')
    const settle = await command(gm, 'settle', null, { type: 'settleMovement' })
    const lost = commit(gm, settle, 'gm', { transact: async (callback) => { await runTransaction(gm, callback); throw new Error('The connection dropped.') } })
    await expect(lost).rejects.toThrow('The connection dropped.')
    const retried = await commit(gm, structuredClone(settle), 'gm')
    expect(retried).toMatchObject({ ok: true })
    const hero = await readSheet(gm, 'characters/hero')
    expect(hero.sheetRevision).toBe(3)
    expect(hero.lubec.gear.items).toEqual([expect.objectContaining({ id: 'floor-ball', name: 'Dodgeball', carrier: 'hands' })])
    expect((await readSheet(gm, 'characters/dottie')).sheetRevision).toBe(3)
    const { state } = await readFight(as('spectator'))
    expect(state).toMatchObject({ phase: 'declare', floor: [], pendingActions: [{ combatantKey: ROY, action: 'declare' }] })
    const log = (await getDocs(collection(gm, root, 'combats', FIGHT, 'log'))).docs.map((entry) => entry.data().event as string)
    expect(log).toEqual(expect.arrayContaining(['Dottie could not pick up the Dodgeball: no free hand.', 'Wayne picked up the Dodgeball.']))
    expect(await act('gm', 'settle-again', null, { type: 'settleMovement' })).toEqual({ ok: false, reason: 'Movement is not ready to settle.' })
  })

  it('refuses a Leave, then confirms it: Out at the close, with a runner\'s empty declaration and the stage moving on', async () => {
    expect(await act('player', 'leave-1', HERO, { type: 'move', choice: 'leave' })).toMatchObject({ ok: true })
    expect(await act('player', 'answer-self', null, { type: 'answerLeave', combatantKey: HERO, confirm: true })).toEqual({ ok: false, reason: 'Only the GM can do that.' })
    expect(await act('gm', 'refuse', null, { type: 'answerLeave', combatantKey: HERO, confirm: false })).toMatchObject({ ok: true })
    expect((await readFight(as('player'))).state.combatants.find((entry) => entry.key === HERO)!.movement).toBeNull()
    expect(await act('player', 'leave-2', HERO, { type: 'move', choice: 'leave' })).toMatchObject({ ok: true })
    expect(await act('player2', 'run', DOTTIE, { type: 'move', choice: 'run' })).toMatchObject({ ok: true })
    expect(await act('gm', 'npcs', null, { type: 'npcMovement', choices: { [ROY]: stay } })).toMatchObject({ ok: true })
    expect((await readFight(as('gm'))).state.movementComplete).toBe(false)
    expect(await act('gm', 'confirm', null, { type: 'answerLeave', combatantKey: HERO, confirm: true })).toMatchObject({ ok: true })
    const stale = await command(as('player'), 'late', HERO, { type: 'move', ...stay })
    expect(await act('gm', 'settle', null, { type: 'settleMovement' })).toMatchObject({ ok: true })
    const { state } = await readFight(as('spectator'))
    expect(state.combatants.find((entry) => entry.key === HERO)!.outReason).toBe('left')
    expect(state.combatants.find((entry) => entry.key === DOTTIE)!.declaration).toMatchObject({ ran: true, aim: null, lines: [] })
    expect(state.pendingActions).toEqual([{ combatantKey: ROY, action: 'declare' }])
    expect(await commit(as('player'), stale, 'player')).toEqual({ ok: false, reason: 'That fight stage is stale.' })
  })
})

const wound = (overrides: Partial<CombatWound> = {}): CombatWound => ({
  id: 'w-hero', target: { kind: 'character', sheetId: 'hero' }, originatingRound: 0, effectiveRound: 1, traumaDelta: 1, stressDelta: 0,
  effect: { id: 'winded', name: 'Winded', cause: 'Winded row', steps: [{ modifiers: [{ target: 'Handle', amount: -10 }], labels: [] }] }, ...overrides,
})

/** Declare as Movement leaves it when everyone stayed: Roy first, then Wayne, then Dottie. */
const toDeclare = (outbox: CombatWound[] = []) => patchState((state) => ({
  phase: 'declare', stageInstanceId: 'declare-1', movementComplete: false, woundOutbox: outbox,
  combatants: state.combatants.map((entry) => ({ ...entry, movement: { choice: 'stay', pickup: null, leave: null } })),
  pendingActions: [{ combatantKey: ROY, action: 'declare' as const }],
}))
const royThrow = { targetKey: HERO, weaponItemId: 'roy-ball', attackId: 'throw', defense: { against: HERO, amount: 20 } }

describe('Declare between the GM and two players', () => {
  it('waits for a delayed due wound, freezes Handle from the delivered sheet, and lets independent actions commit side by side', async () => {
    await toDeclare([wound()])
    const [royDeclared] = await Promise.all([
      act('gm', 'declare-roy', ROY, { type: 'declare', aim: royThrow }),
      act('player2', 'move-late', DOTTIE, { type: 'move', ...stay }),
    ])
    expect(royDeclared).toMatchObject({ ok: true })
    const early = await act('player', 'declare-early', HERO, { type: 'declare', full: true, against: ROY })
    expect(early).toEqual({ ok: false, reason: 'Waiting for wounds to reach the sheet' })
    await drainCombatWounds(as('gm'), { ...scope, fightId: FIGHT }, 'gm')
    expect((await readSheet(as('gm'), 'characters/hero')).sheetRevision).toBe(3)
    expect(await act('player', 'declare-hero', HERO, { type: 'declare', full: true, against: ROY })).toMatchObject({ ok: true })
    const { state } = await readFight(as('spectator'))
    expect(state.combatants.find((entry) => entry.key === HERO)!.declaration).toMatchObject({ full: true, total: 40, lines: [{ against: ROY, amount: 40 }], sourceRevision: 3 })
    expect(state.combatants.find((entry) => entry.key === ROY)!.declaration).toMatchObject({ aim: royThrow, lines: [{ against: HERO, amount: 20 }] })
    expect(state.pendingActions).toEqual([{ combatantKey: DOTTIE, action: 'declare' }])
  })

  it('refuses a declaration out of turn and anyone else\'s, then moves to Attack after the last one', async () => {
    await toDeclare()
    expect(await act('player', 'early', HERO, { type: 'declare', full: true, against: ROY })).toEqual({ ok: false, reason: "It is Roy Carver's turn to declare." })
    expect(await act('player', 'roy-for-me', ROY, { type: 'declare', aim: royThrow })).toEqual({ ok: false, reason: 'That combatant belongs to someone else.' })
    expect(await act('gm', 'roy', ROY, { type: 'declare', aim: royThrow })).toMatchObject({ ok: true })
    expect(await act('player', 'hero', HERO, { type: 'declare', full: true, against: ROY })).toMatchObject({ ok: true })
    expect(await act('gm', 'for-dottie', DOTTIE, { type: 'declare', full: true, against: ROY })).toMatchObject({ ok: true })
    const { state } = await readFight(as('spectator'))
    expect(state).toMatchObject({ phase: 'attack', pendingActions: [] })
    expect(state.stageInstanceId).not.toBe('declare-1')
  })
})
