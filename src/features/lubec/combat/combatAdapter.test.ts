/**
 * The combat adapter's own steps over an in-memory Firestore stub: which records
 * it reads, that every read precedes every write, what each write carries, and
 * how the control listener follows fights. Real rules and real transactions are
 * in `combatTransaction.emulator.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { lubecCharacterSheet } from '../../ruleSets/lubec/sheetFixtures'
import { lubecDetachedItem } from '../../ruleSets/lubec/gear/detachedItems'
import { parseLubecGmItem } from '../../ruleSets/lubec/gear/gmItem'
import type { CombatFight, CombatHandler } from './engine/types'

type Ref = { path: string; id: string }
type Data = Record<string, unknown>
type Listener = { path: string; next: (snap: unknown) => void; error: (error: Error) => void; active: boolean }
const store = new Map<string, Data>()
const events: string[] = []
const listeners: Listener[] = []
const snapOf = (ref: Ref) => {
  const data = store.get(ref.path)
  return { id: ref.id, exists: () => data !== undefined, data: () => data && structuredClone(data), get: (field: string) => data?.[field] }
}

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => {
    const path = segments.join('/')
    return { path, id: path.split('/').at(-1) }
  },
  serverTimestamp: () => 'server-time',
  runTransaction: async (_db: unknown, run: (tx: unknown) => Promise<unknown>) => {
    const writes: (() => void)[] = []
    const write = (kind: string, ref: Ref, apply: () => void) => { events.push(`${kind} ${ref.path}`); writes.push(apply) }
    const tx = {
      get: async (ref: Ref) => { events.push(`get ${ref.path}`); return snapOf(ref) },
      set: (ref: Ref, data: Data) => write('set', ref, () => store.set(ref.path, structuredClone(data))),
      update: (ref: Ref, data: Data) => write('update', ref, () => store.set(ref.path, { ...store.get(ref.path), ...structuredClone(data) })),
      delete: (ref: Ref) => write('delete', ref, () => store.delete(ref.path)),
    }
    const result = await run(tx)
    writes.forEach((apply) => apply())
    return result
  },
  onSnapshot: (ref: Ref, next: Listener['next'], error: Listener['error']) => {
    const listener = { path: ref.path, next, error, active: true }
    listeners.push(listener)
    next(snapOf(ref))
    return () => { listener.active = false }
  },
}))

const { commitCombatCommand } = await import('./combatTransaction')
const { combatCommandJournal, createCombatCommand } = await import('./commandJournal')
const { subscribeCombat } = await import('./combatSubscription')
const { combatLifecycleHandlers } = await import('./engine/lifecycle')

const db = {} as Firestore
function memoryStorage() {
  const entries = new Map<string, string>()
  return {
    getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value) },
    removeItem: (key: string) => { entries.delete(key) }, key: (index: number) => [...entries.keys()][index] ?? null, get length() { return entries.size },
  }
}
const root = 'groups/g/campaigns/c'
const scope = { groupId: 'g', campaignId: 'c' }
const sheet = (ownerUserId: string, name = 'Tommy') => ({ system: 'lubec', name, ownerUserId, creationStatus: 'active', schemaVersion: 1, sheetRevision: 0, schemaWrittenAt: new Date(1), lubec: lubecCharacterSheet() })
const ball = { name: 'Dodgeball', kind: 'weapon', mode: 'thrown', status: 'dropped', qty: 6, size: 1, impact: 2 }
const put = (path: string, data: Data) => store.set(path ? `${root}/${path}` : root, structuredClone(data))
const read = (path: string) => store.get(`${root}/${path}`)
const fight = () => read('combats/fight-start') as unknown as CombatFight
const options = (userId = 'gm', extra = {}) => ({ userId, journal: combatCommandJournal(memoryStorage(), userId), ...extra })
const selections = [{ kind: 'character', sheetId: 'hero' }, { kind: 'npc', sheetId: 'roy' }]
const start = (payload = {}) => createCombatCommand({ ...scope, id: 'start', fightId: 'fight-start', round: 0, phase: 'setup', stageInstanceId: 'local', actorKey: null, interactionSequence: 0 },
  { type: 'start', combatants: selections, floor: [{ itemId: 'ball', status: 'dropped', qty: 2 }], dodgeball: true, ...payload }, () => 'seed')
const action = (type: string, id = type, payload = {}) => {
  const { state } = fight()
  return createCombatCommand({ ...scope, id, fightId: 'fight-start', round: state.round, phase: state.phase, stageInstanceId: state.stageInstanceId, actorKey: null, interactionSequence: 0 }, { type, ...payload }, () => 'seed')
}
const commit = (command: ReturnType<typeof start>, settings = options()) => commitCombatCommand(db, command, settings)
const writesBeforeLastRead = () => events.findIndex((event) => !event.startsWith('get')) < events.findLastIndex((event) => event.startsWith('get'))

beforeEach(() => {
  store.clear()
  events.length = 0
  listeners.length = 0
  store.set('groups/g/members/gm', { status: 'active', role: 'member' })
  store.set('groups/g/members/player', { status: 'active', role: 'member' })
  store.set('groups/g/members/left', { status: 'removed', role: 'admin' })
  put('', { system: 'lubec', gmUserId: 'gm' })
  put('characters/hero', sheet('player'))
  put('npcSheets/roy', sheet('gm', 'Sheet name'))
  put('npcs/roy', { name: 'Roy', portraitPath: 'roy-art', story: 'private' })
  put('gmItems/ball', ball)
})

describe('Start through the adapter', () => {
  it('reads receipt, authority, control, fight, sheets and items before writing fight, control, item, log and receipt', async () => {
    const outcome = await commit(start())
    expect(outcome).toMatchObject({ ok: true, fightId: 'fight-start', generatedIds: expect.arrayContaining(['fight-start', 'item:start:floor%3Aball:0']) })
    expect(events.filter((event) => event.startsWith('get')).map((event) => event.slice(4))).toEqual([
      `${root}/combats/fight-start/commands/start`, root, 'groups/g/members/gm', `${root}/combatControl/current`, `${root}/combats/fight-start`,
      `${root}/characters/hero`, `${root}/npcSheets/roy`, `${root}/npcs/roy`, `${root}/gmItems/ball`,
    ])
    expect(writesBeforeLastRead()).toBe(false)
    expect(read('combatControl/current')).toEqual({ activeFightId: 'fight-start' })
    expect(read('gmItems/ball')).toMatchObject({ qty: 4, updatedAt: 'server-time' })
    expect(fight()).toMatchObject({ status: 'live', participantUserIds: ['player'], updatedAt: 'server-time', state: { phase: 'before-initiative', round: 0 } })
    expect(fight().state.combatants.map((actor) => [actor.name, actor.portraitPath])).toEqual([['Tommy', ''], ['Roy', 'roy-art']])
    expect(JSON.stringify(fight())).not.toContain('private')
    expect(read('combats/fight-start/log/start:log:0')).toEqual({ event: 'Combat started. Before initiative.', actor: null, ordinal: 0, at: 'server-time' })
    expect(read('combats/fight-start/commands/start')).toMatchObject({ outcome, at: 'server-time', command: { seed: 'seed' } })
  })

  it('uses the NPC sheet name when its public NPC document is missing', async () => {
    store.delete(`${root}/npcs/roy`)
    await commit(start())
    expect(fight().state.combatants[1]).toMatchObject({ name: 'Sheet name', portraitPath: '' })
  })

  it('refuses a vanished sheet, and deletes a fully consumed dropped stack', async () => {
    store.delete(`${root}/characters/hero`)
    expect(await commit(start())).toEqual({ ok: false, reason: 'character:hero: sheet is missing or unreadable.' })
    expect(read('gmItems/ball')).toMatchObject({ qty: 6 })
    put('characters/hero', sheet('player'))
    events.length = 0
    expect(await commit(start({ floor: [{ itemId: 'ball', status: 'dropped', qty: 6 }] }))).toMatchObject({ ok: true })
    expect(events).toContain(`delete ${root}/gmItems/ball`)
    expect(read('gmItems/ball')).toBeUndefined()
    expect(fight().state.floor.map((record) => [record.item.id, record.item.qty])).toEqual([['ball', 6]])
  })

  it('replays a committed duplicate, refuses changed reuse, and refuses without writing', async () => {
    const first = await commit(start())
    events.length = 0
    expect(await commit(start())).toEqual(first)
    expect(events).toEqual([`get ${root}/combats/fight-start/commands/start`])
    expect(await commit(start({ dodgeball: false }))).toEqual({ ok: false, reason: 'Command id reused with different payload.' })
    events.length = 0
    store.delete(`${root}/combats/fight-start/commands/start`)
    expect(await commit(start())).toEqual({ ok: false, reason: 'A fight is already active.' })
    expect(events.every((event) => event.startsWith('get'))).toBe(true)
  })

  it('reads no private sheet or GM item for a caller who is not an active GM', async () => {
    for (const userId of ['player', 'left', 'stranger']) {
      events.length = 0
      expect(await commit(start(), options(userId))).toEqual({ ok: false, reason: 'Only the GM can do that.' })
      expect(events.some((event) => /characters|npcSheets|npcs|gmItems/.test(event))).toBe(false)
    }
    store.set('groups/g/members/left', { status: 'active', role: 'admin' })
    expect(await commit(start(), options('left'))).toMatchObject({ ok: true })
  })
})

describe('commands on a live fight', () => {
  beforeEach(async () => { await commit(start()) })

  it('places from the payload and writes no control', async () => {
    put('gmItems/ball', { ...ball, status: 'library' })
    events.length = 0
    expect(await commit(action('place', 'place', { floor: [{ itemId: 'ball', status: 'library', qty: 1 }] }))).toMatchObject({ ok: true })
    expect(events).toContain(`get ${root}/gmItems/ball`)
    expect(events.some((event) => event.includes('combatControl') && !event.startsWith('get'))).toBe(false)
    expect(fight().state.floor).toHaveLength(2)
    expect(await commit(action('place', 'empty-place', { floor: [] }))).toMatchObject({ ok: true })
  })

  it('refreshes public summaries from every combatant\'s current sheet and public NPC record, and only for the GM', async () => {
    put('npcs/roy', { name: 'Roy the Bull', portraitPath: 'roy-art-2', story: 'private' })
    events.length = 0
    expect(await commit(action('refresh', 'refresh-player'), options('player'))).toEqual({ ok: false, reason: 'Only the GM can do that.' })
    expect(events.some((event) => event.includes('npcSheets') || event.includes('characters/'))).toBe(false)
    expect(await commit(action('refresh'))).toMatchObject({ ok: true })
    expect(events).toEqual(expect.arrayContaining([`get ${root}/characters/hero`, `get ${root}/npcSheets/roy`, `get ${root}/npcs/roy`]))
    expect(writesBeforeLastRead()).toBe(false)
    expect(fight().state.combatants[1]).toMatchObject({ key: 'npc:roy', name: 'Roy the Bull', portraitPath: 'roy-art-2' })
    expect(JSON.stringify(fight())).not.toMatch(/private|Sheet name/)
    expect(await commit(action('refresh', 'refresh-again'))).toEqual({ ok: false, reason: 'Public summaries are current.' })
  })

  it('replaces state whole, so a field the engine removed does not survive', async () => {
    const live = fight()
    put('combats/fight-start', { ...live, state: { ...live.state, scratch: 'stale' } })
    const shrink: CombatHandler = (_command, records) => {
      const { scratch: _scratch, ...state } = records.fight!.state as typeof records.fight.state & { scratch?: string }
      return { fight: { ...records.fight!, state }, items: [], logs: [] }
    }
    expect(await commit(action('shrink'), options('gm', { handlers: { shrink } }))).toMatchObject({ ok: true })
    expect(fight().state).not.toHaveProperty('scratch')
    expect(fight()).toMatchObject({ status: 'live', participantUserIds: ['player'] })
  })

  it('reads every Floor and in-flight object for End, deletes nothing it did not consume, and clears control', async () => {
    const live = fight()
    const thrown = lubecDetachedItem(parseLubecGmItem({ ...ball, qty: 1 }, 'thrown'), [])
    put('combats/fight-start', { ...live, state: { ...live.state, attack: { id: 'a', grantId: null, attackerKey: 'character:hero', step: 'catch', detached: [thrown], closed: false } } })
    events.length = 0
    expect(await commit(action('end'))).toMatchObject({ ok: true })
    expect(events.filter((event) => event.includes('gmItems/') && event.startsWith('get'))).toEqual([`get ${root}/gmItems/item:start:floor%3Aball:0`, `get ${root}/gmItems/thrown`])
    expect(writesBeforeLastRead()).toBe(false)
    expect(read('combatControl/current')).toEqual({ activeFightId: null })
    expect(read('gmItems/thrown')).toMatchObject({ status: 'dropped', qty: 1 })
    expect(fight().status).toBe('ended')
  })

  it('refuses End on a fight that does not exist without reading items', async () => {
    const ghost = action('end', 'ghost')
    ghost.envelope.fightId = 'missing'
    events.length = 0
    expect(await commit(ghost)).toEqual({ ok: false, reason: 'That fight is not live.' })
    expect(events.some((event) => event.includes('gmItems'))).toBe(false)
  })

  it('drains due wounds and retries End, and stops retrying when delivery cannot clear them', async () => {
    const live = fight()
    put('combats/fight-start', { ...live, state: { ...live.state, woundOutbox: [{ id: 'wound' }] } })
    expect(await commit(action('end'))).toEqual({ ok: false, reason: 'Wounds must be delivered before combat can end.' })
    const stuck = vi.fn(async () => undefined)
    expect(await commit(action('end', 'stuck'), options('gm', { drainWounds: stuck }))).toEqual({ ok: false, reason: 'Wound delivery is still pending. Combat remains live; retry End.' })
    expect(stuck).toHaveBeenCalledTimes(5)
    const drain = vi.fn(async (fightId: string) => {
      const current = read(`combats/${fightId}`) as unknown as CombatFight
      put(`combats/${fightId}`, { ...current, state: { ...current.state, woundOutbox: [], woundAcknowledgements: ['wound'] } })
    })
    expect(await commit(action('end', 'drained'), options('gm', { drainWounds: drain }))).toMatchObject({ ok: true })
    expect(drain).toHaveBeenCalledOnce()
  })

  it('returns any other refusal without draining, keeps a failed send journalled, and uses a supplied transaction runner', async () => {
    const drainWounds = vi.fn()
    expect(await commit(action('interrupt'), options('gm', { drainWounds }))).toEqual({ ok: false, reason: 'The attacker has not gone Out.' })
    expect(drainWounds).not.toHaveBeenCalled()
    const broken: CombatHandler = () => { throw 'engine bug' }
    const settings = options('gm', { handlers: { ...combatLifecycleHandlers, broken } })
    await expect(commit(action('broken'), settings)).rejects.toBe('engine bug')
    expect(settings.journal.pending()).toHaveLength(1)
    const transact = vi.fn(async () => ({ ok: false as const, reason: 'transport refused' }))
    expect(await commit(action('end', 'custom'), options('gm', { transact }))).toEqual({ ok: false, reason: 'transport refused' })
    expect(transact).toHaveBeenCalledOnce()
  })
})

describe('control listener', () => {
  const emit = (path: string) => listeners.filter((listener) => listener.active && listener.path === `${root}/${path}`)
    .forEach((listener) => listener.next(snapOf({ path: listener.path, id: path.split('/').at(-1)! })))

  it('follows control to the identified fight, reports a missing fight or null control, and stops both listeners', () => {
    const seen: (string | null)[] = []
    const errors: Error[] = []
    const stop = subscribeCombat(db, scope, (value) => { seen.push(value && `${value.id}:${value.fight.status}`) }, (error) => { errors.push(error) })
    expect(seen).toEqual([null])
    put('combatControl/current', { activeFightId: 'one' })
    put('combats/one', { status: 'live' })
    emit('combatControl/current')
    put('combats/one', { status: 'ended' })
    emit('combats/one')
    put('combatControl/current', { activeFightId: 'gone' })
    emit('combatControl/current')
    emit('combats/one')
    expect(seen).toEqual([null, 'one:live', 'one:ended', null])
    listeners.at(-1)!.error(new Error('fight denied'))
    listeners[0].error(new Error('control denied'))
    expect(errors.map((error) => error.message)).toEqual(['fight denied', 'control denied'])
    stop()
    expect(listeners.every((listener) => !listener.active)).toBe(true)
    expect(() => subscribeCombat(db, scope, () => undefined, () => undefined)()).not.toThrow()
  })
})
