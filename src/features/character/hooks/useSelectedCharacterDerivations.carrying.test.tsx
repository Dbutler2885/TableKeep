// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { capacityCases } from '../oseCarryingCases'
import { parseOseCharacter } from '../lib/storedCharacterRecord'
import { useSelectedCharacterDerivations } from './useSelectedCharacterDerivations'
import type { CharacterInventoryItem } from '../../../types/app'

const character = parseOseCharacter('pc', { class: 'Fighter' })
type Params = Parameters<typeof useSelectedCharacterDerivations>[0]
const defaults: Params = {
  effectiveSelected: character, abilityScoresByCharacterId: {}, rolledAbilityScoresByCharacterId: {}, abilityScoresRolledByCharacterId: {},
  inventoryByCharacterId: {}, startingGoldByCharacterId: {}, storeCartByCharacterId: {}, storeSpentByCharacterId: {},
  thacoByCharacterId: {}, saveScoresByCharacterId: {}, adventureScoresByCharacterId: {}, thiefSkillsByCharacterId: {},
  outgoingTransfers: [], goldSpendAmount: '', storeCategory: 'adventuring', isInFinalizationFlow: false,
}
afterEach(cleanup)
describe('sheet capacity and store preview', () => {
  it.each(capacityCases)('$name matches the app/server baseline and keeps movement rows unlocked', ({ details, packedSlots }) => {
    const scores = (details as { abilityScores?: Params['abilityScoresByCharacterId'][string] } | undefined)?.abilityScores
    const { result } = renderHook(() => useSelectedCharacterDerivations({ ...defaults, abilityScoresByCharacterId: scores ? { pc: scores } : {} }))
    expect(result.current.availablePackedSlotIndices).toHaveLength(packedSlots)
    expect(result.current.availablePackedSlotIndices.slice(-13)).toEqual(Array.from({ length: 13 }, (_, i) => i + 6))
    expect(result.current.packedSlotUnlockedByIndex.filter(Boolean)).toHaveLength(packedSlots)
  })
  it.each([0, 12, 13, 14])('counts packed rows, rather than stack quantity or equipped gear, at %s used', (count) => {
    const packed = Array.from({ length: count }, (_, i) => ({ id: String(i), kind: 'general', qty: 999, equipped: false })) as CharacterInventoryItem[]
    const equipped = Array.from({ length: 20 }, (_, i) => ({ id: 'e' + i, kind: 'general', qty: 999, equipped: true })) as CharacterInventoryItem[]
    const { result } = renderHook(() => useSelectedCharacterDerivations({
      ...defaults, inventoryByCharacterId: { pc: [...packed, ...equipped] },
      storeCartByCharacterId: { pc: [{ key: 'cart', name: 'Rope', kind: 'general', qty: 1, costGp: 2 }] },
    }))
    expect(result.current.selectedStoreOpenPackedSlots).toBe(Math.max(0, 13 - count))
    expect(result.current.selectedStoreRequiredPacked).toBe(1)
    expect(result.current.storeCartExceedsPackedSlots).toBe(count >= 13)
  })
  it('shows baseline capacity and an empty store cart with no selected character', () => {
    const { result } = renderHook(() => useSelectedCharacterDerivations({ ...defaults, effectiveSelected: null }))
    expect(result.current.availablePackedSlotIndices).toHaveLength(13)
    expect(result.current.selectedStoreOpenPackedSlots).toBe(13)
    expect(result.current.selectedStoreRequiredPacked).toBe(0)
    expect(result.current.storeCartExceedsPackedSlots).toBe(false)
  })
})
