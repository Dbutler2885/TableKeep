import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocFromServer, getDocs, runTransaction, setDoc, updateDoc, type Firestore } from 'firebase/firestore'
import { emulatorPort } from '../../../../vitest.emulatorEndpoint'
import { firestoreRules } from '../../../../vitest.firestoreRules'
import { saveSheetIntention } from '../../character/characterStore/sheetIntentionTransaction'
import { lubecCharacterSheet } from '../../ruleSets/lubec/sheetFixtures'
import { lubecCurrentValue, lubecEffectiveHandle } from '../../ruleSets/lubec/derivations'
import { createCombatCommand } from './commandJournal'
import { commitCombatCommand } from './combatTransaction'
import { combatLifecycleHandlers } from './engine/lifecycle'
import { combatInputModifiers, confirmedCombatRevision, readCombatInputs } from './woundBarrier'
import { deliverCombatWound, drainCombatWounds } from './woundDelivery'
import { combatWoundDrainService } from './woundDrainService'
import { WOUND_WAIT, type CombatWound } from './woundTypes'
import type { CombatantSelection, CombatCommand, CombatFight, CombatHandler } from './engine/types'

const scope = { groupId: 'wounds', campaignId: 'lubec', fightId: 'fight' }
const root = 'groups/wounds/campaigns/lubec'
const target: CombatantSelection = { kind: 'character', sheetId: 'hero' }
let env: RulesTestEnvironment
const clients = new Map<string, Firestore>()
const as = (uid = 'gm'): Firestore => {
  if (!clients.has(uid)) clients.set(uid, env.authenticatedContext(uid).firestore())
  return clients.get(uid)!
}
const ref = (db: Firestore, path: string) => doc(db, root, path)
const sheet = (ownerUserId = 'player') => ({ system: 'lubec', name: 'Tommy', ownerUserId, creationStatus: 'active', schemaVersion: 1, sheetRevision: 0, schemaWrittenAt: new Date(123), lubec: lubecCharacterSheet(), futureField: 'keep me' })
const wound = (overrides: Partial<CombatWound> = {}): CombatWound => ({ id: 'wound', target, originatingRound: 1, effectiveRound: 2, traumaDelta: 1, stressDelta: 2, effect: { id: 'injury', name: 'Bell rung', cause: 'Bell rung row', steps: [{ modifiers: [{ target: 'Handle', amount: -20 }, { target: 'Speed', amount: -10 }, { target: 'Strength', amount: -10 }], labels: ['Dazed'] }] }, ...overrides })
const journal = () => ({ save: vi.fn(), remove: vi.fn(), pending: () => [] })
const settings = (userId = 'gm') => ({ userId, journal: journal() })
const readFight = async (db = as()) => (await getDoc(ref(db, 'combats/fight'))).data() as CombatFight
const storedSheet = async (db = as(), path = 'characters/hero') => (await getDoc(ref(db, path))).data()!
const currentRevision = async (db = as(), path = 'characters/hero') => confirmedCombatRevision(await getDocFromServer(ref(db, path)))
async function seed(path: string, data: object) { await env.withSecurityRulesDisabled(async (context) => { await setDoc(ref(context.firestore(), path), data) }) }
async function fixture(wounds = [wound()], round = 1) {
  const fight = await readFight()
  await updateDoc(ref(as(), 'combats/fight'), { state: { ...fight.state, round, woundOutbox: wounds } })
}
async function command(type: string, id = type, actorKey: string | null = null): Promise<CombatCommand> {
  const { state } = await readFight()
  return createCombatCommand({ ...scope, id, round: state.round, phase: state.phase, stageInstanceId: state.stageInstanceId, actorKey, interactionSequence: 0 }, { type }, () => 'seed')
}
const readInputs = (db: Firestore, confirmed: number | null, selection = target) => runTransaction(db, (tx) => readCombatInputs(db, tx, scope, selection, confirmed))

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev', firestore: { host: '127.0.0.1', port: emulatorPort('FIRESTORE_EMULATOR_HOST', 8080), rules: firestoreRules() } })
})
afterAll(async () => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    for (const [uid, role] of [['gm', 'member'], ['second-gm', 'admin'], ['player', 'member'], ['other', 'member'], ['spectator', 'member']]) {
      await setDoc(doc(db, 'groups/wounds/members', uid), { userId: uid, role, status: 'active' })
    }
    await setDoc(ref(db, ''), { system: 'lubec', gmUserId: 'gm' })
    await setDoc(ref(db, 'characters/hero'), sheet())
    await setDoc(ref(db, 'npcSheets/roy'), sheet('gm'))
    await setDoc(ref(db, 'npcs/roy'), { name: 'Roy' })
  })
  const start = createCombatCommand({ ...scope, id: 'start', round: 0, phase: 'setup', stageInstanceId: 'setup', actorKey: null, interactionSequence: 0 }, { type: 'start', combatants: [target, { kind: 'npc', sheetId: 'roy' }], floor: [], dodgeball: true }, () => 'seed')
  expect(await commitCombatCommand(as(), start, settings())).toMatchObject({ ok: true })
})

describe('once-only wound delivery through real rules', () => {
  it('delivers a single uncontended wound without any revision retry', async () => {
    await fixture()
    const acknowledgement = await deliverCombatWound(as(), scope, 'gm', 'wound')
    expect(acknowledgement).toMatchObject({ id: 'wound', targetRevision: 1 })
    expect((await storedSheet()).sheetRevision).toBe(1)
    expect((await readFight()).state.woundOutbox).toEqual([])
    expect((await getDocs(collection(as(), root, 'characters/hero', 'writeReceipts'))).size).toBe(1)
  })

  it.each([target, { kind: 'npc', sheetId: 'roy' } as const])('races two GM drains for $kind, retains a revision acknowledgement, and replays an uncertain delivery', async (selection) => {
    await fixture([wound({ target: selection })])
    await Promise.all([drainCombatWounds(as(), scope, 'gm'), drainCombatWounds(as('second-gm'), scope, 'second-gm')])
    const fight = await readFight()
    expect(fight.state.woundOutbox).toEqual([])
    expect(fight.state.woundAcknowledgements).toHaveLength(1)
    const acknowledgement = fight.state.woundAcknowledgements[0]
    expect(acknowledgement).toMatchObject({ id: 'wound', target: selection, targetRevision: 1, originatingRound: 1, effectiveRound: 2 })
    expect(await deliverCombatWound(as(), scope, 'gm', 'wound')).toEqual(acknowledgement)
    const path = selection.kind === 'character' ? 'characters/hero' : 'npcSheets/roy'
    expect(await storedSheet(as(), path)).toMatchObject({ sheetRevision: 1, futureField: 'keep me', lubec: { counters: { trauma: 1, stress: 4 }, effects: [{ combatOrigin: { fightId: 'fight', woundId: 'wound', originatingRound: 1, effectiveRound: 2 } }] } })
    expect((await getDocs(collection(as(), root, path, 'writeReceipts'))).size).toBe(1)
    await commitCombatCommand(as(), await command('end'), settings())
    expect(await deliverCombatWound(as(), scope, 'gm', 'wound')).toEqual(acknowledgement)
  })

  it('drains wounds for different targets without confusing their revisions during concurrent recovery', async () => {
    await fixture([wound(), wound({ id: 'npc-wound', target: { kind: 'npc', sheetId: 'roy' } })])
    await Promise.all([drainCombatWounds(as(), scope, 'gm'), drainCombatWounds(as('second-gm'), scope, 'second-gm')])
    const acknowledgements = (await readFight()).state.woundAcknowledgements
    expect(acknowledgements.map((entry) => [entry.id, entry.targetRevision])).toEqual([['wound', 1], ['npc-wound', 1]])
    expect((await storedSheet()).lubec.counters.trauma).toBe(1)
    expect((await storedSheet(as(), 'npcSheets/roy')).lubec.counters.trauma).toBe(1)
  })

  it.each([
    [{ target: { kind: 'character', sheetId: 'missing' } }, 'not in this fight'],
    [{ originatingRound: 2, effectiveRound: 3 }, 'future round'],
    [{ target: { kind: 'invalid', sheetId: 'hero' } }, 'not in this fight'],
  ])('leaves invalid wound targets and rounds pending: %j', async (changes, reason) => {
    await fixture([wound(changes as Partial<CombatWound>)])
    await expect(drainCombatWounds(as(), scope, 'gm')).rejects.toThrow(reason)
    expect((await readFight()).state.woundOutbox).toHaveLength(1)
    expect((await storedSheet()).sheetRevision).toBe(0)
  })

  it.each([{ kind: 'character', sheetId: '' }, { kind: 'invalid', sheetId: 'hero' }])('exposes malformed persisted target identities instead of choosing a sheet: %j', async (selection) => {
    const fight = await readFight()
    fight.state.round = 1
    fight.state.combatants = [{ ...fight.state.combatants[0], ...selection, key: `${selection.kind}:${selection.sheetId}` } as typeof fight.state.combatants[number]]
    fight.state.woundOutbox = [wound({ target: selection as CombatantSelection })]
    await updateDoc(ref(as(), 'combats/fight'), { state: fight.state })
    await expect(drainCombatWounds(as(), scope, 'gm')).rejects.toThrow('Invalid wound target')
    expect((await storedSheet()).sheetRevision).toBe(0)
  })

  it('refuses duplicate wound ids instead of applying one payload and discarding another', async () => {
    await fixture([wound(), wound({ traumaDelta: 2 })])
    await expect(drainCombatWounds(as(), scope, 'gm')).rejects.toThrow('Duplicate wound identity')
    expect((await readFight()).state.woundAcknowledgements).toEqual([])
    expect((await storedSheet()).sheetRevision).toBe(0)
  })

  it('keeps delayed owner and second-GM intentions and a pickup while rebasing wound deltas and effects', async () => {
    const db = as()
    const player = as('player')
    const hero = ref(player, 'characters/hero')
    const playerDelta = { operationId: 'delayed_player', baseRevision: 0, edits: [{ kind: 'delta' as const, path: ['lubec', 'counters', 'stress'], base: 2, amount: 3 }] }
    const secondGmEdit = { operationId: 'delayed_gm', baseRevision: 0, edits: [{ kind: 'set' as const, path: ['name'], base: { exists: true as const, value: 'Tommy' }, value: 'Tommy Eves' }] }
    await fixture()
    await drainCombatWounds(db, scope, 'gm')
    const pickup = { operationId: 'fixture_pickup', baseRevision: 1, edits: [{ kind: 'insert' as const, path: ['lubec', 'gear', 'items'], record: { id: 'ball', name: 'Dodgeball', qty: 1 } }] }
    expect(await saveSheetIntention(db, ref(db, 'characters/hero'), pickup)).toMatchObject({ status: 'committed', revision: 2 })
    expect(await saveSheetIntention(player, hero, playerDelta)).toMatchObject({ status: 'committed', revision: 3 })
    expect(await saveSheetIntention(as('second-gm'), ref(as('second-gm'), 'characters/hero'), secondGmEdit)).toMatchObject({ status: 'committed', revision: 4 })
    expect(await saveSheetIntention(player, hero, playerDelta)).toMatchObject({ status: 'committed', revision: 3 })
    const result = await storedSheet()
    expect(result).toMatchObject({ name: 'Tommy Eves', sheetRevision: 4, futureField: 'keep me', lubec: { counters: { stress: 7, trauma: 1 }, gear: { items: [{ id: 'ball', qty: 1 }] } } })
    expect(result.lubec.effects).toHaveLength(1)
    expect((await readFight()).state.woundAcknowledgements[0].targetRevision).toBe(1)
  })

  it.each(['player', 'other', 'spectator'])('refuses non-GM delivery by %s without acknowledging or changing any sheet', async (uid) => {
    await fixture()
    await expect(drainCombatWounds(as(uid), scope, uid)).rejects.toThrow('Only the GM')
    expect((await readFight()).state.woundOutbox).toHaveLength(1)
    expect((await storedSheet()).sheetRevision).toBe(0)
  })

  it('keeps failed delivery pending with its reason and delivers it after repair/reconnect', async () => {
    await fixture()
    await deleteDoc(ref(as(), 'characters/hero'))
    const report = vi.fn()
    const service = combatWoundDrainService((fightId) => drainCombatWounds(as(), { ...scope, fightId }, 'gm'), report)
    try {
      service.observe({ id: 'fight', fight: await readFight() })
      await vi.waitFor(() => expect(report).toHaveBeenLastCalledWith({ fightId: 'fight', pending: true, reason: expect.stringContaining('sheet is missing') }))
      expect((await readFight()).state.woundAcknowledgements).toEqual([])
      await seed('characters/hero', sheet())
      await service.reconnect()
      expect(report).toHaveBeenLastCalledWith({ fightId: 'fight', pending: false, reason: null })
      expect((await storedSheet()).sheetRevision).toBe(1)
      expect((await readFight()).state.woundOutbox).toEqual([])
    } finally { service.stop() }
  })

  it('refuses invalid revisions, unrepairable effects, absent fights and invalid ownership without partial writes', async () => {
    await fixture()
    await updateDoc(ref(as(), 'characters/hero'), { 'lubec.effects': [{ id: 'collision', name: 'Existing', cause: '', steps: [] }], sheetRevision: 1 })
    // A non-array cannot be appended; no queue acknowledgement or counter mutation can escape.
    await seed('characters/hero', { ...sheet(), lubec: { ...lubecCharacterSheet(), effects: null } })
    await expect(drainCombatWounds(as(), scope, 'gm')).rejects.toThrow('sheet repair')
    expect((await readFight()).state.woundAcknowledgements).toEqual([])
    expect((await storedSheet()).lubec.counters.trauma).toBe(0)
    await seed('characters/hero', { ...sheet(), sheetRevision: -1 })
    await expect(drainCombatWounds(as(), scope, 'gm')).rejects.toThrow('invalid-revision')
    await expect(drainCombatWounds(as(), { ...scope, fightId: 'missing' }, 'gm')).rejects.toThrow('fight is missing')
    await updateDoc(ref(as(), 'combatControl/current'), { activeFightId: 'other' })
    await expect(drainCombatWounds(as(), scope, 'gm')).rejects.toThrow('control does not match')
  })
})

describe('canonical input barriers', () => {
  it('lets current-round display/Movement proceed but holds the next declaration and GM Return for both drain and owner snapshot', async () => {
    await fixture()
    const player = as('player')
    const confirmed = await currentRevision(player)
    const earlier = await readInputs(player, confirmed)
    expect(lubecEffectiveHandle(earlier.sheet, earlier.modifiers)).toBe(55)
    const fight = await readFight()
    fight.state.round = 2
    fight.state.combatants[0].outReason = 'wound'
    await updateDoc(ref(as(), 'combats/fight'), { state: fight.state })
    expect((await readFight()).state.combatants[0].outReason).toBe('wound')
    await expect(readInputs(player, confirmed)).rejects.toThrow(WOUND_WAIT)
    await expect(readInputs(as(), confirmed)).rejects.toThrow(WOUND_WAIT)
    await drainCombatWounds(as(), scope, 'gm')
    await expect(readInputs(player, confirmed)).rejects.toThrow(WOUND_WAIT)
    await expect(readInputs(as(), confirmed)).rejects.toThrow(WOUND_WAIT)
    const current = await readInputs(player, await currentRevision(player))
    expect(current.revision).toBe(1)
    expect(lubecEffectiveHandle(current.sheet, current.modifiers)).toBe(35)
    expect(lubecEffectiveHandle(earlier.sheet, earlier.modifiers)).toBe(55)
    expect((await readFight()).state.combatants[0].outReason).toBe('wound')
    expect(lubecCurrentValue(current.sheet, 'Strength', current.modifiers)).toBe(19)
  })

  it('blocks pre-initiative freezing until delivery and a confirmed new snapshot, and includes Speed for round one', async () => {
    await fixture([wound({ originatingRound: 0, effectiveRound: 1 })], 0)
    const confirmed = await currentRevision(as('player'))
    await expect(readInputs(as(), confirmed)).rejects.toThrow(WOUND_WAIT)
    await drainCombatWounds(as(), scope, 'gm')
    await expect(readInputs(as(), confirmed)).rejects.toThrow(WOUND_WAIT)
    const current = await readInputs(as(), await currentRevision())
    expect(lubecCurrentValue(current.sheet, 'Speed', current.modifiers)).toBe(46)
    expect(lubecCurrentValue(current.sheet, 'Speed', combatInputModifiers(current.sheet, { fightId: 'fight', round: 0 }))).toBe(56)
  })

  it('rereads canonical values after a newer ordinary edit and refuses stale/deleted/private targets', async () => {
    const confirmed = await currentRevision()
    expect(await saveSheetIntention(as(), ref(as(), 'characters/hero'), { operationId: 'new_handle', baseRevision: 0, edits: [{ kind: 'set', path: ['lubec', 'base', 'Handle'], base: { exists: true, value: 50 }, value: 60 }] })).toMatchObject({ status: 'committed' })
    const inputs = await readInputs(as(), confirmed)
    expect(inputs.revision).toBe(1)
    expect(lubecEffectiveHandle(inputs.sheet, inputs.modifiers)).toBe(65)
    await expect(readInputs(as(), 0, { kind: 'character', sheetId: 'missing' })).rejects.toThrow('not in this fight')
    await expect(readInputs(as('player'), 0, { kind: 'npc', sheetId: 'roy' })).rejects.toThrow()
    await deleteDoc(ref(as(), 'characters/hero'))
    await expect(readInputs(as(), 0)).rejects.toThrow('sheet is missing')
    await commitCombatCommand(as(), await command('end'), settings())
    await expect(readInputs(as(), 0)).rejects.toThrow('not live')
  })
})

it('End retries the latest empty-outbox transaction after a player enqueues a wound and refuses subsequent live commands', async () => {
  const enqueue: CombatHandler = (_command, records) => ({ fight: { ...records.fight!, state: { ...records.fight!.state, woundOutbox: [wound({ originatingRound: 0, effectiveRound: 1 })] } }, items: [], logs: [] })
  const playerSettings = { ...settings('player'), handlers: { ...combatLifecycleHandlers, fixture: enqueue } }
  const lateCommand = await command('fixture', 'late-enqueue', 'character:hero')
  let callbacks = 0
  const end = await command('end')
  const outcome = await commitCombatCommand(as(), end, {
    ...settings(),
    transact: (callback) => runTransaction(as(), async (tx) => {
      const result = await callback(tx)
      callbacks++
      if (callbacks === 1) expect(await commitCombatCommand(as('player'), await command('fixture', 'enqueue', 'character:hero'), playerSettings)).toMatchObject({ ok: true })
      return result
    }),
  })
  expect(outcome).toMatchObject({ ok: true })
  expect(callbacks).toBeGreaterThan(2)
  expect((await readFight()).state).toMatchObject({ woundOutbox: [], woundAcknowledgements: [{ id: 'wound', targetRevision: 1 }] })
  expect((await readFight()).status).toBe('ended')
  expect((await getDoc(ref(as(), 'combatControl/current'))).get('activeFightId')).toBeNull()
  expect((await storedSheet()).lubec.counters.trauma).toBe(1)
  expect(await commitCombatCommand(as(), end, settings())).toEqual(outcome)
  expect(await commitCombatCommand(as('player'), lateCommand, playerSettings)).toEqual({ ok: false, reason: 'That fight is not live.' })
})

it('End exposes a failed delivery reason and remains live until the same End command can finish', async () => {
  await fixture()
  await deleteDoc(ref(as(), 'characters/hero'))
  const end = await command('end')
  expect(await commitCombatCommand(as(), end, settings())).toMatchObject({ ok: false, reason: expect.stringContaining('sheet is missing') })
  expect((await readFight()).status).toBe('live')
  expect((await readFight()).state.woundOutbox).toHaveLength(1)
  await seed('characters/hero', sheet())
  expect(await commitCombatCommand(as(), end, settings())).toMatchObject({ ok: true })
  expect((await storedSheet()).sheetRevision).toBe(1)
})
