/** What moving a thing costs, in the sentences the sheet shows (Rules M1 to M6). */
import { describe, expect, it } from 'vitest'
import { lubecCostText, lubecCostWord, lubecMoveCost } from './moveCost'

describe('the cost of a move in words', () => {
  it('says each kind of move the way the prototype does', () => {
    expect(lubecCostText('hands', 'backpack#0')).toBe('From a hand to the backpack: 2 actions.')
    expect(lubecCostText('body', 'hands')).toBe('From the body to a hand: free.')
    expect(lubecCostText('hands', 'body')).toBe('From a hand to the body: 1 action.')
    expect(lubecCostText('backpack', 'backpack#2')).toBe("Moving it inside the backpack: free. It's only arranging.")
    expect(lubecCostText('hands', 'hands')).toBe('Moving it to the other hand: free. (A guess.)')
    expect(lubecCostText('hands', 'worn')).toBe('Putting it on from a hand: 1 action.')
    expect(lubecCostText('worn', 'body')).toBe('Taking it off onto the body: 2 actions.')
    expect(lubecCostText('backpack', 'drop')).toBe('Dropping it from the backpack: 2 actions.')
    expect(lubecCostText('worn', 'drop')).toBe('Dropping it once it is off: 1 action.')
  })

  it('counts nothing to or from a carrier, or a move the table has no number for (Rule M6)', () => {
    expect(lubecCostText('duffel', 'hands')).toBe('')
    expect(lubecCostText('hands', 'duffel#0')).toBe('')
    expect(lubecCostText('body', 'body')).toBe('')
    expect(lubecMoveCost('drop', 'hands')).toBeNull()
  })

  it('names a cost in actions', () => {
    expect([0, 1, 2].map((n) => lubecCostWord({ n }))).toEqual(['free', '1 action', '2 actions'])
    expect(lubecMoveCost('backpack', 'hands#1')).toEqual({ n: 2, a: 'backpack', b: 'hands', guess: false })
  })
})
