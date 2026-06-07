import type { WheelEvent, MutableRefObject } from 'react'
import type { WheelRectSnapshot } from './types'
import { MIN_MAP_ZOOM, MAX_MAP_ZOOM } from './constants'

export function computeWheelZoom(
  event: WheelEvent<HTMLDivElement>,
  currentZoom: number,
  currentPan: { x: number; y: number },
  mapLayer: HTMLDivElement | null,
  anchorRef: MutableRefObject<{ expiresAt: number; anchor: WheelRectSnapshot | null }>,
) {
  const factor = Math.exp(-event.deltaY * 0.0015)
  const now = performance.now()
  const shouldRefreshAnchor = now > anchorRef.current.expiresAt || !anchorRef.current.anchor
  if (shouldRefreshAnchor) {
    const liveRect = mapLayer?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect()
    // Anchor wheel math to the actual transformed map layer, not the outer stage.
    // This keeps cursor-centered zoom stable across desktop/mobile layouts.
    anchorRef.current.anchor = {
      centerX: liveRect.left + liveRect.width * 0.5 - currentPan.x,
      centerY: liveRect.top + liveRect.height * 0.5 - currentPan.y,
    }
  }
  anchorRef.current.expiresAt = now + 120
  const anchor = anchorRef.current.anchor!
  const pointerX = event.clientX - anchor.centerX
  const pointerY = event.clientY - anchor.centerY
  const nextZoom = Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, currentZoom * factor))
  const mapLocalX = (pointerX - currentPan.x) / currentZoom
  const mapLocalY = (pointerY - currentPan.y) / currentZoom
  return {
    nextZoom,
    nextPan: {
      x: pointerX - mapLocalX * nextZoom,
      y: pointerY - mapLocalY * nextZoom,
    },
  }
}
