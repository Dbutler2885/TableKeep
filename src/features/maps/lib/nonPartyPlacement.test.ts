import { describe, expect, it } from 'vitest'
import {
  GENERIC_CREATOR_KEY,
  clampMonsterCount,
  findSourceByKey,
  genericAssetIdForKey,
  genericCreatorMatches,
  matchesSourceSearch,
  normalizeSourceSearch,
  placementSourceKey,
  reconcileSourceKey,
  stagedGenericSource,
} from './nonPartyPlacement'
import { customTokenIconUrl, placementSourceColor, placementSourceImageUrl } from './placementSourceDisplay'
import type { GenericTokenPlacementSource, MonsterTokenPlacementSource, NpcTokenPlacementSource } from './tokenPlacementQueue'

const goblin: MonsterTokenPlacementSource = { kind: 'monster', id: 'm1', name: 'Goblin', tokenIcon: { icon: 'pawn', color: '#00ff00', size: 30 } }
const keeper: NpcTokenPlacementSource = { kind: 'npc', id: 'n1', name: 'Keeper', tokenIcon: { icon: 'custom', color: '#ff0000', size: 30, customImageUrl: 'https://img.test/k.png' } }
const crate: GenericTokenPlacementSource = { kind: 'genericToken', id: 'a1', name: 'Crate', imagePath: 'assets/a1.png', imageUrl: 'https://img.test/a1.png' }
const sources = [goblin, keeper, crate]

describe('the non-party picker', () => {
  it('keys a source by kind and id, and finds it again', () => {
    expect(placementSourceKey(keeper)).toBe('npc:n1')
    expect(findSourceByKey(sources, 'genericToken:a1')).toBe(crate)
    expect(findSourceByKey(sources, 'npc:zz')).toBeNull()
  })

  it('selects the token asset only for a generic source', () => {
    expect(genericAssetIdForKey(sources, 'genericToken:a1')).toBe('a1')
    expect(genericAssetIdForKey(sources, 'monster:m1')).toBeNull()
    expect(genericAssetIdForKey(sources, 'npc:gone')).toBeNull()
    expect(genericAssetIdForKey(sources, GENERIC_CREATOR_KEY)).toBeNull()
  })

  it('keeps a choice while its source exists, and always keeps the creator', () => {
    expect(reconcileSourceKey('', sources)).toBe('')
    expect(reconcileSourceKey(GENERIC_CREATOR_KEY, [])).toBe(GENERIC_CREATOR_KEY)
    expect(reconcileSourceKey('monster:m1', sources)).toBe('monster:m1')
    expect(reconcileSourceKey('monster:m1', [keeper])).toBe('')
  })

  it('searches names and kinds, case-insensitively', () => {
    expect(normalizeSourceSearch('  GoB ')).toBe('gob')
    expect(matchesSourceSearch(goblin, '')).toBe(true)
    expect(matchesSourceSearch(goblin, 'gob')).toBe(true)
    expect(matchesSourceSearch(goblin, 'monster')).toBe(true)
    expect(matchesSourceSearch(crate, 'generic asset')).toBe(true)
    expect(matchesSourceSearch(crate, 'generictoken')).toBe(false)
    expect(genericCreatorMatches('')).toBe(true)
    expect(genericCreatorMatches('upload')).toBe(true)
    expect(genericCreatorMatches('goblin')).toBe(false)
  })

  it('clamps a monster count to 1 through 99', () => {
    expect(clampMonsterCount(0)).toBe(1)
    expect(clampMonsterCount(Number.NaN)).toBe(1)
    expect(clampMonsterCount(4.7)).toBe(4)
    expect(clampMonsterCount(300)).toBe(99)
  })

  it('stages a pawn, or the selected asset, under the typed name', () => {
    expect(stagedGenericSource(null, '  ', '#123', 30)).toEqual({ kind: 'genericToken', id: '', name: 'Token', tokenIcon: { icon: 'pawn', color: '#123', size: 30 } })
    expect(stagedGenericSource(null, ' Box ', '#123', 30).name).toBe('Box')
    expect(stagedGenericSource(crate, '', '#123', 30)).toEqual({
      ...crate,
      tokenIcon: { icon: 'custom', color: '#123', size: 30, customImagePath: 'assets/a1.png', customImageUrl: 'https://img.test/a1.png', customImageName: 'Crate' },
    })
    expect(stagedGenericSource(crate, 'Box', '#123', 30).name).toBe('Box')
  })
})

describe('placement source display', () => {
  it('shows a generic asset image or a custom icon image, and nothing for a pawn', () => {
    expect(placementSourceImageUrl(crate)).toBe('https://img.test/a1.png')
    expect(placementSourceImageUrl(keeper)).toBe('https://img.test/k.png')
    expect(placementSourceImageUrl(goblin)).toBe('')
    expect(customTokenIconUrl(null)).toBe('')
    expect(customTokenIconUrl({ icon: 'custom', color: '#000', size: 1 })).toBe('')
  })

  it('colours a source by its icon, or the fallback', () => {
    expect(placementSourceColor(goblin, '#fff')).toBe('#00ff00')
    expect(placementSourceColor(crate, '#fff')).toBe('#fff')
  })
})
