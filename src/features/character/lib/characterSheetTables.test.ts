import { describe, expect, it } from 'vitest'
import { abilityRows, adventureRows, playerAddGearTemplates, saveRows, thiefSkillRows } from './characterSheetTables'

describe('character sheet tables', () => {
  it('preserves the sheet row order and catalog-backed gear choices', () => {
    expect(abilityRows.map((row) => row.code)).toEqual(['STR', 'INT', 'WIS', 'DEX', 'CON', 'CHA'])
    expect(saveRows.map((row) => row.code)).toEqual(['D', 'W', 'P', 'B', 'S', '±'])
    expect(adventureRows.map((row) => row.code)).toEqual(['FG', 'FT', 'HT', 'LD', 'OD', 'SD'])
    expect(thiefSkillRows.map((row) => row.code)).toEqual(['CS', 'TR', 'HN', 'HS', 'MS', 'OL', 'PP', 'RL'])
    expect(playerAddGearTemplates.some((entry) => entry.itemKind === 'consumable')).toBe(true)
  })
})
