import { describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'
import { makeLubecDirectEntryCharacter } from '../ruleSets/lubec/directEntry'
import { emptyLubecGear } from '../ruleSets/lubec/gear/gearRecord'
import type { LubecItem } from '../ruleSets/lubec/gear/gearRecord'
import { lubecSheetWiring, type LubecViewer } from './lubecSheetWiring'

const moves = vi.hoisted(() => ({ lubecMoveBetween: vi.fn(async (..._args: unknown[]) => ({ ok: true })) }))
vi.mock('./gear/lubecMoveTransaction', () => moves)

const draft = makeLubecDirectEntryCharacter('tommy', { userId: 'player-1', username: 'tommyev' })
const finalized: LubecCharacterRecord = { ...draft, creationStatus: 'active' }

const owner: LubecViewer = { role: 'player', userId: 'player-1' }
const gm: LubecViewer = { role: 'gm', userId: 'gm-1' }
const otherPlayer: LubecViewer = { role: 'player', userId: 'player-2' }

const counters = { stress: 3, minimumStress: 2, trauma: 1 }
const skills = { free: 'Boatwork', picked: ['Swimming'] }

const db = { name: 'db-stub' } as unknown as Firestore
const records = { db, scope: { groupId: 'group-1', campaignId: 'campaign-1' }, sheet: { kind: 'character', characterId: 'tommy' } } as const

function wire(character: LubecCharacterRecord | null, viewer: LubecViewer, withRecords = false) {
  const store = { updateCharacter: vi.fn(), updateCharacterNow: vi.fn(), hasPendingWrite: vi.fn(() => false) }
  return { store, edits: lubecSheetWiring(character, viewer, store, withRecords ? records : null) }
}

const noEdits = {
  onCountersChange: null, onSkillsChange: null, corrections: null, onDraftEdit: null, onRollUp: null, onFinalize: null, onGearChange: null, onGearDrop: null,
  onGearRolled: null,
}

const flashlight = { id: 'f1', kind: 'holder', name: 'Flashlight', carrier: 'backpack', pocket: 0 } as LubecItem

describe('lubecSheetWiring', () => {
  it('offers nothing while no sheet is open', () => {
    expect(wire(null, gm).edits).toEqual(noEdits)
  })

  it('offers nothing to a player looking at someone else\'s character', () => {
    expect(wire(draft, otherPlayer).edits).toEqual(noEdits)
    expect(wire(finalized, otherPlayer).edits).toEqual(noEdits)
  })

  it('lets the owner type into a draft, roll it up at once and finalize it', () => {
    const { store, edits } = wire(draft, owner)

    edits.onDraftEdit?.({ age: 12 })
    edits.onRollUp?.({ age: 13 })
    edits.onSkillsChange?.(skills)
    edits.onCountersChange?.(counters)
    edits.onFinalize?.()

    expect(store.updateCharacter.mock.calls).toEqual([
      ['tommy', { lubec: { ...draft.lubec, age: 12 } }],
      ['tommy', { lubec: { ...draft.lubec, skills } }],
      ['tommy', { lubec: { ...draft.lubec, counters } }],
      ['tommy', { creationStatus: 'active' }],
    ])
    expect(store.updateCharacterNow).toHaveBeenCalledExactlyOnceWith('tommy', { lubec: { ...draft.lubec, age: 13 } })
    expect(edits.corrections).toBeNull()
  })

  it('leaves the owner of a finalized character only the counters and the gear', () => {
    const { store, edits } = wire(finalized, owner)

    expect({ ...edits, onCountersChange: null, onGearChange: null, onGearRolled: null }).toEqual(noEdits)
    expect(wire(finalized, owner, true).edits.onGearDrop).not.toBeNull()
    edits.onCountersChange?.(counters)
    expect(store.updateCharacter).toHaveBeenCalledExactlyOnceWith('tommy', { lubec: { ...finalized.lubec, counters } })
  })

  it('lets the owner and the GM change the gear at every stage, saved under lubec.gear', () => {
    const gear = { ...emptyLubecGear(), overrides: ['full'] }
    for (const [character, viewer] of [[draft, owner], [finalized, owner], [draft, gm], [finalized, gm]] as const) {
      const { store, edits } = wire(character, viewer)
      edits.onGearChange?.(gear)
      expect(store.updateCharacter).toHaveBeenCalledExactlyOnceWith('tommy', { lubec: { ...character.lubec, gear } })
    }
  })

  it('lets the owner and the GM drop a thing to the GM Items tab, as the one who dropped it, from the sheet\'s own record', async () => {
    for (const viewer of [owner, gm]) {
      moves.lubecMoveBetween.mockClear()
      await wire(finalized, viewer, true).edits.onGearDrop?.(flashlight)
      expect(moves.lubecMoveBetween).toHaveBeenCalledExactlyOnceWith(db, expect.objectContaining({
        scope: records.scope,
        from: records.sheet,
        to: { kind: 'gm-items' },
        move: { itemId: 'f1', seen: { carrier: 'backpack', pocket: 0, slot: undefined }, droppedBy: { characterId: 'tommy', characterName: 'Unnamed kid', userId: viewer.userId } },
      }))
    }
  })

  it('records a heavy thing\'s Strength roll for the owner of a character in play, as any roll is recorded', () => {
    const { store, edits } = wire(finalized, owner)
    const rolled = { ...finalized.lubec, counters: { ...finalized.lubec.counters, stress: 1 } }
    edits.onGearRolled?.(rolled)
    expect(store.updateCharacter).toHaveBeenCalledExactlyOnceWith('tommy', { lubec: rolled })
  })

  it('asks nobody for a Strength roll but the owner of a character in play: not the GM, another player, or a draft\'s owner', () => {
    expect(wire(finalized, gm).edits.onGearRolled).toBeNull()
    expect(wire(finalized, otherPlayer).edits.onGearRolled).toBeNull()
    expect(wire(draft, owner).edits.onGearRolled).toBeNull()
    expect(wire({ ...finalized, ownerUserId: 'gm-1' }, gm).edits.onGearRolled).not.toBeNull()
  })

  it('offers no drop to another player, or where the records are not known', () => {
    expect(wire(finalized, otherPlayer, true).edits.onGearDrop).toBeNull()
    expect(wire(finalized, owner).edits.onGearDrop).toBeNull()
  })

  it('sends the sheet\'s waiting save before a drop, and nothing when none waits', async () => {
    const { store, edits } = wire(finalized, owner, true)
    await edits.onGearDrop?.(flashlight)
    const { store: moveStore } = moves.lubecMoveBetween.mock.lastCall?.[1] as { store: { sendSaveNow: (id: string) => void } }
    moveStore.sendSaveNow('tommy')
    expect(store.updateCharacterNow).not.toHaveBeenCalled()
    store.hasPendingWrite.mockReturnValue(true)
    moveStore.sendSaveNow('tommy')
    expect(store.updateCharacterNow).toHaveBeenCalledExactlyOnceWith('tommy', {})
  })

  it('gives the GM corrections to a finalized character\'s locked values', () => {
    const { store, edits } = wire(finalized, gm)

    edits.corrections?.onDraftEdit({ age: 14 })
    edits.corrections?.onSkillsChange(skills)

    expect(edits.onDraftEdit).toBeNull()
    expect(edits.onSkillsChange).toBeNull()
    expect(store.updateCharacter.mock.calls).toEqual([
      ['tommy', { lubec: { ...finalized.lubec, age: 14 } }],
      ['tommy', { lubec: { ...finalized.lubec, skills } }],
    ])
  })

  it('lets the GM edit a player\'s draft as its owner does', () => {
    const { edits } = wire(draft, gm)

    expect(edits.onDraftEdit).not.toBeNull()
    expect(edits.onFinalize).not.toBeNull()
    expect(edits.corrections).toBeNull()
  })
})
