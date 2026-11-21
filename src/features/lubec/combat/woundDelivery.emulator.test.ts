import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { collection, deleteField, deleteDoc, doc, getDoc, getDocFromServer, getDocs, runTransaction, serverTimestamp, setDoc, updateDoc, type Firestore } from 'firebase/firestore'
import { emulatorPort } from '../../../../vitest.emulatorEndpoint'
import { firestoreRules } from '../../../../vitest.firestoreRules'
import { saveSheetIntention } from '../../character/characterStore/sheetIntentionTransaction'
import { lubecCharacterSheet } from '../../ruleSets/lubec/sheetFixtures'
import { lubecCurrentValue, lubecEffectiveHandle } from '../../ruleSets/lubec/derivations'
import type { LubecStepUntil } from '../../ruleSets/lubec/effects'
import { createCombatCommand } from './commandJournal'
import { commitCombatCommand } from './combatTransaction'
import { lubecEffectRecovery } from '../effectRecovery'
import { acknowledgeLubecDeathReminder } from '../deathReminderAck'
import { combatEntropy } from './engine/commandEntropy'
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
    expect(await commitCombatCommand(as(), await command('end'), settings())).toMatchObject({ ok: false, reason: expect.stringContaining('sheet is missing') })
    await seed('characters/hero', sheet())
    expect(await commitCombatCommand(as(), await command('end'), settings())).toMatchObject({ ok: true })
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
  expect((await readFight()).state.woundOutbox).toEqual([])
  expect((await readFight()).state.woundAcknowledgements).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'wound', targetRevision: 1 })]))
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
  expect((await readFight()).state.woundOutbox.map((entry) => entry.id)).toEqual(['wound', 'close:character:hero', 'close:npc:roy'])
  await seed('characters/hero', sheet())
  expect(await commitCombatCommand(as(), end, settings())).toMatchObject({ ok: true })
  expect((await storedSheet()).sheetRevision).toBe(1)
})

describe('a final wound\'s linked cards through real rules', () => {
  const step = (amount: number, until: LubecStepUntil) => ({ modifiers: [{ target: 'Handle' as const, amount }], labels: [], until })
  const card = (cardKey: string, amount: number, until: LubecStepUntil = 'long-rest') =>
    ({ id: cardKey, cardKey, name: 'Shattered forearm', part: cardKey, cause: 'Blunt Force, left forearm, Impact 6', wound: { row: 'Shattered forearm', table: 'blunt', groupId: '' }, steps: [step(amount, until)] })
  const linked = (selection: CombatantSelection = target) => {
    const cards = [card('bleed', 0, 'treated'), card('arm', -20)]
    return wound({ target: selection, effect: cards[0], effects: cards, traumaDelta: 2, stressDelta: 0 })
  }
  const pathOf = (selection: CombatantSelection) => (selection.kind === 'character' ? 'characters/hero' : 'npcSheets/roy')
  const effectsOf = async (path: string) => (await storedSheet(as(), path)).lubec.effects as { id: string; wound: { groupId: string } }[]

  it.each([target, { kind: 'npc', sheetId: 'roy' } as const])('lands every card once under one wound identity for $kind, across racing drains and a replay', async (selection) => {
    await fixture([linked(selection)])
    await Promise.all([drainCombatWounds(as(), scope, 'gm'), drainCombatWounds(as('second-gm'), scope, 'second-gm')])
    const acknowledgement = (await readFight()).state.woundAcknowledgements[0]
    expect(await deliverCombatWound(as(), scope, 'gm', 'wound')).toEqual(acknowledgement)
    const effects = await effectsOf(pathOf(selection))
    expect(effects.map((effect) => effect.id)).toEqual([`${acknowledgement.operationId}_bleed`, `${acknowledgement.operationId}_arm`])
    expect(new Set(effects.map((effect) => effect.wound.groupId))).toEqual(new Set([acknowledgement.operationId]))
    expect((await storedSheet(as(), pathOf(selection))).lubec.counters.trauma).toBe(2)
  })

  async function steppedDown(uid: string, path: string) {
    const db = as(uid)
    const stored = await storedSheet(db, path)
    const [bleed] = stored.lubec.effects as { id: string }[]
    return saveSheetIntention(db, ref(db, path), {
      operationId: `step_${uid}`, baseRevision: stored.sheetRevision,
      edits: [{ kind: 'remove', path: ['lubec', 'effects', { recordId: bleed.id }], base: { exists: true, value: bleed as never } }],
    })
  }

  it.each(['player', 'gm'])('lets %s step down one PC card, leaving its sibling and the Trauma', async (uid) => {
    await fixture([linked()])
    await drainCombatWounds(as(), scope, 'gm')
    expect(await steppedDown(uid, 'characters/hero')).toMatchObject({ status: 'committed', revision: 2 })
    const after = await storedSheet()
    expect((after.lubec.effects as { id: string }[]).map((effect) => effect.id)).toEqual([expect.stringMatching(/_arm$/)])
    expect(after.lubec.counters.trauma).toBe(2)
  })

  it.each([['other', 'characters/hero'], ['spectator', 'characters/hero'], ['player', 'npcSheets/roy']])('refuses %s stepping down a card on %s', async (uid, path) => {
    await fixture([linked(path === 'characters/hero' ? target : { kind: 'npc', sheetId: 'roy' })])
    await drainCombatWounds(as(), scope, 'gm')
    await expect(steppedDown(uid, path)).rejects.toThrow()
    expect((await effectsOf(path)).length).toBe(2)
  })

  it('charges a knock-out\'s rolled Minimum Stress once, across racing drains and a replay', async () => {
    const knockOut = { ...linked(), minimumStressDelta: 3, effects: [card('unconscious', 0, 'by-hand')], effect: card('unconscious', 0, 'by-hand') }
    await fixture([knockOut])
    await Promise.all([drainCombatWounds(as(), scope, 'gm'), drainCombatWounds(as('second-gm'), scope, 'second-gm')])
    await deliverCombatWound(as(), scope, 'gm', 'wound')
    expect((await storedSheet()).lubec.counters).toMatchObject({ trauma: 2, minimumStress: 5 })
    expect(await effectsOf('characters/hero')).toHaveLength(1)
  })

  it('keeps both of two concurrent sibling Step downs, and a retried Step down applies once', async () => {
    const twoSteps = { ...card('arm', -20), steps: [step(-20, 'long-rest'), step(-10, 'lasting')] }
    await fixture([{ ...linked(), effects: [card('bleed', 0, 'treated'), twoSteps], effect: card('bleed', 0, 'treated') }])
    await drainCombatWounds(as(), scope, 'gm')
    const stored = await storedSheet()
    const [bleed, arm] = stored.lubec.effects as { id: string; steps: unknown[] }[]
    const aid = { operationId: 'first_aid', baseRevision: 1, edits: [{ kind: 'remove' as const, path: ['lubec', 'effects', { recordId: bleed.id }], base: { exists: true as const, value: bleed as never } }] }
    const rest = {
      operationId: 'long_rest', baseRevision: 1,
      edits: [{ kind: 'set' as const, path: ['lubec', 'effects', { recordId: arm.id }, 'steps'], base: { exists: true as const, value: arm.steps as never }, value: arm.steps.slice(1) as never }],
    }
    const player = as('player')
    await Promise.all([saveSheetIntention(player, ref(player, 'characters/hero'), aid), saveSheetIntention(as(), ref(as(), 'characters/hero'), rest)])
    expect(await saveSheetIntention(as(), ref(as(), 'characters/hero'), rest)).toMatchObject({ status: 'committed' })
    const after = await storedSheet()
    expect(after.sheetRevision).toBe(3)
    expect((after.lubec.effects as { id: string; steps: unknown[] }[]).map((effect) => [effect.id, effect.steps.length])).toEqual([[arm.id, 1]])
    expect(after.lubec.counters.trauma).toBe(2)
  })

  it('lets the GM step down an NPC card', async () => {
    await fixture([linked({ kind: 'npc', sheetId: 'roy' })])
    await drainCombatWounds(as(), scope, 'gm')
    expect(await steppedDown('gm', 'npcSheets/roy')).toMatchObject({ status: 'committed' })
    expect((await effectsOf('npcSheets/roy')).length).toBe(1)
  })
})

describe('round ticks through real rules', () => {
  const brief = { id: 'clipped', name: 'Clipped', cause: 'Blunt Force', combatOrigin: { fightId: 'fight', woundId: 'w', originatingRound: 1, effectiveRound: 1 }, steps: [{ modifiers: [], labels: [], until: 'next-round-end', rolls: [{ scope: 'attacks', mode: 'disadvantage' }] }] }
  const tick = (round: number): CombatWound => ({ kind: 'tick', tickRound: round, id: `round-${round}:character:hero`, target, originatingRound: round, effectiveRound: round + 1, traumaDelta: 0, stressDelta: 0 })

  it('ends a brief window once at the end of the next round, across racing drains and a replay', async () => {
    await seed('characters/hero', { ...sheet(), lubec: { ...lubecCharacterSheet(), effects: [brief] } })
    await fixture([tick(2)], 2)
    await Promise.all([drainCombatWounds(as(), scope, 'gm'), drainCombatWounds(as('second-gm'), scope, 'second-gm')])
    const acknowledgement = (await readFight()).state.woundAcknowledgements[0]
    expect(acknowledgement).toMatchObject({ id: 'round-2:character:hero', targetRevision: 1 })
    expect(await deliverCombatWound(as(), scope, 'gm', 'round-2:character:hero')).toEqual(acknowledgement)
    expect((await storedSheet()).lubec.effects).toEqual([])
    expect((await storedSheet()).sheetRevision).toBe(1)
  })

  it('acknowledges a tick with nothing to end at the revision it read, writing no sheet', async () => {
    await fixture([tick(1)], 1)
    await drainCombatWounds(as(), scope, 'gm')
    expect((await readFight()).state.woundAcknowledgements[0]).toMatchObject({ targetRevision: 0 })
    expect((await storedSheet()).sheetRevision).toBe(0)
  })
})


describe('saved lost stages through real rules', () => {
  it.each([target, { kind: 'npc', sheetId: 'roy' } as const])('delivers and closes Dazed once for $kind while preserving sibling cards', async (selection) => {
    const path = selection.kind === 'character' ? 'characters/hero' : 'npcSheets/roy'
    const lost = { movement: [4, 5], action: [3, 4] }
    const card = { id: 'dazed', cardKey: 'dazed', name: 'Concussion', cause: 'Fisticuffs', lost, steps: [{ modifiers: [], labels: ['Dazed'], until: 'rounds' as const }] }
    const sibling = { id: 'lasting', cardKey: 'lasting', name: 'Concussion', cause: 'Fisticuffs', steps: [{ modifiers: [{ target: 'Intellect' as const, amount: -10 }], labels: [], until: 'lasting' as const }] }
    await fixture([wound({ target: selection, originatingRound: 3, effectiveRound: 3, effects: [card, sibling], traumaDelta: 0, stressDelta: 0 })], 3)
    await drainCombatWounds(as(), scope, 'gm')
    const delivered = (await storedSheet(as(), path)).lubec.effects
    expect(delivered[0].lost).toEqual(lost)
    const close: CombatWound = { kind: 'close', tickRound: 4, id: `close:${selection.kind}:${selection.sheetId}`, target: selection, originatingRound: 4, effectiveRound: 5, traumaDelta: 0, stressDelta: 0 }
    await fixture([close], 4)
    await Promise.all([drainCombatWounds(as(), scope, 'gm'), drainCombatWounds(as('second-gm'), scope, 'second-gm')])
    const after = await storedSheet(as(), path)
    expect(after.lubec.effects[0]).toMatchObject({ lost, afterCombat: { suggestedMinutes: 2 }, steps: [{ until: 'by-hand' }] })
    expect(after.lubec.effects[1]).toEqual(delivered[1])
    const receipt = await deliverCombatWound(as(), scope, 'gm', close.id)
    expect(receipt.targetRevision).toBe(2)
    expect((await storedSheet(as(), path)).sheetRevision).toBe(2)
  })
})


describe('standing through real rules and command receipts', () => {
  it.each([target, { kind: 'npc', sheetId: 'roy' } as const])('clears only down on a successful Stand for $kind and replays without rerolling', async (selection) => {
    const path = selection.kind === 'character' ? 'characters/hero' : 'npcSheets/roy'
    const raw = sheet(selection.kind === 'character' ? 'player' : 'gm')
    const down = { id: 'down', name: 'Knocked down', cause: 'Sweep', steps: [{ modifiers: [], labels: [], until: 'combat-end', restrictions: [{ kind: 'down' }] }] }
    const sibling = { id: 'sibling', name: 'Dazed', cause: 'Concussion', steps: [{ modifiers: [], labels: ['Action lost'], until: 'rounds' }] }
    await seed(path, { ...raw, lubec: { ...raw.lubec, base: { ...raw.lubec.base, Speed: 100 }, effects: [down, sibling] } })
    const fight = await readFight()
    await updateDoc(ref(as(), 'combats/fight'), { state: { ...fight.state, phase: 'movement', round: 3, order: ['character:hero', 'npc:roy'], pendingActions: [] } })
    const actorKey = `${selection.kind}:${selection.sheetId}`
    const move = { ...await command('move', 'stand', actorKey), payload: { type: 'move', choice: 'stand' } }
    const uid = selection.kind === 'character' ? 'player' : 'gm'
    const [one, two] = await Promise.all([commitCombatCommand(as(uid), move, settings(uid)), commitCombatCommand(as(), move, settings())])
    expect(one).toMatchObject({ ok: true })
    expect(two).toEqual(one)
    expect((await storedSheet(as(), path))).toMatchObject({ sheetRevision: 1, lubec: { effects: [sibling], counters: raw.lubec.counters } })
    expect((await readFight()).state.combatants.find((entry) => entry.key === actorKey)?.movement).toMatchObject({ choice: 'stand', stand: { success: true } })
    expect(await commitCombatCommand(as(uid), move, settings(uid))).toEqual(one)
    expect((await storedSheet(as(), path)).sheetRevision).toBe(1)
  })

  it('charges failed Stand Stress once and keeps the down card, then closing clears it', async () => {
    const raw = sheet()
    const down = { id: 'down', name: 'Knocked down', cause: 'Sweep', combatOrigin: { fightId: 'fight', woundId: 'knock', originatingRound: 1, effectiveRound: 1 }, steps: [{ modifiers: [], labels: [], until: 'combat-end', restrictions: [{ kind: 'down' }] }] }
    await seed('characters/hero', { ...raw, lubec: { ...raw.lubec, base: { ...raw.lubec.base, Speed: 0 }, effects: [down] } })
    const fight = await readFight()
    await updateDoc(ref(as(), 'combats/fight'), { state: { ...fight.state, phase: 'movement', round: 3, order: ['character:hero', 'npc:roy'], pendingActions: [] } })
    let move = { ...await command('move', 'stand', 'character:hero'), payload: { type: 'move', choice: 'stand' } }
    for (let i = 0; combatEntropy(move).die('stand:character:hero', 100) <= 50; i++) move = { ...move, seed: `failed-stand-${i}` }
    const result = await commitCombatCommand(as('player'), move, settings('player'))
    expect(result).toMatchObject({ ok: true })
    expect(await commitCombatCommand(as('player'), move, settings('player'))).toEqual(result)
    const current = await storedSheet()
    expect(current.lubec.counters.stress).toBe(raw.lubec.counters.stress + 1)
    expect(current.lubec.effects).toEqual([down])
    expect((await readFight()).state.lost?.['character:hero'].action).toEqual([3])
    expect(await commitCombatCommand(as(), await command('end'), settings())).toMatchObject({ ok: true })
    expect((await storedSheet()).lubec.effects).toEqual([])
    expect((await storedSheet()).lubec.counters.stress).toBe(raw.lubec.counters.stress + 1)
  })
})


describe('waking Head 9 through real rules', () => {
  const card = { id: 'wake', name: 'Knocked out', cause: 'Fisticuffs Head 9', cardKey: 'unconscious', wakeSave: 'severe-concussion', wound: { groupId: 'original', trauma: 2, minimumStress: 3, dice: { minutes: [4, 9] } }, steps: [{ modifiers: [], labels: ['13 minutes'], until: 'by-hand', restrictions: [{ kind: 'unconscious' }] }] }
  const sibling = { id: 'sibling', name: 'Dazed', cause: 'Another wound', steps: [{ modifiers: [], labels: ['Keep'], until: 'rounds' }] }
  const quiet = { settleSaves: async () => undefined }
  const recover = (uid: string, selection: CombatantSelection) => lubecEffectRecovery({ db: as(uid), scope, sheet: selection.kind === 'npc' ? { kind: 'npc', npcId: selection.sheetId } : { kind: 'character', characterId: selection.sheetId } }, quiet, selection.sheetId)

  it.each([target, { kind: 'npc', sheetId: 'roy' } as const])('resolves $kind once across racing clears and reload, preserving landing charges and siblings', async (selection) => {
    const path = selection.kind === 'character' ? 'characters/hero' : 'npcSheets/roy'
    const raw = sheet(selection.kind === 'character' ? 'player' : 'gm')
    await seed(path, { ...raw, lubec: { ...raw.lubec, base: { ...raw.lubec.base, Body: 100 }, counters: { stress: 3, minimumStress: 3, trauma: 2 }, effects: [card, sibling] } })
    const uid = selection.kind === 'character' ? 'player' : 'gm'
    const first = recover(uid, selection)
    const results = await Promise.all([first('wake'), recover('second-gm', selection)('wake')])
    expect(results[0]).toMatchObject({ status: 'committed', revision: 1 })
    expect(results[1]).toEqual(results[0])
    const current = await storedSheet(as(), path)
    expect(current.lubec.counters).toEqual({ stress: 3, minimumStress: 3, trauma: 2 })
    expect(current.lubec.effects).toHaveLength(2)
    expect(current.lubec.effects[0]).toEqual(sibling)
    expect(current.lubec.effects[1]).toMatchObject({ id: 'wake_aftermath', wound: card.wound, steps: [{ modifiers: [{ target: 'Handle', amount: -10 }] }], recoveryRoll: { outcome: 'success', advantage: 'disadvantage' } })
    expect(await recover(uid, selection)('wake')).toEqual(results[0])
    expect((await storedSheet(as(), path)).sheetRevision).toBe(1)
  })

  it('charges a failed waking Save once and refuses another player or a player resolving an NPC', async () => {
    const raw = sheet()
    await seed('characters/hero', { ...raw, lubec: { ...raw.lubec, base: { ...raw.lubec.base, Body: 0 }, counters: { stress: 3, minimumStress: 3, trauma: 2 }, effects: [card, sibling] } })
    await seed('npcSheets/roy', { ...raw, ownerUserId: 'gm', lubec: { ...raw.lubec, effects: [card] } })
    await expect(recover('other', target)('wake')).rejects.toThrow()
    await expect(recover('player', { kind: 'npc', sheetId: 'roy' })('wake')).rejects.toThrow()
    const result = await recover('player', target)('wake')
    expect(result).toMatchObject({ status: 'committed', revision: 1 })
    expect(await recover('gm', target)('wake')).toEqual(result)
    const current = await storedSheet()
    expect(current.lubec.counters).toEqual({ stress: 4, minimumStress: 3, trauma: 2 })
    expect(current.lubec.effects[1]).toMatchObject({ recoveryRoll: { outcome: 'failure' }, steps: [{ modifiers: [{ target: 'Handle', amount: -30 }] }, { modifiers: [{ target: 'Handle', amount: -10 }] }, { modifiers: [{ target: 'Intellect', amount: -10 }] }] })
  })
})

describe('a wound drop through real rules', () => {
  const inHand = (id: string, name: string, slot: number, extra: Record<string, unknown> = {}) =>
    ({ id, kind: 'thing', carrier: 'hands', slot, name, size: 1, qty: 1, weight: 'normal', note: '', ...extra })
  const holding = (ownerUserId: string, ...items: object[]) => {
    const raw = sheet(ownerUserId)
    return { ...raw, lubec: { ...raw.lubec, gear: { ...raw.lubec.gear, items } } }
  }

  it.each([target, { kind: 'npc', sheetId: 'roy' } as const])('moves the struck hand\'s item from the $kind sheet to the Floor once, across racing drains, a replay and End', async (selection) => {
    const path = selection.kind === 'character' ? 'characters/hero' : 'npcSheets/roy'
    await seed(path, holding(selection.kind === 'character' ? 'player' : 'gm', inHand('knife', 'Knife', 1), inHand('lantern', 'Lantern', 0)))
    await fixture([wound({ target: selection, effectiveRound: 1, drop: { hand: 'right' } })])
    await Promise.all([drainCombatWounds(as(), scope, 'gm'), drainCombatWounds(as('second-gm'), scope, 'second-gm')])
    const fight = await readFight()
    expect(fight.state.floor.map((record) => record.item.id)).toEqual(['knife'])
    expect(fight.state.floor[0].item).not.toHaveProperty('slot')
    const stored = await storedSheet(as(), path)
    expect(stored.lubec.gear.items.map((item: { id: string }) => item.id)).toEqual(['lantern'])
    expect(stored).toMatchObject({ sheetRevision: 1, lubec: { counters: { trauma: 1 } } })
    expect(await deliverCombatWound(as(), scope, 'gm', 'wound')).toEqual(fight.state.woundAcknowledgements[0])
    expect((await readFight()).state.floor).toHaveLength(1)
    expect(await commitCombatCommand(as(), await command('end'), settings())).toMatchObject({ ok: true })
    expect((await getDoc(ref(as(), 'gmItems/knife'))).data()).toMatchObject({ id: 'knife', name: 'Knife', status: 'dropped' })
  })

  it('drops a two-handed item held through the struck hand as one item, and an empty hand drops nothing', async () => {
    await seed('characters/hero', holding('player', inHand('spear', 'Spear', 0, { size: 2 })))
    await fixture([wound({ effectiveRound: 1, drop: { hand: 'right' } }), wound({ id: 'again', effectiveRound: 1, drop: { hand: 'left' } })])
    await drainCombatWounds(as(), scope, 'gm')
    expect((await readFight()).state.floor.map((record) => record.item.id)).toEqual(['spear'])
    const stored = await storedSheet()
    expect(stored.lubec.gear.items).toEqual([])
    expect(stored.sheetRevision).toBe(2)
  })
})

describe('the delayed speech-recovery Save through real rules', () => {
  const speech = {
    id: 'speech', name: 'Windpipe opened', part: 'Speech', cause: 'Cutting Neck 5', cardKey: 'speech', wound: { groupId: 'original', trauma: 2 },
    steps: [
      { modifiers: [], labels: [], until: 'long-rest', restrictions: [{ kind: 'speech', words: 'Whisper only' }] },
      { modifiers: [], labels: ['Body Save'], until: 'by-hand', onReach: { save: 'Body', failure: 'Speech damaged' } },
    ],
  }
  const bleed = { id: 'bleed', name: 'Windpipe opened', part: 'Bleeding', cause: 'Cutting Neck 5', steps: [{ modifiers: [], labels: ['Keep'], until: 'rounds' }] }
  const quiet = { settleSaves: async () => undefined }
  const recover = (uid: string, selection: CombatantSelection) => lubecEffectRecovery({ db: as(uid), scope, sheet: selection.kind === 'npc' ? { kind: 'npc', npcId: selection.sheetId } : { kind: 'character', characterId: selection.sheetId } }, quiet, selection.sheetId)

  it.each([target, { kind: 'npc', sheetId: 'roy' } as const])('resolves a $kind card once across racing Step downs and a replay, keeping the sibling and the landing charges', async (selection) => {
    const path = selection.kind === 'character' ? 'characters/hero' : 'npcSheets/roy'
    const raw = sheet(selection.kind === 'character' ? 'player' : 'gm')
    await seed(path, { ...raw, lubec: { ...raw.lubec, base: { ...raw.lubec.base, Body: 100 }, counters: { stress: 3, minimumStress: 3, trauma: 2 }, effects: [speech, bleed] } })
    const uid = selection.kind === 'character' ? 'player' : 'gm'
    const results = await Promise.all([recover(uid, selection)('speech', 'reach'), recover('second-gm', selection)('speech', 'reach')])
    expect(results[0]).toMatchObject({ status: 'committed', revision: 1 })
    expect(results[1]).toEqual(results[0])
    const current = await storedSheet(as(), path)
    expect(current.lubec.counters).toEqual({ stress: 3, minimumStress: 3, trauma: 2 })
    expect(current.lubec.effects).toEqual([bleed])
    expect(current.lubec.lastRoll).toMatchObject({ against: 'Body', outcome: 'success' })
    expect(await recover(uid, selection)('speech', 'reach')).toEqual(results[0])
    expect((await storedSheet(as(), path)).sheetRevision).toBe(1)
  })

  it('charges a failed Save once, and refuses another player or a player resolving an NPC', async () => {
    const raw = sheet()
    await seed('characters/hero', { ...raw, lubec: { ...raw.lubec, base: { ...raw.lubec.base, Body: 0 }, counters: { stress: 3, minimumStress: 3, trauma: 2 }, effects: [speech, bleed] } })
    await seed('npcSheets/roy', { ...raw, ownerUserId: 'gm', lubec: { ...raw.lubec, effects: [speech] } })
    await expect(recover('other', target)('speech', 'reach')).rejects.toThrow()
    await expect(recover('player', { kind: 'npc', sheetId: 'roy' })('speech', 'reach')).rejects.toThrow()
    const result = await recover('player', target)('speech', 'reach')
    expect(result).toMatchObject({ status: 'committed', revision: 1 })
    expect(await recover('gm', target)('speech', 'reach')).toEqual(result)
    const current = await storedSheet()
    expect(current.lubec.counters).toEqual({ stress: 4, minimumStress: 3, trauma: 2 })
    expect(current.lubec.effects).toEqual([bleed, expect.objectContaining({ id: 'speech_recovered', steps: [expect.objectContaining({ labels: ['Speech damaged'], until: 'lasting', charmReminder: true })], recoveryRoll: expect.objectContaining({ outcome: 'failure' }) })])
  })
})

describe('Death Save reminders through real rules', () => {
  const classed = (trauma: number) => {
    const raw = sheet()
    return { ...raw, lubec: { ...raw.lubec, class: { key: 'working', choices: {} }, counters: { stress: 0, minimumStress: 2, trauma } } }
  }

  it('raises one reminder for a wound across racing drains and a replay, and the GM marks it handled once', async () => {
    await seed('characters/hero', classed(2))
    await fixture([wound({ effectiveRound: 1, traumaDelta: 2, immediateDeathSave: 'Shot through the heart' })])
    await Promise.all([drainCombatWounds(as(), scope, 'gm'), drainCombatWounds(as('second-gm'), scope, 'second-gm')])
    await deliverCombatWound(as(), scope, 'gm', 'wound')
    const stored = await storedSheet()
    expect(stored.lubec.counters.trauma).toBe(4)
    expect(stored.lubec.deathReminders).toEqual([expect.objectContaining({ reasons: ['Immediate Death Save: Shot through the heart', 'Trauma reached 4, the Death Save threshold of 4'] })])
    const id = stored.lubec.deathReminders[0].id
    const handled = await Promise.all([acknowledgeLubecDeathReminder(as(), scope, target, id), acknowledgeLubecDeathReminder(as('second-gm'), scope, target, id)])
    expect(handled[1]).toEqual(handled[0])
    const after = await storedSheet()
    expect(after.lubec.deathReminders).toEqual([expect.objectContaining({ id, handled: true })])
    expect(after.lubec.counters).toEqual(stored.lubec.counters)
  })

  it('raises none for a wound below the threshold', async () => {
    await seed('characters/hero', classed(0))
    await fixture([wound({ effectiveRound: 1, traumaDelta: 1 })])
    await drainCombatWounds(as(), scope, 'gm')
    expect((await storedSheet()).lubec.deathReminders).toBeUndefined()
  })
})

describe('GM-only Lubec conditions through real rules', () => {
  it('denies owner creation with a condition, including alongside ordinary edits', async () => {
    for (const condition of ['comatose', 'dead']) {
      await assertFails(setDoc(ref(as('player'), `characters/new-${condition}`), { ...sheet(), schemaWrittenAt: serverTimestamp(), lubec: { ...sheet().lubec, condition } }))
    }
    await assertSucceeds(setDoc(ref(as('player'), 'characters/new-none'), { ...sheet(), schemaWrittenAt: serverTimestamp() }))
  })
  it('denies owner set, change, clear and nested deletion/replacement but allows unchanged conditions', async () => {
    await assertFails(updateDoc(ref(as('player'), 'characters/hero'), { 'lubec.condition': 'dead', name: 'Changed', sheetRevision: 1 }))
    await assertSucceeds(updateDoc(ref(as(), 'characters/hero'), { 'lubec.condition': 'comatose', sheetRevision: 1 }))
    for (const update of [
      { 'lubec.condition': 'dead' }, { 'lubec.condition': deleteField() }, { lubec: deleteField() },
      { lubec: sheet().lubec }, { lubec: { ...sheet().lubec, condition: 'dead' } },
    ]) await assertFails(updateDoc(ref(as('player'), 'characters/hero'), { ...update, name: 'Changed', sheetRevision: 2 }))
    await assertSucceeds(updateDoc(ref(as('player'), 'characters/hero'), { name: 'Ordinary edit', sheetRevision: 2 }))
    await assertSucceeds(updateDoc(ref(as('player'), 'characters/hero'), { lubec: { ...sheet().lubec, condition: 'comatose', age: 15 }, sheetRevision: 3 }))
    await assertSucceeds(updateDoc(ref(as(), 'characters/hero'), { 'lubec.condition': 'dead', sheetRevision: 4 }))
    await assertSucceeds(updateDoc(ref(as(), 'characters/hero'), { 'lubec.condition': deleteField(), sheetRevision: 5 }))
  })
  it('rebases a stale owner edit without erasing a newer GM condition', async () => {
    await saveSheetIntention(as(), ref(as(), 'characters/hero'), { operationId: 'gm-condition', baseRevision: 0, edits: [{ kind: 'set', path: ['lubec', 'condition'], base: { exists: false }, value: 'dead' }] })
    await saveSheetIntention(as('player'), ref(as('player'), 'characters/hero'), { operationId: 'owner-age', baseRevision: 0, edits: [{ kind: 'set', path: ['lubec', 'age'], base: { exists: true, value: null }, value: 15 }] })
    expect(await storedSheet()).toMatchObject({ lubec: { condition: 'dead', age: 15 } })
  })
  it.each(['characters/hero', 'npcSheets/roy'])('continues wounds and countdowns on a Dead %s', async (path) => {
    await seed(path, { ...sheet(), lubec: { ...sheet().lubec, condition: 'dead' } })
    const selection = path.startsWith('npcSheets') ? { kind: 'npc' as const, sheetId: 'roy' } : target
    await fixture([wound({ target: selection })])
    await deliverCombatWound(as(), scope, 'gm', 'wound')
    expect(await storedSheet(as(), path)).toMatchObject({ lubec: { condition: 'dead', counters: { trauma: 1 }, effects: [expect.anything()] } })
  })
})
