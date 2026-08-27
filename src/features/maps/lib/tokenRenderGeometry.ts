import {
  DEFAULT_TOKEN_VIEW_DISTANCE,
  TOKEN_REFERENCE_DIMENSION,
  TOKEN_RENDER_SIZE_MAX,
  TOKEN_VIEW_DISTANCE_MAX,
  TOKEN_VIEW_DISTANCE_MIN,
} from './constants'
import type { TokenRecord } from './types'

export type TokenRenderGeometryInput = Pick<
  TokenRecord,
  'size' | 'sizeScale' | 'tokenImageWidth' | 'tokenImageHeight' | 'viewDistance' | 'viewDistanceScale'
>

export const renderTokenSize = (token: TokenRenderGeometryInput, activeMapDimension: number) => {
  const scale = token.sizeScale ?? token.size / TOKEN_REFERENCE_DIMENSION
  return Math.max(10, Math.min(TOKEN_RENDER_SIZE_MAX, Math.round(scale * activeMapDimension)))
}

export const renderTokenDimensions = (token: TokenRenderGeometryInput, activeMapDimension: number) => {
  const baseSize = renderTokenSize(token, activeMapDimension)
  const rawWidth = token.tokenImageWidth > 0 ? token.tokenImageWidth : 0
  const rawHeight = token.tokenImageHeight > 0 ? token.tokenImageHeight : 0
  if (rawWidth <= 0 || rawHeight <= 0) {
    return { width: baseSize, height: baseSize, baseSize }
  }

  const ratio = rawWidth / rawHeight
  if (ratio >= 1) {
    return {
      width: baseSize,
      height: Math.max(8, Math.round(baseSize / ratio)),
      baseSize,
    }
  }
  return {
    width: Math.max(8, Math.round(baseSize * ratio)),
    height: baseSize,
    baseSize,
  }
}

export const renderTokenViewDistance = (token: TokenRenderGeometryInput, activeFogDimension: number) => {
  const fallbackScale = DEFAULT_TOKEN_VIEW_DISTANCE / TOKEN_REFERENCE_DIMENSION
  const scale = token.viewDistanceScale ?? fallbackScale
  return Math.max(TOKEN_VIEW_DISTANCE_MIN, Math.min(TOKEN_VIEW_DISTANCE_MAX, Math.round(scale * activeFogDimension)))
}

export const tokenViewDistanceSliderValue = (token: TokenRenderGeometryInput) => {
  if (typeof token.viewDistance === 'number') return token.viewDistance
  return DEFAULT_TOKEN_VIEW_DISTANCE
}
