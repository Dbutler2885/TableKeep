import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  clearLosSeenCanvas,
  fogSizeForSource,
  imageDisplaySize,
  isBlankMap,
  isImageOfMap,
  measuredImageSize,
  needsAnotherFrame,
  sameSize,
  type Size,
} from '../lib/inlineMapSizing'
import type { MapRecord } from '../lib/types'

// The map as laid out on screen (base size) and its fog canvas (fog size), and
// whether its image has been measured.
export function useInlineMapSize() {
  const [inlineBaseSize, setInlineBaseSize] = useState<Size>({ width: 0, height: 0 })
  const [inlineFogSize, setInlineFogSize] = useState<Size>({ width: 0, height: 0 })
  const [inlineImageReady, setInlineImageReady] = useState(false)
  const inlineMapLayerRef = useRef<HTMLDivElement | null>(null)
  const inlineStageRef = useRef<HTMLDivElement | null>(null)
  const inlineLosSeenCanvasRef = useRef<HTMLCanvasElement | null>(null)
  return {
    inlineBaseSize,
    setInlineBaseSize,
    inlineFogSize,
    setInlineFogSize,
    inlineImageReady,
    setInlineImageReady,
    inlineMapLayerRef,
    inlineStageRef,
    inlineLosSeenCanvasRef,
    // A newly selected map is unmeasured until its image reports in again.
    forgetMapSize: () => {
      setInlineImageReady(false)
      setInlineFogSize({ width: 0, height: 0 })
    },
  }
}

export type InlineMapSize = ReturnType<typeof useInlineMapSize>

// The selected map, readable from callbacks that outlive the render that made them.
export function useSelectedMapRef(selectedMap: MapRecord | null) {
  const selectedMapRef = useRef<MapRecord | null>(null)
  useEffect(() => {
    selectedMapRef.current = selectedMap
  }, [selectedMap])
  return selectedMapRef
}

type SetSize = Dispatch<SetStateAction<Size>>

function observeLayerSize(layer: HTMLDivElement | null, setSize: SetSize) {
  if (!layer) return () => {}
  const updateSize = () => {
    const width = Math.max(1, Math.round(layer.clientWidth))
    const height = Math.max(1, Math.round(layer.clientHeight))
    setSize((current) => (sameSize(current, width, height) ? current : { width, height }))
  }

  updateSize()
  const observer = new ResizeObserver(() => updateSize())
  observer.observe(layer)
  const image = layer.querySelector('img')
  if (image) observer.observe(image)
  return () => observer.disconnect()
}

type MapLayerSizeOptions = {
  layerRef: { current: HTMLDivElement | null }
  setSize: SetSize
  mapId: string | undefined
  isMobile: boolean
  mobileMapView: string
  mobileGmPane: string
  mobilePlayerPane: string
}

// Follows the map layer's laid-out size, starting again whenever the layer can
// have been replaced: a new map, or a change of layout or pane.
export function useMapLayerSize({ layerRef, setSize, mapId, isMobile, mobileMapView, mobileGmPane, mobilePlayerPane }: MapLayerSizeOptions) {
  useEffect(() => {
    const cleanupInline = observeLayerSize(layerRef.current, setSize)
    return () => {
      cleanupInline()
    }
  }, [layerRef, setSize, mapId, isMobile, mobileMapView, mobileGmPane, mobilePlayerPane])
}

type InlineMapReadyOptions = {
  size: InlineMapSize
  selectedMapRef: { current: MapRecord | null }
  mapId: string | undefined
  invalidateInlineOverlayCache: () => void
}

// Measures the selected map once its image or blank surface reports in, and sizes
// the fog canvases to match. The line-of-sight canvas starts empty at that size.
export function useInlineMapReady({ size, selectedMapRef, mapId, invalidateInlineOverlayCache }: InlineMapReadyOptions) {
  const { setInlineBaseSize, setInlineFogSize, setInlineImageReady, inlineLosSeenCanvasRef } = size
  const showMapAt = useCallback((displaySize: Size, fogSize: Size) => {
    setInlineBaseSize(displaySize)
    setInlineFogSize(fogSize)
    invalidateInlineOverlayCache()
    clearLosSeenCanvas(inlineLosSeenCanvasRef.current, fogSize.width, fogSize.height)
    setInlineImageReady(true)
  }, [inlineLosSeenCanvasRef, invalidateInlineOverlayCache, setInlineBaseSize, setInlineFogSize, setInlineImageReady])

  const handleInlineImageReady = useCallback(function handleInlineImageReadyCallback(target: HTMLImageElement, attempt = 0) {
    if (!isImageOfMap(target, selectedMapRef.current)) return
    const measured = measuredImageSize(target)
    if (needsAnotherFrame(measured, attempt)) {
      window.requestAnimationFrame(() => handleInlineImageReadyCallback(target, attempt + 1))
      return
    }
    showMapAt(imageDisplaySize(measured, target), fogSizeForSource(target.naturalWidth, target.naturalHeight))
  }, [selectedMapRef, showMapAt])

  const handleInlineBlankReady = useCallback((displayWidth: number, displayHeight: number) => {
    const currentMap = selectedMapRef.current
    if (!isBlankMap(currentMap)) return
    showMapAt(
      { width: Math.max(1, Math.round(displayWidth)), height: Math.max(1, Math.round(displayHeight)) },
      fogSizeForSource(Math.max(1, currentMap.width), Math.max(1, currentMap.height)),
    )
  }, [selectedMapRef, showMapAt])

  const { width, height } = size.inlineFogSize
  useEffect(() => {
    clearLosSeenCanvas(inlineLosSeenCanvasRef.current, Math.max(1, width), Math.max(1, height))
  }, [inlineLosSeenCanvasRef, mapId, width, height])

  return { handleInlineImageReady, handleInlineBlankReady }
}
