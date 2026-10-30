import { describe, expect, it } from 'vitest'
import type { LubecCharacterSheet } from '../../ruleSets/lubec/characterRecord'
import { emptyLubecGear, type LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecNpcFightSummary, readLubecNpcFightSummary } from './lubecNpcFightSummary'

const worn = (id: string, locs: string[], armor: LubecItem['armor']) =>
  ({ id, kind: 'armor', carrier: 'worn', name: `Secret ${id}`, size: 1, qty: 1, weight: 'normal', note: '', locs, armor }) as LubecItem

const sheetWearing = (...items: LubecItem[]) => ({ gear: { ...emptyLubecGear(), items } }) as LubecCharacterSheet

describe('the public summary of an NPC', () => {
  it('adds armor up per part, joins parts that stop the same, and leaves bare parts out', () => {
    const summary = lubecNpcFightSummary(sheetWearing(
      worn('jacket', ['torso', 'waist'], { cut: 2, pierce: 1, blunt: 1, gun: 0 }),
      worn('vest', ['torso'], { cut: 1, pierce: 0, blunt: 0, gun: 3 }),
    ))
    expect(summary.armor).toEqual([
      { locs: ['torso'], armor: { cut: 3, pierce: 1, blunt: 1, gun: 3 } },
      { locs: ['waist'], armor: { cut: 2, pierce: 1, blunt: 1, gun: 0 } },
    ])
  })

  it('carries nothing else from the sheet', () => {
    const summary = lubecNpcFightSummary(sheetWearing(worn('jacket', ['torso'], { cut: 2, pierce: 0, blunt: 0, gun: 0 })))
    expect(JSON.stringify(summary)).not.toContain('Secret')
    expect(Object.keys(summary)).toEqual(['armor', 'woundLevel'])
  })

  it('has no armor without a sheet, and says nothing of a wound until wound level is decided', () => {
    expect(lubecNpcFightSummary(null)).toEqual({ armor: [], woundLevel: null })
  })
})

describe('reading a stored summary', () => {
  it('reads what the GM wrote', () => {
    const summary = lubecNpcFightSummary(sheetWearing(worn('j', ['torso'], { cut: 2, pierce: 0, blunt: 0, gun: 0 })))
    expect(readLubecNpcFightSummary(JSON.parse(JSON.stringify(summary)))).toEqual(summary)
  })

  it('reads anything else as none', () => {
    expect(readLubecNpcFightSummary(undefined)).toBeNull()
    expect(readLubecNpcFightSummary({ armor: 'plenty' })).toBeNull()
    expect(readLubecNpcFightSummary({ armor: [{ locs: ['torso'], armor: { cut: 'a lot' } }] })).toBeNull()
  })
})
