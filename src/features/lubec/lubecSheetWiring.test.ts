import { describe, expect, it, vi } from 'vitest'
import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'
import { makeLubecDirectEntryCharacter } from '../ruleSets/lubec/directEntry'
import { emptyLubecGear } from '../ruleSets/lubec/gear/gearRecord'
import { lubecSheetWiring, type LubecViewer } from './lubecSheetWiring'

const draft = makeLubecDirectEntryCharacter('tommy', { userId: 'player-1', username: 'tommyev' })
const finalized: LubecCharacterRecord = { ...draft, creationStatus: 'active' }

const owner: LubecViewer = { role: 'player', userId: 'player-1' }
const gm: LubecViewer = { role: 'gm', userId: 'gm-1' }
const otherPlayer: LubecViewer = { role: 'player', userId: 'player-2' }

const counters = { stress: 3, minimumStress: 2, trauma: 1 }
const skills = { free: 'Boatwork', picked: ['Swimming'] }

function wire(character: LubecCharacterRecord | null, viewer: LubecViewer) {
  const store = { updateCharacter: vi.fn(), updateCharacterNow: vi.fn() }
  return { store, edits: lubecSheetWiring(character, viewer, store) }
}

const noEdits = {
  onCountersChange: null, onSkillsChange: null, corrections: null, onDraftEdit: null, onRollUp: null, onFinalize: null, onGearChange: null,
}

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

    expect({ ...edits, onCountersChange: null, onGearChange: null }).toEqual(noEdits)
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
