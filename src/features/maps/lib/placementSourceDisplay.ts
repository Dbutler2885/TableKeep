import type { TokenPlacementIcon, TokenPlacementSource } from './tokenPlacementQueue'

// The uploaded image a token icon shows, or '' for a pawn.
export function customTokenIconUrl(tokenIcon: TokenPlacementIcon | null | undefined) {
  return tokenIcon?.icon === 'custom' ? tokenIcon.customImageUrl ?? '' : ''
}

export function placementSourceImageUrl(source: TokenPlacementSource) {
  return source.kind === 'genericToken' ? source.imageUrl : customTokenIconUrl(source.tokenIcon)
}

export function placementSourceColor(source: TokenPlacementSource, fallbackColor: string) {
  return source.tokenIcon?.color ?? fallbackColor
}
