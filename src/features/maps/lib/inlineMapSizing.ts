import { FOG_CANVAS_MAX_DIM } from './constants'
import type { MapRecord } from './types'

export type Size = { width: number; height: number }

// The dimensions the map's tokens, grid and fog are measured against.
export function mapDimensions(baseSize: Size, fogSize: Size) {
  return {
    activeMapDimension: Math.max(1, Math.min(baseSize.width, baseSize.height)),
    activeMapWidth: baseSize.width,
    activeMapHeight: baseSize.height,
    activeFogDimension: Math.max(1, Math.min(fogSize.width, fogSize.height)),
  }
}

export type MapDimensions = ReturnType<typeof mapDimensions>

// The fog canvas keeps the source's aspect ratio, capped at FOG_CANVAS_MAX_DIM.
export function fogSizeForSource(width: number, height: number): Size {
  const fogScale = Math.min(1, FOG_CANVAS_MAX_DIM / Math.max(width, height, 1))
  return {
    width: Math.max(1, Math.round(width * fogScale)),
    height: Math.max(1, Math.round(height * fogScale)),
  }
}

export function measuredImageSize(image: HTMLImageElement): Size {
  return {
    width: Math.round(image.clientWidth || image.getBoundingClientRect().width),
    height: Math.round(image.clientHeight || image.getBoundingClientRect().height),
  }
}

// An image that has not laid out yet is measured again on a later frame, eight times at most.
export function needsAnotherFrame(size: Size, attempt: number) {
  return (size.width <= 0 || size.height <= 0) && attempt < 8
}

export function imageDisplaySize(measured: Size, image: HTMLImageElement): Size {
  return {
    width: Math.max(1, measured.width || image.naturalWidth),
    height: Math.max(1, measured.height || image.naturalHeight),
  }
}

export function isImageOfMap(image: HTMLImageElement, map: MapRecord | null) {
  return map !== null && image.dataset.mapId === map.id
}

export function isBlankMap(map: MapRecord | null): map is MapRecord {
  return map !== null && map.kind === 'blank'
}

export function sameSize(current: Size, width: number, height: number) {
  return current.width === width && current.height === height
}

function resizeCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
  if (canvas.width === width && canvas.height === height) return
  canvas.width = width
  canvas.height = height
}

// Empties the line-of-sight canvas at the given size.
export function clearLosSeenCanvas(canvas: HTMLCanvasElement | null, width: number, height: number) {
  if (!canvas || width <= 0 || height <= 0) return
  resizeCanvas(canvas, width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  ctx.clearRect(0, 0, width, height)
}
