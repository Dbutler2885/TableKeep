export type MediaSize = { width: number; height: number }
export type MediaPoint = { x: number; y: number }
export type MediaView = MediaPoint & { scale: number }
export const MIN_MEDIA_ZOOM = 0.1
export const MAX_MEDIA_ZOOM = 8
export const initialMediaView = (): MediaView => ({ scale: 1, x: 0, y: 0 })
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function fitMediaScale(content: MediaSize, viewport: MediaSize, padding = 24): number {
  if (content.width <= 0 || content.height <= 0) return 0
  return Math.max(0, Math.min((viewport.width - padding) / content.width, (viewport.height - padding) / content.height))
}

export function constrainMediaView(view: MediaView, content: MediaSize, viewport: MediaSize): MediaView {
  const scale = clamp(view.scale, MIN_MEDIA_ZOOM, MAX_MEDIA_ZOOM)
  const maxX = Math.max(0, (content.width * scale - viewport.width) / 2)
  const maxY = Math.max(0, (content.height * scale - viewport.height) / 2)
  return { scale, x: clamp(view.x, -maxX, maxX), y: clamp(view.y, -maxY, maxY) }
}

export function zoomMediaAt(view: MediaView, nextScale: number, anchor: MediaPoint, content: MediaSize, viewport: MediaSize): MediaView {
  const scale = clamp(nextScale, MIN_MEDIA_ZOOM, MAX_MEDIA_ZOOM)
  const ratio = scale / view.scale
  return constrainMediaView({ scale, x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio }, content, viewport)
}

const midpoint = (a: MediaPoint, b: MediaPoint): MediaPoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const distance = (a: MediaPoint, b: MediaPoint) => Math.hypot(a.x - b.x, a.y - b.y)

export function gestureMediaView(start: MediaView, before: MediaPoint[], after: MediaPoint[], content: MediaSize, viewport: MediaSize): MediaView {
  if (!before.length || !after.length) return start
  if (before.length < 2 || after.length < 2) {
    return constrainMediaView({ ...start, x: start.x + after[0].x - before[0].x, y: start.y + after[0].y - before[0].y }, content, viewport)
  }
  const from = midpoint(before[0], before[1])
  const to = midpoint(after[0], after[1])
  const factor = distance(after[0], after[1]) / Math.max(1, distance(before[0], before[1]))
  const zoomed = zoomMediaAt(start, start.scale * factor, from, content, viewport)
  return constrainMediaView({ ...zoomed, x: zoomed.x + to.x - from.x, y: zoomed.y + to.y - from.y }, content, viewport)
}

export function mediaWheelFactor(deltaY: number, deltaMode: number, ctrlKey: boolean, viewportHeight: number): number {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? viewportHeight : 1
  return Math.exp(-deltaY * unit * (ctrlKey ? 0.01 : 0.002))
}

// Bound raster memory during PDF zoom; the CSS viewport can still zoom further.
export function pdfRasterScale(content: MediaSize, requested: number, pixelRatio: number): number {
  return Math.min(requested, Math.sqrt(8_000_000 / (content.width * content.height)) / pixelRatio)
}
