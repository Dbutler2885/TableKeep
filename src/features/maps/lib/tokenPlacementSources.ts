import type {
  CharacterTokenSummary,
  MonsterSummary,
  NpcSummary,
  TokenAssetRecord,
} from './types'
import type {
  GenericTokenPlacementSource,
  MonsterTokenPlacementSource,
  NpcTokenPlacementSource,
  PartyCharacterTokenPlacementSource,
} from './tokenPlacementQueue'
import { isPlayerOwnedLivingPartyCharacter } from './partyCharacterEligibility'

export function toNpcTokenPlacementSource(npc: NpcSummary): NpcTokenPlacementSource {
  return {
    kind: 'npc',
    id: npc.id,
    name: npc.name,
    tokenIcon: npc.tokenIcon,
  }
}

export function toMonsterTokenPlacementSource(monster: MonsterSummary): MonsterTokenPlacementSource {
  return {
    kind: 'monster',
    id: monster.id,
    name: monster.name,
    tokenIcon: monster.tokenIcon,
  }
}

export function toPartyCharacterTokenPlacementSource(
  character: CharacterTokenSummary,
): PartyCharacterTokenPlacementSource {
  return {
    kind: 'partyCharacter',
    id: character.id,
    name: character.name,
    tokenIcon: character.tokenIcon,
  }
}

export function toGenericTokenPlacementSource(asset: TokenAssetRecord): GenericTokenPlacementSource {
  return {
    kind: 'genericToken',
    id: asset.id,
    name: asset.name,
    imagePath: asset.imagePath,
    imageUrl: asset.imageUrl,
    imageWidth: asset.width,
    imageHeight: asset.height,
  }
}

export function buildWholePartyTokenPlacementSources(
  characters: readonly CharacterTokenSummary[],
  gmUserId: string | null | undefined,
): PartyCharacterTokenPlacementSource[] {
  return characters
    .filter((character) => isPlayerOwnedLivingPartyCharacter(character, gmUserId))
    .map(toPartyCharacterTokenPlacementSource)
}
