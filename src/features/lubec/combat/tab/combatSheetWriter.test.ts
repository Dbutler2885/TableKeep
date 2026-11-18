import { describe, expect, it, vi } from 'vitest'
import type { LubecCharacterRecord } from '../../../ruleSets/lubec/characterRecord'

// The combat tab saves a fighter's sheet through the shared store, and resolves
// a waking or reached-step Save against the record the sheet itself names.

const recovery = vi.hoisted(() => ({ calls: [] as unknown[][] }))
vi.mock('../../../../firebase', () => ({ db: { name: 'db' } }))
vi.mock('../../effectRecovery', () => ({ lubecEffectRecovery: (...args: unknown[]) => { recovery.calls.push(args); return 'recover' } }))

const { combatSheetWriter } = await import('./combatSheetWriter')
const scope = { groupId: 'g', campaignId: 'c' }
const record = { id: 'roy' } as LubecCharacterRecord

describe("a fighter's sheet writer", () => {
  it('saves through the store and resolves an NPC sheet\'s Saves against the NPC', () => {
    const store = { updateCharacter: vi.fn(), updateCharacterNow: vi.fn(), hasPendingWrite: vi.fn(() => false) }
    const writer = combatSheetWriter(store, 'npcSheets', scope)
    expect(writer.updateCharacter).toBe(store.updateCharacter)
    expect(writer.recovery(record)).toBe('recover')
    const [records, writes, sheetId] = recovery.calls.at(-1)! as [unknown, { updateCharacterNow: (id: string, updates: object) => void; hasPendingWrite: unknown }, string]
    expect(records).toEqual({ db: { name: 'db' }, scope, sheet: { kind: 'npc', npcId: 'roy' } })
    expect(sheetId).toBe('roy')
    writes.updateCharacterNow('roy', { lubec: {} })
    expect(store.updateCharacterNow).toHaveBeenCalledWith('roy', { lubec: {} }, record)
    expect(writes.hasPendingWrite).toBe(store.hasPendingWrite)
  })

  it("resolves a character's Saves against the character", () => {
    const store = { updateCharacter: vi.fn(), updateCharacterNow: vi.fn(), hasPendingWrite: vi.fn(() => false) }
    combatSheetWriter(store, 'characters', scope).recovery({ id: 'wayne' } as LubecCharacterRecord)
    expect(recovery.calls.at(-1)![0]).toMatchObject({ sheet: { kind: 'character', characterId: 'wayne' } })
  })
})
