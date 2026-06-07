import type { TokenRecord } from './types'
import type { Role } from '../../../types/app'

// Returns true if a token's center point is in revealed fog (alpha < 16).
// Pure function — caller passes the active fog canvas and relevant state.
export function isTokenVisibleOnFog(
  token: TokenRecord,
  role: Role | null,
  playerViewPreview: boolean,
  fullyHidden: boolean,
  fogCanvas: HTMLCanvasElement | null,
): boolean {
  if (token.hidden && (role !== 'gm' || playerViewPreview)) return false
  if (role === 'gm' && !playerViewPreview) return true
  if (token.party) return true

  if (!fogCanvas) return !fullyHidden

  const ctx = fogCanvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return true

  const x = Math.max(0, Math.min(fogCanvas.width - 1, Math.round(token.x * fogCanvas.width)))
  const y = Math.max(0, Math.min(fogCanvas.height - 1, Math.round(token.y * fogCanvas.height)))

  try {
    const alpha = ctx.getImageData(x, y, 1, 1).data[3]
    return alpha < 16
  } catch {
    return true
  }
}

// Returns true if any of the 12 sample points across the token's bounding box
// fall in revealed fog. Used for player-view layering (under/over fog).
export function isTokenPartiallyVisibleOnFog(
  token: TokenRecord,
  position: { x: number; y: number },
  tokenDimensions: { width: number; height: number },
  fogCanvas: HTMLCanvasElement | null,
  fullyHidden: boolean,
): boolean {
  if (token.hidden) return false
  if (token.party) return true
  if (!fogCanvas) return !fullyHidden

  const fogCtx = fogCanvas.getContext('2d', { willReadFrequently: true })
  if (!fogCtx) return true

  const { width, height } = tokenDimensions
  const anchorX = Math.round(position.x * fogCanvas.width)
  const anchorY = Math.round(position.y * fogCanvas.height)
  const left = anchorX - Math.round(width / 2)
  const top = anchorY - height

  const samplePoints = [
    [0.5, 0.08],
    [0.25, 0.08],
    [0.75, 0.08],
    [0.5, 0.35],
    [0.25, 0.35],
    [0.75, 0.35],
    [0.5, 0.65],
    [0.25, 0.65],
    [0.75, 0.65],
    [0.5, 0.9],
    [0.25, 0.9],
    [0.75, 0.9],
  ] as const

  try {
    for (const [sx, sy] of samplePoints) {
      const x = Math.max(0, Math.min(fogCanvas.width - 1, left + Math.round(width * sx)))
      const y = Math.max(0, Math.min(fogCanvas.height - 1, top + Math.round(height * sy)))
      const alpha = fogCtx.getImageData(x, y, 1, 1).data[3]
      if (alpha < 16) return true
    }
  } catch {
    return true
  }

  return false
}
