import { useRef } from 'react'
import type { CanvasClipRect, MapRecord } from '../lib/types'
import { floodFillSurfaceRegion } from '../lib/visionBlockers'
import { marchRays, pixelBufferHasBlockers, visionBlockerCacheKey, visitRevealStroke } from '../lib/visionRaycast'

const SURFACE_REVEAL_INTERVAL_MS = 150

export function useVisionReveal({ selectedMap, markFogLocalEdit, stampFog }: {
  selectedMap: MapRecord | null
  markFogLocalEdit: () => void
  stampFog: (canvas: HTMLCanvasElement, x: number, y: number, mode: 'reveal' | 'hide', brushSize: number) => void
}) {
  const visionBlockerCacheRef = useRef<{ canvas: HTMLCanvasElement | null; key: string; hasBlockers: boolean } | null>(null)
  // This region-sized scratch canvas is distinct from useFogTools' full-canvas
  // reveal mask. Its drawImage call relies on the clipped-region offset.
  const revealMaskCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const blockerCompositeCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const lastSurfaceRevealAtRef = useRef(0)

  const visionCanvasHasBlockers = (canvas: HTMLCanvasElement) => {
    const key = visionBlockerCacheKey(selectedMap, canvas.width, canvas.height)
    const cached = visionBlockerCacheRef.current
    if (cached?.canvas === canvas && cached.key === key) return cached.hasBlockers
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx || canvas.width <= 0 || canvas.height <= 0) {
      visionBlockerCacheRef.current = { canvas, key, hasBlockers: false }
      return false
    }
    const hasBlockers = pixelBufferHasBlockers(ctx.getImageData(0, 0, canvas.width, canvas.height).data)
    visionBlockerCacheRef.current = { canvas, key, hasBlockers }
    return hasBlockers
  }

  const revealFromTokenPoint = (fogCanvas: HTMLCanvasElement, visionCanvas: HTMLCanvasElement | null, center: { x: number; y: number }, brushSize: number, clipRect?: CanvasClipRect | null) => {
    const radius = Math.max(1, brushSize / 2)
    if (clipRect && (center.x < clipRect.minX - radius || center.x > clipRect.maxX + radius || center.y < clipRect.minY - radius || center.y > clipRect.maxY + radius)) return
    markFogLocalEdit()
    if (!visionCanvas || !visionCanvasHasBlockers(visionCanvas)) {
      stampFog(fogCanvas, center.x, center.y, 'reveal', brushSize)
      return
    }
    const fogCtx = fogCanvas.getContext('2d', { willReadFrequently: true })
    const visionCtx = visionCanvas.getContext('2d', { willReadFrequently: true })
    if (!fogCtx || !visionCtx) return
    const minX = Math.max(0, Math.floor(center.x - radius - 2))
    const minY = Math.max(0, Math.floor(center.y - radius - 2))
    const maxX = Math.min(fogCanvas.width - 1, Math.ceil(center.x + radius + 2))
    const maxY = Math.min(fogCanvas.height - 1, Math.ceil(center.y + radius + 2))
    const clippedMinX = clipRect ? Math.max(minX, clipRect.minX) : minX
    const clippedMinY = clipRect ? Math.max(minY, clipRect.minY) : minY
    const clippedMaxX = clipRect ? Math.min(maxX, clipRect.maxX) : maxX
    const clippedMaxY = clipRect ? Math.min(maxY, clipRect.maxY) : maxY
    if (clippedMaxX < clippedMinX || clippedMaxY < clippedMinY) return
    const regionWidth = Math.max(1, clippedMaxX - clippedMinX + 1)
    const regionHeight = Math.max(1, clippedMaxY - clippedMinY + 1)
    const visionData = visionCtx.getImageData(clippedMinX, clippedMinY, regionWidth, regionHeight).data
    if (!pixelBufferHasBlockers(visionData)) {
      stampFog(fogCanvas, center.x, center.y, 'reveal', brushSize)
      return
    }
    let maskCanvas = revealMaskCanvasRef.current
    if (!maskCanvas) maskCanvas = revealMaskCanvasRef.current = document.createElement('canvas')
    if (maskCanvas.width !== regionWidth || maskCanvas.height !== regionHeight) {
      maskCanvas.width = regionWidth
      maskCanvas.height = regionHeight
    }
    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })
    if (!maskCtx) return
    maskCtx.globalCompositeOperation = 'source-over'
    maskCtx.globalAlpha = 1
    maskCtx.clearRect(0, 0, regionWidth, regionHeight)
    maskCtx.fillStyle = 'rgba(0,0,0,1)'
    const dot = Math.max(1, radius * 0.03)
    const surfaceHitPoints: Array<{ x: number; y: number }> = []
    marchRays({ data: visionData, width: regionWidth, height: regionHeight, originX: center.x, originY: center.y, radius, clip: { minX: clippedMinX, minY: clippedMinY, maxX: clippedMaxX, maxY: clippedMaxY }, onLit: (x, y) => {
      maskCtx.beginPath()
      maskCtx.arc(x - clippedMinX, y - clippedMinY, dot, 0, Math.PI * 2)
      maskCtx.fill()
    }, onSurfaceHit: (x, y) => surfaceHitPoints.push({ x, y }) })
    fogCtx.save()
    fogCtx.globalCompositeOperation = 'destination-out'
    fogCtx.beginPath()
    fogCtx.arc(center.x, center.y, radius, 0, Math.PI * 2)
    fogCtx.clip()
    fogCtx.drawImage(maskCanvas, clippedMinX, clippedMinY)
    fogCtx.restore()
    const now = Date.now()
    if (surfaceHitPoints.length === 0 || now - lastSurfaceRevealAtRef.current < SURFACE_REVEAL_INTERVAL_MS) return
    lastSurfaceRevealAtRef.current = now
    let surfaceMaskCanvas = blockerCompositeCanvasRef.current
    if (!surfaceMaskCanvas) surfaceMaskCanvas = blockerCompositeCanvasRef.current = document.createElement('canvas')
    if (surfaceMaskCanvas.width !== regionWidth || surfaceMaskCanvas.height !== regionHeight) {
      surfaceMaskCanvas.width = regionWidth
      surfaceMaskCanvas.height = regionHeight
    }
    const compositeCtx = surfaceMaskCanvas.getContext('2d', { willReadFrequently: true })
    if (!compositeCtx) return
    const surfaceMask = compositeCtx.createImageData(regionWidth, regionHeight)
    floodFillSurfaceRegion({ data: visionData, width: regionWidth, height: regionHeight, seeds: surfaceHitPoints.map((hit) => ({ x: hit.x - clippedMinX, y: hit.y - clippedMinY })), onFilled: (x, y) => {
      const index = (y * regionWidth + x) * 4
      surfaceMask.data[index] = 255
      surfaceMask.data[index + 1] = 255
      surfaceMask.data[index + 2] = 255
      surfaceMask.data[index + 3] = 255
    } })
    compositeCtx.clearRect(0, 0, regionWidth, regionHeight)
    compositeCtx.putImageData(surfaceMask, 0, 0)
    fogCtx.save()
    fogCtx.globalCompositeOperation = 'destination-out'
    fogCtx.beginPath()
    fogCtx.arc(center.x, center.y, radius, 0, Math.PI * 2)
    fogCtx.clip()
    fogCtx.drawImage(surfaceMaskCanvas, clippedMinX, clippedMinY)
    fogCtx.restore()
  }

  const revealFromTokenStroke = (fogCanvas: HTMLCanvasElement, visionCanvas: HTMLCanvasElement | null, from: { x: number; y: number }, to: { x: number; y: number }, brushSize: number, clipRect?: CanvasClipRect | null) => {
    visitRevealStroke({ from, to, brushSize, clipRect, onPoint: (point) => revealFromTokenPoint(fogCanvas, visionCanvas, point, brushSize, clipRect) })
  }
  return { revealFromTokenPoint, revealFromTokenStroke }
}
