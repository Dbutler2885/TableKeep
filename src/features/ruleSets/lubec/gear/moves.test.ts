/**
 * What moving a thing costs (Rules M1 to M6), cell by cell against the
 * sentence the table carries out. B's `ground` column is the drop, whose
 * destination is the GM's Items tab.
 */
import { describe, expect, it } from 'vitest'
import { MOVE_COST, MOVE_GUESS } from './gearRules'

// "Body to hand free, hand to body 1, anything into or out of the backpack 2, hand to worn 1, body to worn 2.
// Taking armor off costs what putting it on does. Dropping from a hand or the body is free, from the backpack 2.
// Moving things around inside the backpack is free: it's only arranging.
// Moving a thing to the other hand is a guess."
const SENTENCE: [from: string, to: string, cost: number, clause: string][] = [
  ['body', 'hands', 0, 'Body to hand free'],
  ['hands', 'body', 1, 'hand to body 1'],
  ['hands', 'backpack', 2, 'anything into the backpack 2'],
  ['body', 'backpack', 2, 'anything into the backpack 2'],
  ['worn', 'backpack', 2, 'anything into the backpack 2'],
  ['backpack', 'hands', 2, 'anything out of the backpack 2'],
  ['backpack', 'body', 2, 'anything out of the backpack 2'],
  ['backpack', 'worn', 2, 'anything out of the backpack 2'],
  ['hands', 'worn', 1, 'hand to worn 1'],
  ['body', 'worn', 2, 'body to worn 2'],
  ['worn', 'hands', 1, 'taking armor off costs what putting it on does: worn to hand 1'],
  ['worn', 'body', 2, 'taking armor off costs what putting it on does: worn to body 2'],
  ['hands', 'drop', 0, 'Dropping from a hand is free'],
  ['body', 'drop', 0, 'Dropping from the body is free'],
  ['backpack', 'drop', 2, 'Dropping from the backpack 2'],
  ['worn', 'drop', 1, 'Dropping worn armor costs what taking it off into a hand does: 1'],
  ['backpack', 'backpack', 0, 'Moving things around inside the backpack is free'],
  ['hands', 'hands', 0, 'Moving a thing to the other hand is a guess'],
]

describe('the move costs (Rules M1 to M6)', () => {
  it.each(SENTENCE)('%s to %s costs %i: %s', (from, to, cost) => {
    expect(MOVE_COST[from as keyof typeof MOVE_COST][to as 'drop']).toBe(cost)
  })

  it('has no cell the sentence does not give', () => {
    const cells = Object.entries(MOVE_COST).flatMap(([from, row]) => Object.keys(row).map((to) => `${from}>${to}`))
    expect(cells.sort()).toEqual(SENTENCE.map(([from, to]) => `${from}>${to}`).sort())
  })

  it('names the drop as a column of its own, and no ground', () => {
    for (const row of Object.values(MOVE_COST)) {
      expect(row).toHaveProperty('drop')
      expect(row).not.toHaveProperty('ground')
    }
  })

  it('has no row for the drop: nothing is moved out of the GM Items tab here', () => {
    expect(Object.keys(MOVE_COST)).toEqual(['hands', 'body', 'backpack', 'worn'])
  })

  it('marks the one guess: a thing to the other hand (Rule M5)', () => {
    expect([...MOVE_GUESS]).toEqual(['hands>hands'])
  })
})
