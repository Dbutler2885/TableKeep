import { describe, expect, it } from 'vitest'
import { applyVtmXpSpend, canAffordVtmXp, xpCostForNewTrait, xpCostToRaise, xpRuleLabel } from './vtmXp'

describe('vtmXp', () => {
  it('calculates raise costs by category', () => {
    expect(xpCostToRaise('willpower', 4)).toBe(4)
    expect(xpCostToRaise('humanity', 4)).toBe(8)
    expect(xpCostToRaise('virtue', 3)).toBe(6)
    expect(xpCostToRaise('ability', 3)).toBe(6)
    expect(xpCostToRaise('attribute', 3)).toBe(12)
    expect(xpCostToRaise('thaumaturgyPath', 3)).toBe(12)
  })

  it('calculates discipline costs by clan context', () => {
    expect(xpCostToRaise('discipline', 3, { clan: 'brujah', discipline: 'Celerity' })).toBe(15)
    expect(xpCostToRaise('discipline', 3, { clan: 'brujah', discipline: 'Animalism' })).toBe(21)
    expect(xpCostToRaise('discipline', 3, { clan: 'caitiff', discipline: 'Animalism' })).toBe(18)
  })

  it('calculates new trait flat costs', () => {
    expect(xpCostForNewTrait('ability')).toBe(3)
    expect(xpCostForNewTrait('thaumaturgyPath')).toBe(7)
    expect(xpCostForNewTrait('discipline')).toBe(10)
  })

  it('describes Caitiff discipline costs separately from clan and out-of-clan costs', () => {
    expect(xpRuleLabel('discipline', { clan: 'brujah' })).toBe('XP: rating × 5 clan / × 7 other · new 10')
    expect(xpRuleLabel('discipline', { clan: 'caitiff' })).toBe('XP: rating × 6 Caitiff · new 10')
  })

  it('checks affordability and applies spend ledger entries', () => {
    expect(canAffordVtmXp(5, 6)).toBe(false)
    const result = applyVtmXpSpend({ balance: 10, cost: 6, note: 'Raise Dexterity', nowMs: 100 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.balance).toBe(4)
    expect(result.entry).toMatchObject({ type: 'spend', amount: 6, note: 'Raise Dexterity' })
  })
})
