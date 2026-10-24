import { describe, expect, it, vi } from 'vitest'
import type { CharacterRecord } from '../../../types/app'
import { characterFixture, generalItemFixture } from '../characterTestFixtures'
import {
  HOLY_SYMBOL_REQUIRED,
  addNewCharacter,
  canFinalizeCharacter,
  carriesHolySymbol,
  draftFinalizeError,
  finalizeSelectionKey,
  needsHolySymbol,
  newCharacterRecord,
} from './characterRoster'
import { defaultTokenIcon } from './characterSheetLayout'

describe('new character records', () => {
  it('starts a new character as a draft and an established one as an established draft', () => {
    const fresh = newCharacterRecord('new', 'player', 'player1')
    expect(fresh).toEqual({
      id: expect.any(String), name: 'New Character', ownerUserId: 'player', ownerUsername: 'player1',
      creationMode: 'new', creationModeExplicit: true, creationStatus: 'draft', className: '-', level: 1,
      hpCurrent: 0, hpMax: 0, ac: 10, xp: 0, portraitPath: '', portraitUrl: null, portraitFocusX: 50, portraitFocusY: 50,
      tokenIcon: defaultTokenIcon,
    })
    expect(newCharacterRecord('established', 'player', 'player1')).toMatchObject({ creationMode: 'established', creationStatus: 'established_draft' })
    expect(newCharacterRecord('new', 'player', 'player1').id).not.toBe(fresh.id)
  })

  function creation(overrides: { canCreateCharacter?: boolean, isSinglePane?: boolean } = {}) {
    return {
      canCreateCharacter: true, currentUserId: 'player', currentUsername: 'player1', isSinglePane: false,
      setSelectedCharacterId: vi.fn(), showDetailPane: vi.fn(), createCharacter: vi.fn(async (_character: CharacterRecord) => undefined),
      ...overrides,
    }
  }

  it('selects and creates the new character, showing its sheet only on a single pane', () => {
    const wide = creation()
    addNewCharacter(wide, 'new')
    const created = wide.createCharacter.mock.calls[0][0]
    expect(wide.setSelectedCharacterId).toHaveBeenCalledExactlyOnceWith(created.id)
    expect(created).toMatchObject({ ownerUserId: 'player', ownerUsername: 'player1', creationStatus: 'draft' })
    expect(wide.showDetailPane).not.toHaveBeenCalled()
    const narrow = creation({ isSinglePane: true })
    addNewCharacter(narrow, 'established')
    expect(narrow.showDetailPane).toHaveBeenCalledOnce()
  })

  it('creates nothing without permission', () => {
    const denied = creation({ canCreateCharacter: false, isSinglePane: true })
    addNewCharacter(denied, 'new')
    expect(denied.setSelectedCharacterId).not.toHaveBeenCalled()
    expect(denied.showDetailPane).not.toHaveBeenCalled()
    expect(denied.createCharacter).not.toHaveBeenCalled()
  })
})

describe('finalize gate and key', () => {
  it('needs a selected, editable character in the finalization flow', () => {
    const gate = { effectiveSelected: characterFixture(), canEditSelected: true, isInFinalizationFlow: true }
    expect(canFinalizeCharacter(gate)).toBe(true)
    expect(canFinalizeCharacter({ ...gate, effectiveSelected: null })).toBe(false)
    expect(canFinalizeCharacter({ ...gate, canEditSelected: false })).toBe(false)
    expect(canFinalizeCharacter({ ...gate, isInFinalizationFlow: false })).toBe(false)
  })

  it('keys finalize state by character and creation status', () => {
    expect(finalizeSelectionKey(characterFixture())).toBe('hero:draft')
    expect(finalizeSelectionKey(characterFixture({ creationStatus: 'established_draft' }))).toBe('hero:established_draft')
    expect(finalizeSelectionKey(null)).toBe('')
  })
})

describe('draft validation', () => {
  const ready = { effectiveSelected: characterFixture(), hasRolledAbilityScores: true, hasRolledHp: true, selectedInventory: [] }

  it('reports the first missing step, in order', () => {
    expect(draftFinalizeError({ ...ready, effectiveSelected: null })).toBe('No character selected.')
    expect(draftFinalizeError({ ...ready, effectiveSelected: characterFixture({ className: '-', hpMax: 0 }), hasRolledAbilityScores: false })).toBe('Choose a class before finalizing.')
    expect(draftFinalizeError({ ...ready, hasRolledAbilityScores: false, hasRolledHp: false })).toBe('Roll ability scores before finalizing.')
    expect(draftFinalizeError({ ...ready, hasRolledHp: false, effectiveSelected: characterFixture({ hpMax: 0 }) })).toBe('Roll hit points before finalizing.')
    expect(draftFinalizeError({ ...ready, effectiveSelected: characterFixture({ hpMax: 0, className: 'Cleric' }) })).toBe('Set maximum hit points before finalizing.')
    expect(draftFinalizeError({ ...ready, effectiveSelected: characterFixture({ className: 'Cleric' }) })).toBe(HOLY_SYMBOL_REQUIRED)
    expect(draftFinalizeError(ready)).toBeNull()
  })

  it('accepts a cleric carrying any item named as a holy symbol', () => {
    const cleric = characterFixture({ className: 'Cleric' })
    const symbol = generalItemFixture({ name: 'Silver HOLY SYMBOL' })
    expect(carriesHolySymbol([generalItemFixture(), symbol])).toBe(true)
    expect(carriesHolySymbol([generalItemFixture({ name: undefined })])).toBe(false)
    expect(needsHolySymbol(cleric, [symbol])).toBe(false)
    expect(needsHolySymbol(cleric, [])).toBe(true)
    expect(needsHolySymbol(characterFixture(), [])).toBe(false)
    expect(draftFinalizeError({ ...ready, effectiveSelected: cleric, selectedInventory: [symbol] })).toBeNull()
  })
})
