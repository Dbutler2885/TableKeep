import { describe, expect, it } from 'vitest'
import type { CharacterInventoryItem } from '../../../types/app'
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
      saveScoresByCharacterId: { a: { death: '12' } },
      adventureScoresByCharacterId: { a: { listen: '2' } },
      adventureSeedClassByCharacterId: { a: 'Thief' },
      thiefSkillsByCharacterId: { a: { climb: '87' } },
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
      saveScores: { death: '12' },
      adventureScores: { listen: '2' },
      adventureSeedClass: 'Thief',
      thiefSkills: { climb: '87' },
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
