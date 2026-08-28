import { describe, expect, it } from 'vitest'
import { makeArmourItem } from '../characterFactories'
import { deriveCombatStats, deriveMovement, deriveThiefExpertise } from './characterDerivedStats'

describe('character derived stats', () => {
  it('preserves movement bands after STR-gated slots', () => {
    expect(deriveMovement(6)).toMatchObject({ currentBaseMove: 120, derivedOverlandMove: 24 })
    expect(deriveMovement(14)).toMatchObject({ currentBaseMove: 90, derivedEncounterMove: 30 })
    expect(deriveMovement(30).currentBaseMove).toBe(30)
  })

  it('preserves thief expertise accounting', () => {
    expect(deriveThiefExpertise(1, { CS: '2', TR: '2', HN: '1', HS: '1', MS: '1', OL: '1', PP: '1', RL: '1' })).toEqual({ total: 4, spent: 2, remaining: 2 })
  })

  it('combines DEX, armour, shield, magic, and halfling modifiers', () => {
    const result = deriveCombatStats({
      str: 16, dex: 16, cha: 9, con: 13, wis: 13, isHalfling: true,
      equippedBodyArmour: makeArmourItem({ armourClass: '5', magicMod: '-1' }),
      equippedShield: makeArmourItem({ armourType: 'shield', shieldMod: '-1' }),
      saveScores: { D: '10', W: '11', P: '12', B: '13', S: '14' },
    })
    expect(result).toMatchObject({ computedAc: 1, derivedInitModifier: '+2', derivedMissileModifier: '+3' })
    expect(result.displayedSaveScores).toMatchObject({ W: '10', S: '13' })
  })
})
