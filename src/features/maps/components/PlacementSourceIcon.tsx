import { ChessPawn } from 'lucide-react'
import { placementSourceColor, placementSourceImageUrl } from '../lib/placementSourceDisplay'
import type { TokenPlacementSource } from '../lib/tokenPlacementQueue'

// A placement source's token, as its image or as a pawn in its colour.
export function PlacementSourceIcon({ source, fallbackColor }: { source: TokenPlacementSource; fallbackColor: string }) {
  const imageUrl = placementSourceImageUrl(source)
  return (
    <span className="token-row-icon" style={{ color: placementSourceColor(source, fallbackColor) }} aria-hidden>
      {imageUrl ? <img src={imageUrl} alt="" className="token-row-image" /> : <ChessPawn size={14} />}
    </span>
  )
}
