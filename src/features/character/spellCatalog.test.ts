import { describe, expect, it } from 'vitest'
import {
  getArcaneCasterCaps,
  getCappedAccessibleArcaneSpellLevels,
  getCappedArcaneSpellsPerDay,
} from './spellCatalog'

describe('arcane caster caps', () => {
  it('caps elves at level 10 and 5th-level spells', () => {
    expect(getArcaneCasterCaps('Elf')).toEqual({ maxCasterLevel: 10, maxSpellLevel: 5 })
  })

  it('lets magic-users reach level 14 and 6th-level spells', () => {
    expect(getArcaneCasterCaps('Magic-User')).toEqual({ maxCasterLevel: 14, maxSpellLevel: 6 })
  })

  it('gives a level 10 elf the OSE elf spell progression (no 6th-level spells)', () => {
    expect(getCappedAccessibleArcaneSpellLevels('Elf', 10)).toEqual([1, 2, 3, 4, 5])
    // OSE elf level 10: 3/3/3/3/2, and never a 6th-level slot.
    expect(getCappedArcaneSpellsPerDay('Elf', 10)).toEqual([3, 3, 3, 3, 2, 0])
  })

  it('never grants an over-leveled elf 6th-level spells or level 11+ slots', () => {
    // Robustness guard: even if an elf's level is forced past the class maximum, the
    // caps clamp them to the level-10 elf progression.
    expect(getCappedAccessibleArcaneSpellLevels('Elf', 14)).toEqual([1, 2, 3, 4, 5])
    expect(getCappedArcaneSpellsPerDay('Elf', 14)).toEqual([3, 3, 3, 3, 2, 0])
  })

  it('matches magic-user slots for legal elf levels 1-10', () => {
    for (let level = 1; level <= 10; level += 1) {
      // Elf and magic-user share the same slots through level 10; they only diverge above it.
      expect(getCappedArcaneSpellsPerDay('Elf', level)).toEqual(getCappedArcaneSpellsPerDay('Magic-User', level))
    }
  })

  it('keeps magic-users uncapped: 6th-level spells at high level', () => {
    expect(getCappedAccessibleArcaneSpellLevels('Magic-User', 12)).toContain(6)
    // OSE magic-user level 12: 4/4/3/3/3/2.
    expect(getCappedArcaneSpellsPerDay('Magic-User', 12)).toEqual([4, 4, 3, 3, 3, 2])
  })
})
