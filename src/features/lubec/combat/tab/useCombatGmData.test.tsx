// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import type { Campaign, NpcRecord } from '../../../../types/app'
import type { LubecCharacterRecord } from '../../../ruleSets/lubec/characterRecord'
import { lubecCharacterSheet } from '../../../ruleSets/lubec/sheetFixtures'
import { parseLubecGmItem } from '../../../ruleSets/lubec/gear/gmItem'

const mocks = vi.hoisted(() => ({ stores: [] as Record<string, unknown>[], items: null as unknown, npcs: [] as unknown[] }))

vi.mock('../../../character/characterStore/useCharacterStore', () => ({
  useCharacterStore: (options: Record<string, unknown>) => {
    mocks.stores.push(options)
    const kid = (id: string, name: string, creationStatus = 'active') => ({ id, name, creationStatus, ownerUserId: 'owner', portraitPath: `${id}-art`, lubec: lubecCharacterSheet() }) as unknown as LubecCharacterRecord
    return { characters: options.collection === 'characters' ? [kid('wayne', 'Wayne'), kid('draft', 'Draft', 'draft')] : [kid('roy', 'Roy sheet')] }
  },
}))
vi.mock('../../../npcs/hooks/useNpcDocuments', () => ({ useNpcDocuments: () => ({ npcs: mocks.npcs }) }))
vi.mock('../../items/useLubecGmItems', () => ({ useLubecGmItems: () => mocks.items }))

const { useCombatGmData } = await import('./useCombatGmData')

const campaign = { id: 'gym', groupId: 'school', gmUserId: 'gm' } as Campaign
afterEach(cleanup)

describe('what the GM sets a fight up from', () => {
  it('reads characters in play, NPCs with their public face over their sheet, and every GM item oldest first', () => {
    mocks.npcs = [{ id: 'roy', name: 'Roy Carver', portraitPath: 'roy-face' }, { id: 'coach', name: 'Coach' }] as NpcRecord[]
    mocks.items = [parseLubecGmItem({ name: 'New', kind: 'thing', status: 'library', createdAt: { seconds: 9 } }, 'new'), parseLubecGmItem({ name: 'Old', kind: 'thing', status: 'dropped', createdAt: { seconds: 1 } }, 'old')]
    const { result } = renderHook(() => useCombatGmData({ campaign, userId: 'gm', setError: () => undefined }))
    expect(result.current.characters.map((sheet) => [sheet.sheetId, sheet.name, sheet.portraitPath])).toEqual([['wayne', 'Wayne', 'wayne-art']])
    expect(result.current.npcs.map(({ npc, sheet }) => [npc.id, sheet?.name ?? null, sheet?.portraitPath ?? null])).toEqual([['roy', 'Roy Carver', 'roy-face'], ['coach', null, null]])
    expect(result.current.items.map((item) => item.id)).toEqual(['old', 'new'])
    expect(mocks.stores.map((options) => [options.collection, options.role, options.enabled])).toContainEqual(['npcSheets', 'gm', true])
  })

  it('has no items while they load, and an NPC with no portrait shows none', () => {
    mocks.npcs = [{ id: 'roy', name: 'Roy Carver' }] as NpcRecord[]
    mocks.items = null
    const { result } = renderHook(() => useCombatGmData({ campaign: { ...campaign, gmUserId: undefined }, userId: 'gm', setError: () => undefined }))
    expect(result.current.items).toEqual([])
    expect(result.current.npcs[0].sheet?.portraitPath).toBe('')
  })
})
