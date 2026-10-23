// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CharacterInventoryItem } from '../../../types/app'
import { characterFixture, generalItemFixture } from '../characterTestFixtures'
import { useCharacterRoster } from './useCharacterRoster'

type Params = Parameters<typeof useCharacterRoster>[0]

function setup(overrides: Partial<Params> = {}) {
  const params: Params = {
    campaignId: 'campaign', groupId: 'group', currentUserId: 'player', currentUsername: 'player1',
    canCreateCharacter: true, effectiveSelected: characterFixture(), canEditSelected: true,
    isGuidedCreation: true, isInFinalizationFlow: true, hasRolledAbilityScores: true,
    hasRolledHp: true, selectedInventory: [], setSelectedCharacterId: vi.fn(),
    isSinglePane: false, showDetailPane: vi.fn(), updateSelectedCharacter: vi.fn(),
    createCharacter: vi.fn(async () => undefined), ...overrides,
  }
  return { params, ...renderHook((next: Params) => useCharacterRoster(next), { initialProps: params }) }
}

afterEach(cleanup)

describe('guided finalization, in its current validation order', () => {
  it('confirms a ready non-cleric without requiring any inventory', () => {
    const { result } = setup()
    act(() => result.current.requestFinalizeCharacter())
    expect(result.current.finalizeConfirmOpen).toBe(true)
    expect(result.current.finalizeError).toBeNull()
    expect(result.current.holySymbolRequiredOpen).toBe(false)
  })
  it.each([
    { name: 'class', character: { className: '-' }, ability: false, hp: false, error: 'Choose a class before finalizing.' },
    { name: 'ability roll', character: { hpMax: 0 }, ability: false, hp: false, error: 'Roll ability scores before finalizing.' },
    { name: 'HP roll', character: { hpMax: 0 }, ability: true, hp: false, error: 'Roll hit points before finalizing.' },
    { name: 'zero maximum HP', character: { hpMax: 0 }, ability: true, hp: true, error: 'Set maximum hit points before finalizing.' },
    { name: 'negative maximum HP', character: { hpMax: -1 }, ability: true, hp: true, error: 'Set maximum hit points before finalizing.' },
  ])('requires $name before opening confirmation', ({ character, ability, hp, error }) => {
    const { result, params } = setup({ effectiveSelected: characterFixture(character), hasRolledAbilityScores: ability, hasRolledHp: hp })
    act(() => result.current.requestFinalizeCharacter())
    expect(result.current.finalizeError).toBe(error)
    expect(result.current.finalizeConfirmOpen).toBe(false)
    expect(result.current.holySymbolRequiredOpen).toBe(false)
    expect(params.updateSelectedCharacter).not.toHaveBeenCalled()
  })

  it.each([[], [generalItemFixture({ name: 'Rope' })], [generalItemFixture()]].map((selectedInventory) => ({ selectedInventory })))(
    'opens the holy symbol dialog for a cleric without a named holy symbol ($selectedInventory)', ({ selectedInventory }) => {
      const { result } = setup({ effectiveSelected: characterFixture({ className: 'Cleric' }), selectedInventory })
      act(() => result.current.requestFinalizeCharacter())
      expect(result.current.holySymbolRequiredOpen).toBe(true)
      expect(result.current.finalizeError).toBeNull()
      expect(result.current.finalizeConfirmOpen).toBe(false)
      act(() => result.current.setHolySymbolRequiredOpen(false))
      expect(result.current.holySymbolRequiredOpen).toBe(false)
    },
  )

  it.each(['Holy Symbol', 'Silver HOLY SYMBOL pendant'])('accepts a cleric carrying %s, including at one maximum HP', (name) => {
    const selectedInventory: CharacterInventoryItem[] = [generalItemFixture({ id: 'symbol', name })]
    const { result } = setup({ effectiveSelected: characterFixture({ className: 'Cleric', hpMax: 1 }), selectedInventory })
    act(() => result.current.requestFinalizeCharacter())
    expect(result.current.finalizeConfirmOpen).toBe(true)
    expect(result.current.holySymbolRequiredOpen).toBe(false)
    expect(result.current.finalizeError).toBeNull()
  })
})

describe('finalization state and guards', () => {
  it.each([
    { effectiveSelected: null }, { canEditSelected: false }, { isInFinalizationFlow: false },
  ])('ignores both finalization actions when gated by %j', (overrides) => {
    const { result, params } = setup(overrides)
    act(() => result.current.setFinalizeError('Keep this error'))
    act(() => result.current.requestFinalizeCharacter())
    expect(result.current.finalizeConfirmOpen).toBe(false)
    expect(result.current.finalizeError).toBe('Keep this error')
    act(() => result.current.setFinalizeConfirmOpen(true))
    act(() => result.current.finalizeCharacter())
    expect(params.updateSelectedCharacter).not.toHaveBeenCalled()
    expect(result.current.finalizeConfirmOpen).toBe(true)
    expect(result.current.finalizeError).toBe('Keep this error')
  })

  it('skips guided requirements for an established draft, clears old errors, and finalizes only after confirmation', () => {
    const { result, params } = setup({ isGuidedCreation: false, effectiveSelected: characterFixture({ creationMode: 'established', creationStatus: 'established_draft', className: '-', hpMax: 0 }), hasRolledAbilityScores: false, hasRolledHp: false })
    act(() => result.current.setFinalizeError('Old error'))
    act(() => result.current.requestFinalizeCharacter())
    expect(result.current.finalizeError).toBeNull()
    expect(result.current.finalizeConfirmOpen).toBe(true)
    expect(params.updateSelectedCharacter).not.toHaveBeenCalled()
    act(() => result.current.finalizeCharacter())
    expect(params.updateSelectedCharacter).toHaveBeenCalledExactlyOnceWith({ creationStatus: 'active' })
    expect(result.current.finalizeConfirmOpen).toBe(false)
    expect(result.current.finalizeError).toBeNull()
  })

  it('confirmation does not repeat validation, and clears the error present at confirmation time', () => {
    const { result, params } = setup({ hasRolledAbilityScores: false })
    act(() => { result.current.setFinalizeConfirmOpen(true); result.current.setFinalizeError('Old error') })
    act(() => result.current.finalizeCharacter())
    expect(params.updateSelectedCharacter).toHaveBeenCalledExactlyOnceWith({ creationStatus: 'active' })
    expect(result.current.finalizeError).toBeNull()
    expect(result.current.finalizeConfirmOpen).toBe(false)
  })

  it('keys confirmation and errors by both character id and creation status, restoring them when returning to that selection', () => {
    const { result, params, rerender } = setup()
    act(() => { result.current.setFinalizeConfirmOpen(true); result.current.setFinalizeError('Mirelda error') })
    for (const effectiveSelected of [characterFixture({ id: 'other' }), characterFixture({ creationStatus: 'active' }), null]) {
      rerender({ ...params, effectiveSelected })
      expect(result.current.finalizeConfirmOpen).toBe(false)
      expect(result.current.finalizeError).toBeNull()
    }
    rerender(params)
    expect(result.current.finalizeConfirmOpen).toBe(true)
    expect(result.current.finalizeError).toBe('Mirelda error')
    act(() => { result.current.setFinalizeConfirmOpen(false); result.current.setFinalizeError('') })
    expect(result.current.finalizeConfirmOpen).toBe(false)
    expect(result.current.finalizeError).toBeNull()
  })

  it('exposes independent create-modal state', () => {
    const { result } = setup()
    expect(result.current.createCharacterModalOpen).toBe(false)
    act(() => result.current.setCreateCharacterModalOpen(true))
    expect(result.current.createCharacterModalOpen).toBe(true)
    act(() => result.current.setCreateCharacterModalOpen(false))
    expect(result.current.createCharacterModalOpen).toBe(false)
  })

  it('keeps the holy-symbol dialog open across selection changes until explicitly dismissed', () => {
    const { result, params, rerender } = setup({ effectiveSelected: characterFixture({ className: 'Cleric' }) })
    act(() => result.current.requestFinalizeCharacter())
    rerender({ ...params, effectiveSelected: characterFixture({ id: 'fighter' }) })
    expect(result.current.holySymbolRequiredOpen).toBe(true)
    act(() => result.current.setHolySymbolRequiredOpen(false))
    expect(result.current.holySymbolRequiredOpen).toBe(false)
  })
})
