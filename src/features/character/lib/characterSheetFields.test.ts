import { describe, expect, it } from 'vitest'
import type { CharacterInventoryItem } from '../../../types/app'
import type { AdventureScores, SaveScores, ThiefSkillScores } from '../characterRules'
import { emptyAbilityScores } from '../characterRules'
import { detailsFromState, type StateMaps } from './characterSheetFields'

const emptyMaps = (): StateMaps => ({
  abilityScoresByCharacterId: {},
  rolledAbilityScoresByCharacterId: {},
  abilityScoresRolledByCharacterId: {},
  hpBaseRollByCharacterId: {},
  inventoryByCharacterId: {},
  spellBookSpellIdsByCharacterId: {},
  memorizedSpellIdsByCharacterId: {},
  thacoByCharacterId: {},
  saveScoresByCharacterId: {},
  adventureScoresByCharacterId: {},
  adventureSeedClassByCharacterId: {},
  thiefSkillsByCharacterId: {},
  startingGoldByCharacterId: {},
  storeSpentByCharacterId: {},
  storeCartByCharacterId: {},
  alignmentByCharacterId: {},
  titleByCharacterId: {},
  languagesTextByCharacterId: {},
  unencumberingItemsTextByCharacterId: {},
  otherNotesTextByCharacterId: {},
})

describe('detailsFromState', () => {
  it('fills a default for every field a character has no local state for', () => {
    expect(detailsFromState(emptyMaps(), 'a')).toEqual({
      abilityScores: emptyAbilityScores(),
      rolledAbilityScores: null,
      abilityScoresRolled: false,
      hpBaseRoll: null,
      inventory: [],
      thaco: '',
      saveScores: null,
      adventureScores: null,
      adventureSeedClass: '',
      thiefSkills: null,
      startingGold: null,
      storeSpent: 0,
      storeCart: [],
      spellBookSpellIds: [],
      memorizedSpellIds: [],
      alignment: 'Neutrality',
      title: '',
      languagesText: '',
      unencumberingItemsText: '',
      otherNotesText: '',
    })
  })

  it('reads each field from that character\'s local state only', () => {
    const scores = { STR: '13', INT: '9', WIS: '10', DEX: '15', CON: '12', CHA: '8' }
    const rope = { id: 'rope' } as CharacterInventoryItem
    const saves = { D: '12' } as unknown as SaveScores
    const adventure = { FG: '2' } as unknown as AdventureScores
    const thief = { CS: '87' } as unknown as ThiefSkillScores
    const cart = [{ key: 'rope', name: 'Rope', costGp: 1, qty: 1, kind: 'general' as const }]
    const maps: StateMaps = {
      abilityScoresByCharacterId: { a: scores, b: emptyAbilityScores() },
      rolledAbilityScoresByCharacterId: { a: scores },
      abilityScoresRolledByCharacterId: { a: true },
      hpBaseRollByCharacterId: { a: 0 },
      inventoryByCharacterId: { a: [rope] },
      spellBookSpellIdsByCharacterId: { a: ['sleep'] },
      memorizedSpellIdsByCharacterId: { a: ['light'] },
      thacoByCharacterId: { a: '19' },
      saveScoresByCharacterId: { a: saves },
      adventureScoresByCharacterId: { a: adventure },
      adventureSeedClassByCharacterId: { a: 'Thief' },
      thiefSkillsByCharacterId: { a: thief },
      startingGoldByCharacterId: { a: 0 },
      storeSpentByCharacterId: { a: 12 },
      storeCartByCharacterId: { a: cart },
      alignmentByCharacterId: { a: 'Chaos' },
      titleByCharacterId: { a: 'Footpad' },
      languagesTextByCharacterId: { a: 'Common' },
      unencumberingItemsTextByCharacterId: { a: 'Ring' },
      otherNotesTextByCharacterId: { a: 'Owes the guild' },
    }
    expect(detailsFromState(maps, 'a')).toEqual({
      abilityScores: scores,
      rolledAbilityScores: scores,
      abilityScoresRolled: true,
      hpBaseRoll: 0,
      inventory: [rope],
      thaco: '19',
      saveScores: saves,
      adventureScores: adventure,
      adventureSeedClass: 'Thief',
      thiefSkills: thief,
      startingGold: 0,
      storeSpent: 12,
      storeCart: cart,
      spellBookSpellIds: ['sleep'],
      memorizedSpellIds: ['light'],
      alignment: 'Chaos',
      title: 'Footpad',
      languagesText: 'Common',
      unencumberingItemsText: 'Ring',
      otherNotesText: 'Owes the guild',
    })
  })

  it('lists the fields in the order the sheet has always written them', () => {
    expect(Object.keys(detailsFromState(emptyMaps(), 'a'))).toEqual([
      'abilityScores', 'rolledAbilityScores', 'abilityScoresRolled', 'hpBaseRoll', 'inventory',
      'thaco', 'saveScores', 'adventureScores', 'adventureSeedClass', 'thiefSkills',
      'startingGold', 'storeSpent', 'storeCart', 'spellBookSpellIds', 'memorizedSpellIds',
      'alignment', 'title', 'languagesText', 'unencumberingItemsText', 'otherNotesText',
    ])
  })
})
