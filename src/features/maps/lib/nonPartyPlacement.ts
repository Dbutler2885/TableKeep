import type { GenericTokenPlacementSource, TokenPlacementSource } from './tokenPlacementQueue'

// The picker's value for the "new token" creator, which is not a source of its own.
export const GENERIC_CREATOR_KEY = 'generic:create'

export function placementSourceKey(source: TokenPlacementSource) {
  return `${source.kind}:${source.id}`
}

export function findSourceByKey<T extends TokenPlacementSource>(sources: T[], key: string): T | null {
  return sources.find((source) => placementSourceKey(source) === key) ?? null
}

// The token asset to select when the picker moves to `key`, if it names a generic asset.
export function genericAssetIdForKey(sources: TokenPlacementSource[], key: string) {
  if (key === GENERIC_CREATOR_KEY) return null
  const source = findSourceByKey(sources, key)
  return source?.kind === 'genericToken' ? source.id : null
}

// The picker keeps its choice while that source still exists, and always keeps the creator.
export function reconcileSourceKey(current: string, sources: TokenPlacementSource[]) {
  if (!current || current === GENERIC_CREATOR_KEY) return current
  return findSourceByKey(sources, current) ? current : ''
}

export function normalizeSourceSearch(search: string) {
  return search.trim().toLowerCase()
}

export function matchesSourceSearch(source: TokenPlacementSource, normalizedSearch: string) {
  if (!normalizedSearch) return true
  const kindLabel = source.kind === 'genericToken' ? 'generic asset' : source.kind
  return `${source.name} ${kindLabel}`.toLowerCase().includes(normalizedSearch)
}

export function genericCreatorMatches(normalizedSearch: string) {
  return !normalizedSearch || 'generic asset assets token custom upload'.includes(normalizedSearch)
}

export function clampMonsterCount(count: number) {
  return Math.max(1, Math.min(99, Math.floor(count) || 1))
}

// What the creator would place: the selected asset under the typed name, or a pawn.
export function stagedGenericSource(
  selectedAsset: GenericTokenPlacementSource | null,
  tokenName: string,
  color: string,
  size: number,
): GenericTokenPlacementSource {
  const name = tokenName.trim()
  if (!selectedAsset) {
    return { kind: 'genericToken', id: '', name: name || 'Token', tokenIcon: { icon: 'pawn', color, size } }
  }
  return {
    ...selectedAsset,
    name: name || selectedAsset.name,
    tokenIcon: {
      icon: 'custom',
      color,
      size,
      customImagePath: selectedAsset.imagePath,
      customImageUrl: selectedAsset.imageUrl,
      customImageName: selectedAsset.name,
    },
  }
}
