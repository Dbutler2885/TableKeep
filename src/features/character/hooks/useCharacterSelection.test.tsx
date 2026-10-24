// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { characterFixture } from '../characterTestFixtures'
import { useCharacterSelection } from './useCharacterSelection'

afterEach(cleanup)

const first = characterFixture({ id: 'first', name: 'A first' })
const second = characterFixture({ id: 'second', name: 'B second' })

function params(overrides: Partial<Parameters<typeof useCharacterSelection>[0]> = {}) {
  return {
    characters: [second, first], role: 'player' as const, gmUserId: 'gm', currentUserId: 'player', currentCharacterId: null,
    selectedCharacter: null, selectedCharacterId: '', setSelectedCharacterId: vi.fn(), embeddedMode: false,
    ...overrides,
  }
}

describe('character selection', () => {
  it('selects the first sorted character when nothing is selected', () => {
    const current = params()
    const { result } = renderHook(() => useCharacterSelection(current))
    expect(result.current.sortedCharacters).toEqual([first, second])
    expect(result.current.effectiveSelected).toBeNull()
    expect(current.setSelectedCharacterId).toHaveBeenCalledExactlyOnceWith('first')
  })

  it('keeps an existing selection and selects nothing in an empty roster', () => {
    const selected = params({ selectedCharacterId: 'second' })
    expect(renderHook(() => useCharacterSelection(selected)).result.current.effectiveSelected).toBe(second)
    expect(selected.setSelectedCharacterId).not.toHaveBeenCalled()
    const empty = params({ characters: [] })
    renderHook(() => useCharacterSelection(empty))
    expect(empty.setSelectedCharacterId).not.toHaveBeenCalled()
  })

  it('shows an embedded player their current character without changing the selection', () => {
    const embedded = params({ embeddedMode: true, currentCharacterId: 'second' })
    const { result } = renderHook(() => useCharacterSelection(embedded))
    expect(result.current.sortedCharacters).toEqual([second])
    expect(result.current.effectiveSelected).toBe(second)
    expect(embedded.setSelectedCharacterId).not.toHaveBeenCalled()
  })

  it('keeps the sorted roster stable across renders with the same inputs', () => {
    const current = params({ selectedCharacterId: 'first' })
    const { result, rerender } = renderHook(() => useCharacterSelection(current))
    const sorted = result.current.sortedCharacters
    rerender()
    expect(result.current.sortedCharacters).toBe(sorted)
  })
})
