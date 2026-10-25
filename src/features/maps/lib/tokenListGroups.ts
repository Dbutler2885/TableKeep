import type { TokenRecord } from './types'

export type TokenCategoryKey = 'party' | 'characters' | 'monsters' | 'npcs' | 'other'

export type TokenGroup = { key: TokenCategoryKey; label: string; tokens: TokenRecord[] }

type TokenLink = 'characterId' | 'monsterId' | 'npcId'

function isNonPartyWith(token: TokenRecord, link: TokenLink) {
  return !token.party && Boolean(token[link])
}

function isUnlinkedNonParty(token: TokenRecord) {
  return !token.party && !token.characterId && !token.monsterId && !token.npcId
}

// The token list's categories, in display order, leaving out the empty ones.
// A token linked to more than one kind of record is listed under each.
export function groupTokensByCategory(tokens: TokenRecord[]): TokenGroup[] {
  const groups: TokenGroup[] = [
    { key: 'party', label: 'Party', tokens: tokens.filter((token) => token.party) },
    { key: 'characters', label: 'Characters', tokens: tokens.filter((token) => isNonPartyWith(token, 'characterId')) },
    { key: 'monsters', label: 'Monsters', tokens: tokens.filter((token) => isNonPartyWith(token, 'monsterId')) },
    { key: 'npcs', label: 'NPCs', tokens: tokens.filter((token) => isNonPartyWith(token, 'npcId')) },
    { key: 'other', label: 'Other', tokens: tokens.filter(isUnlinkedNonParty) },
  ]
  return groups.filter((group) => group.tokens.length > 0)
}

// Top-level category a token falls under (mirrors the groupTokensByCategory partition).
export function tokenCategoryKey(token: TokenRecord): TokenCategoryKey {
  if (token.party) return 'party'
  if (token.characterId) return 'characters'
  if (token.monsterId) return 'monsters'
  if (token.npcId) return 'npcs'
  return 'other'
}

// "Make group" only applies when every selected token shares one category, so the
// new group can nest cleanly under that category's block.
export function shareOneCategory(tokens: TokenRecord[]) {
  return tokens.length > 0 && new Set(tokens.map(tokenCategoryKey)).size === 1
}

// The label of the category holding the selection, for the "Make group" dialog.
export function selectedCategoryLabel(groups: TokenGroup[], selectedIds: Set<string>, sameCategory: boolean) {
  if (!sameCategory) return 'this category'
  const group = groups.find((entry) => entry.tokens.some((token) => selectedIds.has(token.id)))
  return group ? group.label : 'this category'
}

export type NamedTokenGroups = {
  named: Array<[name: string, tokens: TokenRecord[]]>
  loose: TokenRecord[]
}

// Splits a category's tokens into its named sub-groups, in first-seen order, and
// the tokens that belong to none.
export function partitionNamedGroups(tokens: TokenRecord[]): NamedTokenGroups {
  const named: NamedTokenGroups['named'] = []
  const loose: TokenRecord[] = []
  tokens.forEach((token) => {
    const name = (token.group ?? '').trim()
    if (!name) {
      loose.push(token)
      return
    }
    const existing = named.find(([key]) => key === name)
    if (existing) existing[1].push(token)
    else named.push([name, [token]])
  })
  return { named, loose }
}
