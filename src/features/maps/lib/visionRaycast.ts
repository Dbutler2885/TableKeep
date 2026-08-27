import type { CanvasClipRect, MapRecord } from './types'
import { blockerKindAt } from './visionBlockers'

type VisionSource = Pick<
  MapRecord,
  'id' | 'visionBlockImagePath' | 'visionBlockImageUrl' | 'visionBlockDataUrl'
>

export const visionSourceSignature = (source: VisionSource | null | undefined) => {
  const dataUrl = source?.visionBlockDataUrl ?? ''
  return [
    source?.id ?? '',
    source?.visionBlockImagePath ?? '',
    source?.visionBlockImageUrl ?? '',
    dataUrl.length,
    dataUrl.slice(0, 32),
    dataUrl.slice(-32),
  ].join(':')
}

export const visionBlockerCacheKey = (
  source: VisionSource | null | undefined,
  width: number,
  height: number,
) => `${visionSourceSignature(source)}:${width}x${height}`

export const pixelBufferHasBlockers = (data: Uint8ClampedArray) => {
  for (let index = 3; index < data.length; index += 4) {
    if ((data[index] ?? 0) > 20) return true
  }
  return false
}

export const rayCountForRadius = (radius: number) => (
  Math.max(220, Math.min(1800, Math.round(radius * 5.4)))
)

export const marchRays = ({
  data,
  width,
  height,
  originX,
  originY,
  radius,
  clip,
  onLit,
  onSurfaceHit,
}: {
  data: Uint8ClampedArray
  width: number
  height: number
  originX: number
  originY: number
  radius: number
  clip: CanvasClipRect
  onLit: (x: number, y: number) => void
  onSurfaceHit: (x: number, y: number) => void
}) => {
  if (clip.maxX < clip.minX || clip.maxY < clip.minY) return
  const rays = rayCountForRadius(radius)
  const rayStep = (Math.PI * 2) / rays
  for (let index = 0; index < rays; index += 1) {
    const angle = index * rayStep
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    for (let distance = 0; distance <= radius; distance += 1) {
      const x = Math.round(originX + cos * distance)
      const y = Math.round(originY + sin * distance)
      if (x < clip.minX || x > clip.maxX || y < clip.minY || y > clip.maxY) break
      const blockerKind = blockerKindAt(data, width, height, x - clip.minX, y - clip.minY)
      if (blockerKind !== 'none') {
        if (blockerKind === 'surface') onSurfaceHit(x, y)
        break
      }
      onLit(x, y)
    }
  }
}

export const visitRevealStroke = ({
  from,
  to,
  brushSize,
  clipRect,
  onPoint,
}: {
  from: { x: number; y: number }
  to: { x: number; y: number }
  brushSize: number
  clipRect?: CanvasClipRect | null
  onPoint: (point: { x: number; y: number }) => void
}) => {
  if (clipRect) {
    const radius = Math.max(1, brushSize / 2)
    const minX = Math.min(from.x, to.x) - radius
    const minY = Math.min(from.y, to.y) - radius
    const maxX = Math.max(from.x, to.x) + radius
    const maxY = Math.max(from.y, to.y) + radius
    if (
      maxX < clipRect.minX ||
      maxY < clipRect.minY ||
      minX > clipRect.maxX ||
      minY > clipRect.maxY
    ) return
  }

  const deltaX = to.x - from.x
  const deltaY = to.y - from.y
  const distance = Math.hypot(deltaX, deltaY)
  const step = Math.max(2, brushSize * 0.14)
  const steps = Math.max(1, Math.ceil(distance / step))
  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps
    onPoint({ x: from.x + deltaX * progress, y: from.y + deltaY * progress })
  }
}
