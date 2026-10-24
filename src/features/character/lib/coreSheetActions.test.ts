import { describe, expect, it, vi } from 'vitest'
import type { Dispatch, SetStateAction } from 'react'
import type { ItemApprovalRequest } from '../../../types/app'
import { type AbilityScores, type SaveScores, emptyAbilityScores } from '../characterRules'
import { characterFixture } from '../characterTestFixtures'
import {
  abilityScoresAfterEdit,
  applyClassDerivedData,
  classLevelFor,
  freeformAbilityScores,
  hasPendingAbilityRerollFor,
  requestAbilityScoreRoll,
  rollsWithoutApproval,
  updateAbilityScore,
} from './coreSheetActions'

// A state setter backed by a plain value, so a test can read what an updater produced.
function stateCell<T>(initial: T) {
  const cell = { value: initial, set: vi.fn() as unknown as Dispatch<SetStateAction<T>> }
  vi.mocked(cell.set).mockImplementation((next) => {
    cell.value = typeof next === 'function' ? (next as (current: T) => T)(cell.value) : next
  })
  return cell
}

const scores = { ...emptyAbilityScores(), STR: '9', INT: '11' }

describe('freeform ability scores', () => {
  it('empties a blank or whitespace score', () => {
    expect(freeformAbilityScores(scores, 'STR', '')).toEqual({ ...scores, STR: '' })
    expect(freeformAbilityScores(scores, 'STR', '   ')).toEqual({ ...scores, STR: '' })
  })

  it('accepts whole scores from 1 to 18, reading a leading number', () => {
    expect(freeformAbilityScores(scores, 'STR', '1')).toEqual({ ...scores, STR: '1' })
    expect(freeformAbilityScores(scores, 'INT', '18')).toEqual({ ...scores, INT: '18' })
    expect(freeformAbilityScores(scores, 'STR', '12abc')).toEqual({ ...scores, STR: '12' })
  })

  it.each(['0', '19', '-4', 'abc'])('rejects %s', (value) => {
    expect(freeformAbilityScores(scores, 'STR', value)).toBeNull()
  })
})

describe('ability score edits', () => {
  function editState(overrides: Partial<Parameters<typeof updateAbilityScore>[0]> = {}) {
    const abilityScores = stateCell<Record<string, AbilityScores>>({ other: scores })
    const state = {
      effectiveSelected: characterFixture(),
      canEditAbilityScores: true,
      isGuidedCreation: false,
      selectedClassName: 'Fighter',
      selectedAbilityScores: scores,
      tryBuildGuidedScores: vi.fn((): AbilityScores | null => ({ ...scores, STR: '10', INT: '10' })),
      setAbilityScoresByCharacterId: abilityScores.set,
      openReallocationClassRequired: vi.fn(),
      ...overrides,
    }
    return { state, abilityScores }
  }

  it('applies an established edit over the selected scores and keeps other characters', () => {
    const { state, abilityScores } = editState()
    updateAbilityScore(state, 'STR', '14')
    expect(abilityScores.value).toEqual({ other: scores, hero: { ...scores, STR: '14' } })
    expect(state.tryBuildGuidedScores).not.toHaveBeenCalled()
  })

  it('ignores a rejected established edit', () => {
    const { state, abilityScores } = editState()
    updateAbilityScore(state, 'STR', '25')
    expect(abilityScores.set).not.toHaveBeenCalled()
  })

  it('reallocates a guided edit through the guided builder with the parsed value', () => {
    const { state, abilityScores } = editState({ isGuidedCreation: true })
    updateAbilityScore(state, 'STR', '10')
    expect(state.tryBuildGuidedScores).toHaveBeenCalledExactlyOnceWith('STR', 10)
    expect(abilityScores.value.hero).toEqual({ ...scores, STR: '10', INT: '10' })
  })

  it('ignores a guided edit the builder rejects', () => {
    const { state, abilityScores } = editState({ isGuidedCreation: true, tryBuildGuidedScores: vi.fn(() => null) })
    updateAbilityScore(state, 'STR', 'x')
    expect(state.tryBuildGuidedScores).toHaveBeenCalledExactlyOnceWith('STR', Number.NaN)
    expect(abilityScores.set).not.toHaveBeenCalled()
  })

  it('asks for a class before a guided edit, without building scores', () => {
    const { state } = editState({ isGuidedCreation: true, selectedClassName: '-' })
    expect(abilityScoresAfterEdit(state, 'STR', '10')).toBeNull()
    expect(state.openReallocationClassRequired).toHaveBeenCalledOnce()
    expect(state.tryBuildGuidedScores).not.toHaveBeenCalled()
  })

  it('does nothing without a selection or edit permission', () => {
    for (const overrides of [{ effectiveSelected: null }, { canEditAbilityScores: false }, { effectiveSelected: null, isGuidedCreation: true, selectedClassName: '-' }]) {
      const { state, abilityScores } = editState(overrides)
      updateAbilityScore(state, 'STR', '14')
      expect(abilityScores.set).not.toHaveBeenCalled()
      expect(state.openReallocationClassRequired).not.toHaveBeenCalled()
    }
  })
})

describe('class-derived data', () => {
  it('uses the selected character level, defaulting to one, and level one for anyone else', () => {
    expect(classLevelFor(characterFixture({ level: 7 }), 'hero')).toBe(7)
    expect(classLevelFor(characterFixture({ level: undefined as unknown as number }), 'hero')).toBe(1)
    expect(classLevelFor(characterFixture({ level: 7 }), 'other')).toBe(1)
    expect(classLevelFor(null, 'hero')).toBe(1)
  })

  it('sets the class saves and THAC0 for that level and keeps other characters', () => {
    const otherSaves = { D: '1', W: '2', P: '3', B: '4', S: '5' }
    const saves = stateCell<Record<string, SaveScores>>({ other: otherSaves })
    const thaco = stateCell<Record<string, string>>({ other: '20' })
    const state = { effectiveSelected: characterFixture({ level: 7 }), setSaveScoresByCharacterId: saves.set, setThacoByCharacterId: thaco.set }
    applyClassDerivedData(state, 'next', 'Cleric')
    expect(saves.value).toEqual({ other: otherSaves, next: { D: '11', W: '12', P: '14', B: '16', S: '15' } })
    expect(thaco.value).toEqual({ other: '20', next: '19' })
    applyClassDerivedData(state, 'hero', 'Fighter')
    expect(thaco.value.hero).toBe('14')
  })

  it('leaves saves and THAC0 alone for a class without them', () => {
    const saves = stateCell<Record<string, SaveScores>>({})
    const thaco = stateCell<Record<string, string>>({})
    applyClassDerivedData({ effectiveSelected: null, setSaveScoresByCharacterId: saves.set, setThacoByCharacterId: thaco.set }, 'hero', 'Unknown class')
    expect(saves.set).not.toHaveBeenCalled()
    expect(thaco.set).not.toHaveBeenCalled()
  })
})

describe('ability re-roll requests', () => {
  const request = (overrides: Partial<ItemApprovalRequest>) => ({ action: 'ability_reroll', characterId: 'hero', status: 'pending', ...overrides }) as ItemApprovalRequest

  it('finds only a pending re-roll for the selected character', () => {
    const hero = characterFixture()
    expect(hasPendingAbilityRerollFor([request({})], hero)).toBe(true)
    expect(hasPendingAbilityRerollFor([request({ characterId: 'other' })], hero)).toBe(false)
    expect(hasPendingAbilityRerollFor([request({ action: 'create' })], hero)).toBe(false)
    expect(hasPendingAbilityRerollFor([request({ status: 'approved' })], hero)).toBe(false)
    expect(hasPendingAbilityRerollFor([request({})], null)).toBe(false)
    expect(hasPendingAbilityRerollFor([], hero)).toBe(false)
  })

  it('rolls at once for a first roll or a GM, and needs approval for a player re-roll', () => {
    expect(rollsWithoutApproval({ hasRolledAbilityScores: false, role: 'player' })).toBe(true)
    expect(rollsWithoutApproval({ hasRolledAbilityScores: true, role: 'gm' })).toBe(true)
    expect(rollsWithoutApproval({ hasRolledAbilityScores: true, role: 'player' })).toBe(false)
    expect(rollsWithoutApproval({ hasRolledAbilityScores: true, role: null })).toBe(false)
  })

  function rollState(overrides: Partial<Parameters<typeof requestAbilityScoreRoll>[0]> = {}) {
    return {
      effectiveSelected: characterFixture(),
      role: 'player' as const,
      currentUsername: 'player1',
      canEditSelected: true,
      isGuidedCreation: true,
      hasRolledAbilityScores: true,
      hasPendingAbilityReroll: false,
      rollAbilityScores: vi.fn(),
      submitAbilityRerollRequest: vi.fn(async () => undefined),
      setApprovalPendingFeedback: vi.fn(),
      ...overrides,
    }
  }

  it('sends a player re-roll for approval and reports it', () => {
    const state = rollState()
    requestAbilityScoreRoll(state)
    expect(state.submitAbilityRerollRequest).toHaveBeenCalledExactlyOnceWith('hero', 'Mirelda', 'player1')
    expect(state.setApprovalPendingFeedback).toHaveBeenCalledExactlyOnceWith('Ability score re-roll sent to GM for approval.')
    expect(state.rollAbilityScores).not.toHaveBeenCalled()
  })

  it('rolls directly when no approval is needed', () => {
    const state = rollState({ hasRolledAbilityScores: false, hasPendingAbilityReroll: true })
    requestAbilityScoreRoll(state)
    expect(state.rollAbilityScores).toHaveBeenCalledOnce()
    expect(state.submitAbilityRerollRequest).not.toHaveBeenCalled()
    expect(state.setApprovalPendingFeedback).not.toHaveBeenCalled()
  })

  it.each([
    { effectiveSelected: null },
    { canEditSelected: false },
    { isGuidedCreation: false },
    { hasPendingAbilityReroll: true },
  ])('does nothing for %j', (overrides) => {
    const state = rollState(overrides)
    requestAbilityScoreRoll(state)
    expect(state.rollAbilityScores).not.toHaveBeenCalled()
    expect(state.submitAbilityRerollRequest).not.toHaveBeenCalled()
    expect(state.setApprovalPendingFeedback).not.toHaveBeenCalled()
  })
})
