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
import { drainCombatWounds } from './woundDelivery'

const scope = { groupId: 'sneak', campaignId: 'gym' }
const root = 'groups/sneak/campaigns/gym'
const FIGHT = 'fight-start'
const HERO = 'character:hero'
let env: RulesTestEnvironment
const as = (uid: string): Firestore => env.authenticatedContext(uid).firestore()
const ref = (db: Firestore, path: string) => doc(db, root, path)
const ball = { id: 'ball', kind: 'weapon', mode: 'thrown', name: 'Dodgeball', carrier: 'hands', slot: 0, size: 1, qty: 2, weight: 'normal', note: '', impact: 0, wounds: ['blunt'], table: 'dodgeball', catchChance: 50, catchPutsThrowerOut: true }
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

/** The seed whose command-bound `purpose` die satisfies `want`. */
function seedForDie(id: string, purpose: string, want: (die: number) => boolean): string {
  for (let attempt = 0; ; attempt++) {
    const text = `seed-${attempt}`
    if (want(combatEntropy({ envelope: { id } as CombatCommand['envelope'], seed: text, payload: { type: purpose } }).die(purpose, 100))) return text
  }
}

const readRoy = async (db: Firestore) => (await getDoc(ref(db, 'npcSheets/roy'))).data() as { sheetRevision: number; lubec: { gear: { items: { id: string; name: string; qty: number; carrier: string }[] } } }

/** Wayne hits Roy with quality 0 or 1 (a 1-digit roll under 45), so Roy's Defense of 20 can stop it. */
async function lowHit(gm: Firestore, player: Firestore) {
  await grantAndAim(gm, player)
  const roll = await command(player, 'roll-low', HERO, { type: 'roll', aim }, seedFor('roll-low', (die) => die < 10))
  expect(await commit(player, roll, 'player')).toMatchObject({ ok: true })
  expect((await readFight(gm)).state.attack).toMatchObject({ step: 'defense' })
}

describe('Defense, the catch and the landing between two clients', () => {
  it('stops a throw with Roy\'s Defense and catches it into his hand, Wayne Out, the object owned once', async () => {
    const gm = as('gm')
    const player = as('player')
    await lowHit(gm, player)
    const defendSeed = seedForDie('defend', 'defense', (die) => die < 10)
    expect(await commit(gm, await command(gm, 'defend', 'npc:roy', { type: 'defend', split: { amount: 20 } }, defendSeed), 'gm')).toMatchObject({ ok: true })
    const atCatch = (await readFight(player)).state.attack!
    expect(atCatch).toMatchObject({ step: 'catch', defense: { success: true } })
    const catchCommand = await command(gm, 'catch', 'npc:roy', { type: 'catch' }, seedForDie('catch', 'catch', (die) => die < atCatch.catchChance!))
    const outcome = await commit(gm, catchCommand, 'gm')
    expect(outcome).toMatchObject({ ok: true })
    expect(await commit(gm, structuredClone(catchCommand), 'gm')).toEqual(outcome)
    const roy = await readRoy(gm)
    expect(roy.sheetRevision).toBe(3)
    expect(roy.lubec.gear.items).toEqual([expect.objectContaining({ name: 'Dodgeball', qty: 1, carrier: 'hands' })])
    const wayne = await readHero(gm)
    expect(wayne.lubec.gear.items).toEqual([expect.objectContaining({ id: 'ball', qty: 1 })])
    expect(roy.lubec.gear.items[0].id).not.toBe('ball')
    const { state } = await readFight(player)
    expect(state.attack).toMatchObject({ outcome: 'caught', closed: true, detached: [] })
    expect(state.floor).toEqual([])
    expect(state.combatants.find((entry) => entry.key === HERO)!.outReason).toBe('caught')
  })

  it('ends the fight during the catch with the in-flight ball dropped to the GM\'s Items exactly once', async () => {
    const gm = as('gm')
    const player = as('player')
    await lowHit(gm, player)
    await commit(gm, await command(gm, 'defend', 'npc:roy', { type: 'defend', split: { amount: 20 } }, seedForDie('defend', 'defense', (die) => die < 10)), 'gm')
    const thrownId = (await readFight(gm)).state.attack!.detached[0].item.id
    expect(await commit(gm, await command(gm, 'end', null, { type: 'end' }), 'gm')).toMatchObject({ ok: true })
    expect((await getDoc(ref(gm, `gmItems/${thrownId}`))).data()).toMatchObject({ status: 'dropped', qty: 1, name: 'Dodgeball' })
    expect(await commit(gm, await command(gm, 'late-catch', 'npc:roy', { type: 'catch' }), 'gm')).toMatchObject({ ok: false })
  })

  it('lands an undefended hit, moves nothing, rolls Strength once, and reads the Dodgeball row', async () => {
    const gm = as('gm')
    const player = as('player')
    await grantAndAim(gm, player)
    expect(await commit(player, await command(player, 'roll-hit', HERO, { type: 'roll', aim }, seedFor('roll-hit', (die) => die < 35)), 'player')).toMatchObject({ ok: true })
    expect(await commit(gm, await command(gm, 'no-defense', 'npc:roy', { type: 'defend', split: { amount: 0 } }), 'gm')).toMatchObject({ ok: true })
    const landing = (await readFight(player)).state.attack!.landing!
    expect(await commit(player, await command(player, 'land', HERO, { type: 'land', part: landing.start }), 'player')).toMatchObject({ ok: true })
    const strength = await command(player, 'strength', HERO, { type: 'strength' })
    const first = await commit(player, strength, 'player')
    expect(await commit(player, structuredClone(strength), 'player')).toEqual(first)
    const { attack } = (await readFight(as('spectator'))).state
    // Impact is read on its Dodgeball row at once: applied, or waiting on Roy's Check or Save.
    expect(attack).toMatchObject({ landing: { part: landing.start, moved: 0 }, strength: { roll: first.ok ? first.rolls[0].value : 0 }, row: { group: expect.any(String) } })
  })
})

/** A seed whose command-bound dice satisfy each purpose's want, in the order the command rolls them. */
function seedWith(id: string, wants: Record<string, (die: number) => boolean>): string {
  for (let attempt = 0; ; attempt++) {
    const text = `seed-${attempt}`
    const probe = combatEntropy({ envelope: { id } as CombatCommand['envelope'], seed: text, payload: { type: 'probe' } })
    if (Object.entries(wants).every(([purpose, want]) => want(probe.die(purpose, 100)))) return text
  }
}

/** Wayne's throw hits with quality from `attack`, lands undefended where `landing` says, and rolls Strength as `strength` wants. */
async function hitAndLand(gm: Firestore, player: Firestore, wants: { attack: (die: number) => boolean; landing: (die: number) => boolean; strength: (die: number) => boolean }) {
  await grantAndAim(gm, player)
  expect(await commit(player, await command(player, 'w-roll', HERO, { type: 'roll', aim }, seedWith('w-roll', { attack: wants.attack })), 'player')).toMatchObject({ ok: true })
  expect(await commit(gm, await command(gm, 'w-defend', 'npc:roy', { type: 'defend', split: { amount: 0 } }, seedWith('w-defend', { landing: wants.landing })), 'gm')).toMatchObject({ ok: true })
  const landing = (await readFight(player)).state.attack!.landing!
  expect(await commit(player, await command(player, 'w-land', HERO, { type: 'land', part: landing.start }), 'player')).toMatchObject({ ok: true })
  expect(await commit(player, await command(player, 'w-strength', HERO, { type: 'strength' }, seedWith('w-strength', { strength: wants.strength })), 'player')).toMatchObject({ ok: true })
}

describe('Dodgeball wounds and initiative between two clients', () => {
  it('queues the player\'s wound on Roy, and the GM\'s delivery alone writes it to his sheet once', async () => {
    const gm = as('gm')
    const player = as('player')
    // Quality 2 to the head with no Strength bonus: Glasses or hat knocked flying, 1 Stress.
    await hitAndLand(gm, player, { attack: (die) => die >= 20 && die < 30, landing: (die) => die <= 11, strength: (die) => die > 29 })
    const queued = (await readFight(player)).state
    expect(queued.attack).toMatchObject({ outcome: 'wounded', row: { name: 'Glasses or hat knocked flying' } })
    expect(queued.combatants.find((entry) => entry.key === 'npc:roy')!.outReason).toBe('wound')
    expect(queued.woundOutbox).toHaveLength(1)
    const stressBefore = (await getDoc(ref(gm, 'npcSheets/roy'))).data()!.lubec.counters.stress as number
    await drainCombatWounds(gm, { ...scope, fightId: FIGHT }, 'gm')
    await drainCombatWounds(as('gm'), { ...scope, fightId: FIGHT }, 'gm')
    const roy = (await getDoc(ref(gm, 'npcSheets/roy'))).data()!
    expect(roy.lubec.counters.stress).toBe(stressBefore + 1)
    expect(roy.lubec.effects).toEqual([expect.objectContaining({ name: 'Glasses or hat knocked flying', combatOrigin: expect.objectContaining({ effectiveRound: 1 }) })])
    const delivered = (await readFight(player)).state
    expect(delivered.woundOutbox).toEqual([])
    expect(delivered.woundAcknowledgements).toHaveLength(1)
    expect(await commit(gm, await command(gm, 'begin', null, { type: 'begin' }), 'gm')).toMatchObject({ ok: true })
  })

  it('waits on the GM\'s Handle Check for Roy, names a missing Handle, and on repair catches the ball into his hand', async () => {
    const gm = as('gm')
    const player = as('player')
    // Quality 1 to the torso or waist with no Strength bonus: Trapped against the chest.
    await hitAndLand(gm, player, { attack: (die) => die >= 10 && die < 20, landing: (die) => die >= 14 && die <= 44, strength: (die) => die > 29 })
    const waiting = (await readFight(player)).state
    expect(waiting.attack).toMatchObject({ step: 'check', row: { name: 'Trapped against the chest' } })
    expect(waiting.pendingActions).toEqual([{ combatantKey: 'npc:roy', action: 'check' }])
    expect(await commit(player, await command(player, 'not-mine', 'npc:roy', { type: 'check' }), 'player')).toMatchObject({ ok: false })
    const roy = (await getDoc(ref(gm, 'npcSheets/roy'))).data()!
    await seed('npcSheets/roy', { ...roy, lubec: { ...roy.lubec, base: { ...roy.lubec.base, Handle: null } } })
    expect(await commit(gm, await command(gm, 'check-holed', 'npc:roy', { type: 'check' }), 'gm')).toMatchObject({ ok: true, rolls: [] })
    expect((await readFight(player)).state.attack).toMatchObject({ step: 'check', repair: expect.stringContaining('attack/Check Handle') })
    await seed('npcSheets/roy', roy)
    const check = await command(gm, 'check', 'npc:roy', { type: 'check' }, seedWith('check', { check: (die) => die <= 30 }))
    expect(await commit(gm, check, 'gm')).toMatchObject({ ok: true, rolls: [{ purpose: 'check' }] })
    const { state } = await readFight(player)
    expect(state.attack).toMatchObject({ outcome: 'row-caught', closed: true, detached: [] })
    expect(state.combatants.find((entry) => entry.key === HERO)!.outReason).toBe('caught')
    expect((await getDoc(ref(gm, 'npcSheets/roy'))).data()!.lubec.gear.items).toEqual([expect.objectContaining({ name: 'Dodgeball', carrier: 'hands' })])
  })

  it('rolls initiative once from each client and starts round 1 Movement, the same on a retry', async () => {
    const gm = as('gm')
    const player = as('player')
    expect(await commit(gm, await command(gm, 'begin', null, { type: 'begin' }), 'gm')).toMatchObject({ ok: true })
    const mine = await command(player, 'init-hero', HERO, { type: 'initiative' })
    const first = await commit(player, mine, 'player')
    expect(first).toMatchObject({ ok: true, rolls: [{ purpose: 'initiative' }] })
    expect(await commit(player, structuredClone(mine), 'player')).toEqual(first)
    expect(await commit(player, await command(player, 'init-roy', 'npc:roy', { type: 'initiative' }), 'player')).toMatchObject({ ok: false })
    expect(await commit(gm, await command(gm, 'init-npcs', null, { type: 'npcInitiative' }), 'gm')).toMatchObject({ ok: true })
    const { state } = await readFight(as('spectator'))
    expect(state).toMatchObject({ phase: 'movement', round: 1 })
    expect(state.order).toHaveLength(2)
    expect(state.combatants.every((entry) => entry.initiative?.sourceRevision === 2)).toBe(true)
  })
})
