/**
 * A Sneak Attack through the real transaction adapter and the real Firestore
 * rules, with the GM and the player on separate clients: grant, aim, range and
 * one Roll, a reload during aim and after the Roll, a missing input repaired
 * mid-step, and a transaction callback forced to run twice.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, runTransaction, setDoc, updateDoc, type Firestore } from 'firebase/firestore'
import { emulatorPort } from '../../../../vitest.emulatorEndpoint'
import { firestoreRules } from '../../../../vitest.firestoreRules'
import { lubecCharacterSheet } from '../../ruleSets/lubec/sheetFixtures'
import { commitCombatCommand, type CombatTransactionOptions } from './combatTransaction'
import { combatCommandJournal, createCombatCommand, type CombatJournalStorage } from './commandJournal'
import { combatEntropy } from './engine/commandEntropy'
import type { CombatAim, CombatCommand, CombatFight, CombatOutcome } from './engine/types'

const scope = { groupId: 'sneak', campaignId: 'gym' }
const root = 'groups/sneak/campaigns/gym'
const FIGHT = 'fight-start'
const HERO = 'character:hero'
let env: RulesTestEnvironment
const as = (uid: string): Firestore => env.authenticatedContext(uid).firestore()
const ref = (db: Firestore, path: string) => doc(db, root, path)
const ball = { id: 'ball', kind: 'weapon', mode: 'thrown', name: 'Dodgeball', carrier: 'hands', slot: 0, size: 1, qty: 2, weight: 'normal', note: '', impact: 0, wounds: ['blunt'], table: 'dodgeball', catchChance: 50 }
// A Working Kid's class adds 5 Handle: base 45 reads as 50, and Throwing Arm adds 15.
const heroSheet = () => ({
  system: 'lubec', name: 'Wayne', ownerUserId: 'player', creationStatus: 'active', schemaVersion: 1, sheetRevision: 2, schemaWrittenAt: new Date(123),
  lubec: lubecCharacterSheet({ base: { ...lubecCharacterSheet().base, Handle: 45 }, skills: { free: 'Athletics', picked: ['Throwing Arm'] }, gear: { items: [ball] } as never }),
})
const aim: CombatAim = { targetKey: 'npc:roy', weaponItemId: 'ball', attackId: 'throw', defense: { against: 'npc:roy', amount: 20 } }

function storage(): CombatJournalStorage {
  const entries = new Map<string, string>()
  return { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value) }, removeItem: (key) => { entries.delete(key) }, key: (index) => [...entries.keys()][index] ?? null, get length() { return entries.size } }
}
const options = (userId: string, extra: Partial<CombatTransactionOptions> = {}): CombatTransactionOptions => ({ userId, journal: combatCommandJournal(storage(), userId), ...extra })
const readFight = async (db: Firestore) => (await getDoc(ref(db, `combats/${FIGHT}`))).data() as CombatFight
const readHero = async (db: Firestore) => (await getDoc(ref(db, 'characters/hero'))).data() as { sheetRevision: number; lubec: { gear: { items: { id: string; qty: number }[] } } }
const seed = (path: string, data: object) => env.withSecurityRulesDisabled(async (context) => { await setDoc(ref(context.firestore(), path), data) })

/** A command bound to the fight as this client reads it now, acting as `actorKey`. */
async function command(db: Firestore, id: string, actorKey: string | null, payload: CombatCommand['payload'], seedText = 'seed'): Promise<CombatCommand> {
  const { state } = await readFight(db)
  const sequence = state.combatants.find((actor) => actor.key === actorKey)?.interactionSequence ?? 0
  return createCombatCommand({ ...scope, id, fightId: FIGHT, round: state.round, phase: state.phase, stageInstanceId: state.stageInstanceId, actorKey, interactionSequence: sequence }, payload, () => seedText)
}

/** The seed whose command-bound attack die satisfies `want`, so a test scripts a hit or a miss through the real dice. */
function seedFor(id: string, want: (die: number) => boolean): string {
  for (let attempt = 0; ; attempt++) {
    const text = `seed-${attempt}`
    const probe = combatEntropy({ envelope: { id } as CombatCommand['envelope'], seed: text, payload: { type: 'roll' } })
    if (want(probe.die('attack', 100))) return text
  }
}

const commit = (db: Firestore, next: CombatCommand, userId: string, extra: Partial<CombatTransactionOptions> = {}): Promise<CombatOutcome> =>
  commitCombatCommand(db, next, options(userId, extra))

async function grantAndAim(gm: Firestore, player: Firestore) {
  expect(await commit(gm, await command(gm, 'grant', null, { type: 'grant', combatantKey: HERO }), 'gm')).toMatchObject({ ok: true })
  expect(await commit(player, await command(player, 'aim', HERO, { type: 'aim', aim }), 'player')).toMatchObject({ ok: true })
  expect(await commit(gm, await command(gm, 'range', null, { type: 'range', band: 'medium', modifier: -10 }), 'gm')).toMatchObject({ ok: true })
}

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev', firestore: { host: '127.0.0.1', port: emulatorPort('FIRESTORE_EMULATOR_HOST', 8080), rules: firestoreRules() } })
})
afterAll(async () => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    for (const [uid, role] of [['gm', 'admin'], ['player', 'member'], ['spectator', 'member']]) {
      await setDoc(doc(db, 'groups/sneak/members', uid), { userId: uid, role, status: 'active' })
    }
    await setDoc(ref(db, ''), { system: 'lubec', gmUserId: 'gm' })
    await setDoc(ref(db, 'characters/hero'), heroSheet())
    await setDoc(ref(db, 'npcSheets/roy'), { ...heroSheet(), ownerUserId: 'gm', name: 'Roy', lubec: lubecCharacterSheet() })
    await setDoc(ref(db, 'npcs/roy'), { name: 'Roy Carver', portraitPath: '' })
  })
  const start = createCombatCommand({ ...scope, id: 'start', fightId: FIGHT, round: 0, phase: 'setup', stageInstanceId: 'setup', actorKey: null, interactionSequence: 0 },
    { type: 'start', combatants: [{ kind: 'character', sheetId: 'hero' }, { kind: 'npc', sheetId: 'roy' }], floor: [], dodgeball: true }, () => 'seed')
  expect(await commit(as('gm'), start, 'gm')).toMatchObject({ ok: true })
})

describe('a Sneak Attack between a GM client and a player client', () => {
  it('misses: one spend, the ball on the Floor, the same outcome on retry, and the GM free to grant again', async () => {
    const gm = as('gm')
    const player = as('player')
    await grantAndAim(gm, player)
    const reloaded = await readFight(as('spectator'))
    expect(reloaded.state.attack).toMatchObject({ step: 'aim', aim, frozen: { total: 65, attack: 45, sourceRevision: 2 }, range: { band: 'medium', modifier: -10 } })
    const roll = await command(player, 'roll-miss', HERO, { type: 'roll', aim }, seedFor('roll-miss', (die) => die >= 35))
    const outcome = await commit(player, roll, 'player')
    expect(outcome).toMatchObject({ ok: true, rolls: [{ purpose: 'attack', ordinal: 0 }] })
    expect(await commit(player, structuredClone(roll), 'player')).toEqual(outcome)
    const hero = await readHero(gm)
    expect(hero.sheetRevision).toBe(3)
    expect(hero.lubec.gear.items).toEqual([expect.objectContaining({ id: 'ball', qty: 1 })])
    const { state } = await readFight(gm)
    expect(state.attack).toMatchObject({ step: 'done', closed: true, detached: [], roll: { hit: false, attackNumber: 35 } })
    expect(state.floor.map((record) => record.item.qty)).toEqual([1])
    expect(state).toMatchObject({ round: 0, phase: 'before-initiative', pendingActions: [] })
    const log = await getDocs(collection(gm, root, 'combats', FIGHT, 'log'))
    expect(log.docs.map((entry) => entry.data().roll?.result).filter(Boolean)).toEqual(['Miss'])
    expect(await commit(gm, await command(gm, 'grant-again', null, { type: 'grant', combatantKey: HERO }), 'gm')).toMatchObject({ ok: true })
  })

  it('hits: the ball stays in flight, Defense is the persisted next step, and no second grant overlaps it', async () => {
    const gm = as('gm')
    const player = as('player')
    await grantAndAim(gm, player)
    const roll = await command(player, 'roll-hit', HERO, { type: 'roll', aim }, seedFor('roll-hit', (die) => die < 35))
    expect(await commit(player, roll, 'player')).toMatchObject({ ok: true })
    const { state } = await readFight(player)
    expect(state.attack).toMatchObject({ step: 'defense', closed: false, roll: { hit: true } })
    expect(state.attack!.detached.map((record) => record.item.qty)).toEqual([1])
    expect(state.pendingActions).toEqual([{ combatantKey: 'npc:roy', action: 'defense' }])
    expect(await commit(gm, await command(gm, 'overlap', null, { type: 'grant', combatantKey: 'npc:roy' }), 'gm')).toEqual({ ok: false, reason: 'Finish the granted attack first.' })
  })

  it('spends once when a contended transaction runs its callback again, with the same die', async () => {
    const gm = as('gm')
    const player = as('player')
    await grantAndAim(gm, player)
    let runs = 0
    const transact: CombatTransactionOptions['transact'] = (callback) => runTransaction(player, async (tx) => {
      const outcome = await callback(tx)
      runs += 1
      // Changing a document the callback read forces Firestore to run it again on fresh reads.
      if (runs === 1) await env.withSecurityRulesDisabled(async (context) => { await updateDoc(ref(context.firestore(), 'characters/hero'), { unrelated: 'edited elsewhere' }) })
      return outcome
    })
    const roll = await command(player, 'roll-retry', HERO, { type: 'roll', aim })
    const expected = combatEntropy(roll).die('attack', 100)
    const outcome = await commit(player, roll, 'player', { transact })
    expect(runs).toBe(2)
    expect(outcome).toMatchObject({ ok: true, rolls: [{ purpose: 'attack', ordinal: 0, value: expected }] })
    const hero = (await readHero(gm)) as Awaited<ReturnType<typeof readHero>> & { unrelated?: string }
    expect(hero).toMatchObject({ sheetRevision: 3, unrelated: 'edited elsewhere' })
    expect(hero.lubec.gear.items).toEqual([expect.objectContaining({ id: 'ball', qty: 1 })])
    expect((await getDocs(collection(gm, root, 'characters', 'hero', 'writeReceipts'))).size).toBe(1)
  })

  it('opens a repair for a missing Handle, keeps the step after a reload, and resumes without dice or a spend', async () => {
    const gm = as('gm')
    const player = as('player')
    await grantAndAim(gm, player)
    const attackId = (await readFight(gm)).state.attack!.id
    await seed('characters/hero', { ...heroSheet(), sheetRevision: 3, lubec: { ...heroSheet().lubec, base: { ...heroSheet().lubec.base, Handle: null } } })
    const blocked = await commit(player, await command(player, 'roll-blocked', HERO, { type: 'roll', aim }), 'player')
    expect(blocked).toMatchObject({ ok: true, rolls: [] })
    const reloaded = (await readFight(as('player'))).state.attack!
    expect(reloaded).toMatchObject({ id: attackId, step: 'aim', range: { band: 'medium' }, repair: expect.stringContaining('missing attack/Check Handle') })
    expect((await readHero(gm)).lubec.gear.items[0].qty).toBe(2)
    await seed('characters/hero', { ...heroSheet(), sheetRevision: 4 })
    const resumed = await commit(player, await command(player, 'roll-resumed', HERO, { type: 'roll', aim }), 'player')
    expect(resumed).toMatchObject({ ok: true, rolls: [{ purpose: 'attack' }] })
    expect((await readFight(gm)).state.attack).toMatchObject({ id: attackId, repair: null, roll: expect.any(Object) })
    expect(await readHero(gm)).toMatchObject({ sheetRevision: 5 })
  })

  it('refuses a player answering an NPC grant, and a spectator answering at all, without writing', async () => {
    const gm = as('gm')
    expect(await commit(gm, await command(gm, 'grant-npc', null, { type: 'grant', combatantKey: 'npc:roy' }), 'gm')).toMatchObject({ ok: true })
    const npcAim = { targetKey: HERO, weaponItemId: 'fisticuffs', attackId: 'punch', defense: null }
    const player = as('player')
    expect(await commit(player, await command(player, 'npc-aim', 'npc:roy', { type: 'aim', aim: npcAim }), 'player')).toEqual({ ok: false, reason: 'That combatant belongs to someone else.' })
    const spectator = as('spectator')
    await expect(commit(spectator, await command(spectator, 'spectate', HERO, { type: 'aim', aim }), 'spectator')).resolves.toMatchObject({ ok: false })
    expect((await readFight(gm)).state.attack).toMatchObject({ attackerKey: 'npc:roy', aim: null })
  })
})
