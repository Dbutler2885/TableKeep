import type { CSSProperties } from 'react'
import type { Role } from '../../../types/app'
import { normalizeTokenRotation } from './tokenRotation'
import { isTokenPartiallyVisibleOnFog, isTokenVisibleOnFog } from './tokenVisibility'
import type { TokenRecord } from './types'

type Position = { x: number; y: number }

export type TokenLayerKind = 'under-fog' | 'over-fog'

// Where a token is drawn: where it is being dragged, else where its move animation
// has it, else where it is stored.
export function tokenLivePosition(token: TokenRecord, dragged: Position | undefined, animated: Position | undefined) {
  const position = dragged ?? animated ?? token
  return {
    x: position.x,
    y: position.y,
    dragging: Boolean(dragged),
    animating: Boolean(animated) && !dragged,
  }
}

export function tokenPositionStyle(position: Position, color: string): CSSProperties {
  return { left: `${position.x * 100}%`, top: `${position.y * 100}%`, color }
}

export function tokenDisplayName(token: TokenRecord, index: number) {
  const name = token.name.trim()
  return name || `Token ${index + 1}`
}

export function tokenNameStyle(token: TokenRecord): CSSProperties {
  return {
    color: token.color,
    fontSize: '10px',
    transform: 'translate(-50%, 8px)',
  }
}

export function tokenGlyphStyle(token: TokenRecord): CSSProperties {
  return {
    transform: [
      `rotate(${normalizeTokenRotation(token.rotationDeg)}deg)`,
      `scale(${token.flipHorizontal ? -1 : 1}, ${token.flipVertical ? -1 : 1})`,
    ].join(' '),
  }
}

export function gmTokenNameClassName(token: TokenRecord, playerViewPreview: boolean) {
  if (playerViewPreview) {
    return token.revealName ? 'map-token-name gm-hover-only' : 'map-token-name gm-hidden'
  }
  return token.revealName ? 'map-token-name' : 'map-token-name gm-hover-only'
}

function classNames(...names: Array<string | false>) {
  return names.filter(Boolean).join(' ')
}

type GmTokenState = { dragging: boolean; animating: boolean; selected: boolean; hidden: boolean }

export function gmTokenClassName({ dragging, animating, selected, hidden }: GmTokenState) {
  return classNames('map-token', dragging && 'dragging', animating && 'animating', selected && 'selected', hidden && 'gm-hidden-token')
}

export function playerTokenClassName(animating: boolean, selected: boolean) {
  return classNames('map-token', 'player', animating && 'animating', selected && 'selected')
}

// Party tokens are drawn over the fog and everyone else under it; a hidden token,
// and every token while the GM is editing the map, is in neither player layer.
export function isInPlayerLayer(token: TokenRecord, layer: TokenLayerKind, gmEditing: boolean) {
  if (gmEditing || token.hidden) return false
  return layer === 'under-fog' ? !token.party : token.party
}

export type FogVisibility = {
  role: Role | null
  playerViewPreview: boolean
  fullyHidden: boolean
  fogCanvasRef: { current: HTMLCanvasElement | null }
}

// Whether a token's centre is in revealed fog, read from the live fog canvas.
export function isTokenShownOnFog(token: TokenRecord, fog: FogVisibility) {
  return isTokenVisibleOnFog(token, fog.role, fog.playerViewPreview, fog.fullyHidden, fog.fogCanvasRef.current)
}

// Whether any part of a token drawn at `position` is in revealed fog. The token's
// size is scaled from the map to the fog canvas before sampling.
export function isTokenPartlyShownOnFog(token: TokenRecord, position: Position, dimensions: { width: number; height: number }, fog: FogVisibility, activeMapDimension: number) {
  const fogCanvas = fog.fogCanvasRef.current
  const fogScale = fogCanvas ? fogCanvas.height / Math.max(1, activeMapDimension) : 1
  const scaledDimensions = {
    width: Math.max(2, Math.round(dimensions.width * fogScale)),
    height: Math.max(2, Math.round(dimensions.height * fogScale)),
  }
  return isTokenPartiallyVisibleOnFog(token, position, scaledDimensions, fogCanvas, fog.fullyHidden)
}
