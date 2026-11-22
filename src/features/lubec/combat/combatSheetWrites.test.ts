import { describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { lubecCharacterSheet } from '../../ruleSets/lubec/sheetFixtures'
import { prepareCombatSheets } from './combatSheetWrites'
import type { CombatCommand, CombatPlan } from './engine/types'

// What a combat command writes to a fighter's own sheet when it stands them up: the
// Knocked down card it read comes off by its id, and a failed Speed Check's Stress is
// added, all under the one receipt the command owns.

vi.mock('firebase/firestore', async (original) => {
  const sdk = await original<typeof import('firebase/firestore')>()
  return { ...sdk, doc: (parent: { path?: string }, ...parts: string[]) => ({ path: [parent.path, ...parts].filter(Boolean).join('/') }) }
})

const db = {} as Firestore
const command = {
  envelope: { id: 'stand', groupId: 'g', campaignId: 'c', fightId: 'fight', round: 2, phase: 'movement', stageInstanceId: 's', actorKey: 'character:hero', interactionSequence: 0 },
  seed: 'seed', payload: { type: 'move' },
} as CombatCommand
const down = { id: 'down', name: 'Knocked down', cause: 'Blunt Force', steps: [{ modifiers: [], labels: [], until: 'combat-end', restrictions: [{ kind: 'down' }] }] }
const bruise = { id: 'bruise', name: 'Bruise', cause: 'Fisticuffs', steps: [{ modifiers: [], labels: [] }] }
const raw = (effects: unknown[] = [down, bruise]) => ({ sheetRevision: 4, lubec: lubecCharacterSheet({ effects: effects as never, counters: { stress: 1, minimumStress: 0, trauma: 0 } }) })
const standing = (removeEffects: string[], stressDelta: number): CombatPlan => ({
  fight: {} as CombatPlan['fight'], items: [], logs: [],
  sheetEffects: [{ selection: { kind: 'character', sheetId: 'hero' }, removeEffects, stressDelta }],
})
const prepare = (plan: CombatPlan, sheet: Record<string, unknown> = raw()) =>
  prepareCombatSheets(db, command, plan, new Map([['character:hero', sheet]]))

describe('standing up in combat', () => {
  it('takes the Knocked down card off by its id and leaves every other card', async () => {
    const [prepared] = await prepare(standing(['down'], 0))
    expect(prepared.outcome).toMatchObject({ status: 'committed', revision: 5 })
    const sheet = prepared.mutation!.sheet as { lubec: { effects: { id: string }[]; counters: { stress: number } } }
    expect(sheet.lubec.effects.map((effect) => effect.id)).toEqual(['bruise'])
    expect(sheet.lubec.counters.stress).toBe(1)
    expect(prepared.sheetRef).toMatchObject({ path: 'groups/g/campaigns/c/characters/hero' })
  })

  it('adds a failed Speed Check\'s Stress and keeps the card when the stand failed', async () => {
    const [prepared] = await prepare(standing([], 1))
    const sheet = prepared.mutation!.sheet as { lubec: { effects: { id: string }[]; counters: { stress: number } } }
    expect(sheet.lubec.effects.map((effect) => effect.id)).toEqual(['down', 'bruise'])
    expect(sheet.lubec.counters.stress).toBe(2)
  })

  it('refuses before writing when the card has changed since the sheet was read', async () => {
    await expect(prepare(standing(['down'], 0), raw([bruise]))).rejects.toThrow('That effect changed; refresh before standing.')
    await expect(prepare(standing(['down'], 0), { sheetRevision: 4 })).rejects.toThrow('That effect changed; refresh before standing.')
  })

  it('refuses a sheet the transaction never read', async () => {
    await expect(prepareCombatSheets(db, command, standing(['down'], 0), new Map())).rejects.toThrow('That sheet was not read; nothing was spent.')
  })
})
