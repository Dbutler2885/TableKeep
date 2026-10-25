import { useMemo, useState } from 'react'
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
} from '../lib/nonPartyPlacement'
import type { GenericTokenPlacementSource, MonsterTokenPlacementSource, NpcTokenPlacementSource, TokenPlacementSource } from '../lib/tokenPlacementQueue'

export type NonPartySources = {
  monsterPlacementSources: MonsterTokenPlacementSource[]
  npcPlacementSources: NpcTokenPlacementSource[]
  genericPlacementSources: GenericTokenPlacementSource[]
}

// Which source the non-party picker has chosen. A choice that disappears from
// the sources is dropped as the sources change; the creator is always kept.
function useNonPartySourceChoice(sources: TokenPlacementSource[], setSelectedTokenAssetId: (assetId: string) => void) {
  const [sourceKey, setSourceKey] = useState('')
  const [previousSources, setPreviousSources] = useState(sources)
  if (previousSources !== sources) {
    setPreviousSources(sources)
    setSourceKey((current) => reconcileSourceKey(current, sources))
  }
  const chooseSource = (key: string) => {
    setSourceKey(key)
    const assetId = genericAssetIdForKey(sources, key)
    if (assetId !== null) setSelectedTokenAssetId(assetId)
  }
  return {
    sourceKey,
    selectedSource: findSourceByKey(sources, sourceKey),
    creatorSelected: sourceKey === GENERIC_CREATOR_KEY,
    chooseSource,
    clearSource: () => setSourceKey(''),
  }
}

function useNonPartySearch({ monsterPlacementSources, npcPlacementSources, genericPlacementSources }: NonPartySources) {
  const [search, setSearch] = useState('')
  const normalized = normalizeSourceSearch(search)
  const matches = (source: TokenPlacementSource) => matchesSourceSearch(source, normalized)
  return {
    search,
    setSearch,
    visibleMonsters: monsterPlacementSources.filter(matches),
    visibleNpcs: npcPlacementSources.filter(matches),
    visibleGenerics: genericPlacementSources.filter(matches),
    creatorVisible: genericCreatorMatches(normalized),
  }
}

function useMonsterCounts() {
  const [counts, setCounts] = useState<Record<string, number>>({})
  return {
    countFor: (monsterId: string) => counts[monsterId] ?? 1,
    setCount: (monsterId: string, count: number) => {
      setCounts((current) => ({ ...current, [monsterId]: clampMonsterCount(count) }))
    },
  }
}

// The non-party picker's state: the search, the chosen source and the monster counts.
export function useNonPartyPlacement(sources: NonPartySources, setSelectedTokenAssetId: (assetId: string) => void) {
  const { monsterPlacementSources, npcPlacementSources, genericPlacementSources } = sources
  const allSources = useMemo(
    () => [...monsterPlacementSources, ...npcPlacementSources, ...genericPlacementSources],
    [genericPlacementSources, monsterPlacementSources, npcPlacementSources],
  )
  const choice = useNonPartySourceChoice(allSources, setSelectedTokenAssetId)
  const search = useNonPartySearch(sources)
  const counts = useMonsterCounts()
  const [genericTokenName, setGenericTokenName] = useState('Token')
  const visible = [...search.visibleMonsters, ...search.visibleNpcs, ...search.visibleGenerics]
  return {
    ...choice,
    ...search,
    ...counts,
    genericTokenName,
    setGenericTokenName,
    selectedKeyVisible: visible.some((source) => placementSourceKey(source) === choice.sourceKey),
  }
}

export type NonPartyPlacement = ReturnType<typeof useNonPartyPlacement>
