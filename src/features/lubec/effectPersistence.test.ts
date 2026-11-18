import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import type { LubecEffect } from '../ruleSets/lubec/effects'
import { lubecCharacterSheet } from '../ruleSets/lubec/sheetFixtures'
import { lubecEffectRecovery } from './effectRecovery'
import { acknowledgeLubecDeathReminder } from './deathReminderAck'
import type { LubecGearRecords } from './gear/lubecGearDrop'

const memory = vi.hoisted(() => ({
  documents: new Map<string, Record<string, unknown>>(), writes: [] as string[],
  automaticSnapshot: true,
  observe: null as null | ((raw: Record<string, unknown> | undefined, pending?: boolean) => void),
  observerError: null as null | ((error: Error) => void),
  stopped: vi.fn(), quiet: vi.fn(async () => undefined),
}))

vi.mock('./gear/lubecMoveTransaction', () => ({ quietSheets: memory.quiet, lubecMoveBetween: vi.fn() }))
vi.mock('firebase/firestore', async (original) => {
  const sdk = await original<typeof import('firebase/firestore')>()
  const snapshot = (raw: Record<string, unknown> | undefined, pending = false) => ({ exists: () => raw !== undefined, data: () => raw, metadata: { hasPendingWrites: pending } })
  return {
    ...sdk,
    doc: (parent: { path?: string }, ...parts: string[]) => {
      const ref = { path: [parent.path, ...parts].filter(Boolean).join('/'), withConverter: () => ref }
      return ref
    },
    serverTimestamp: () => new Date(123),
    runTransaction: async (_db: unknown, write: (tx: unknown) => Promise<unknown>) => {
      const staged = new Map<string, Record<string, unknown>>()
      const result = await write({
        get: async (ref: { path: string }) => snapshot(memory.documents.get(ref.path)),
        set: (ref: { path: string }, value: Record<string, unknown>) => staged.set(ref.path, value),
      })
      for (const [path, value] of staged) { memory.documents.set(path, value); memory.writes.push(path) }
      return result
    },
    onSnapshot: (ref: { path: string }, next: (snap: unknown) => void, error: (cause: Error) => void) => {
      memory.observe = (raw, pending) => next(snapshot(raw, pending))
      memory.observerError = error
      if (memory.automaticSnapshot) queueMicrotask(() => memory.observe!(memory.documents.get(ref.path)))
      return memory.stopped
    },
  }
})

const scope = { groupId: 'g', campaignId: 'c' }
const prefix = 'groups/g/campaigns/c'
const db = {} as Firestore
const store = { hasPendingWrite: () => false, updateCharacterNow: vi.fn() }
const unconscious: LubecEffect = { id: 'card', name: 'Knocked out', cause: 'Head 9', wakeSave: 'severe-concussion', steps: [{ modifiers: [], labels: [], restrictions: [{ kind: 'unconscious' }] }] }
const recoveringSpeech: LubecEffect = { id: 'card', name: 'Neck wound', cause: 'Cutting Neck 5', steps: [
  { modifiers: [], labels: ['Speech impaired'], until: 'long-rest' },
  { modifiers: [], labels: [], until: 'lasting', onReach: { save: 'Body', failure: 'Speech damaged' } },
] }
const raw = (effect = unconscious) => ({ schemaVersion: 1, sheetRevision: 2, untouched: 'keep', lubec: lubecCharacterSheet({ effects: [effect], counters: { stress: 2, minimumStress: 2, trauma: 2 } }) })
const records = (kind: 'character' | 'npc'): LubecGearRecords =>
  ({ db, scope, sheet: kind === 'npc' ? { kind, npcId: 'hero' } : { kind, characterId: 'hero' } }) as LubecGearRecords
const pathFor = (kind: 'character' | 'npc') => `${prefix}/${kind === 'npc' ? 'npcSheets' : 'characters'}/hero`

beforeEach(() => {
  memory.documents.clear()
  memory.writes = []
  memory.automaticSnapshot = true
  memory.observe = null
  memory.observerError = null
  memory.stopped.mockClear()
  memory.quiet.mockClear()
})

describe('persisted effect recovery', () => {
  it.each(['character', 'npc'] as const)('replaces only the %s card once and replays its stable receipt', async (kind) => {
    const path = pathFor(kind)
    memory.documents.set(path, raw())
    const recover = lubecEffectRecovery(records(kind), store, 'hero')
    const first = await recover('card')
    expect(first).toMatchObject({ status: 'committed', revision: 3 })
    const saved = memory.documents.get(path) as ReturnType<typeof raw>
    expect(saved.untouched).toBe('keep')
    expect(saved.lubec.counters.trauma).toBe(2)
    expect(saved.lubec.effects).toMatchObject([{ id: 'card_aftermath', cardKey: 'concussion' }])
    const dice = saved.lubec.effects[0].recoveryRoll
    expect(memory.writes).toHaveLength(2)
    expect(await recover('card')).toEqual(first)
    expect(memory.writes).toHaveLength(2)
    expect((memory.documents.get(path) as ReturnType<typeof raw>).lubec.effects[0].recoveryRoll).toEqual(dice)
  })

  it('uses a distinct reached-step Save without charging Trauma or replacing unrelated fields', async () => {
    const path = pathFor('character')
    memory.documents.set(path, raw(recoveringSpeech))
    await lubecEffectRecovery(records('character'), store, 'hero')('card', 'reach')
    const saved = memory.documents.get(path) as ReturnType<typeof raw>
    expect(saved.lubec.counters.trauma).toBe(2)
    expect(saved.lubec.lastRoll).toMatchObject({ against: 'Body' })
    expect(saved.lubec.effects.some((effect) => effect.id === 'card')).toBe(false)
  })

  it('waits for a confirmed snapshot at the saved revision, ignoring pending and stale snapshots', async () => {
    memory.automaticSnapshot = false
    const path = pathFor('character')
    memory.documents.set(path, raw())
    let finished = false
    const recovering = lubecEffectRecovery(records('character'), store, 'hero')('card').then(() => { finished = true })
    await vi.waitFor(() => expect(memory.observe).not.toBeNull())
    memory.observe!({ sheetRevision: 3 }, true)
    memory.observe!({ sheetRevision: 2 })
    await Promise.resolve()
    expect(finished).toBe(false)
    memory.observe!({ sheetRevision: 3 })
    await recovering
    expect(finished).toBe(true)
    expect(memory.stopped).toHaveBeenCalledOnce()
  })

  it.each(['missing', 'version', 'no-card'] as const)('refuses %s before writing any sheet or receipt', async (problem) => {
    if (problem !== 'missing') memory.documents.set(pathFor('character'), { ...raw(), ...(problem === 'version' ? { schemaVersion: 0 } : { lubec: lubecCharacterSheet() }) })
    await expect(lubecEffectRecovery(records('character'), store, 'hero')('card')).rejects.toThrow()
    expect(memory.writes).toEqual([])
  })

  it.each(['missing', 'network'] as const)('reports a %s snapshot after commit so retry can recover the receipt', async (problem) => {
    memory.automaticSnapshot = false
    memory.documents.set(pathFor('character'), raw())
    const recovering = lubecEffectRecovery(records('character'), store, 'hero')('card')
    const rejected = expect(recovering).rejects.toThrow(problem === 'missing' ? 'sheet is missing' : 'offline')
    await vi.waitFor(() => expect(memory.observe).not.toBeNull())
    if (problem === 'missing') memory.observe!(undefined)
    else memory.observerError!(new Error('offline'))
    await rejected
    expect(memory.writes).toHaveLength(2)
  })
})

describe('GM acknowledgement persistence', () => {
  it.each(['character', 'npc'] as const)('marks only its own %s reminder, leaves counters unchanged, and replays without a write', async (kind) => {
    const sheet = raw()
    const reminders = [{ id: 'death', reasons: ['Immediate'], event: 'Wound landed' }, { id: 'other', reasons: ['Critical'], event: 'Countdown due' }]
    memory.documents.set(pathFor(kind), { ...sheet, lubec: { ...sheet.lubec, deathReminders: reminders } })
    const first = await acknowledgeLubecDeathReminder(db, scope, { kind, sheetId: 'hero' }, 'death')
    expect(first).toMatchObject({ status: 'committed', revision: 3 })
    const saved = memory.documents.get(pathFor(kind)) as ReturnType<typeof raw>
    expect(saved.lubec.counters).toEqual(sheet.lubec.counters)
    expect(saved.lubec.deathReminders).toEqual([{ ...reminders[0], handled: true }, reminders[1]])
    expect(await acknowledgeLubecDeathReminder(db, scope, { kind, sheetId: 'hero' }, 'death')).toEqual(first)
    expect(memory.writes).toHaveLength(2)
  })

  it('reports a missing sheet and creates no receipt', async () => {
    await expect(acknowledgeLubecDeathReminder(db, scope, { kind: 'character', sheetId: 'hero' }, 'death')).rejects.toThrow('sheet is missing')
    expect(memory.writes).toEqual([])
  })
})
