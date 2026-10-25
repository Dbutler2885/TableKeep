import { DEFAULT_TOKEN_VIEW_DISTANCE, TOKEN_SIZE_MIN } from './constants'
import { normalizeTokenRotation } from './tokenRotation'
import type { TokenRecord } from './types'

type TokenFlag = 'party' | 'revealName' | 'hidden' | 'flipHorizontal' | 'flipVertical'

// Whether a bulk flag reads as on: every selected token has it, and there is one.
export function everyTokenHas(tokens: TokenRecord[], flag: TokenFlag) {
  return tokens.length > 0 && tokens.every((token) => token[flag])
}

function firstTokenValue<T>(tokens: TokenRecord[], pick: (token: TokenRecord) => T | null | undefined, fallback: T): T {
  return tokens.length > 0 ? pick(tokens[0]) ?? fallback : fallback
}

// The values the bulk controls show: the first selected token's.
export function bulkTokenValues(
  selected: TokenRecord[],
  fallbackColor: string,
  viewDistanceOf: (token: TokenRecord) => number,
) {
  const partyTokens = selected.filter((token) => token.party)
  return {
    partyTokens,
    size: firstTokenValue(selected, (token) => token.size, TOKEN_SIZE_MIN),
    color: firstTokenValue(selected, (token) => token.color, fallbackColor),
    rotation: normalizeTokenRotation(firstTokenValue(selected, (token) => token.rotationDeg, 0)),
    viewDistance: partyTokens.length > 0 ? viewDistanceOf(partyTokens[0]) : DEFAULT_TOKEN_VIEW_DISTANCE,
  }
}
