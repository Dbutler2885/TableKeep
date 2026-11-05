/** The Floor panel's In hands line, read from a sheet's hands. */
import { describe, expect, it } from 'vitest'
import { parseLubecGear } from '../../../ruleSets/lubec/gear/gearRecord'
import { lubecCharacterSheet } from '../../../ruleSets/lubec/sheetFixtures'
import type { Combatant } from '../engine/types'
import { handsLine } from './movementModel'

const wayne = { name: 'Wayne Gardner' } as Combatant
const holding = (items: object[]) => lubecCharacterSheet({ gear: parseLubecGear({ items }) })

describe('handsLine', () => {
  it('says when both hands are empty, and names a thing held in both', () => {
    expect(handsLine(wayne, holding([]))).toBe('Wayne Gardner: both hands empty.')
    const bat = { id: 'bat', kind: 'weapon', mode: 'melee', name: 'Baseball bat', carrier: 'hands', slot: 0, size: 2, qty: 1, weight: 'heavy', note: '', hands: 2 }
    expect(handsLine(wayne, holding([bat]))).toBe('Wayne Gardner: a Baseball bat in both hands.')
  })
})
