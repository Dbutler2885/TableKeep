import { describe, expect, it } from 'vitest'
import { aToken } from '../test/mapFixtures'
import { DEFAULT_TOKEN_VIEW_DISTANCE, TOKEN_SIZE_MIN } from './constants'
import { bulkTokenValues, everyTokenHas } from './selectedTokenSummary'
import { groupTokensByCategory, partitionNamedGroups, selectedCategoryLabel, shareOneCategory, tokenCategoryKey } from './tokenListGroups'
import { addMissingIds, idRange, includeId, setIdsSelected, toggleId } from './tokenListSelection'

const pc = aToken({ id: 'pc', party: true, characterId: 'c' })
const hireling = aToken({ id: 'hire', characterId: 'c2' })
const goblin = aToken({ id: 'gob', monsterId: 'm' })
const keeper = aToken({ id: 'keep', npcId: 'n' })
const crate = aToken({ id: 'crate' })
const both = aToken({ id: 'both', monsterId: 'm', npcId: 'n' })

describe('token categories', () => {
  it('lists the categories in use in display order', () => {
    expect(groupTokensByCategory([crate, keeper, goblin, hireling, pc]).map((group) => [group.key, group.label, group.tokens.map((token) => token.id)])).toEqual([
      ['party', 'Party', ['pc']],
      ['characters', 'Characters', ['hire']],
      ['monsters', 'Monsters', ['gob']],
      ['npcs', 'NPCs', ['keep']],
      ['other', 'Other', ['crate']],
    ])
    expect(groupTokensByCategory([])).toEqual([])
  })

  it('lists a token linked to two kinds of record under both', () => {
    expect(groupTokensByCategory([both]).map((group) => group.key)).toEqual(['monsters', 'npcs'])
  })

  it('puts each token in its first matching category', () => {
    expect([pc, hireling, goblin, keeper, crate, both].map(tokenCategoryKey)).toEqual(['party', 'characters', 'monsters', 'npcs', 'other', 'monsters'])
  })

  it('knows when a selection shares one category, and names it', () => {
    const groups = groupTokensByCategory([goblin, keeper])
    expect(shareOneCategory([])).toBe(false)
    expect(shareOneCategory([goblin, both])).toBe(true)
    expect(shareOneCategory([goblin, keeper])).toBe(false)
    expect(selectedCategoryLabel(groups, new Set(['keep']), true)).toBe('NPCs')
    expect(selectedCategoryLabel(groups, new Set(['keep']), false)).toBe('this category')
    expect(selectedCategoryLabel(groups, new Set(['gone']), true)).toBe('this category')
  })

  it('splits named sub-groups, trimmed and in first-seen order, from loose tokens', () => {
    const a = aToken({ id: 'a', group: 'Patrol' })
    const b = aToken({ id: 'b', group: ' Guard ' })
    const c = aToken({ id: 'c', group: 'Patrol ' })
    const d = aToken({ id: 'd', group: '  ' })
    const { named, loose } = partitionNamedGroups([a, b, crate, c, d])
    expect(named.map(([name, tokens]) => [name, tokens.map((token) => token.id)])).toEqual([['Patrol', ['a', 'c']], ['Guard', ['b']]])
    expect(loose.map((token) => token.id)).toEqual(['crate', 'd'])
  })
})

describe('token list selection', () => {
  it('adds ids without repeating them', () => {
    expect(addMissingIds(['a'], ['b', 'a', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('selects or deselects a set of ids', () => {
    expect(setIdsSelected(['a', 'b'], ['b', 'c'], true)).toEqual(['a', 'b', 'c'])
    expect(setIdsSelected(['a', 'b', 'c'], ['b', 'c'], false)).toEqual(['a'])
  })

  it('toggles and includes one id', () => {
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b'])
    expect(toggleId(['b'], 'a')).toEqual(['b', 'a'])
    const current = ['a']
    expect(includeId(current, 'a')).toBe(current)
    expect(includeId(current, 'b')).toEqual(['a', 'b'])
  })

  it('finds the run between two ids either way round', () => {
    const ids = ['a', 'b', 'c', 'd']
    expect(idRange(ids, 'b', 'd')).toEqual(['b', 'c', 'd'])
    expect(idRange(ids, 'c', 'a')).toEqual(['a', 'b', 'c'])
    expect(idRange(ids, 'x', 'a')).toBeNull()
    expect(idRange(ids, 'a', 'x')).toBeNull()
  })
})

describe('bulk token values', () => {
  it('reads the first selected token, and the first party token for view distance', () => {
    const first = aToken({ id: '1', size: 40, color: '#111111', rotationDeg: -90 })
    const party = aToken({ id: '2', party: true })
    const values = bulkTokenValues([first, party], '#fallback', (token) => (token.id === '2' ? 222 : 0))
    expect(values).toEqual({ partyTokens: [party], size: 40, color: '#111111', rotation: 270, viewDistance: 222 })
  })

  it('falls back when nothing is selected', () => {
    expect(bulkTokenValues([], '#fallback', () => 1)).toEqual({
      partyTokens: [],
      size: TOKEN_SIZE_MIN,
      color: '#fallback',
      rotation: 0,
      viewDistance: DEFAULT_TOKEN_VIEW_DISTANCE,
    })
  })

  it('reads a flag as on only when every selected token has it', () => {
    expect(everyTokenHas([], 'hidden')).toBe(false)
    expect(everyTokenHas([aToken({ id: '1', hidden: true }), aToken({ id: '2' })], 'hidden')).toBe(false)
    expect(everyTokenHas([aToken({ id: '1', hidden: true })], 'hidden')).toBe(true)
  })
})
