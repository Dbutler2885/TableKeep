import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, runTransaction, setDoc, updateDoc, type Firestore, type Transaction } from 'firebase/firestore'
import { emulatorPort } from '../../../../vitest.emulatorEndpoint'
import { firestoreRules } from '../../../../vitest.firestoreRules'
import { lubecCharacterSheet } from '../../ruleSets/lubec/sheetFixtures'
import { lubecDetachedItem } from '../../ruleSets/lubec/gear/detachedItems'
import { parseLubecGmItem } from '../../ruleSets/lubec/gear/gmItem'
import { commitCombatCommand, type CombatTransactionOptions } from './combatTransaction'
import { combatCommandJournal, createCombatCommand, type CombatJournalStorage } from './commandJournal'
import { combatLifecycleHandlers } from './engine/lifecycle'
import type { CombatCommand, CombatFight, CombatHandler, CombatOutcome } from './engine/types'
import { subscribeCombatLog, type CombatLogUpdate } from './combatLog'
import { subscribeCombat } from './combatSubscription'

const scope = { groupId: 'lifecycle', campaignId: 'lubec' }
const root = 'groups/lifecycle/campaigns/lubec'
let env: RulesTestEnvironment
const as = (uid = 'gm'): Firestore => env.authenticatedContext(uid).firestore()
const ref = (db: Firestore, path: string) => doc(db, root, path)
const sheet = (ownerUserId = 'player') => ({ system: 'lubec', name: 'Tommy', ownerUserId, creationStatus: 'active', schemaVersion: 1, sheetRevision: 0, schemaWrittenAt: new Date(123), lubec: lubecCharacterSheet() })
const item = { id: 'ball', name: 'Dodgeball', kind: 'weapon', mode: 'thrown', status: 'dropped', qty: 6, size: 1, impact: 2, futureField: { retained: true } }

function storage(): CombatJournalStorage {
  const entries = new Map<string, string>()
  return { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value) }, removeItem: (key) => { entries.delete(key) }, key: (index) => [...entries.keys()][index] ?? null, get length() { return entries.size } }
}
const options = (userId = 'gm'): CombatTransactionOptions => ({ userId, journal: combatCommandJournal(storage(), userId) })
const start = (id = 'start', floor = [{ itemId: 'ball', status: 'dropped', qty: 2 }]): CombatCommand => createCombatCommand({
  ...scope, id, fightId: `fight-${id}`, round: 0, phase: 'setup', stageInstanceId: `setup-${id}`, actorKey: null, interactionSequence: 0,
}, { type: 'start', combatants: [{ kind: 'character', sheetId: 'hero' }, { kind: 'character', sheetId: 'other' }, { kind: 'npc', sheetId: 'npc' }], floor, dodgeball: true }, () => 'seed')
const readFight = async (db: Firestore, fightId = 'fight-start') => (await getDoc(ref(db, `combats/${fightId}`))).data() as CombatFight
async function action(db: Firestore, type: string, id = type): Promise<CombatCommand> {
  const fight = await readFight(db)
  return createCombatCommand({ ...scope, fightId: 'fight-start', id, round: fight.state.round, phase: fight.state.phase, stageInstanceId: fight.state.stageInstanceId, actorKey: null, interactionSequence: 0 }, { type }, () => 'seed')
}
const commit = (db: Firestore, command: CombatCommand, supplied = options()) => commitCombatCommand(db, command, supplied)
const control = async (db: Firestore) => (await getDoc(ref(db, 'combatControl/current'))).data()?.activeFightId
async function seed(path: string, data: object) {
  await env.withSecurityRulesDisabled(async (context) => { await setDoc(ref(context.firestore(), path), data) })
}

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev', firestore: { host: '127.0.0.1', port: emulatorPort('FIRESTORE_EMULATOR_HOST', 8080), rules: firestoreRules() } })
})
afterAll(async () => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    for (const [uid, role] of [['admin', 'admin'], ['gm', 'member'], ['player', 'member'], ['other', 'member'], ['spectator', 'member']]) {
      await setDoc(doc(db, 'groups/lifecycle/members', uid), { userId: uid, role, status: 'active' })
    }
    await setDoc(ref(db, ''), { system: 'lubec', gmUserId: 'gm' })
    await setDoc(ref(db, 'characters/hero'), sheet())
    await setDoc(ref(db, 'characters/other'), sheet('other'))
    await setDoc(ref(db, 'npcSheets/npc'), { ...sheet('gm'), secretInput: 'private' })
    await setDoc(ref(db, 'npcs/npc'), { name: 'Roy', portraitPath: 'npc-art', secretStory: 'private' })
    await setDoc(ref(db, 'gmItems/ball'), item)
  })
})

describe('real adapter atomic Start', () => {
  it('races two GM devices on absent control, consumes once, and retains the winning public fight and receipt', async () => {
    const db = as()
    const commands = [start('one'), start('two')]
    const outcomes = await Promise.all([commit(db, commands[0]), commit(as('admin'), commands[1], options('admin'))])
    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1)
    expect(outcomes.filter((outcome) => !outcome.ok)).toEqual([{ ok: false, reason: 'A fight is already active.' }])
    const fightId = await control(db)
    expect((await getDocs(collection(db, root, 'combats'))).size).toBe(1)
    expect((await getDoc(ref(db, 'gmItems/ball'))).data()).toMatchObject({ qty: 4, id: 'ball' })
    const fight = await readFight(db, fightId)
    expect(fight).toMatchObject({ status: 'live', participantUserIds: ['player', 'other'], state: { round: 0, phase: 'before-initiative' } })
    expect(fight.state.combatants[2]).toMatchObject({ name: 'Roy', portraitPath: 'npc-art' })
    expect(JSON.stringify(fight)).not.toMatch(/secretInput|secretStory|base|counters/)
    expect((await getDocs(collection(db, root, 'combats', fightId, 'commands'))).size).toBe(1)
    expect((await getDocs(collection(db, root, 'combats', fightId, 'log'))).size).toBe(1)
  })

  it('publishes an NPC sheet name when its public NPC document is missing', async () => {
    const db = as()
    await env.withSecurityRulesDisabled(async (context) => { await deleteDoc(ref(context.firestore(), 'npcs/npc')) })
    expect(await commit(db, start())).toMatchObject({ ok: true })
    expect((await readFight(db)).state.combatants[2]).toMatchObject({ key: 'npc:npc', name: 'Tommy', portraitPath: '', ownerUserId: 'gm' })
  })

  it('cancelled and reloaded local selections do nothing; stale status/quantity/missing selections spend nothing', async () => {
    const db = as()
    const local = start()
    expect(await control(db)).toBeUndefined()
    expect((await getDoc(ref(db, 'gmItems/ball'))).data()?.qty).toBe(6)
    const reloaded = structuredClone(local)
    await updateDoc(ref(db, 'gmItems/ball'), { qty: 1 })
    expect(await commit(db, reloaded)).toMatchObject({ ok: false, reason: expect.stringContaining('quantity') })
    await seed('gmItems/ball', { ...item, status: 'library' })
    expect(await commit(db, local)).toMatchObject({ ok: false, reason: expect.stringContaining('stale') })
    expect(await control(db)).toBeUndefined()
    expect((await getDocs(collection(db, root, 'combats'))).empty).toBe(true)
    expect((await getDoc(ref(db, 'gmItems/ball'))).data()?.qty).toBe(6)
  })

  it.each(['Speed', 'Handle', 'Strength', 'Body'])('revalidates missing %s from the current sheet, rather than a setup snapshot', async (name) => {
    const db = as()
    const local = start()
    await updateDoc(ref(db, 'characters/hero'), { [`lubec.base.${name}`]: null, sheetRevision: 1 })
    expect(await commit(db, local)).toMatchObject({ ok: false, reason: expect.stringContaining(name) })
    expect(await control(db)).toBeUndefined()
    expect((await getDoc(ref(db, 'gmItems/ball'))).data()?.qty).toBe(6)
  })

  it('refuses a vanished selected sheet and consumes nothing', async () => {
    const db = as()
    await deleteDoc(ref(db, 'characters/other'))
    expect(await commit(db, start())).toEqual({ ok: false, reason: 'character:other: sheet is missing or unreadable.' })
    expect(await control(db)).toBeUndefined()
    expect((await getDoc(ref(db, 'gmItems/ball'))).data()?.qty).toBe(6)
  })

  it('deletes fully consumed drops; library copies use latest data and repeated placements keep distinct ids', async () => {
    const db = as()
    await seed('gmItems/ball', { ...item, status: 'library', impact: 8 })
    expect(await commit(db, start('start', [{ itemId: 'ball', status: 'library', qty: 6 }]))).toMatchObject({ ok: true })
    const place = await action(db, 'place')
    place.payload.floor = [{ itemId: 'ball', status: 'library', qty: 6 }]
    const first = await commit(db, place)
    expect(await commit(db, place)).toEqual(first)
    const next = { ...place, envelope: { ...place.envelope, id: 'place-again' } }
    await commit(db, next)
    const floor = (await readFight(db)).state.floor
    expect(floor.map((record) => record.item.qty)).toEqual([6, 6, 6])
    expect(floor.map((record) => record.item.impact)).toEqual([8, 8, 8])
    expect(new Set(floor.map((record) => record.item.id)).size).toBe(3)
    expect((await getDoc(ref(db, 'gmItems/ball'))).data()).toMatchObject({ qty: 6, status: 'library' })
    await commit(db, await action(db, 'end'))
    expect((await getDocs(collection(db, root, 'gmItems'))).size).toBe(4)
    const takeAll = start('all', [{ itemId: floor[0].item.id, status: 'dropped', qty: 6 }])
    await commit(db, takeAll)
    expect((await getDoc(ref(db, `gmItems/${floor[0].item.id}`))).exists()).toBe(false)
  })
})

describe('durable command protocol', () => {
  it('recovers a lost acknowledgement from the journal and returns Start and End receipts after End', async () => {
    const db = as()
    const journalStorage = storage()
    const settings = { ...options(), journal: combatCommandJournal(journalStorage, 'gm') }
    const local = start()
    const lost = { ...settings, transact: async (callback: (tx: Transaction) => Promise<CombatOutcome>) => { await runTransaction(db, callback); throw new Error('transport lost acknowledgement') } }
    await expect(commit(db, local, lost)).rejects.toThrow('lost acknowledgement')
    const reloaded = combatCommandJournal(journalStorage, 'gm')
    expect(reloaded.pending()).toEqual([local])
    const replay = await commit(db, reloaded.pending()[0], settings)
    expect(reloaded.pending()).toEqual([])
    const end = await action(db, 'end')
    await expect(commit(db, end, lost)).rejects.toThrow('lost acknowledgement')
    expect(await control(db)).toBeNull()
    const dropsBefore = (await getDocs(collection(db, root, 'gmItems'))).docs.map((snap) => snap.data())
    expect(await commit(db, end, settings)).toMatchObject({ ok: true })
    expect(await commit(db, local)).toEqual(replay)
    expect((await getDocs(collection(db, root, 'gmItems'))).docs.map((snap) => snap.data())).toEqual(dropsBefore)
    expect(await commit(db, { ...local, payload: { ...local.payload, dodgeball: false } })).toEqual({ ok: false, reason: 'Command id reused with different payload.' })
  })

  it('forced real transaction retries retain output ids, rolls and receipts', async () => {
    const db = as()
    let callbacks = 0
    const transact: CombatTransactionOptions['transact'] = (callback) => runTransaction(db, async (tx) => {
      const outcome = await callback(tx)
      callbacks++
      if (callbacks === 1) await updateDoc(ref(as('admin'), 'gmItems/ball'), { impact: 7 })
      return outcome
    })
    const outcome = await commit(db, start(), { ...options(), transact })
    expect(callbacks).toBeGreaterThan(1)
    expect(outcome).toMatchObject({ ok: true, generatedIds: expect.arrayContaining(['item:start:floor%3Aball:0']) })
    expect((await readFight(db)).state.floor[0].item).toMatchObject({ impact: 7, qty: 2 })
    expect((await getDocs(collection(db, root, 'combats/fight-start/commands'))).size).toBe(1)
    expect((await getDocs(collection(db, root, 'combats/fight-start/log'))).size).toBe(1)
  })

  const interaction: CombatHandler = (command, records, _authority, entropy) => {
    const fight = records.fight!
    entropy.die('fixture roll', 100)
    const combatants = fight.state.combatants.map((actor) => actor.key === command.envelope.actorKey ? { ...actor, interactionSequence: actor.interactionSequence + 1 } : actor)
    return { fight: { ...fight, state: { ...fight.state, combatants } }, items: [], logs: [{ event: 'Fixture actor interaction.', actor: command.envelope.actorKey }] }
  }

  it('independent actor commands both commit with actor-local sequences, and stale actor/round/attack deliveries refuse', async () => {
    const db = as()
    await commit(db, start())
    const settings = (uid: string) => ({ ...options(uid), handlers: { ...combatLifecycleHandlers, fixture: interaction } })
    const first = await action(db, 'fixture', 'player-action')
    first.envelope.actorKey = 'character:hero'
    const second = await action(db, 'fixture', 'other-action')
    second.envelope.actorKey = 'character:other'
    const outcomes = await Promise.all([commit(as('player'), first, settings('player')), commit(as('other'), second, settings('other'))])
    expect(outcomes.every((outcome) => outcome.ok)).toBe(true)
    expect((await readFight(db)).state.combatants.slice(0, 2).map((actor) => actor.interactionSequence)).toEqual([1, 1])
    expect(await commit(as('player'), first, settings('player'))).toEqual(outcomes[0])
    const stale = { ...first, envelope: { ...first.envelope, id: 'new-stale' } }
    expect(await commit(as('player'), stale, settings('player'))).toMatchObject({ ok: false, reason: expect.stringContaining('interaction is stale') })
    for (const field of [{ round: 2 }, { stageInstanceId: 'old-stage' }, { phase: 'movement' }, { attackId: 'old-attack' }, { grantId: 'old-grant' }, { step: 'catch' }]) {
      const late = { ...first, envelope: { ...first.envelope, id: 'late', interactionSequence: 1, ...field } }
      expect(await commit(as('player'), late, settings('player'))).toMatchObject({ ok: false })
    }
    expect((await getDocs(collection(db, root, 'combats/fight-start/commands'))).size).toBe(3)
    const forged = { ...second, envelope: { ...second.envelope, id: 'forged', interactionSequence: 1 } }
    expect(await commit(as('player'), forged, settings('player'))).toMatchObject({ ok: false, reason: expect.stringContaining('belongs to someone else') })
    await expect(commit(as('spectator'), first, settings('spectator'))).resolves.toEqual(outcomes[0])
    const spectator = { ...first, envelope: { ...first.envelope, id: 'spectator', interactionSequence: 1 } }
    expect(await commit(as('spectator'), spectator, settings('spectator'))).toMatchObject({ ok: false })
  })

  it('enforces GM lifecycle authority and retains pending commands when rules refuse reads', async () => {
    const db = as()
    await commit(db, start())
    for (const type of ['end', 'interrupt', 'place']) {
      expect(await commit(as('player'), await action(db, type), options('player'))).toMatchObject({ ok: false, reason: 'Only the GM can do that.' })
    }
    const playerOptions = options('player')
    expect(await commit(as('player'), start('player-start'), playerOptions)).toEqual({ ok: false, reason: 'Only the GM can do that.' })
    expect(playerOptions.journal.pending()).toEqual([])
    const outsiderOptions = options('outsider')
    await expect(commit(as('outsider'), start('outsider'), outsiderOptions)).rejects.toThrow()
    expect(outsiderOptions.journal.pending()).toHaveLength(1)
    expect((await getDocs(collection(db, root, 'combats'))).size).toBe(1)
  })

  it('surfaces an unexpected non-Error engine failure as a failed send and keeps it journalled', async () => {
    const db = as()
    await commit(db, start())
    const broken: CombatHandler = () => { throw 'engine bug' }
    const settings = { ...options(), handlers: { broken } }
    await expect(commit(db, await action(db, 'broken'), settings)).rejects.toBe('engine bug')
    expect(settings.journal.pending()).toHaveLength(1)
  })

  it('replaces mutable state whole, so a removed nested field does not survive a merge', async () => {
    const db = as()
    await commit(db, start())
    const fight = await readFight(db)
    fight.state.attack = { id: 'attack', grantId: 'grant', attackerKey: 'character:hero', step: 'aim', detached: [], closed: false }
    await updateDoc(ref(db, 'combats/fight-start'), { state: fight.state })
    const shrink: CombatHandler = (_command, records) => {
      const { grantId: _grantId, ...attack } = records.fight!.state.attack!
      return { fight: { ...records.fight!, state: { ...records.fight!.state, attack: attack as typeof records.fight.state.attack } }, items: [], logs: [] }
    }
    const command = await action(db, 'shrink')
    expect(await commit(db, command, { ...options(), handlers: { shrink } })).toMatchObject({ ok: true })
    expect((await readFight(db)).state.attack).not.toHaveProperty('grantId')
    expect(await readFight(db)).toMatchObject({ status: 'live', participantUserIds: ['player', 'other'] })
  })
})

describe('public fight summaries', () => {
  it('the GM republishes a changed NPC name and face from current records; a participant cannot', async () => {
    const db = as()
    expect(await commit(db, start())).toMatchObject({ ok: true })
    await setDoc(ref(db, 'npcs/npc'), { name: 'Roy the Bull', portraitPath: 'npc-art-2', secretStory: 'private' })
    const refused = await commit(as('player'), await action(as('player'), 'refresh', 'refresh-player'), options('player'))
    expect(refused).toEqual({ ok: false, reason: 'Only the GM can do that.' })
    expect(await commit(db, await action(db, 'refresh'))).toMatchObject({ ok: true })
    const fight = await readFight(db)
    expect(fight.state.combatants[2]).toMatchObject({ key: 'npc:npc', name: 'Roy the Bull', portraitPath: 'npc-art-2' })
    expect(JSON.stringify(fight)).not.toMatch(/secretInput|secretStory/)
    expect(await commit(db, await action(db, 'refresh', 'refresh-again'))).toEqual({ ok: false, reason: 'Public summaries are current.' })
  })
})

describe('atomic End and interruption', () => {
  it.each(['defense', 'catch', 'repair'])('settles %s, closes retained state and clears control in one commit', async (step) => {
    const db = as()
    await commit(db, start())
    const fight = await readFight(db)
    fight.state.attack = { id: 'pending', grantId: 'grant', attackerKey: 'character:hero', step, detached: [lubecDetachedItem(parseLubecGmItem({ ...item, qty: 1 }, 'thrown'), [])], closed: false }
    await updateDoc(ref(db, 'combats/fight-start'), { state: fight.state })
    const end = await action(db, 'end')
    expect(await commit(db, end)).toMatchObject({ ok: true })
    expect(await control(db)).toBeNull()
    expect(await readFight(db)).toMatchObject({ status: 'ended', state: { floor: [], attack: { closed: true, detached: [], step }, woundOutbox: [] } })
    expect((await getDoc(ref(db, 'gmItems/thrown'))).data()).toMatchObject({ status: 'dropped', qty: 1, impact: 2, futureField: { retained: true } })
    expect(await commit(db, end)).toMatchObject({ ok: true })
    expect((await getDocs(collection(db, root, 'gmItems'))).size).toBe(3)
    expect(await commit(db, await action(db, 'place'))).toMatchObject({ ok: false, reason: 'That fight is not live.' })
  })

  it('refuses conflicts or missing control with no partial writes, and preserves an already committed catch', async () => {
    const db = as()
    await commit(db, start())
    const floorId = (await readFight(db)).state.floor[0].item.id
    await seed(`gmItems/${floorId}`, { ...item, id: floorId, impact: 99 })
    expect(await commit(db, await action(db, 'end'))).toMatchObject({ ok: false, reason: expect.stringContaining('conflicting dropped item') })
    expect(await control(db)).toBe('fight-start')
    expect((await readFight(db)).status).toBe('live')
    const ghost = await action(db, 'end')
    expect(await commit(db, { ...ghost, envelope: { ...ghost.envelope, id: 'ghost-end', fightId: 'no-such-fight' } })).toEqual({ ok: false, reason: 'That fight is not live.' })
    await seed('combatControl/current', { activeFightId: 'different' })
    expect(await commit(db, await action(db, 'end'))).toMatchObject({ ok: false, reason: expect.stringContaining('control does not match') })
    expect((await getDocs(collection(db, root, 'combats/fight-start/commands'))).size).toBe(1)
  })

  it('retries finalization after a concurrent wound enqueue and refuses to end if delivery cannot clear it', async () => {
    const db = as()
    await commit(db, start())
    let callbacks = 0
    let drained = 0
    const settings: CombatTransactionOptions = {
      ...options(),
      transact: (callback) => runTransaction(db, async (tx) => {
        const outcome = await callback(tx)
        callbacks++
        if (callbacks === 1) {
          const fresh = await readFight(as('admin'))
          fresh.state.woundOutbox.push({ id: 'racing-wound', target: { kind: 'character', sheetId: 'hero' }, originatingRound: 0, effectiveRound: 1, traumaDelta: 1, stressDelta: 0, effect: { id: 'injury', name: 'Bruise', cause: 'Bruise row', steps: [] } })
          await updateDoc(ref(as('admin'), 'combats/fight-start'), { state: fresh.state })
        }
        return outcome
      }),
      drainWounds: async () => {
        drained++
        const fresh = await readFight(db)
        fresh.state.woundAcknowledgements.push(...fresh.state.woundOutbox.map((wound) => ({ id: wound.id, target: wound.target, targetRevision: 1, originatingRound: 0, effectiveRound: 1, operationId: 'fixture_op' })))
        fresh.state.woundOutbox = []
        await updateDoc(ref(db, 'combats/fight-start'), { state: fresh.state })
      },
    }
    expect(await commit(db, await action(db, 'end'), settings)).toMatchObject({ ok: true })
    expect(callbacks).toBeGreaterThan(2)
    expect(drained).toBe(1)
    expect(await readFight(db)).toMatchObject({ status: 'ended', state: { woundOutbox: [], woundAcknowledgements: [{ id: 'racing-wound', targetRevision: 1 }] } })
    const oldEnd = await action(db, 'end')
    await commit(db, oldEnd, settings)
    expect(drained).toBe(1)
    await commit(db, start('second', []))
    const second = await readFight(db, 'fight-second')
    second.state.woundOutbox = [{ id: 'undeliverable', target: { kind: 'character', sheetId: 'missing' }, originatingRound: 0, effectiveRound: 1, traumaDelta: 1, stressDelta: 0, effect: { id: 'injury', name: 'Bruise', cause: 'Bruise row', steps: [] } }]
    await updateDoc(ref(db, 'combats/fight-second'), { state: second.state })
    const endSecond = { ...oldEnd, envelope: { ...oldEnd.envelope, id: 'end-second', fightId: 'fight-second', stageInstanceId: second.state.stageInstanceId } }
    expect(await commit(db, endSecond)).toMatchObject({ ok: false, reason: expect.stringContaining('Wound delivery is pending') })
    expect(await commit(db, endSecond, { ...options(), drainWounds: async () => {} })).toMatchObject({ ok: false, reason: expect.stringContaining('still pending') })
    expect(await control(db)).toBe('fight-second')
  })

  it('interruption and End settle the same object once, and a committed catch creates no drop', async () => {
    const db = as()
    await commit(db, start())
    const fight = await readFight(db)
    fight.state.combatants[0].outReason = 'Out'
    fight.state.attack = { id: 'attack', grantId: null, attackerKey: 'character:hero', step: 'defense', detached: [lubecDetachedItem(parseLubecGmItem({ ...item, qty: 1 }, 'thrown'), [])], closed: false }
    await updateDoc(ref(db, 'combats/fight-start'), { state: fight.state })
    const interrupt = await action(db, 'interrupt')
    expect(await commit(db, interrupt)).toMatchObject({ ok: true })
    expect(await commit(db, interrupt)).toMatchObject({ ok: true })
    expect((await readFight(db)).state.floor).toHaveLength(2)
    await commit(db, await action(db, 'end'))
    expect((await getDoc(ref(db, 'gmItems/thrown'))).data()?.qty).toBe(1)
    expect((await readFight(db)).state.attack?.detached).toEqual([])
  })
})

it('subscribes by control id, follows replacement fights, and cleans up both listeners', async () => {
  const db = as()
  const seen: (string | null)[] = []
  const stop = subscribeCombat(db, scope, (value) => { seen.push(value?.id ?? null) }, (error) => { throw error })
  try {
    await vi.waitFor(() => expect(seen).toEqual([null]), { timeout: 5000 })
    expect(seen.at(-1)).toBeNull()
    await commit(db, start())
    await vi.waitFor(() => expect(seen.at(-1)).toBe('fight-start'), { timeout: 5000 })
    await commit(db, await action(db, 'end'))
    await vi.waitFor(() => expect(seen.at(-1)).toBeNull(), { timeout: 5000 })
    await commit(db, start('next', []))
    await vi.waitFor(() => expect(seen.at(-1)).toBe('fight-next'), { timeout: 5000 })
    await seed('combatControl/current', { activeFightId: 'missing-fight' })
    await vi.waitFor(() => expect(seen.slice(-2)).toEqual(['fight-next', null]), { timeout: 5000 })
  } finally { stop() }
})

describe('committed roll feedback through the real adapter and rules', () => {
  it('publishes one complete ordered roll log to a participant and a spectator, without replay on attachment', async () => {
    const db = as()
    await commit(db, start())
    const updates: CombatLogUpdate[][] = [[], []]
    const errors: Error[] = []
    const stops = ['player', 'spectator'].map((uid, index) => subscribeCombatLog(as(uid), scope, 'fight-start', (update) => updates[index].push(update), (error) => errors.push(error)))
    try {
      await vi.waitFor(() => expect(updates.every((viewer) => viewer.at(-1)?.entries.length === 1)).toBe(true), { timeout: 10_000 })
      expect(updates.flatMap((viewer) => viewer.flatMap(({ arriving }) => arriving))).toEqual([])
      const roll = { who: 'Tommy', what: 'Attack roll', roll: '27', target: 'against 36', result: 'Hit · Quality 2', tone: 'ok' as const, extra: 'Dodgeball thrown at Roy.' }
      const logs = Array.from({ length: 12 }, (_, ordinal) => ({ event: `Result ${ordinal}`, actor: 'character:hero', roll: { ...roll, what: `Roll ${ordinal}` } }))
      const publish: CombatHandler = (_command, records) => ({ fight: records.fight!, items: [], logs })
      const command = await action(db, 'publish')
      const settings = { ...options(), handlers: { publish } }
      expect(await commit(db, command, settings)).toMatchObject({ ok: true })
      expect(await commit(db, command, settings)).toMatchObject({ ok: true })
      await vi.waitFor(() => expect(updates.every((viewer) => viewer.flatMap(({ arriving }) => arriving).length === 12)).toBe(true), { timeout: 10_000 })
      for (const viewer of updates) {
        const arriving = viewer.flatMap((update) => update.arriving)
        expect(arriving.map(({ ordinal }) => ordinal)).toEqual(Array.from({ length: 12 }, (_, ordinal) => ordinal))
        expect(arriving[0]).toMatchObject({ actor: 'character:hero', roll: { ...roll, what: 'Roll 0' } })
        expect(viewer.at(-1)?.entries).toHaveLength(13)
      }
      expect(errors).toEqual([])
    } finally {
      stops.forEach((stop) => stop())
    }
  })
})
