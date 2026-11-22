import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FirebaseError } from 'firebase/app'
import { runTransaction, type Firestore, type Transaction } from 'firebase/firestore'
import { lubecCharacterSheet } from '../../ruleSets/lubec/sheetFixtures'
import { lubecEffectiveHandle } from '../../ruleSets/lubec/derivations'
import { readCombatInputs } from './woundBarrier'
import { deliverCombatWound, drainCombatWounds } from './woundDelivery'
import type { CombatFight } from './engine/types'
import { WOUND_WAIT, type CombatWound } from './woundTypes'

// Verify adapter ordering/atomic writes without a service. The companion emulator
// suite independently exercises these public operations against the real rules.
type Ref = { path: string; id: string; withConverter: () => Ref }
const store = new Map<string, Record<string, unknown>>()
const events: string[] = []
let afterPlan: (() => Promise<void>) | undefined
function reference(path: string): Ref {
  return { path, id: path.split('/').at(-1)!, withConverter() { return this } }
}
function snapshot(ref: Ref) {
  const data = store.get(ref.path)
  return { exists: () => data !== undefined, data: () => data && structuredClone(data), get: (field: string) => data?.[field] }
}
vi.mock('firebase/firestore', () => ({
  doc: (parent: Ref | Firestore, ...segments: string[]) => reference(['path' in parent ? parent.path : '', ...segments].filter(Boolean).join('/')),
  serverTimestamp: () => 'server-time',
  getDocFromServer: async (ref: Ref) => { events.push(`probe ${ref.path}`); return snapshot(ref) },
  runTransaction: async (_db: Firestore, callback: (tx: Transaction) => Promise<unknown>) => {
    const writes: (() => void)[] = []
    let writing = false
    const tx = {
      get: async (ref: Ref) => {
        if (writing) throw new Error('Read after write')
        events.push(`read ${ref.path}`)
        return snapshot(ref)
      },
      set: (ref: Ref, data: Record<string, unknown>) => {
        writing = true
        writes.push(() => { events.push(`write ${ref.path}`); store.set(ref.path, structuredClone(data)) })
      },
      update: (ref: Ref, data: Record<string, unknown>) => {
        writing = true
        writes.push(() => { events.push(`write ${ref.path}`); store.set(ref.path, { ...store.get(ref.path), ...structuredClone(data) }) })
      },
    } as unknown as Transaction
    const result = await callback(tx)
    const interfere = afterPlan
    afterPlan = undefined
    if (interfere) { await interfere(); throw new FirebaseError('permission-denied', 'revision fence won by another GM') }
    writes.forEach((write) => write())
    return result
  },
}))

const db = {} as Firestore
const scope = { groupId: 'group', campaignId: 'campaign', fightId: 'fight' }
const root = 'groups/group/campaigns/campaign'
const target = { kind: 'character' as const, sheetId: 'hero' }
const wound = (overrides: Partial<CombatWound> = {}): CombatWound => ({ id: 'wound', target, originatingRound: 1, effectiveRound: 2, traumaDelta: 1, stressDelta: 2, effect: { id: 'injury', name: 'Bruise', cause: 'Bruise row', steps: [{ modifiers: [{ target: 'Handle', amount: -20 }], labels: ['Dazed'] }] }, ...overrides })
const put = (path: string, data: Record<string, unknown>) => store.set(path ? `${root}/${path}` : root, structuredClone(data))
const read = (path: string) => store.get(`${root}/${path}`)!
const fight = () => read('combats/fight') as unknown as CombatFight
const inputs = (confirmed: number | null = 0) => runTransaction(db, (tx) => readCombatInputs(db, tx, scope, target, confirmed))
const deliver = (id: string | undefined = 'wound', userId = 'gm') => deliverCombatWound(db, scope, userId, id)

beforeEach(() => {
  store.clear()
  events.length = 0
  afterPlan = undefined
  store.set('groups/group/members/gm', { role: 'member', status: 'active' })
  store.set('groups/group/members/admin', { role: 'admin', status: 'active' })
  store.set('groups/group/members/player', { role: 'member', status: 'active' })
  put('', { gmUserId: 'gm' })
  put('combatControl/current', { activeFightId: 'fight' })
  put('combats/fight', { status: 'live', participantUserIds: ['player'], state: { round: 1, phase: 'attack', stageInstanceId: 'stage', floor: [], attack: null, woundOutbox: [wound()], woundAcknowledgements: [], combatants: [{ ...target, key: 'character:hero', name: 'Tommy', ownerUserId: 'player', portraitPath: '', speed: 56, armor: [], interactionSequence: 0, outReason: null }] } })
  put('characters/hero', { name: 'Tommy', ownerUserId: 'player', system: 'lubec', schemaVersion: 1, schemaWrittenAt: 'canonical-stamp', sheetRevision: 0, lubec: lubecCharacterSheet(), futureField: 'retain' })
})

describe('wound delivery adapter', () => {
  it('reads canonical data before atomically writing sheet, receipt and retained acknowledgement', async () => {
    const ack = await deliver()
    expect(ack).toMatchObject({ id: 'wound', targetRevision: 1, effectiveRound: 2 })
    expect(events.filter((event) => event.startsWith('write'))).toEqual([
      `write ${root}/characters/hero`, `write ${root}/characters/hero/writeReceipts/${ack!.operationId}`, `write ${root}/combats/fight`,
    ])
    expect(read('characters/hero')).toMatchObject({ sheetRevision: 1, schemaWrittenAt: 'canonical-stamp', futureField: 'retain', lubec: { counters: { trauma: 1, stress: 4 } } })
    expect(read(`characters/hero/writeReceipts/${ack!.operationId}`)).toMatchObject({ outcome: { revision: 1, operationId: ack!.operationId } })
    expect(fight().state).toMatchObject({ woundOutbox: [], woundAcknowledgements: [ack] })
    events.length = 0
    expect(await deliver()).toEqual(ack)
    expect(events.some((event) => event.startsWith('write'))).toBe(false)
  })

  it('recovers proven revision contention by rereading the already-drained outbox, without applying another delta', async () => {
    let competing: Awaited<ReturnType<typeof deliver>>
    afterPlan = async () => { competing = await deliver('wound', 'admin') }
    expect(await deliver()).toEqual(competing!)
    expect(events.filter((event) => event.startsWith('probe'))).toEqual([`probe ${root}/characters/hero`])
    expect(events.filter((event) => event === `write ${root}/characters/hero`)).toHaveLength(1)
    expect(read('characters/hero')).toMatchObject({ sheetRevision: 1, lubec: { counters: { trauma: 1 } } })
    expect(fight().state.woundAcknowledgements).toHaveLength(1)
  })

  it('drains latest wounds in order and leaves an empty or missing identified entry alone', async () => {
    fight().state.woundOutbox.push(wound({ id: 'another' }))
    await drainCombatWounds(db, scope, 'gm')
    expect(read('characters/hero')).toMatchObject({ sheetRevision: 2, lubec: { counters: { trauma: 2, stress: 6 } } })
    expect(fight().state.woundAcknowledgements.map((ack) => ack.targetRevision)).toEqual([1, 2])
    expect(await deliver('missing')).toBeNull()
    fight().status = 'ended'
    await drainCombatWounds(db, scope, 'gm')
  })

  it('addresses NPC sheets through the same protocol', async () => {
    const npcTarget = { kind: 'npc' as const, sheetId: 'roy' }
    fight().state.combatants = [{ ...fight().state.combatants[0], ...npcTarget, key: 'npc:roy' }]
    fight().state.woundOutbox = [wound({ target: npcTarget })]
    put('npcSheets/roy', read('characters/hero'))
    expect(await deliver()).toMatchObject({ target: npcTarget, targetRevision: 1 })
    expect(read('npcSheets/roy').sheetRevision).toBe(1)
    expect(read('characters/hero').sheetRevision).toBe(0)
  })

  it.each(['player', 'removed'])('refuses delivery for %s before touching a private target', async (userId) => {
    store.set('groups/group/members/removed', { role: 'admin', status: 'removed' })
    await expect(deliver('wound', userId)).rejects.toThrow('Only the GM')
    expect(events.some((event) => event.includes('characters'))).toBe(false)
    expect(fight().state.woundOutbox).toHaveLength(1)
  })

  it.each([
    ['missing fight', () => { store.delete(`${root}/combats/fight`) }, 'fight is missing'],
    ['ended fight', () => { fight().status = 'ended' }, 'not live'],
    ['lost control', () => { put('combatControl/current', { activeFightId: 'other' }) }, 'control does not match'],
    ['missing roster', () => { fight().state.combatants = [] }, 'not in this fight'],
    ['future wound', () => { fight().state.round = 0 }, 'future round'],
    ['duplicate id', () => { fight().state.woundOutbox.push(wound()) }, 'Duplicate wound'],
    ['missing sheet', () => { store.delete(`${root}/characters/hero`) }, 'sheet is missing'],
    ['invalid effect array', () => { (read('characters/hero').lubec as { effects: unknown }).effects = null }, 'sheet repair'],
  ] as const)('refuses %s with no partial writes', async (_name, corrupt, reason) => {
    corrupt()
    await expect(deliver()).rejects.toThrow(reason)
    expect(events.some((event) => event.startsWith('write'))).toBe(false)
  })

  it.each([{ kind: 'character', sheetId: '' }, { kind: 'invalid', sheetId: 'hero' }])('reports invalid persisted target identity: %j', async (selection) => {
    fight().state.combatants = [{ ...fight().state.combatants[0], ...selection, key: `${selection.kind}:${selection.sheetId}` } as CombatFight['state']['combatants'][number]]
    fight().state.woundOutbox = [wound({ target: selection as CombatWound['target'] })]
    await expect(deliver()).rejects.toThrow('Invalid wound target')
    expect(events.some((event) => event.startsWith('write'))).toBe(false)
  })
})

describe('canonical input adapter', () => {
  it('reads current inputs, delays due wounds and lagged snapshots, then freezes canonical penalized inputs', async () => {
    const earlier = await inputs()
    expect(lubecEffectiveHandle(earlier.sheet, earlier.modifiers)).toBe(55)
    fight().state.round = 2
    await expect(inputs()).rejects.toThrow(WOUND_WAIT)
    await deliver()
    await expect(inputs()).rejects.toThrow(WOUND_WAIT)
    const current = await inputs(1)
    expect(current.revision).toBe(1)
    expect(lubecEffectiveHandle(current.sheet, current.modifiers)).toBe(35)
    expect(lubecEffectiveHandle(earlier.sheet, earlier.modifiers)).toBe(55)
  })

  it('refuses input freezing for a target absent from the current fight', async () => {
    fight().state.combatants = []
    await expect(inputs()).rejects.toThrow('not in this fight')
    expect(events.some((event) => event.startsWith('write'))).toBe(false)
  })
})
