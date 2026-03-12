import { useEffect, useRef, useState } from 'react'
import type { MouseEventHandler, TouchEventHandler, WheelEventHandler } from 'react'
import type { Role } from '../../../types/app'
import type { TokenRecord, WheelRectSnapshot } from '../lib/types'
import { MIN_MAP_ZOOM } from '../lib/constants'
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
  return Math.min(4, Math.max(MIN_MAP_ZOOM, value))
}

type UseMapViewportOptions = {
  role: Role | null
  tokens: TokenRecord[]
  fullBaseSize: { width: number; height: number }
  inlineBaseSize: { width: number; height: number }
  activeFogDimension: number
  fullScreenOpen: boolean
  fullMapLayerRef: React.RefObject<HTMLDivElement | null>
  inlineMapLayerRef: React.RefObject<HTMLDivElement | null>
  // Used in fullscreen pan guard: don't hijack left-click when GM tools are active
  fogTool: 'reveal' | 'hide' | null
  visionTool: 'draw' | 'drawFull' | 'erase' | null
  tokenPlaceMode: boolean
  annotationPlaceMode: boolean
  // Mobile: should touch events drive pan/pinch?
  isMobileZoomMapView: boolean
  // View distance scale for camera lock zoom (fog-relative)
  renderTokenViewDistance: (token: TokenRecord) => number
  // Rendered token dimensions (in current map pixels) for camera centering alignment.
  renderTokenDimensions: (token: TokenRecord) => { width: number; height: number; baseSize: number }
}

export function useMapViewport({
  role,
  tokens,
  fullBaseSize,
  inlineBaseSize,
  activeFogDimension,
  fullScreenOpen,
  fullMapLayerRef,
  inlineMapLayerRef,
  fogTool,
  visionTool,
  tokenPlaceMode,
  annotationPlaceMode,
  isMobileZoomMapView,
  renderTokenViewDistance,
  renderTokenDimensions,
}: UseMapViewportOptions) {
  // --- Fullscreen viewport state ---
  const [fullZoom, setFullZoom] = useState(1)
  const [fullPan, setFullPan] = useState({ x: 0, y: 0 })
  const [fullDragging, setFullDragging] = useState(false)

  // --- Player (inline) viewport state ---
  const [playerZoom, setPlayerZoom] = useState(1)
  const [playerPan, setPlayerPan] = useState({ x: 0, y: 0 })
  const [playerDragging, setPlayerDragging] = useState(false)
  const [cameraLock, setCameraLock] = useState(false)

  // --- Refs (kept current to avoid stale closures in RAF/event handlers) ---
  const fullZoomRef = useRef(1)
  const fullPanRef = useRef({ x: 0, y: 0 })
  const playerZoomRef = useRef(1)
  const playerPanRef = useRef({ x: 0, y: 0 })
  const fullDragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const playerDragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const fullWheelAnchorRef = useRef<{ expiresAt: number; anchor: WheelRectSnapshot | null }>({
    expiresAt: 0,
    anchor: null,
  })
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
  const fullBaseSizeRef = useRef(fullBaseSize)
  fullBaseSizeRef.current = fullBaseSize
  const inlineBaseSizeRef = useRef(inlineBaseSize)
  inlineBaseSizeRef.current = inlineBaseSize
  const renderTokenViewDistanceRef = useRef(renderTokenViewDistance)
  renderTokenViewDistanceRef.current = renderTokenViewDistance
  const renderTokenDimensionsRef = useRef(renderTokenDimensions)
  renderTokenDimensionsRef.current = renderTokenDimensions

  const averagePartyCenter = (partyTokens: TokenRecord[], mapHeightPx: number) => {
    const safeMapHeight = Math.max(1, mapHeightPx)
    const cx = partyTokens.reduce((sum, t) => sum + t.x, 0) / partyTokens.length
    const cy = partyTokens.reduce((sum, t) => {
      const dims = renderTokenDimensionsRef.current(t)
      const visualCenterY = t.y - dims.height / (2 * safeMapHeight)
      return sum + Math.max(0, Math.min(1, visualCenterY))
    }, 0) / partyTokens.length
    return { cx, cy }
  }

  // Sync state → refs (used by wheel/touch handlers that need latest value without re-render)
  useEffect(() => { playerZoomRef.current = playerZoom }, [playerZoom])
  useEffect(() => { playerPanRef.current = playerPan }, [playerPan])

  // --- Camera lock: re-center on party tokens whenever they move ---
  useEffect(() => {
    if (!cameraLock || role === 'gm') return
    const partyTokens = tokens.filter((t) => t.party && !t.hidden)
    if (partyTokens.length === 0) return
    if (fullScreenOpen) {
      const { cx, cy } = averagePartyCenter(partyTokens, fullBaseSizeRef.current.height)
      const nextPan = {
        x: fullBaseSizeRef.current.width * fullZoomRef.current * (0.5 - cx),
        y: fullBaseSizeRef.current.height * fullZoomRef.current * (0.5 - cy),
      }
      fullPanRef.current = nextPan
      setFullPan(nextPan)
    } else {
      const { cx, cy } = averagePartyCenter(partyTokens, inlineBaseSizeRef.current.height)
      const nextPan = {
        x: inlineBaseSizeRef.current.width * playerZoomRef.current * (0.5 - cx),
        y: inlineBaseSizeRef.current.height * playerZoomRef.current * (0.5 - cy),
      }
      playerPanRef.current = nextPan
      setPlayerPan(nextPan)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens, cameraLock, fullScreenOpen]) // omit zoom — only re-center on token move, not on user zoom changes

  // --- Handlers ---

  // Reset player viewport — call when switching maps.
  const resetPlayerViewport = () => {
    playerZoomRef.current = 1
    playerPanRef.current = { x: 0, y: 0 }
    setPlayerZoom(1)
    setPlayerPan({ x: 0, y: 0 })
    mobileTouchRef.current.mode = 'none'
  }

  // Reset fullscreen viewport to origin (call before opening fullscreen).
  const resetFullViewport = () => {
    fullZoomRef.current = 1
    fullPanRef.current = { x: 0, y: 0 }
    setFullZoom(1)
    setFullPan({ x: 0, y: 0 })
    setFullDragging(false)
    fullDragStartRef.current = null
  }

  const toggleCameraLock = () => {
    if (!cameraLock) {
      const partyTokens = tokens.filter((t) => t.party && !t.hidden)
      if (partyTokens.length > 0) {
        const avgViewDist =
          partyTokens.reduce((sum, t) => sum + renderTokenViewDistanceRef.current(t), 0) / partyTokens.length
        const losZoom = activeFogDimension / (2 * Math.max(1, avgViewDist))
        if (fullScreenOpen) {
          const { cx, cy } = averagePartyCenter(partyTokens, fullBaseSizeRef.current.height)
          const newZoom = fullZoom > losZoom ? losZoom : fullZoom
          const newPan = {
            x: fullBaseSizeRef.current.width * newZoom * (0.5 - cx),
            y: fullBaseSizeRef.current.height * newZoom * (0.5 - cy),
          }
          fullZoomRef.current = newZoom
          fullPanRef.current = newPan
          setFullZoom(newZoom)
          setFullPan(newPan)
        } else {
          const { cx, cy } = averagePartyCenter(partyTokens, inlineBaseSizeRef.current.height)
          const currentPlayerZoom = playerZoomRef.current
          const newZoom = currentPlayerZoom > losZoom ? losZoom : currentPlayerZoom
          const newPan = {
            x: inlineBaseSizeRef.current.width * newZoom * (0.5 - cx),
            y: inlineBaseSizeRef.current.height * newZoom * (0.5 - cy),
          }
          playerZoomRef.current = newZoom
          playerPanRef.current = newPan
          setPlayerZoom(newZoom)
          setPlayerPan(newPan)
        }
      }
      setCameraLock(true)
    } else {
      setCameraLock(false)
    }
  }

  // Fullscreen wheel zoom (cursor-centered)
  const handleFullWheel: WheelEventHandler<HTMLDivElement> = (event) => {
    const target = event.target as HTMLElement | null
    if (target?.closest('.map-annotation-popover')) return
    event.preventDefault()
    const { nextZoom, nextPan } = computeWheelZoom(
      event,
      fullZoomRef.current,
      fullPanRef.current,
      fullMapLayerRef.current,
      fullWheelAnchorRef,
    )
    fullZoomRef.current = nextZoom
    fullPanRef.current = nextPan
    setFullZoom(nextZoom)
    setFullPan(nextPan)
  }

  // Fullscreen pan: middle mouse always pans; left mouse pans when shift held or no GM tool active
  const handleFullMouseDown: MouseEventHandler<HTMLDivElement> = (event) => {
    if (event.button === 1) {
      event.preventDefault()
    } else if (
      event.button === 0 &&
      (event.shiftKey || !(role === 'gm' && (fogTool || visionTool || tokenPlaceMode || annotationPlaceMode)))
    ) {
      event.preventDefault()
    } else {
      return
    }
    setFullDragging(true)
    fullDragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: fullPan.x,
      panY: fullPan.y,
    }
  }

  const handleFullMouseMove: MouseEventHandler<HTMLDivElement> = (event) => {
    if (!fullDragging || !fullDragStartRef.current) return
    const deltaX = event.clientX - fullDragStartRef.current.x
    const deltaY = event.clientY - fullDragStartRef.current.y
    const nextPan = {
      x: fullDragStartRef.current.panX + deltaX,
      y: fullDragStartRef.current.panY + deltaY,
    }
    fullPanRef.current = nextPan
    setFullPan(nextPan)
  }

  const endFullDrag = () => {
    setFullDragging(false)
    fullDragStartRef.current = null
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
    if (role === 'gm' && !event.shiftKey) return
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

    if (role === 'gm' && (fogTool || visionTool)) return

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
    fullZoom,
    fullPan,
    fullDragging,
    playerZoom,
    playerPan,
    playerDragging,
    cameraLock,
    // Refs (needed by fog/token systems that read zoom/pan without re-rendering)
    fullZoomRef,
    fullPanRef,
    playerZoomRef,
    playerPanRef,
    fullWheelAnchorRef,
    playerWheelAnchorRef,
    // Setters exposed for callers that need direct control (animation tick, etc.)
    setFullZoom,
    setFullPan,
    setFullDragging,
    setPlayerZoom,
    setPlayerPan,
    setCameraLock,
    // Methods
    resetPlayerViewport,
    resetFullViewport,
    toggleCameraLock,
    // Handlers
    handleFullWheel,
    handleFullMouseDown,
    handleFullMouseMove,
    endFullDrag,
    handlePlayerWheel,
    handlePlayerMouseDown,
    handlePlayerMouseMove,
    endPlayerDrag,
    handleMobilePlayerTouchStart,
    handleMobilePlayerTouchMove,
    handleMobilePlayerTouchEnd,
  }
}
