// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import type { Campaign } from '../../../../types/app'

const store = vi.hoisted(() => ({ options: [] as unknown[], characters: [] as { id: string; ownerUserId: string }[] }))
vi.mock('../../../character/characterStore/useCharacterStore', () => ({
  useCharacterStore: (options: unknown) => { store.options.push(options); return { characters: store.characters } },
}))

vi.mock('./combatSheetWriter', () => ({ combatSheetWriter: (_store: unknown, collection: string, scope: unknown) => ({ collection, scope }) }))

const { useCombatPlayerRoster } = await import('./useCombatPlayerRoster')
const campaign: Campaign = { id: 'gym', name: 'Gym', status: 'active', groupId: 'school', gmUserId: 'gm' }
afterEach(cleanup)

describe("a player's roster for the attack window", () => {
  it("reads the campaign's characters as a player and keeps only the viewer's own", () => {
    store.characters = [{ id: 'wayne', ownerUserId: 'wayne-uid' }, { id: 'dottie', ownerUserId: 'dottie-uid' }]
    const { result } = renderHook(() => useCombatPlayerRoster({ campaign, userId: 'wayne-uid', setError: () => undefined, enabled: true }))
    expect(result.current.roster).toEqual({ characters: [{ id: 'wayne', ownerUserId: 'wayne-uid' }], npcs: [] })
    expect(result.current.writer).toEqual({ collection: 'characters', scope: { groupId: 'school', campaignId: 'gym' } })
    expect(store.options.at(-1)).toMatchObject({ campaignId: 'gym', groupId: 'school', userId: 'wayne-uid', role: 'player', gmUserId: 'gm', enabled: true, collection: 'characters' })
  })

  it('follows a campaign with no GM recorded', () => {
    renderHook(() => useCombatPlayerRoster({ campaign: { ...campaign, gmUserId: undefined }, userId: 'wayne-uid', setError: () => undefined, enabled: false }))
    expect(store.options.at(-1)).toMatchObject({ gmUserId: null, enabled: false })
  })
})
