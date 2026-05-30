import { useEffect, useRef, useState } from 'react'
import type { MouseEventHandler, TouchEventHandler, WheelEventHandler } from 'react'
import type { Role } from '../../../types/app'
import type { TokenRecord, WheelRectSnapshot } from '../lib/types'
import { MAX_MAP_ZOOM, MIN_MAP_ZOOM } from '../lib/constants'
import { computeWheelZoom } from '../lib/zoomMath'

// Private touch geometry helpers
function touchDistance(touches: React.TouchList): number {
  const a = touches[0]
  const b = touches[1]
  return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
}

function touchCenter(touches: React.TouchList): { x: number; y: number } {
  const a = touches[0]
  const b = touches[1]
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
}

function clampMobileZoom(value: number): number {
  return Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, value))
}

type UseMapViewportOptions = {
  role: Role | null
  tokens: TokenRecord[]
  inlineBaseSize: { width: number; height: number }
  activeFogDimension: number
  inlineMapLayerRef: React.RefObject<HTMLDivElement | null>
  // Used in the inline pan guard: GM tools own plain left-drag, so don't hijack it
  fogTool: 'reveal' | 'hide' | null
  visionTool: 'draw' | 'drawFull' | 'erase' | null
  tokenPlaceMode: boolean
  annotationPlaceMode: boolean
  playerLabelPlaceMode: boolean
  // Allow the GM to pan the inline stage with a plain left-drag (Map Preview).
  allowGmInlinePan: boolean
  // Mobile: should touch events drive pan/pinch?
  isMobileZoomMapView: boolean
  // View distance scale for camera lock zoom (fog-relative)
  renderTokenViewDistance: (token: TokenRecord) => number
  renderTokenDimensions: (token: TokenRecord) => { width: number; height: number; baseSize: number }
}

export function useMapViewport({
  role,
  tokens,
  inlineBaseSize,
  activeFogDimension,
  inlineMapLayerRef,
  fogTool: _fogTool,
  visionTool: _visionTool,
  tokenPlaceMode: _tokenPlaceMode,
  annotationPlaceMode: _annotationPlaceMode,
  playerLabelPlaceMode: _playerLabelPlaceMode,
  allowGmInlinePan,
  isMobileZoomMapView,
  renderTokenViewDistance,
  renderTokenDimensions,
}: UseMapViewportOptions) {
  // --- Player (inline) viewport state ---
  const [playerZoom, setPlayerZoom] = useState(1)
  const [playerPan, setPlayerPan] = useState({ x: 0, y: 0 })
  const [playerDragging, setPlayerDragging] = useState(false)
  const [cameraLock, setCameraLock] = useState(false)

  // --- Refs (kept current to avoid stale closures in RAF/event handlers) ---
  const playerZoomRef = useRef(1)
  const playerPanRef = useRef({ x: 0, y: 0 })
  const playerDragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const playerWheelAnchorRef = useRef<{ expiresAt: number; anchor: WheelRectSnapshot | null }>({
    expiresAt: 0,
    anchor: null,
  })
  const mobileTouchRef = useRef<{
    mode: 'none' | 'pan' | 'pinch'
    startZoom: number
    startDistance: number
    startPan: { x: number; y: number }
    startCenter: { x: number; y: number }
  }>({
    mode: 'none',
    startZoom: 1,
    startDistance: 0,
    startPan: { x: 0, y: 0 },
    startCenter: { x: 0, y: 0 },
  })

  // Keep option refs current so camera-lock effect always reads latest layout sizes.
  const inlineBaseSizeRef = useRef(inlineBaseSize)
  inlineBaseSizeRef.current = inlineBaseSize
  const renderTokenViewDistanceRef = useRef(renderTokenViewDistance)
  renderTokenViewDistanceRef.current = renderTokenViewDistance
  const renderTokenDimensionsRef = useRef(renderTokenDimensions)
  renderTokenDimensionsRef.current = renderTokenDimensions

  const getPartyAnchorDelta = (
    partyTokens: TokenRecord[],
    stage: HTMLDivElement | null,
    mapLayer: HTMLDivElement | null,
  ) => {
    if (!stage || !mapLayer) return null
    const stageRect = stage.getBoundingClientRect()
    const mapRect = mapLayer.getBoundingClientRect()
    if (stageRect.width <= 0 || stageRect.height <= 0 || mapRect.width <= 0 || mapRect.height <= 0) return null
    const safeMapHeight = Math.max(1, mapRect.height)
    const centerX = partyTokens.reduce((sum, t) => sum + (mapRect.left + t.x * mapRect.width), 0) / partyTokens.length
    const centerY = partyTokens.reduce((sum, t) => {
      const dims = renderTokenDimensionsRef.current(t)
      const visualCenterY = mapRect.top + t.y * mapRect.height - dims.height / 2
      return sum + visualCenterY
    }, 0) / partyTokens.length
    return {
      x: stageRect.left + stageRect.width / 2 - centerX,
      y: stageRect.top + stageRect.height / 2 - Math.max(mapRect.top, Math.min(mapRect.top + safeMapHeight, centerY)),
    }
  }

  // Sync state → refs (used by wheel/touch handlers that need latest value without re-render)
  useEffect(() => { playerZoomRef.current = playerZoom }, [playerZoom])
  useEffect(() => { playerPanRef.current = playerPan }, [playerPan])

  // --- Camera lock: re-center on party tokens whenever they move ---
  useEffect(() => {
    if (!cameraLock || role === 'gm') return
    const partyTokens = tokens.filter((t) => t.party && !t.hidden)
    if (partyTokens.length === 0) return
    const delta = getPartyAnchorDelta(partyTokens, inlineMapLayerRef.current?.parentElement as HTMLDivElement | null, inlineMapLayerRef.current)
    if (!delta) return
    const nextPan = {
      x: playerPanRef.current.x + delta.x,
      y: playerPanRef.current.y + delta.y,
    }
    playerPanRef.current = nextPan
    setPlayerPan(nextPan)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens, cameraLock])

  // --- Handlers ---

  // Reset player viewport — call when switching maps.
  const resetPlayerViewport = () => {
    playerZoomRef.current = 1
    playerPanRef.current = { x: 0, y: 0 }
    setPlayerZoom(1)
    setPlayerPan({ x: 0, y: 0 })
    mobileTouchRef.current.mode = 'none'
  }

  const toggleCameraLock = () => {
    if (!cameraLock) {
      const partyTokens = tokens.filter((t) => t.party && !t.hidden)
      if (partyTokens.length > 0) {
        const avgViewDist =
          partyTokens.reduce((sum, t) => sum + renderTokenViewDistanceRef.current(t), 0) / partyTokens.length
        const losZoom = activeFogDimension / (2 * Math.max(1, avgViewDist))
        const currentPlayerZoom = playerZoomRef.current
        const newZoom = currentPlayerZoom > losZoom ? losZoom : currentPlayerZoom
        playerZoomRef.current = newZoom
        setPlayerZoom(newZoom)
        requestAnimationFrame(() => {
          const delta = getPartyAnchorDelta(
            partyTokens,
            inlineMapLayerRef.current?.parentElement as HTMLDivElement | null,
            inlineMapLayerRef.current,
          )
          if (!delta) return
          const nextPan = {
            x: playerPanRef.current.x + delta.x,
            y: playerPanRef.current.y + delta.y,
          }
          playerPanRef.current = nextPan
          setPlayerPan(nextPan)
        })
      }
      setCameraLock(true)
    } else {
      setCameraLock(false)
    }
  }

  // Player (inline) wheel zoom
  const handlePlayerWheel: WheelEventHandler<HTMLDivElement> = (event) => {
    const target = event.target as HTMLElement | null
    if (target?.closest('.map-annotation-popover')) return
    event.preventDefault()
    const { nextZoom, nextPan } = computeWheelZoom(
      event,
      playerZoomRef.current,
      playerPanRef.current,
      inlineMapLayerRef.current,
      playerWheelAnchorRef,
    )
    playerZoomRef.current = nextZoom
    playerPanRef.current = nextPan
    setPlayerZoom(nextZoom)
    setPlayerPan(nextPan)
  }

  const handlePlayerMouseDown: MouseEventHandler<HTMLDivElement> = (event) => {
    if (event.button !== 0) return
    if (role === 'gm' && !event.shiftKey && !allowGmInlinePan) return
    if (!event.shiftKey && playerZoom <= 1) return
    event.preventDefault()
    setPlayerDragging(true)
    playerDragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: playerPan.x,
      panY: playerPan.y,
    }
  }

  const handlePlayerMouseMove: MouseEventHandler<HTMLDivElement> = (event) => {
    if (!playerDragging || !playerDragStartRef.current) return
    const deltaX = event.clientX - playerDragStartRef.current.x
    const deltaY = event.clientY - playerDragStartRef.current.y
    const nextPan = {
      x: playerDragStartRef.current.panX + deltaX,
      y: playerDragStartRef.current.panY + deltaY,
    }
    playerPanRef.current = nextPan
    setPlayerPan(nextPan)
  }

  const endPlayerDrag = () => {
    setPlayerDragging(false)
    playerDragStartRef.current = null
  }

  // Mobile touch handlers (pinch-to-zoom + single-finger pan)
  const handleMobilePlayerTouchStart: TouchEventHandler<HTMLDivElement> = (event) => {
    if (!isMobileZoomMapView) return

    if (event.touches.length === 2) {
      const center = touchCenter(event.touches)
      mobileTouchRef.current = {
        mode: 'pinch',
        startZoom: playerZoomRef.current,
        startDistance: touchDistance(event.touches),
        startPan: playerPanRef.current,
        startCenter: center,
      }
      return
    }

    if (role === 'gm' && (_fogTool || _visionTool)) return

    if (event.touches.length === 1 && playerZoom > 1) {
      const touch = event.touches[0]
      mobileTouchRef.current = {
        mode: 'pan',
        startZoom: playerZoomRef.current,
        startDistance: 0,
        startPan: playerPanRef.current,
        startCenter: { x: touch.clientX, y: touch.clientY },
      }
    }
  }

  const handleMobilePlayerTouchMove: TouchEventHandler<HTMLDivElement> = (event) => {
    if (!isMobileZoomMapView) return
    if (event.touches.length === 0) return

    if (mobileTouchRef.current.mode === 'pinch' && event.touches.length >= 2) {
      event.preventDefault()
      const currentDistance = touchDistance(event.touches)
      const scale = currentDistance / Math.max(1, mobileTouchRef.current.startDistance)
      const nextZoom = clampMobileZoom(mobileTouchRef.current.startZoom * scale)
      const center = touchCenter(event.touches)
      const deltaCenter = {
        x: center.x - mobileTouchRef.current.startCenter.x,
        y: center.y - mobileTouchRef.current.startCenter.y,
      }
      const nextPan = {
        x: mobileTouchRef.current.startPan.x + deltaCenter.x,
        y: mobileTouchRef.current.startPan.y + deltaCenter.y,
      }
      playerZoomRef.current = nextZoom
      playerPanRef.current = nextPan
      setPlayerZoom(nextZoom)
      setPlayerPan(nextPan)
      return
    }

    if (mobileTouchRef.current.mode === 'pan' && event.touches.length === 1) {
      event.preventDefault()
      const touch = event.touches[0]
      const delta = {
        x: touch.clientX - mobileTouchRef.current.startCenter.x,
        y: touch.clientY - mobileTouchRef.current.startCenter.y,
      }
      const nextPan = {
        x: mobileTouchRef.current.startPan.x + delta.x,
        y: mobileTouchRef.current.startPan.y + delta.y,
      }
      playerPanRef.current = nextPan
      setPlayerPan(nextPan)
    }
  }

  const handleMobilePlayerTouchEnd: TouchEventHandler<HTMLDivElement> = (event) => {
    if (!isMobileZoomMapView) return

    if (event.touches.length === 0) {
      mobileTouchRef.current.mode = 'none'
      if (playerZoomRef.current <= MIN_MAP_ZOOM) {
        playerPanRef.current = { x: 0, y: 0 }
        setPlayerPan({ x: 0, y: 0 })
      }
      return
    }

    if (event.touches.length === 1 && playerZoomRef.current > 1) {
      const touch = event.touches[0]
      mobileTouchRef.current = {
        mode: 'pan',
        startZoom: playerZoomRef.current,
        startDistance: 0,
        startPan: playerPanRef.current,
        startCenter: { x: touch.clientX, y: touch.clientY },
      }
    }
  }

  return {
    // State
    playerZoom,
    playerPan,
    playerDragging,
    cameraLock,
    // Refs (needed by fog/token systems that read zoom/pan without re-rendering)
    playerZoomRef,
    playerPanRef,
    playerWheelAnchorRef,
    // Setters exposed for callers that need direct control (animation tick, etc.)
    setPlayerZoom,
    setPlayerPan,
    setCameraLock,
    // Methods
    resetPlayerViewport,
    toggleCameraLock,
    // Handlers
    handlePlayerWheel,
    handlePlayerMouseDown,
    handlePlayerMouseMove,
    endPlayerDrag,
    handleMobilePlayerTouchStart,
    handleMobilePlayerTouchMove,
    handleMobilePlayerTouchEnd,
  }
}
