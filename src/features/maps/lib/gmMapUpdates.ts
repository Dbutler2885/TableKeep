import { TOKEN_REFERENCE_DIMENSION } from './constants'
import type { TokenRecord } from './types'

type ScaledField = 'size' | 'viewDistance'

const SCALE_FIELDS = { size: 'sizeScale', viewDistance: 'viewDistanceScale' } as const

// A token size or view distance as stored: the value and its share of the
// reference dimension.
export function scaledTokenUpdate(field: ScaledField, value: number) {
  return { [field]: value, [SCALE_FIELDS[field]]: value / TOKEN_REFERENCE_DIMENSION } as Partial<TokenRecord>
}

export function withTokenUpdate(tokens: TokenRecord[], tokenId: string, update: Partial<TokenRecord>) {
  return tokens.map((token) => (token.id === tokenId ? { ...token, ...update } : token))
}

export function nextSceneNpcIds(currentIds: string[], npcId: string, enabled: boolean) {
  if (!enabled) return currentIds.filter((id) => id !== npcId)
  return currentIds.includes(npcId) ? currentIds : [...currentIds, npcId]
}

// Paging past either end of the character sheets wraps around.
export function pagedIndex(currentIndex: number, direction: -1 | 1, count: number) {
  const from = currentIndex >= 0 ? currentIndex : 0
  return (from + direction + count) % count
}
