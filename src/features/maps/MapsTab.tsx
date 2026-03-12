import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChangeEventHandler,
  MouseEventHandler,
  SyntheticEvent,
} from 'react'
import {
  ALargeSmall,
  Check,
  Binoculars,
  ChessPawn,
  ChevronLeft,
  Circle,
  Dice1,
  Dice2,
  Dice3,
  Dice4,
  Dice5,
  Dice6,
  Eraser,
  Eye,
  EyeOff,
  Flag,
  Grid3X3,
  Hexagon,
  LoaderCircle,
  Map,
  Minus,
  Pencil,
  PenTool,
  Plus,
  Ruler,
  SquareDashedMousePointer,
  SlidersHorizontal,
  SprayCan,
  Tag,
  Trash2,
  TvMinimalPlay,
  Upload,
  User,
  X,
} from 'lucide-react'
import type { Role } from '../../types/app'
import { TokenIconEditor, type TokenIconConfig } from '../tokens/TokenIconEditor'
import { ConfirmModal } from '../common/ConfirmModal'
import { IconValueSlider } from '../common/IconValueSlider'
import type {
  CanvasClipRect,
  MonsterSummary,
  TokenAssetRecord,
  TokenPathAnimation,
  TokenRecord,
  Waypoint,
} from './lib/types'
import {
  DEFAULT_TOKEN_VIEW_DISTANCE,
  ENCOUNTER_CHECK_DISTANCE_FEET,
  ENCOUNTER_CHECK_TURNS,
  FOG_CANVAS_MAX_DIM,
  TOKEN_REFERENCE_DIMENSION,
  TOKEN_RENDER_SIZE_MAX,
  TOKEN_SIZE_MAX,
  TOKEN_VIEW_DISTANCE_MAX,
  TOKEN_VIEW_DISTANCE_MIN,
} from './lib/constants'
import { isTokenVisibleOnFog, isTokenPartiallyVisibleOnFog } from './lib/tokenVisibility'
import { GridOverlay } from './components/GridOverlay'
import { ModeConfirmAction } from './components/ModeConfirmAction'
import { PlayerMapControls } from './components/PlayerMapControls'
import { TokenLayer } from './components/TokenLayer'
import { AnnotationLayer } from './components/AnnotationLayer'
import { InlineMapStage } from './components/InlineMapStage'
import { FullscreenMapStage } from './components/FullscreenMapStage'
import { MOBILE_BREAKPOINT } from '../../constants/layout'
import { useGridTools } from './hooks/useGridTools'
import { useMapData } from './hooks/useMapData'
import { useMapViewport } from './hooks/useMapViewport'
import { useFogTools } from './hooks/useFogTools'
import { useTokenSelection } from './hooks/useTokenSelection'
import { useTokenAnimation } from './hooks/useTokenAnimation'
import { useTokenDrag } from './hooks/useTokenDrag'
import { useEncounterTracking } from './hooks/useEncounterTracking'
import { useTokenAssets } from './hooks/useTokenAssets'

const SURFACE_REVEAL_INTERVAL_MS = 150

export function MapsTab({ campaignId, role }: { campaignId: string; role: Role | null }) {
  const [selectedMapId, setSelectedMapId] = useState('')
  const [isMobile, setIsMobile] = useState<boolean>(() => window.innerWidth <= MOBILE_BREAKPOINT)
  const [mobileMapView, setMobileMapView] = useState<'list' | 'detail'>('list')
  const [mobileGmPane, setMobileGmPane] = useState<'map' | 'controls'>('map')
  const [mobilePlayerPane, setMobilePlayerPane] = useState<'map' | 'controls'>('map')
  const [fullScreenOpen, setFullScreenOpen] = useState(false)
  const [fogTool, setFogTool] = useState<'reveal' | 'hide' | null>(null)
  const [visionTool, setVisionTool] = useState<'draw' | 'drawFull' | 'erase' | null>(null)
  const [fogBrushSize, setFogBrushSize] = useState(120)
  const fogBrushStrength = 0.7
  const [streamingMode, setStreamingMode] = useState(false)
  const [tokenPlaceMode, setTokenPlaceMode] = useState(false)
  const [tokenSelectMode, setTokenSelectMode] = useState(false)
  const [annotationPlaceMode, setAnnotationPlaceMode] = useState(false)
  const [tokenColor, setTokenColor] = useState('#b45309')
  const [tokenSize, setTokenSize] = useState(28)
  const [inlineBaseSize, setInlineBaseSize] = useState({ width: 0, height: 0 })
  const [fullBaseSize, setFullBaseSize] = useState({ width: 0, height: 0 })
  const [inlineFogSize, setInlineFogSize] = useState({ width: 0, height: 0 })
  const [fullFogSize, setFullFogSize] = useState({ width: 0, height: 0 })
  const [inlineImageReady, setInlineImageReady] = useState(false)
  const [fullImageReady, setFullImageReady] = useState(false)
  const fullStageRef = useRef<HTMLDivElement | null>(null)
  const inlineMapLayerRef = useRef<HTMLDivElement | null>(null)
  const inlineStageRef = useRef<HTMLDivElement | null>(null)
  const fullMapLayerRef = useRef<HTMLDivElement | null>(null)
  const suppressNextMapClickRef = useRef(false)
  const revealMaskCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const blockerCompositeCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const lastSurfaceRevealAtRef = useRef(0)
  const inlineLosSeenCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const fullLosSeenCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const tokenAnimationsRef = useRef<Record<string, TokenPathAnimation>>({})
  const pendingFogReloadRef = useRef(false)
  // Stable refs used to break circular deps. These are kept in sync with the
  // values produced by useFogTools / useTokenAnimation each render, allowing
  // useMapData (called later in the same render) to receive the same objects
  // that those hooks write into — so async subscription callbacks in useMapData
  // always call the current implementations.
  const getDropPointRef = useRef<((clientX: number, clientY: number) => { x: number; y: number } | null)>(() => null)
  const tokensRef = useRef<TokenRecord[]>([])
  const recentlyDroppedRef = useRef(new Set<string>())
  const lastAnimatedPathIdRef = useRef<Record<string, string>>({})
  const startTokenPathAnimationRef = useRef<(
    tokenId: string,
    fromPos: { x: number; y: number },
    path: Waypoint[],
    token: TokenRecord,
  ) => void>(() => { })

  useEffect(() => {
    const updateMobileState = () => {
      const mobile = window.innerWidth <= MOBILE_BREAKPOINT
      setIsMobile(mobile)
      if (!mobile) {
        setMobileMapView('list')
        setMobileGmPane('map')
      }
    }

    updateMobileState()
    window.addEventListener('resize', updateMobileState)
    return () => window.removeEventListener('resize', updateMobileState)
  }, [])

  const showListPane = !isMobile || mobileMapView === 'list'
  const showMapPane = !isMobile || mobileMapView === 'detail'
  const fogDisplayOpacity = role === 'gm' ? (streamingMode ? 1 : 0.45) : 1
  const visionOverlayOpacity = role === 'gm' && !streamingMode ? 0.8 : 0
  const losSeenOverlayOpacity = role === 'gm' && !streamingMode ? 0.75 : 0
  const usingFullScreenCanvas = fullScreenOpen && !isMobile
  const activeMapLayerRef = usingFullScreenCanvas ? fullMapLayerRef : inlineMapLayerRef
  const activeMapDimension = Math.max(
    1,
    Math.min(
      usingFullScreenCanvas ? fullBaseSize.width : inlineBaseSize.width,
      usingFullScreenCanvas ? fullBaseSize.height : inlineBaseSize.height,
    ),
  )
  const activeMapWidth = usingFullScreenCanvas ? fullBaseSize.width : inlineBaseSize.width
  const activeMapHeight = usingFullScreenCanvas ? fullBaseSize.height : inlineBaseSize.height
  const activeFogDimension = Math.max(
    1,
    Math.min(
      usingFullScreenCanvas ? fullFogSize.width : inlineFogSize.width,
      usingFullScreenCanvas ? fullFogSize.height : inlineFogSize.height,
    ),
  )
  const {
    maps,
    setMaps,
    mapsLoading,
    mapError,
    setMapError,
    uploading,
    editingMapId,
    editName,
    setEditName,
    deleteCandidate,
    setDeleteCandidate,
    deletingMapId,
    draggingMapId,
    setDraggingMapId,
    dragOverMapId,
    setDragOverMapId,
    tokens,
    setTokens,
    annotations,
    activeAnnotationId,
    setActiveAnnotationId,
    activeAnnotationDraft,
    setActiveAnnotationDraft,
    tokenDeleteCandidate,
    setTokenDeleteCandidate,
    deletingTokenId,
    mapMonsters,
    tokenAssets,
    selectedTokenAssetId,
    setSelectedTokenAssetId,
    selectedTokenAsset,
    tokenAssetDeleteCandidate,
    setTokenAssetDeleteCandidate,
    deletingTokenAssetId,
    visibleMaps,
    selectedMap,
    handleMapUpload: mapDataUpload,
    startRename,
    saveRename,
    deleteMap,
    togglePlayerVisibility,
    handleDragStart,
    handleDrop,
    updateToken,
    requestDeleteToken,
    confirmDeleteToken,
    toggleTokenHidden,
    placeToken,
    placeAnnotation,
    commitActiveAnnotation,
    deleteAnnotation,
    saveTokenAssetFile,
    archiveTokenAsset,
    requestDeleteTokenAsset,
    confirmDeleteTokenAsset,
  } = useMapData({
    campaignId,
    role,
    selectedMapId,
    setSelectedMapId,
    getDropPoint: (clientX, clientY) => getDropPointRef.current(clientX, clientY),
    tokenColor,
    tokenSize,
    tokensRef,
    recentlyDroppedRef,
    lastAnimatedPathIdRef,
    startTokenPathAnimationRef,
  })

  useEffect(() => {
    const syncLayerSize = (
      layer: HTMLDivElement | null,
      setSize: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>,
    ) => {
      if (!layer) return () => {}
      const updateSize = () => {
        const width = Math.max(1, Math.round(layer.clientWidth))
        const height = Math.max(1, Math.round(layer.clientHeight))
        setSize((current) => (
          current.width === width && current.height === height
            ? current
            : { width, height }
        ))
      }

      updateSize()
      const observer = new ResizeObserver(() => updateSize())
      observer.observe(layer)
      const image = layer.querySelector('img')
      if (image) observer.observe(image)
      return () => observer.disconnect()
    }

    const cleanupInline = syncLayerSize(inlineMapLayerRef.current, setInlineBaseSize)
    const cleanupFull = syncLayerSize(fullMapLayerRef.current, setFullBaseSize)
    return () => {
      cleanupInline()
      cleanupFull()
    }
  }, [
    selectedMap?.id,
    fullScreenOpen,
    isMobile,
    mobileMapView,
    mobileGmPane,
    mobilePlayerPane,
  ])

  const handleMapUpload: ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''
    void mapDataUpload(file)
  }

  const tokenSelection = useTokenSelection({ role, tokens, selectedMapId })
  const {
    selectedTokenIds,
    setSelectedTokenIds,
    playerSelectedTokenIds,
    tokenSelectionBox,
    setTokenSelectionBox,
    togglePlayerTokenSelection,
  } = tokenSelection

  const fog = useFogTools({
    campaignId,
    role,
    selectedMap,
    setMapError,
    usingFullScreenCanvas,
    fullScreenOpen,
    isMobile,
    mobileGmPane,
    mobilePlayerPane,
    inlineFogSize,
    fullFogSize,
    fogTool,
    visionTool,
    tokenPlaceMode,
    fogBrushSize,
    activeFogDimension,
    fogBrushStrength,
    tokenAnimationsRef,
    pendingFogReloadRef,
  })
  const {
    setFogDrawing,
    inlineFogReady,
    fullFogReady,
    inlineFogCanvasRef,
    fullFogCanvasRef,
    inlineVisionCanvasRef,
    fullVisionCanvasRef,
    activeFogCanvasRef,
    activeVisionCanvasRef,
    persistFog,
    applyFogPreset,
    bumpFogSampleTick,
    stampFog,
    handleFogPointerDown,
    handleFogPointerMove,
    handleFogPointerUp,
    handleFogTouchStart,
    handleFogTouchMove,
    handleFogTouchEnd,
    invalidateInlineOverlayCache,
    invalidateFullFogCache,
    invalidateFullVisionCache,
  } = fog

  const {
    distanceTrackerFeet,
    distanceTrackerMode,
    distanceTrackerRoll,
    encounterNotice,
    dismissEncounterNotice,
    onMovementFeet,
    resetDistanceTracker,
  } = useEncounterTracking()

  const getTokenDropPoint = (clientX: number, clientY: number) => {
    const canvas = activeFogCanvasRef.current
    if (canvas) {
      const rect = canvas.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0 && canvas.width > 0 && canvas.height > 0) {
        const scaleX = canvas.width / rect.width
        const scaleY = canvas.height / rect.height
        const canvasX = (clientX - rect.left) * scaleX
        const canvasY = (clientY - rect.top) * scaleY
        return {
          x: Math.max(0, Math.min(1, canvasX / canvas.width)),
          y: Math.max(0, Math.min(1, canvasY / canvas.height)),
        }
      }
    }

    const layer = activeMapLayerRef.current
    if (!layer) return null
    const rect = layer.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    const x = (clientX - rect.left) / rect.width
    const y = (clientY - rect.top) / rect.height
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    }
  }

  // Keep getDropPointRef in sync so useMapData (called below) can use it.
  getDropPointRef.current = getTokenDropPoint

  const grid = useGridTools({
    selectedMap,
    role,
    campaignId,
    activeMapWidth,
    activeMapHeight,
    activeMapDimension,
    fullBaseSize,
    inlineBaseSize,
    setMaps,
    setMapError,
    getTokenDropPoint,
    resetDistanceTracker,
  })

  const {
    gridCalibrateMode,
    gridAdjustMode,
    gridAdjustDraft,
    gridCalibrateStart,
    gridCalibrateEnd,
    gridCalibratePreview,
    gridCalibrateSavedAt,
    gridAdjustSavedAt,
    gridCalibratePulse,
    hexDetecting,
    hexDetectConfidence,
    effectiveGridEnabled,
    effectiveGridVisible,
    effectiveGridCellScale,
    effectiveGridOffsetX,
    effectiveGridOffsetY,
    effectiveGridType,
    toggleGridCalibrateMode,
    toggleGridVisibility,
    setGridType,
    applyGridAdjust,
    applyGridCalibration,
    resetGrid,
    handleGridLayerWheel,
    handleGridLayerMouseDown,
    handleGridCalibrateClick,
    handleGridCalibrateMouseMove,
    handleGridCalibrateHandleMouseDown,
  } = grid

  const activeGridCellPx = Math.max(
    8,
    Math.min(520, Math.round(effectiveGridCellScale * activeMapDimension)),
  )

  const renderMapGridOverlay = (usingFull: boolean) => (
    <GridOverlay
      enabled={effectiveGridEnabled}
      visible={effectiveGridVisible}
      type={effectiveGridType}
      pending={gridAdjustMode}
      cellScale={effectiveGridCellScale}
      offsetX={effectiveGridOffsetX}
      offsetY={effectiveGridOffsetY}
      mapWidth={Math.max(1, usingFull ? fullBaseSize.width : inlineBaseSize.width)}
      mapHeight={Math.max(1, usingFull ? fullBaseSize.height : inlineBaseSize.height)}
    />
  )
  const activeAnnotation = annotations.find((annotation) => annotation.id === activeAnnotationId) ?? null
  const gridAdjustReady = Boolean(
    selectedMap &&
    gridAdjustDraft &&
    (
      selectedMap.gridEnabled !== gridAdjustDraft.gridEnabled ||
      selectedMap.gridVisible !== gridAdjustDraft.gridVisible ||
      Math.abs(selectedMap.gridCellScale - gridAdjustDraft.gridCellScale) > 0.000001 ||
      Math.abs(selectedMap.gridOffsetX - gridAdjustDraft.gridOffsetX) > 0.000001 ||
      Math.abs(selectedMap.gridOffsetY - gridAdjustDraft.gridOffsetY) > 0.000001 ||
      selectedMap.gridType !== gridAdjustDraft.gridType
    ),
  )
  const selectionRectStyle = useMemo<React.CSSProperties | null>(() => {
    if (!tokenSelectionBox) return null
    const minX = Math.min(tokenSelectionBox.start.x, tokenSelectionBox.end.x)
    const minY = Math.min(tokenSelectionBox.start.y, tokenSelectionBox.end.y)
    const maxX = Math.max(tokenSelectionBox.start.x, tokenSelectionBox.end.x)
    const maxY = Math.max(tokenSelectionBox.start.y, tokenSelectionBox.end.y)
    return {
      left: `${minX * 100}%`,
      top: `${minY * 100}%`,
      width: `${(maxX - minX) * 100}%`,
      height: `${(maxY - minY) * 100}%`,
    }
  }, [tokenSelectionBox])
  const gridCalibrationLine = useMemo(() => {
    if (!gridCalibrateMode || !gridCalibrateStart) return null
    const end = gridCalibrateEnd ?? gridCalibratePreview
    if (!end) return null
    return { start: gridCalibrateStart, end }
  }, [gridCalibrateEnd, gridCalibrateMode, gridCalibratePreview, gridCalibrateStart])

  const gmTokenNameClassName = (token: TokenRecord) => {
    if (streamingMode) {
      return token.revealName ? 'map-token-name gm-hover-only' : 'map-token-name gm-hidden'
    }
    return token.revealName ? 'map-token-name' : 'map-token-name gm-hover-only'
  }

  const isMobileZoomMapView = isMobile && (role !== 'gm' || mobileGmPane === 'map')
  const isPlayerMapView = role !== 'gm'

  const renderTokenSize = (token: TokenRecord) => {
    const scale = token.sizeScale ?? token.size / TOKEN_REFERENCE_DIMENSION
    return Math.max(10, Math.min(TOKEN_RENDER_SIZE_MAX, Math.round(scale * activeMapDimension)))
  }
  const renderTokenDimensions = (token: TokenRecord) => {
    const baseSize = renderTokenSize(token)
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
  const renderTokenViewDistance = (token: TokenRecord) => {
    const fallbackScale = DEFAULT_TOKEN_VIEW_DISTANCE / TOKEN_REFERENCE_DIMENSION
    const scale = token.viewDistanceScale ?? fallbackScale
    return Math.max(TOKEN_VIEW_DISTANCE_MIN, Math.min(TOKEN_VIEW_DISTANCE_MAX, Math.round(scale * activeFogDimension)))
  }
  const tokenViewDistanceSliderValue = (token: TokenRecord) => {
    if (typeof token.viewDistance === 'number') return token.viewDistance
    return DEFAULT_TOKEN_VIEW_DISTANCE
  }

  const viewport = useMapViewport({
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
  })

  const {
    fullZoom,
    fullPan,
    fullDragging,
    playerZoom,
    playerPan,
    playerDragging,
    cameraLock,
    fullPanRef,
    playerPanRef,
    toggleCameraLock,
    resetFullViewport,
    resetPlayerViewport,
    setFullPan,
    setPlayerPan,
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
  } = viewport
  const isTokenPartiallyVisibleForPlayer = (
    token: TokenRecord,
    position: { x: number; y: number },
    fogCanvas: HTMLCanvasElement | null,
  ) => {
    const dimensions = renderTokenDimensions(token)
    const fogScale = fogCanvas ? fogCanvas.height / Math.max(1, activeMapDimension) : 1
    const scaledDimensions = {
      width: Math.max(2, Math.round(dimensions.width * fogScale)),
      height: Math.max(2, Math.round(dimensions.height * fogScale)),
    }
    return isTokenPartiallyVisibleOnFog(
      token,
      position,
      scaledDimensions,
      fogCanvas,
      selectedMap?.fullyHidden ?? true,
    )
  }
  const renderTokenNameStyle = (token: TokenRecord): React.CSSProperties => {
    return {
      color: token.color,
      fontSize: '10px',
      transform: 'translate(-50%, 8px)',
    }
  }
  const autosizeAnnotationTextarea = useCallback((textarea: HTMLTextAreaElement | null) => {
    if (!textarea) return
    textarea.style.width = 'auto'
    textarea.style.height = 'auto'

    const viewportWidth = Math.max(window.innerWidth, 320)
    const viewportHeight = Math.max(window.innerHeight, 320)
    const minWidth = 168
    const maxWidth = Math.min(420, Math.floor(viewportWidth * 0.56))
    const nextWidth = Math.min(maxWidth, Math.max(minWidth, Math.ceil(textarea.scrollWidth) + 2))
    textarea.style.width = `${nextWidth}px`

    const minHeight = 56
    const maxHeight = Math.min(280, Math.floor(viewportHeight * 0.5))
    const nextHeight = Math.min(maxHeight, Math.max(minHeight, Math.ceil(textarea.scrollHeight) + 2))
    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [])

  const isTokenVisible = (token: TokenRecord) =>
    isTokenVisibleOnFog(
      token,
      role,
      streamingMode,
      selectedMap?.fullyHidden ?? true,
      activeFogCanvasRef.current,
    )

  const selectMap = (mapId: string) => {
    setInlineImageReady(false)
    setFullImageReady(false)
    setInlineFogSize({ width: 0, height: 0 })
    setFullFogSize({ width: 0, height: 0 })
    setSelectedMapId(mapId)
    resetPlayerViewport()
    if (isMobile) {
      setMobileMapView('detail')
      if (role === 'gm') {
        setMobileGmPane('map')
      } else {
        setMobilePlayerPane('map')
      }
    }
  }

  const openFullScreen = () => {
    resetFullViewport()
    setFogDrawing(false)
    invalidateFullFogCache()
    setFullScreenOpen(true)
  }

  const closeFullScreen = () => {
    viewport.setFullDragging(false)
    setFogDrawing(false)
    setFullScreenOpen(false)
  }

  const clearLosSeenCanvas = (canvas: HTMLCanvasElement | null, width: number, height: number) => {
    if (!canvas || width <= 0 || height <= 0) return
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)
  }

  const revealFromTokenPoint = (
    fogCanvas: HTMLCanvasElement,
    visionCanvas: HTMLCanvasElement | null,
    center: { x: number; y: number },
    brushSize: number,
    clipRect?: CanvasClipRect | null,
  ) => {
    const radius = Math.max(1, brushSize / 2)
    if (
      clipRect &&
      (center.x < clipRect.minX - radius ||
        center.x > clipRect.maxX + radius ||
        center.y < clipRect.minY - radius ||
        center.y > clipRect.maxY + radius)
    ) {
      return
    }

    if (!visionCanvas) {
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

    let maskCanvas = revealMaskCanvasRef.current
    if (!maskCanvas) {
      maskCanvas = document.createElement('canvas')
      revealMaskCanvasRef.current = maskCanvas
    }
    if (maskCanvas.width !== fogCanvas.width || maskCanvas.height !== fogCanvas.height) {
      maskCanvas.width = fogCanvas.width
      maskCanvas.height = fogCanvas.height
    }
    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })
    if (!maskCtx) return
    maskCtx.clearRect(clippedMinX, clippedMinY, regionWidth, regionHeight)
    maskCtx.fillStyle = 'rgba(0,0,0,1)'

    const rays = Math.max(220, Math.min(1800, Math.round(radius * 5.4)))
    const rayStep = (Math.PI * 2) / rays
    const distStep = 1
    const dot = Math.max(1, radius * 0.03)
    let hitSurfaceBlocker = false
    const surfaceHitPoints: Array<{ x: number; y: number }> = []
    const pixelAt = (x: number, y: number) => {
      const lx = x - clippedMinX
      const ly = y - clippedMinY
      if (lx < 0 || ly < 0 || lx >= regionWidth || ly >= regionHeight) {
        return { r: 0, g: 0, b: 0, a: 0 }
      }
      const idx = (ly * regionWidth + lx) * 4
      return {
        r: visionData[idx] ?? 0,
        g: visionData[idx + 1] ?? 0,
        b: visionData[idx + 2] ?? 0,
        a: visionData[idx + 3] ?? 0,
      }
    }
    const blockerKindAt = (x: number, y: number): 'none' | 'surface' | 'full' => {
      const px = pixelAt(x, y)
      if (px.a <= 20) return 'none'
      if (px.b >= px.r + 20 && px.b >= px.g + 10) return 'full'
      return 'surface'
    }

    for (let i = 0; i < rays; i += 1) {
      const angle = i * rayStep
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      for (let dist = 0; dist <= radius; dist += distStep) {
        const x = Math.round(center.x + cos * dist)
        const y = Math.round(center.y + sin * dist)
        if (x < clippedMinX || x > clippedMaxX || y < clippedMinY || y > clippedMaxY) break
        const blockerKind = blockerKindAt(x, y)
        if (blockerKind !== 'none') {
          if (blockerKind === 'surface') {
            hitSurfaceBlocker = true
            surfaceHitPoints.push({ x, y })
          }
          break
        }
        maskCtx.beginPath()
        maskCtx.arc(x, y, dot, 0, Math.PI * 2)
        maskCtx.fill()
      }
    }

    fogCtx.save()
    fogCtx.globalCompositeOperation = 'destination-out'
    fogCtx.drawImage(
      maskCanvas,
      clippedMinX,
      clippedMinY,
      regionWidth,
      regionHeight,
      clippedMinX,
      clippedMinY,
      regionWidth,
      regionHeight,
    )
    fogCtx.restore()

    // If LOS touches a surface blocker, reveal only connected surface-blocker
    // paint components that were actually touched by rays. This keeps
    // background blockers hidden behind foreground blockers.
    const now = Date.now()
    const shouldProcessSurfaceReveal =
      hitSurfaceBlocker &&
      surfaceHitPoints.length > 0 &&
      now - lastSurfaceRevealAtRef.current >= SURFACE_REVEAL_INTERVAL_MS

    if (shouldProcessSurfaceReveal) {
      lastSurfaceRevealAtRef.current = now
      let surfaceMaskCanvas = blockerCompositeCanvasRef.current
      if (!surfaceMaskCanvas) {
        surfaceMaskCanvas = document.createElement('canvas')
        blockerCompositeCanvasRef.current = surfaceMaskCanvas
      }
      if (surfaceMaskCanvas.width !== fogCanvas.width || surfaceMaskCanvas.height !== fogCanvas.height) {
        surfaceMaskCanvas.width = fogCanvas.width
        surfaceMaskCanvas.height = fogCanvas.height
      }
      const compositeCtx = surfaceMaskCanvas.getContext('2d', { willReadFrequently: true })
      if (compositeCtx) {
        const surfaceMask = compositeCtx.createImageData(regionWidth, regionHeight)
        const visited = new Uint8Array(regionWidth * regionHeight)
        const queue: number[] = []
        const isSurfaceLocal = (lx: number, ly: number) => {
          if (lx < 0 || ly < 0 || lx >= regionWidth || ly >= regionHeight) return false
          const dataIndex = (ly * regionWidth + lx) * 4
          const r = visionData[dataIndex] ?? 0
          const g = visionData[dataIndex + 1] ?? 0
          const b = visionData[dataIndex + 2] ?? 0
          const a = visionData[dataIndex + 3] ?? 0
          if (a <= 20) return false
          const isFull = b >= r + 20 && b >= g + 10
          return !isFull
        }
        const enqueueLocal = (lx: number, ly: number) => {
          if (lx < 0 || ly < 0 || lx >= regionWidth || ly >= regionHeight) return
          const flat = ly * regionWidth + lx
          if (visited[flat]) return
          visited[flat] = 1
          if (!isSurfaceLocal(lx, ly)) return
          queue.push(flat)
        }

        for (const hit of surfaceHitPoints) {
          enqueueLocal(hit.x - clippedMinX, hit.y - clippedMinY)
        }

        for (let head = 0; head < queue.length; head += 1) {
          const flat = queue[head]
          const lx = flat % regionWidth
          const ly = Math.floor(flat / regionWidth)
          const dataIndex = flat * 4
          surfaceMask.data[dataIndex] = 255
          surfaceMask.data[dataIndex + 1] = 255
          surfaceMask.data[dataIndex + 2] = 255
          surfaceMask.data[dataIndex + 3] = 255

          enqueueLocal(lx - 1, ly)
          enqueueLocal(lx + 1, ly)
          enqueueLocal(lx, ly - 1)
          enqueueLocal(lx, ly + 1)
          enqueueLocal(lx - 1, ly - 1)
          enqueueLocal(lx + 1, ly - 1)
          enqueueLocal(lx - 1, ly + 1)
          enqueueLocal(lx + 1, ly + 1)
        }

        compositeCtx.clearRect(clippedMinX, clippedMinY, regionWidth, regionHeight)
        compositeCtx.putImageData(surfaceMask, clippedMinX, clippedMinY)
        fogCtx.save()
        fogCtx.globalCompositeOperation = 'destination-out'
        fogCtx.drawImage(
          surfaceMaskCanvas,
          clippedMinX,
          clippedMinY,
          regionWidth,
          regionHeight,
          clippedMinX,
          clippedMinY,
          regionWidth,
          regionHeight,
        )
        fogCtx.restore()
      }
    }
  }

  const revealFromTokenStroke = (
    fogCanvas: HTMLCanvasElement,
    visionCanvas: HTMLCanvasElement | null,
    from: { x: number; y: number },
    to: { x: number; y: number },
    brushSize: number,
    clipRect?: CanvasClipRect | null,
  ) => {
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
      ) {
        return
      }
    }

    const deltaX = to.x - from.x
    const deltaY = to.y - from.y
    const distance = Math.hypot(deltaX, deltaY)
    const step = Math.max(2, brushSize * 0.14)
    const steps = Math.max(1, Math.ceil(distance / step))
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps
      revealFromTokenPoint(
        fogCanvas,
        visionCanvas,
        { x: from.x + deltaX * t, y: from.y + deltaY * t },
        brushSize,
        clipRect,
      )
    }
  }

  const tokenAnimation = useTokenAnimation({
    tokens,
    tokenAnimationsRef,
    role,
    cameraLock,
    fullScreenOpen,
    setFullPan,
    setPlayerPan,
    fullPanRef,
    playerPanRef,
    activeFogCanvasRef,
    activeVisionCanvasRef,
    renderTokenViewDistance,
    renderTokenDimensions,
    revealFromTokenPoint,
    revealFromTokenStroke,
    bumpFogSampleTick,
    pendingFogReloadRef,
  })
  const {
    animatedTokenPositions,
    tokensRef: animTokensRef,
    recentlyDroppedRef: animRecentlyDroppedRef,
    lastAnimatedPathIdRef: animLastAnimatedPathIdRef,
    startTokenPathAnimationRef: animStartTokenPathAnimationRef,
  } = tokenAnimation

  // Sync MapsTab-owned refs (passed to useMapData) with useTokenAnimation's
  // internal refs each render, so useMapData's async subscription callbacks
  // always call the current implementations.
  tokensRef.current = animTokensRef.current
  recentlyDroppedRef.current = animRecentlyDroppedRef.current
  lastAnimatedPathIdRef.current = animLastAnimatedPathIdRef.current
  startTokenPathAnimationRef.current = animStartTokenPathAnimationRef.current

  const tokenPointToCanvasPoint = (point: { x: number; y: number }, tokenSizePx = 0) => {
    const canvas = activeFogCanvasRef.current
    if (!canvas) return null
    const fogScale = canvas.height / Math.max(1, activeMapDimension)
    const yOffset = Math.max(0, tokenSizePx * fogScale * 0.5)
    return {
      x: point.x * canvas.width,
      y: Math.max(0, point.y * canvas.height - yOffset),
    }
  }

  const tokenDrag = useTokenDrag({
    campaignId,
    role,
    selectedMap,
    tokens,
    selectedTokenIds,
    getTokenDropPoint,
    renderTokenDimensions,
    tokenPointToCanvasPoint,
    activeFogCanvasRef,
    activeVisionCanvasRef,
    streamingMode,
    renderTokenViewDistance,
    revealFromTokenPoint,
    revealFromTokenStroke,
    activeMapWidth,
    activeMapHeight,
    activeGridCellPx,
    onMovementFeet,
    setTokens,
    persistFog,
    recentlyDroppedRef,
    lastAnimatedPathIdRef,
    setSelectedTokenIds,
  })
  const {
    dragTokenPositions,
    startTokenDrag,
    handleTokenTouchStart,
    handleTokenTouchEnd,
  } = tokenDrag

  const tokenDisplayName = (token: TokenRecord, index: number) => {
    const name = token.name.trim()
    return name || `Token ${index + 1}`
  }

  const {
    uploadingTokenImage,
    tokenImageDraft,
    setTokenImageDraft,
    uploadTokenImage,
    applyTokenImageDraft,
    adjustTokenImageDraftZoom,
    handleTokenImageDraftDragStart,
    handleTokenImageDraftDragMove,
    clearTokenImageDraftDrag,
  } = useTokenAssets({ role, setMapError, saveTokenAssetFile, inlineStageRef })

  const renderTokenGlyph = (token: TokenRecord) => {
    const dimensions = renderTokenDimensions(token)
    if (token.tokenImageUrl) {
      return (
        <img
          src={token.tokenImageUrl}
          alt=""
          className="map-token-image"
          style={{ width: `${dimensions.width}px`, height: `${dimensions.height}px` }}
          draggable={false}
        />
      )
    }
    return <ChessPawn size={dimensions.baseSize} />
  }

  const renderTokenItem = (token: TokenRecord, index: number) => {
    if (!isTokenVisible(token)) return null
    const draggedPosition = dragTokenPositions?.[token.id]
    const animPos = animatedTokenPositions[token.id]
    const x = draggedPosition?.x ?? animPos?.x ?? token.x
    const y = draggedPosition?.y ?? animPos?.y ?? token.y
    const isAnimating = Boolean(animPos) && !draggedPosition

    const isDragging = Boolean(draggedPosition)
    const isSelected = selectedTokenIds.includes(token.id)
    return (
      <button
        key={token.id}
        type="button"
        className={[
          'map-token',
          isDragging ? 'dragging' : '',
          isAnimating ? 'animating' : '',
          isSelected ? 'selected' : '',
          token.hidden ? 'gm-hidden-token' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ left: `${x * 100}%`, top: `${y * 100}%`, color: token.color }}
        onMouseDown={(event) => startTokenDrag(token.id, event)}
        onTouchStart={(event) => handleTokenTouchStart(token.id, event)}
        onTouchEnd={handleTokenTouchEnd}
        onTouchCancel={handleTokenTouchEnd}
        aria-label="Map token"
      >
        <span
          role="button"
          tabIndex={0}
          className="map-token-hide-btn"
          onMouseDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void toggleTokenHidden(token.id)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            event.stopPropagation()
            void toggleTokenHidden(token.id)
          }}
          aria-label={token.hidden ? 'Show token' : 'Hide token'}
          title={token.hidden ? 'Show token' : 'Hide token'}
        >
          <X size={10} />
        </span>
        {renderTokenGlyph(token)}
        {token.hidden && (
          <span className="map-token-hidden-badge" aria-hidden="true">H</span>
        )}
        <span className={gmTokenNameClassName(token)} style={renderTokenNameStyle(token)}>
          {tokenDisplayName(token, index)}
        </span>
      </button>
    )
  }

  const renderPlayerTokenItem = (token: TokenRecord, index: number, layer: 'under-fog' | 'over-fog') => {
    if ((role === 'gm' && !streamingMode) || token.hidden) return null
    if (layer === 'under-fog' && token.party) return null
    if (layer === 'over-fog' && !token.party) return null

    const draggedPosition = dragTokenPositions?.[token.id]
    const animPos = animatedTokenPositions[token.id]
    const x = draggedPosition?.x ?? animPos?.x ?? token.x
    const y = draggedPosition?.y ?? animPos?.y ?? token.y
    const isAnimating = Boolean(animPos) && !draggedPosition
    const isGmStreaming = role === 'gm' && streamingMode

    if (layer === 'under-fog' && !isTokenPartiallyVisibleForPlayer(token, { x, y }, activeFogCanvasRef.current)) {
      return null
    }

    const selected = playerSelectedTokenIds.includes(token.id)
    return (
      <button
        key={`${layer}-${token.id}`}
        type="button"
        className={[
          'map-token',
          'player',
          isAnimating ? 'animating' : '',
          selected ? 'selected' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ left: `${x * 100}%`, top: `${y * 100}%`, color: token.color }}
        onMouseDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
          if (isGmStreaming) startTokenDrag(token.id, event)
        }}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          if (!isGmStreaming) togglePlayerTokenSelection(token.id)
        }}
        onTouchStart={(event) => {
          if (!isGmStreaming) return
          handleTokenTouchStart(token.id, event)
        }}
        onTouchEnd={isGmStreaming ? handleTokenTouchEnd : undefined}
        onTouchCancel={isGmStreaming ? handleTokenTouchEnd : undefined}
        aria-label={tokenDisplayName(token, index)}
      >
        {renderTokenGlyph(token)}
        {token.revealName ? (
          <span className="map-token-name" style={renderTokenNameStyle(token)}>
            {tokenDisplayName(token, index)}
          </span>
        ) : null}
      </button>
    )
  }

  const handleMapLayerMouseDown: MouseEventHandler<HTMLDivElement> = (event) => {
    if (role !== 'gm') return
    if (gridCalibrateMode) return
    if (!tokenSelectMode || event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('.map-token,.map-annotation-btn,.map-annotation-popover')) return
    const point = getTokenDropPoint(event.clientX, event.clientY)
    if (!point) return
    event.preventDefault()
    event.stopPropagation()
    setTokenSelectionBox({ start: point, end: point })
  }

  const handleMapLayerClick: MouseEventHandler<HTMLDivElement> = (event) => {
    if (role !== 'gm') return
    if (suppressNextMapClickRef.current) {
      suppressNextMapClickRef.current = false
      return
    }
    if ((event.target as HTMLElement).closest('.map-token,.map-annotation-btn,.map-annotation-popover')) return
    event.preventDefault()
    if (gridCalibrateMode) {
      handleGridCalibrateClick(event.clientX, event.clientY)
      return
    }
    if (selectedTokenIds.length > 0) {
      setSelectedTokenIds([])
      return
    }
    if (tokenSelectMode) return
    if (annotationPlaceMode) {
      void placeAnnotation(event.clientX, event.clientY)
      return
    }
    if (!tokenPlaceMode) return
    void placeToken(event.clientX, event.clientY)
  }


  useEffect(() => {
    if (role !== 'gm' || !tokenSelectionBox) return

    const handleMove = (event: MouseEvent) => {
      const point = getTokenDropPoint(event.clientX, event.clientY)
      if (!point) return
      setTokenSelectionBox((current) => (current ? { ...current, end: point } : current))
    }

    const handleUp = (event: MouseEvent) => {
      const point = getTokenDropPoint(event.clientX, event.clientY) ?? tokenSelectionBox.end
      const minX = Math.min(tokenSelectionBox.start.x, point.x)
      const minY = Math.min(tokenSelectionBox.start.y, point.y)
      const maxX = Math.max(tokenSelectionBox.start.x, point.x)
      const maxY = Math.max(tokenSelectionBox.start.y, point.y)
      const width = maxX - minX
      const height = maxY - minY
      if (width < 0.005 && height < 0.005) {
        setSelectedTokenIds([])
      } else {
        setSelectedTokenIds(
          tokens
            .filter((token) => token.x >= minX && token.x <= maxX && token.y >= minY && token.y <= maxY)
            .map((token) => token.id),
        )
      }
      setTokenSelectionBox(null)
      suppressNextMapClickRef.current = true
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [getTokenDropPoint, role, tokenSelectionBox, tokens])

  useEffect(() => {
    if (!activeAnnotationId) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.closest('.map-annotation-popover,.map-annotation-btn')) return
      void commitActiveAnnotation()
      setActiveAnnotationId('')
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [activeAnnotationId, activeAnnotationDraft, activeAnnotation, selectedMap, role, campaignId])

  useEffect(() => {
    setActiveAnnotationId('')
    setActiveAnnotationDraft('')
    setSelectedTokenIds([])
    setTokenSelectionBox(null)
    resetDistanceTracker()
    resetGrid()
    setInlineImageReady(false)
    setFullImageReady(false)
    setInlineFogSize({ width: 0, height: 0 })
    setFullFogSize({ width: 0, height: 0 })
  }, [selectedMapId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedTokenAssetId) return
    const existsAsAsset = tokenAssets.some((asset) => asset.id === selectedTokenAssetId)
    const existsAsMonster = mapMonsters.some((monster) => monster.id === selectedTokenAssetId)
    if (!existsAsAsset && !existsAsMonster) setSelectedTokenAssetId('')
  }, [selectedTokenAssetId, tokenAssets, mapMonsters])

  useEffect(() => {
    if (!streamingMode) return
    setActiveAnnotationId('')
  }, [streamingMode])

  const handleInlineImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    if (event.currentTarget.src !== selectedMap?.imageUrl) return
    const target = event.currentTarget
    setInlineBaseSize({
      width: Math.max(1, Math.round(target.clientWidth)),
      height: Math.max(1, Math.round(target.clientHeight)),
    })
    const fogScale = Math.min(1, FOG_CANVAS_MAX_DIM / Math.max(target.naturalWidth, target.naturalHeight, 1))
    setInlineFogSize({
      width: Math.max(1, Math.round(target.naturalWidth * fogScale)),
      height: Math.max(1, Math.round(target.naturalHeight * fogScale)),
    })
    invalidateInlineOverlayCache()
    clearLosSeenCanvas(
      inlineLosSeenCanvasRef.current,
      Math.max(1, Math.round(target.naturalWidth * fogScale)),
      Math.max(1, Math.round(target.naturalHeight * fogScale)),
    )
    setInlineImageReady(true)
  }

  const handleFullImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    if (event.currentTarget.src !== selectedMap?.imageUrl) return
    const target = event.currentTarget
    setFullBaseSize({
      width: Math.max(1, Math.round(target.clientWidth)),
      height: Math.max(1, Math.round(target.clientHeight)),
    })
    const fogScale = Math.min(1, FOG_CANVAS_MAX_DIM / Math.max(target.naturalWidth, target.naturalHeight, 1))
    setFullFogSize({
      width: Math.max(1, Math.round(target.naturalWidth * fogScale)),
      height: Math.max(1, Math.round(target.naturalHeight * fogScale)),
    })
    invalidateFullVisionCache()
    clearLosSeenCanvas(
      fullLosSeenCanvasRef.current,
      Math.max(1, Math.round(target.naturalWidth * fogScale)),
      Math.max(1, Math.round(target.naturalHeight * fogScale)),
    )
    setFullImageReady(true)
  }

  useEffect(() => {
    clearLosSeenCanvas(inlineLosSeenCanvasRef.current, Math.max(1, inlineFogSize.width), Math.max(1, inlineFogSize.height))
  }, [selectedMap?.id, inlineFogSize.width, inlineFogSize.height])

  useEffect(() => {
    clearLosSeenCanvas(fullLosSeenCanvasRef.current, Math.max(1, fullFogSize.width), Math.max(1, fullFogSize.height))
  }, [selectedMap?.id, fullFogSize.width, fullFogSize.height])

  const calibrationOverlayNode = gridCalibrationLine ? (
    <div className={gridCalibratePulse ? 'map-grid-calibration-overlay pulse' : 'map-grid-calibration-overlay'} aria-hidden>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <line
          x1={gridCalibrationLine.start.x * 100}
          y1={gridCalibrationLine.start.y * 100}
          x2={gridCalibrationLine.end.x * 100}
          y2={gridCalibrationLine.end.y * 100}
        />
      </svg>
      <button
        type="button"
        className="map-grid-calibration-handle"
        style={{ left: `${gridCalibrationLine.start.x * 100}%`, top: `${gridCalibrationLine.start.y * 100}%` }}
        onMouseDown={(event) => handleGridCalibrateHandleMouseDown(event, 'start')}
        aria-label="Move calibration start point"
      />
      <button
        type="button"
        className="map-grid-calibration-handle"
        style={{ left: `${gridCalibrationLine.end.x * 100}%`, top: `${gridCalibrationLine.end.y * 100}%` }}
        onMouseDown={(event) => handleGridCalibrateHandleMouseDown(event, 'end')}
        aria-label="Move calibration end point"
      />
    </div>
  ) : null

  const annotationLayerNode = role === 'gm' && !streamingMode ? (
    <AnnotationLayer
      annotations={annotations}
      activeAnnotationId={activeAnnotationId}
      activeAnnotationDraft={activeAnnotationDraft}
      setActiveAnnotationId={setActiveAnnotationId}
      setActiveAnnotationDraft={setActiveAnnotationDraft}
      onCommitActiveAnnotation={commitActiveAnnotation}
      onDeleteAnnotation={deleteAnnotation}
      autosizeAnnotationTextarea={autosizeAnnotationTextarea}
    />
  ) : null

  const fullscreenControlsNode = role === 'gm' ? (
    <aside className="map-fullscreen-controls">
      <GmMapControls
        dark
        fogTool={fogTool}
        setFogTool={setFogTool}
        visionTool={visionTool}
        setVisionTool={setVisionTool}
        fogBrushSize={fogBrushSize}
        setFogBrushSize={setFogBrushSize}
        tokenPlaceMode={tokenPlaceMode}
        setTokenPlaceMode={setTokenPlaceMode}
        tokenSelectMode={tokenSelectMode}
        setTokenSelectMode={setTokenSelectMode}
        annotationPlaceMode={annotationPlaceMode}
        setAnnotationPlaceMode={setAnnotationPlaceMode}
        tokenColor={tokenColor}
        setTokenColor={setTokenColor}
        tokenSize={tokenSize}
        setTokenSize={setTokenSize}
        tokenAssets={tokenAssets}
        selectedTokenAssetId={selectedTokenAssetId}
        setSelectedTokenAssetId={setSelectedTokenAssetId}
        selectedTokenImageUrl={selectedTokenAsset?.imageUrl ?? ''}
        uploadingTokenImage={uploadingTokenImage}
        onUploadTokenImage={uploadTokenImage}
        onArchiveTokenAsset={archiveTokenAsset}
        onRequestDeleteTokenAsset={requestDeleteTokenAsset}
        streamingMode={streamingMode}
        setStreamingMode={setStreamingMode}
        gridVisible={effectiveGridVisible}
        gridType={effectiveGridType}
        gridAdjustMode={gridAdjustMode}
        onToggleGridVisible={() => void toggleGridVisibility()}
        onSetGridType={setGridType}
        onApplyGrid={applyGridAdjust}
        hexDetecting={hexDetecting}
        hexDetectConfidence={hexDetectConfidence}
        gridAdjustReady={gridAdjustReady}
        gridAdjustSaved={Boolean(gridAdjustSavedAt)}
        gridCalibrateMode={gridCalibrateMode}
        onToggleGridCalibrate={toggleGridCalibrateMode}
        gridCalibrateReady={Boolean(gridCalibrateStart && gridCalibrateEnd)}
        gridCalibrateSaved={Boolean(gridCalibrateSavedAt)}
        onApplyGridCalibration={() => void applyGridCalibration().catch((error) => {
          const message = error instanceof Error ? error.message : 'Failed to save grid calibration'
          setMapError(message)
        })}
        distanceTrackerFeet={distanceTrackerFeet}
        distanceTrackerMode={distanceTrackerMode}
        distanceTrackerRoll={distanceTrackerRoll}
        onResetDistanceTracker={resetDistanceTracker}
        applyFogPreset={applyFogPreset}
        canApplyPreset={Boolean(selectedMap)}
        fullyHidden={selectedMap?.fullyHidden === true}
        tokens={tokens}
        selectedTokenIds={selectedTokenIds}
        onSelectTokenCard={(tokenId) => setSelectedTokenIds([tokenId])}
        onUpdateToken={updateToken}
        onUpdateTokenSize={async (tokenId, size) => {
          const sizeScale = size / TOKEN_REFERENCE_DIMENSION
          setTokens((prev) =>
            prev.map((token) => (token.id === tokenId ? { ...token, size, sizeScale } : token)),
          )
          await updateToken(tokenId, { size, sizeScale })
        }}
        onUpdateTokenViewDistance={async (tokenId, viewDistance) => {
          const viewDistanceScale = viewDistance / TOKEN_REFERENCE_DIMENSION
          setTokens((prev) =>
            prev.map((token) =>
              token.id === tokenId ? { ...token, viewDistance, viewDistanceScale } : token,
            ),
          )
          await updateToken(tokenId, { viewDistance, viewDistanceScale })
        }}
        tokenViewDistanceSliderValue={tokenViewDistanceSliderValue}
        onRequestDeleteToken={requestDeleteToken}
        mapMonsters={mapMonsters}
      />
    </aside>
  ) : (
    <aside className="map-fullscreen-controls">
      <PlayerMapControls dark cameraLock={cameraLock} onToggleCameraLock={toggleCameraLock} />
    </aside>
  )


  return (
    <div className="maps-layout">
      {showListPane ? (
        <aside className="maps-sidebar">
          <div className="maps-sidebar-header">
            <h2>Maps</h2>
            {role === 'gm' ? (
              <label className="upload-trigger">
                <Upload size={16} />
                {uploading ? 'Uploading...' : 'Upload'}
                <input type="file" accept="image/*" onChange={handleMapUpload} disabled={uploading} />
              </label>
            ) : null}
          </div>
          <p className="maps-role">Role: {role ?? 'unknown'}</p>

          {mapsLoading ? <p>Loading maps...</p> : null}
          {!mapsLoading && maps.length === 0 ? <p>No maps uploaded yet.</p> : null}
          {!mapsLoading && maps.length > 0 && visibleMaps.length === 0 && role !== 'gm' ? (
            <p>No maps revealed to players yet.</p>
          ) : null}

          <div className="maps-list">
            {visibleMaps.map((map) => (
              <div
                key={map.id}
                className={[
                  'map-row',
                  map.id === selectedMapId ? 'active' : '',
                  map.id === dragOverMapId ? 'drag-over' : '',
                  map.id === draggingMapId ? 'dragging' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                draggable={role === 'gm'}
                onDragStart={() => handleDragStart(map.id)}
                onDragOver={(event) => {
                  event.preventDefault()
                  if (dragOverMapId !== map.id) setDragOverMapId(map.id)
                }}
                onDragLeave={() => {
                  if (dragOverMapId === map.id) setDragOverMapId('')
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  void handleDrop(map.id)
                }}
                onDragEnd={() => {
                  setDraggingMapId('')
                  setDragOverMapId('')
                }}
              >
                <div
                  className="map-select"
                  role="button"
                  tabIndex={0}
                  onClick={() => selectMap(map.id)}
                  onKeyDown={(event) => {
                    const target = event.target as HTMLElement
                    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                      return
                    }
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      selectMap(map.id)
                    }
                  }}
                >
                  <div className="map-thumb-column">
                    <div className="map-thumb-wrap">
                      {role === 'gm' && map.imageUrl ? <img src={map.imageUrl} alt={map.name} className="map-thumb" /> : null}
                    </div>
                    {role === 'gm' ? (
                      <button
                        type="button"
                        className={map.visibleToPlayers ? 'map-visibility-btn on' : 'map-visibility-btn'}
                        onClick={(event) => {
                          event.stopPropagation()
                          void togglePlayerVisibility(map, !map.visibleToPlayers)
                        }}
                        aria-label={map.visibleToPlayers ? 'Visible to players' : 'Hidden from players'}
                      >
                        {map.visibleToPlayers ? <Check size={14} /> : <Circle size={14} />}
                      </button>
                    ) : null}
                  </div>
                  <div className="map-meta">
                    {editingMapId === map.id ? (
                      <input
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        aria-label="Edit map name"
                      />
                    ) : (
                      <strong>{map.name}</strong>
                    )}
                  </div>
                </div>

                {role === 'gm' ? (
                  <div className="map-actions">
                    {editingMapId === map.id ? (
                      <button type="button" className="map-edit-btn" onClick={() => void saveRename(map.id)}>
                        <Check size={14} />
                      </button>
                    ) : (
                      <button type="button" className="map-edit-btn" onClick={() => startRename(map)}>
                        <Pencil size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="map-delete-btn"
                      onClick={() => setDeleteCandidate(map)}
                      disabled={deletingMapId === map.id}
                      aria-label={`Delete ${map.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {mapError ? <p className="error">{mapError}</p> : null}
        </aside>
      ) : null}

      {showMapPane ? (
        <div
          className={[
            role === 'gm' ? 'maps-main gm' : 'maps-main player',
            isMobile && role === 'gm' ? 'mobile-gm' : '',
            isMobile && role !== 'gm' ? 'mobile-player' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {!isMobile || (role === 'gm' ? mobileGmPane === 'map' : mobilePlayerPane === 'map') ? (
            <InlineMapStage
              stageRef={inlineStageRef}
              mapLayerRef={inlineMapLayerRef}
              isMobile={isMobile}
              stageClassName={isMobileZoomMapView ? 'map-stage mobile-player-stage' : 'map-stage'}
              selectedMap={selectedMap}
              mapLayerClassName={isMobileZoomMapView ? 'map-zoom-layer mobile-player-zoom' : 'map-zoom-layer'}
              mapLayerStyle={
                isPlayerMapView
                  ? {
                    transform: `translate(${playerPan.x}px, ${playerPan.y}px) scale(${playerZoom})`,
                    cursor: playerDragging ? 'grabbing' : playerZoom > 1 ? 'grab' : undefined,
                  }
                  : undefined
              }
              onOpenFullscreen={openFullScreen}
              onImageLoad={handleInlineImageLoad}
              onStageWheel={isPlayerMapView ? handlePlayerWheel : undefined}
              onStageMouseDown={isPlayerMapView ? handlePlayerMouseDown : undefined}
              onStageMouseMove={isPlayerMapView ? handlePlayerMouseMove : undefined}
              onStageMouseUp={isPlayerMapView ? endPlayerDrag : undefined}
              onStageMouseLeave={isPlayerMapView ? endPlayerDrag : undefined}
              onMapLayerContextMenu={(event) => event.preventDefault()}
              onMapLayerWheel={(event) => handleGridLayerWheel(event, false)}
              onMapLayerMouseDown={(event) => {
                if (handleGridLayerMouseDown(event, false)) return
                handleMapLayerMouseDown(event)
              }}
              onMapLayerMouseMove={(event) => handleGridCalibrateMouseMove(event.clientX, event.clientY)}
              onMapLayerClick={handleMapLayerClick}
              onMapLayerTouchStart={handleMobilePlayerTouchStart}
              onMapLayerTouchMove={handleMobilePlayerTouchMove}
              onMapLayerTouchEnd={handleMobilePlayerTouchEnd}
              onMapLayerTouchCancel={handleMobilePlayerTouchEnd}
            >
              {renderMapGridOverlay(false)}
              {gridAdjustMode && effectiveGridEnabled && effectiveGridVisible ? <div className="map-grid-adjust-overlay" /> : null}
              {calibrationOverlayNode}
              {role !== 'gm' || streamingMode ? (
                <TokenLayer
                  className="map-token-layer under-fog"
                  ariaLabel="Map tokens under fog"
                  tokens={tokens}
                  renderToken={(token, index) => renderPlayerTokenItem(token, index, 'under-fog')}
                />
              ) : null}
              <canvas
                ref={inlineFogCanvasRef}
                className={tokenPlaceMode || (!fogTool && !visionTool) ? 'map-fog-canvas read-only' : 'map-fog-canvas brush'}
                width={Math.max(1, inlineFogSize.width)}
                height={Math.max(1, inlineFogSize.height)}
                style={{ opacity: fogDisplayOpacity }}
                onMouseDown={handleFogPointerDown}
                onMouseMove={handleFogPointerMove}
                onMouseUp={handleFogPointerUp}
                onMouseLeave={handleFogPointerUp}
                onTouchStart={handleFogTouchStart}
                onTouchMove={handleFogTouchMove}
                onTouchEnd={handleFogTouchEnd}
                onTouchCancel={handleFogTouchEnd}
              />
              <canvas
                ref={inlineVisionCanvasRef}
                className="map-vision-canvas"
                width={Math.max(1, inlineFogSize.width)}
                height={Math.max(1, inlineFogSize.height)}
                style={{ opacity: visionOverlayOpacity }}
              />
              <canvas
                ref={inlineLosSeenCanvasRef}
                className="map-los-seen-canvas"
                width={Math.max(1, inlineFogSize.width)}
                height={Math.max(1, inlineFogSize.height)}
                style={{ opacity: losSeenOverlayOpacity }}
              />
              {role === 'gm' && !streamingMode ? (
                <TokenLayer
                  className="map-token-layer gm"
                  tokens={tokens}
                  renderToken={renderTokenItem}
                />
              ) : null}
              {role !== 'gm' || streamingMode ? (
                <TokenLayer
                  className="map-token-layer player-over-fog"
                  ariaLabel="Map party tokens"
                  tokens={tokens}
                  renderToken={(token, index) => renderPlayerTokenItem(token, index, 'over-fog')}
                />
              ) : null}
              {role === 'gm' && tokenSelectionBox && selectionRectStyle ? (
                <div className="map-token-selection-box" style={selectionRectStyle} />
              ) : null}
              {annotationLayerNode}
              {(!inlineImageReady || !inlineFogReady) ? <div className="map-fog-loading-mask" aria-hidden /> : null}
            </InlineMapStage>
          ) : null}

          {role === 'gm' && (!isMobile || mobileGmPane === 'controls') ? (
            <aside className="map-controls">
              <GmMapControls
                fogTool={fogTool}
                setFogTool={setFogTool}
                visionTool={visionTool}
                setVisionTool={setVisionTool}
                fogBrushSize={fogBrushSize}
                setFogBrushSize={setFogBrushSize}
                tokenPlaceMode={tokenPlaceMode}
                setTokenPlaceMode={setTokenPlaceMode}
                tokenSelectMode={tokenSelectMode}
                setTokenSelectMode={setTokenSelectMode}
                annotationPlaceMode={annotationPlaceMode}
                setAnnotationPlaceMode={setAnnotationPlaceMode}
                tokenColor={tokenColor}
                setTokenColor={setTokenColor}
                tokenSize={tokenSize}
                setTokenSize={setTokenSize}
                tokenAssets={tokenAssets}
                selectedTokenAssetId={selectedTokenAssetId}
                setSelectedTokenAssetId={setSelectedTokenAssetId}
                selectedTokenImageUrl={selectedTokenAsset?.imageUrl ?? ''}
                uploadingTokenImage={uploadingTokenImage}
                onUploadTokenImage={uploadTokenImage}
                onArchiveTokenAsset={archiveTokenAsset}
                onRequestDeleteTokenAsset={requestDeleteTokenAsset}
                streamingMode={streamingMode}
                setStreamingMode={setStreamingMode}
                gridVisible={effectiveGridVisible}
                gridType={effectiveGridType}
                gridAdjustMode={gridAdjustMode}
                onToggleGridVisible={() => void toggleGridVisibility()}
                onSetGridType={setGridType}
                onApplyGrid={applyGridAdjust}
                hexDetecting={hexDetecting}
                hexDetectConfidence={hexDetectConfidence}
                gridAdjustReady={gridAdjustReady}
                gridAdjustSaved={Boolean(gridAdjustSavedAt)}
                gridCalibrateMode={gridCalibrateMode}
                onToggleGridCalibrate={toggleGridCalibrateMode}
                gridCalibrateReady={Boolean(gridCalibrateStart && gridCalibrateEnd)}
                gridCalibrateSaved={Boolean(gridCalibrateSavedAt)}
                onApplyGridCalibration={() => void applyGridCalibration().catch((error) => {
                  const message = error instanceof Error ? error.message : 'Failed to save grid calibration'
                  setMapError(message)
                })}
                distanceTrackerFeet={distanceTrackerFeet}
                distanceTrackerMode={distanceTrackerMode}
                distanceTrackerRoll={distanceTrackerRoll}
                onResetDistanceTracker={resetDistanceTracker}
                applyFogPreset={applyFogPreset}
                canApplyPreset={Boolean(selectedMap)}
                fullyHidden={selectedMap?.fullyHidden === true}
                tokens={tokens}
                selectedTokenIds={selectedTokenIds}
                onSelectTokenCard={(tokenId) => setSelectedTokenIds([tokenId])}
                onUpdateToken={updateToken}
                onUpdateTokenSize={async (tokenId, size) => {
                  const sizeScale = size / TOKEN_REFERENCE_DIMENSION
                  setTokens((prev) =>
                    prev.map((token) => (token.id === tokenId ? { ...token, size, sizeScale } : token)),
                  )
                  await updateToken(tokenId, { size, sizeScale })
                }}
                onUpdateTokenViewDistance={async (tokenId, viewDistance) => {
                  const viewDistanceScale = viewDistance / TOKEN_REFERENCE_DIMENSION
                  setTokens((prev) =>
                    prev.map((token) =>
                      token.id === tokenId ? { ...token, viewDistance, viewDistanceScale } : token,
                    ),
                  )
                  await updateToken(tokenId, { viewDistance, viewDistanceScale })
                }}
                tokenViewDistanceSliderValue={tokenViewDistanceSliderValue}
                onRequestDeleteToken={requestDeleteToken}
                mapMonsters={mapMonsters}
              />
            </aside>
          ) : null}

          {role !== 'gm' && !isMobile ? (
            <aside className="map-controls">
              <PlayerMapControls cameraLock={cameraLock} onToggleCameraLock={toggleCameraLock} />
            </aside>
          ) : null}

          {role !== 'gm' && isMobile && mobilePlayerPane === 'controls' ? (
            <aside className="map-controls">
              <PlayerMapControls cameraLock={cameraLock} onToggleCameraLock={toggleCameraLock} />
            </aside>
          ) : null}

          {isMobile && role !== 'gm' ? (
            <div className="map-mobile-panel-nav">
              <button
                type="button"
                onClick={() => setMobileMapView('list')}
                aria-label="Back to map list"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                className={mobilePlayerPane === 'map' ? 'active' : ''}
                onClick={() => setMobilePlayerPane('map')}
                disabled={mobilePlayerPane === 'map'}
                aria-label="Map pane"
              >
                <Map size={16} />
              </button>
              <button
                type="button"
                className={mobilePlayerPane === 'controls' ? 'active' : ''}
                onClick={() => setMobilePlayerPane('controls')}
                disabled={mobilePlayerPane === 'controls'}
                aria-label="Controls pane"
              >
                <SlidersHorizontal size={16} />
              </button>
            </div>
          ) : null}

          {isMobile && role === 'gm' ? (
            <div className="map-mobile-panel-nav">
              <button
                type="button"
                onClick={() => setMobileMapView('list')}
                aria-label="Back to map list"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                className={mobileGmPane === 'map' ? 'active' : ''}
                onClick={() => setMobileGmPane('map')}
                disabled={mobileGmPane === 'map'}
                aria-label="Map pane"
              >
                <Map size={16} />
              </button>
              <button
                type="button"
                className={mobileGmPane === 'controls' ? 'active' : ''}
                onClick={() => setMobileGmPane('controls')}
                disabled={mobileGmPane === 'controls'}
                aria-label="Controls pane"
              >
                <SlidersHorizontal size={16} />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {fullScreenOpen && !isMobile ? (
        <FullscreenMapStage
          stageRef={fullStageRef}
          mapLayerRef={fullMapLayerRef}
          selectedMap={selectedMap}
          fullDragging={fullDragging}
          mapLayerStyle={{ transform: `translate(${fullPan.x}px, ${fullPan.y}px) scale(${fullZoom})` }}
          onClose={closeFullScreen}
          onImageLoad={handleFullImageLoad}
          onStageWheel={handleFullWheel}
          onStageMouseDown={handleFullMouseDown}
          onStageAuxClick={(event) => {
            if (event.button === 1) event.preventDefault()
          }}
          onStageMouseMove={handleFullMouseMove}
          onStageMouseUp={endFullDrag}
          onStageMouseLeave={endFullDrag}
          onMapLayerWheel={(event) => handleGridLayerWheel(event, true)}
          onMapLayerMouseDown={(event) => {
            if (handleGridLayerMouseDown(event, true)) return
            handleMapLayerMouseDown(event)
          }}
          onMapLayerMouseMove={(event) => handleGridCalibrateMouseMove(event.clientX, event.clientY)}
          onMapLayerClick={handleMapLayerClick}
          controlsNode={fullscreenControlsNode}
        >
          {renderMapGridOverlay(true)}
          {gridAdjustMode && effectiveGridEnabled && effectiveGridVisible ? <div className="map-grid-adjust-overlay" /> : null}
          {calibrationOverlayNode}
          {role !== 'gm' || streamingMode ? (
            <TokenLayer
              className="map-token-layer under-fog"
              ariaLabel="Map tokens under fog"
              tokens={tokens}
              renderToken={(token, index) => renderPlayerTokenItem(token, index, 'under-fog')}
            />
          ) : null}
          <canvas
            ref={fullFogCanvasRef}
            className={tokenPlaceMode || (!fogTool && !visionTool) ? 'map-fog-canvas read-only' : 'map-fog-canvas brush'}
            width={Math.max(1, fullFogSize.width)}
            height={Math.max(1, fullFogSize.height)}
            style={{ opacity: fogDisplayOpacity }}
            onMouseDown={handleFogPointerDown}
            onMouseMove={handleFogPointerMove}
            onMouseUp={handleFogPointerUp}
            onMouseLeave={handleFogPointerUp}
          />
          <canvas
            ref={fullVisionCanvasRef}
            className="map-vision-canvas"
            width={Math.max(1, fullFogSize.width)}
            height={Math.max(1, fullFogSize.height)}
            style={{ opacity: visionOverlayOpacity }}
          />
          <canvas
            ref={fullLosSeenCanvasRef}
            className="map-los-seen-canvas"
            width={Math.max(1, fullFogSize.width)}
            height={Math.max(1, fullFogSize.height)}
            style={{ opacity: losSeenOverlayOpacity }}
          />
          {role === 'gm' && !streamingMode ? (
            <TokenLayer
              className="map-token-layer gm"
              ariaLabel="Map tokens"
              tokens={tokens}
              renderToken={renderTokenItem}
            />
          ) : null}
          {role !== 'gm' || streamingMode ? (
            <TokenLayer
              className="map-token-layer player-over-fog"
              ariaLabel="Map party tokens"
              tokens={tokens}
              renderToken={(token, index) => renderPlayerTokenItem(token, index, 'over-fog')}
            />
          ) : null}
          {role === 'gm' && tokenSelectionBox && selectionRectStyle ? (
            <div className="map-token-selection-box" style={selectionRectStyle} />
          ) : null}
          {annotationLayerNode}
          {(!fullImageReady || !fullFogReady) ? <div className="map-fog-loading-mask" aria-hidden /> : null}
        </FullscreenMapStage>
      ) : null}

      {tokenImageDraft ? (
        <div className="monster-portrait-modal-overlay" role="dialog" aria-modal="true" aria-label="Adjust token image">
          <div className="monster-portrait-modal">
            <div className="monster-portrait-modal-header">
              <span className="monster-portrait-modal-hint">Drag to center crop</span>
              <div className="monster-portrait-modal-actions">
                <button
                  type="button"
                  className="modal-icon-btn"
                  onClick={() => adjustTokenImageDraftZoom(-0.2)}
                  aria-label="Zoom out token crop"
                >
                  <Minus size={16} />
                </button>
                <button
                  type="button"
                  className="modal-icon-btn"
                  onClick={() => adjustTokenImageDraftZoom(0.2)}
                  aria-label="Zoom in token crop"
                >
                  <Plus size={16} />
                </button>
                <button
                  type="button"
                  className="modal-icon-btn"
                  onClick={() => setTokenImageDraft(null)}
                  aria-label="Cancel token image crop"
                >
                  <X size={16} />
                </button>
                <button
                  type="button"
                  className="modal-icon-btn confirm"
                  onClick={() => void applyTokenImageDraft()}
                  aria-label="Apply token image crop"
                >
                  <Check size={16} />
                </button>
              </div>
            </div>
            <div
              className="monster-portrait-modal-preview monster-portrait-drag-zone"
              style={{ aspectRatio: '1 / 1' }}
              onPointerDown={handleTokenImageDraftDragStart}
              onPointerMove={handleTokenImageDraftDragMove}
              onPointerUp={clearTokenImageDraftDrag}
              onPointerCancel={clearTokenImageDraftDrag}
            >
              <img
                src={tokenImageDraft.imageUrl}
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  objectPosition: `${tokenImageDraft.focusX}% ${tokenImageDraft.focusY}%`,
                  transform: `scale(${tokenImageDraft.zoom})`,
                  transformOrigin: 'center center',
                }}
                draggable={false}
              />
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={deleteCandidate !== null}
        title="Delete Map?"
        message={`Permanently remove "${deleteCandidate?.name ?? ''}" from this campaign?`}
        confirmLabel={deletingMapId ? 'Deleting...' : 'Delete'}
        confirmDisabled={Boolean(deletingMapId)}
        onCancel={() => setDeleteCandidate(null)}
        onConfirm={() => void deleteMap()}
      />
      <ConfirmModal
        open={tokenDeleteCandidate !== null}
        title="Delete Token?"
        message="Permanently remove this token from the map?"
        confirmLabel={deletingTokenId ? 'Deleting...' : 'Delete'}
        confirmDisabled={Boolean(deletingTokenId)}
        onCancel={() => setTokenDeleteCandidate(null)}
        onConfirm={() => void confirmDeleteToken()}
      />
      <ConfirmModal
        open={tokenAssetDeleteCandidate !== null}
        title="Delete Token Icon?"
        message={`Permanently remove "${tokenAssetDeleteCandidate?.name ?? ''}" from token icons?`}
        confirmLabel={deletingTokenAssetId ? 'Deleting...' : 'Delete'}
        confirmDisabled={Boolean(deletingTokenAssetId)}
        onCancel={() => setTokenAssetDeleteCandidate(null)}
        onConfirm={() => void confirmDeleteTokenAsset()}
      />
      {encounterNotice ? (
        <div className="encounter-modal-overlay" role="dialog" aria-modal="true" aria-label="Encounter alert">
          <div className="encounter-modal">
            <h3>You encounter a monster!</h3>
            <p>Encounter checks: {encounterNotice.checks} at every {ENCOUNTER_CHECK_DISTANCE_FEET * ENCOUNTER_CHECK_TURNS}&apos;.</p>
            <p>Test chance: 1 in 6. Rolls: {encounterNotice.rolls.join(', ')}.</p>
            <div className="encounter-modal-actions">
              <button type="button" onClick={dismissEncounterNotice}>
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function GmMapControls({
  dark = false,
  fogTool,
  setFogTool,
  visionTool,
  setVisionTool,
  fogBrushSize,
  setFogBrushSize,
  tokenPlaceMode,
  setTokenPlaceMode,
  tokenSelectMode,
  setTokenSelectMode,
  annotationPlaceMode,
  setAnnotationPlaceMode,
  tokenColor,
  setTokenColor,
  tokenSize,
  setTokenSize,
  tokenAssets,
  selectedTokenAssetId,
  setSelectedTokenAssetId,
  selectedTokenImageUrl,
  uploadingTokenImage,
  onUploadTokenImage,
  onArchiveTokenAsset,
  onRequestDeleteTokenAsset,
  streamingMode,
  setStreamingMode,
  gridVisible,
  gridType,
  gridAdjustMode,
  onToggleGridVisible,
  onSetGridType,
  onApplyGrid,
  hexDetecting,
  hexDetectConfidence,
  gridAdjustReady,
  gridAdjustSaved,
  gridCalibrateMode,
  onToggleGridCalibrate,
  gridCalibrateReady,
  gridCalibrateSaved,
  onApplyGridCalibration,
  distanceTrackerFeet,
  distanceTrackerMode,
  distanceTrackerRoll,
  onResetDistanceTracker,
  applyFogPreset,
  canApplyPreset,
  fullyHidden,
  tokens,
  selectedTokenIds,
  onSelectTokenCard,
  onUpdateToken,
  onUpdateTokenSize,
  onUpdateTokenViewDistance,
  tokenViewDistanceSliderValue,
  onRequestDeleteToken,
  mapMonsters,
}: {
  dark?: boolean
  fogTool: 'reveal' | 'hide' | null
  setFogTool: (tool: 'reveal' | 'hide' | null) => void
  visionTool: 'draw' | 'drawFull' | 'erase' | null
  setVisionTool: (tool: 'draw' | 'drawFull' | 'erase' | null) => void
  fogBrushSize: number
  setFogBrushSize: (size: number) => void
  tokenPlaceMode: boolean
  setTokenPlaceMode: (value: boolean) => void
  tokenSelectMode: boolean
  setTokenSelectMode: (value: boolean) => void
  annotationPlaceMode: boolean
  setAnnotationPlaceMode: (value: boolean) => void
  tokenColor: string
  setTokenColor: (value: string) => void
  tokenSize: number
  setTokenSize: (value: number) => void
  tokenAssets: TokenAssetRecord[]
  selectedTokenAssetId: string
  setSelectedTokenAssetId: (value: string) => void
  selectedTokenImageUrl: string
  uploadingTokenImage: boolean
  onUploadTokenImage: (file: File, assetName?: string) => Promise<void>
  onArchiveTokenAsset: (assetId: string, archived: boolean) => Promise<void>
  onRequestDeleteTokenAsset: (assetId: string) => void
  streamingMode: boolean
  setStreamingMode: (value: boolean) => void
  gridVisible: boolean
  gridType: 'square' | 'hex-pointy' | 'hex-flat'
  gridAdjustMode: boolean
  onToggleGridVisible: () => void
  onSetGridType: (gridType: 'square' | 'hex-pointy' | 'hex-flat') => void
  onApplyGrid: () => void
  hexDetecting: boolean
  hexDetectConfidence: number | null
  gridAdjustReady: boolean
  gridAdjustSaved: boolean
  gridCalibrateMode: boolean
  onToggleGridCalibrate: () => void
  gridCalibrateReady: boolean
  gridCalibrateSaved: boolean
  onApplyGridCalibration: () => void
  distanceTrackerFeet: number
  distanceTrackerMode: 'count' | 'first' | 'roll'
  distanceTrackerRoll: number | null
  onResetDistanceTracker: () => void
  applyFogPreset: (preset: 'hide-all' | 'unhide-all') => Promise<void>
  canApplyPreset: boolean
  fullyHidden: boolean
  tokens: TokenRecord[]
  selectedTokenIds: string[]
  onSelectTokenCard: (tokenId: string) => void
  onUpdateToken: (
    tokenId: string,
    updates: Partial<
      Pick<
        TokenRecord,
        'color' | 'size' | 'sizeScale' | 'viewDistance' | 'viewDistanceScale' | 'party' | 'name' | 'revealName' | 'hidden'
      >
    >,
  ) => Promise<void>
  onUpdateTokenSize: (tokenId: string, size: number) => Promise<void>
  onUpdateTokenViewDistance: (tokenId: string, viewDistance: number) => Promise<void>
  tokenViewDistanceSliderValue: (token: TokenRecord) => number
  onRequestDeleteToken: (tokenId: string) => void
  mapMonsters: MonsterSummary[]
}) {
  const toggleHidden = () => {
    void applyFogPreset(fullyHidden ? 'unhide-all' : 'hide-all')
  }

  const [tokenNameDrafts, setTokenNameDrafts] = useState<Record<string, string>>({})
  const [tokensCollapsed, setTokensCollapsed] = useState(false)
  const DistanceRollIcon =
    distanceTrackerMode === 'roll' && distanceTrackerRoll === 1
      ? Dice1
      : distanceTrackerMode === 'roll' && distanceTrackerRoll === 2
        ? Dice2
        : distanceTrackerMode === 'roll' && distanceTrackerRoll === 3
          ? Dice3
          : distanceTrackerMode === 'roll' && distanceTrackerRoll === 4
            ? Dice4
            : distanceTrackerMode === 'roll' && distanceTrackerRoll === 5
              ? Dice5
              : distanceTrackerMode === 'roll' && distanceTrackerRoll === 6
                ? Dice6
                : null
  const distanceFeetLabel = `${Math.max(0, Math.round(distanceTrackerFeet))}'`
  const distanceTrackerLabel = distanceTrackerMode === 'first' ? '1st' : distanceFeetLabel

  const commitTokenLabelEdit = async (token: TokenRecord, labelValue: string) => {
    const current = token.name.trim()
    const nextName = labelValue.trim()
    if (nextName !== current) {
      await onUpdateToken(token.id, { name: nextName })
    }

    setTokenNameDrafts((prev) => {
      const next = { ...prev }
      delete next[token.id]
      return next
    })
  }

  return (
    <div className={dark ? 'map-controls-body dark' : 'map-controls-body'}>
      <div className="map-icon-grid">
        <button
          type="button"
          className={fogTool === 'hide' ? 'map-icon-btn fast-tooltip active' : 'map-icon-btn fast-tooltip'}
          onClick={() => {
            setTokenSelectMode(false)
            setVisionTool(null)
            setFogTool(fogTool === 'hide' ? null : 'hide')
          }}
          aria-label="Spray fog brush"
          data-tooltip="Spray fog brush"
        >
          <SprayCan size={16} />
        </button>
        <button
          type="button"
          className={fogTool === 'reveal' ? 'map-icon-btn fast-tooltip active' : 'map-icon-btn fast-tooltip'}
          onClick={() => {
            setTokenSelectMode(false)
            setVisionTool(null)
            setFogTool(fogTool === 'reveal' ? null : 'reveal')
          }}
          aria-label="Eraser brush"
          data-tooltip="Eraser brush"
        >
          <Eraser size={16} />
        </button>
        <button
          type="button"
          className={visionTool === 'draw' ? 'map-icon-btn fast-tooltip active' : 'map-icon-btn fast-tooltip'}
          onClick={() => {
            setTokenSelectMode(false)
            setFogTool(null)
            setVisionTool(visionTool === 'draw' ? null : 'draw')
          }}
          aria-label="Vision wall brush"
          data-tooltip="Vision wall brush"
        >
          <Pencil size={16} />
        </button>
        <button
          type="button"
          className={visionTool === 'drawFull' ? 'map-icon-btn map-vision-full-btn fast-tooltip active' : 'map-icon-btn map-vision-full-btn fast-tooltip'}
          onClick={() => {
            setTokenSelectMode(false)
            setFogTool(null)
            setVisionTool(visionTool === 'drawFull' ? null : 'drawFull')
          }}
          aria-label="Full vision wall brush"
          data-tooltip="Full vision wall brush"
        >
          <PenTool size={16} />
        </button>
        <button
          type="button"
          className={visionTool === 'erase' ? 'map-icon-btn map-vision-erase-btn fast-tooltip active' : 'map-icon-btn map-vision-erase-btn fast-tooltip'}
          onClick={() => {
            setTokenSelectMode(false)
            setFogTool(null)
            setVisionTool(visionTool === 'erase' ? null : 'erase')
          }}
          aria-label="Erase vision wall brush"
          data-tooltip="Erase vision wall brush"
        >
          <X size={16} />
        </button>
        <div className="map-brush-control-inline" aria-label="Brush size">
          <input
            className="map-brush-control-slider"
            type="range"
            min={1}
            max={260}
            step={1}
            value={fogBrushSize}
            onChange={(event) => setFogBrushSize(Number(event.target.value))}
            aria-label="Brush size"
          />
          <span className="map-brush-control-value">{fogBrushSize}</span>
        </div>
        <button
          type="button"
          className={fullyHidden ? 'map-icon-btn map-hide-all-btn fast-tooltip active' : 'map-icon-btn map-hide-all-btn fast-tooltip'}
          onClick={toggleHidden}
          disabled={!canApplyPreset}
          aria-label={fullyHidden ? 'Unhide all' : 'Hide all'}
          data-tooltip={fullyHidden ? 'Unhide all' : 'Hide all'}
        >
          {fullyHidden ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
        <button
          type="button"
          className={tokenSelectMode ? 'map-icon-btn map-token-select-btn fast-tooltip active' : 'map-icon-btn map-token-select-btn fast-tooltip'}
          onClick={() => {
            const next = !tokenSelectMode
            setTokenSelectMode(next)
            if (next) {
              setFogTool(null)
              setVisionTool(null)
              setTokenPlaceMode(false)
              setAnnotationPlaceMode(false)
            }
          }}
          aria-label="Toggle token drag-select mode"
          data-tooltip="Token drag-select mode"
        >
          <SquareDashedMousePointer size={16} />
        </button>
        <button
          type="button"
          className={annotationPlaceMode ? 'map-icon-btn fast-tooltip active' : 'map-icon-btn fast-tooltip'}
          onClick={() => {
            const next = !annotationPlaceMode
            setAnnotationPlaceMode(next)
            if (next) {
              setTokenSelectMode(false)
              setTokenPlaceMode(false)
            }
          }}
          aria-label="Toggle annotation placement mode"
          data-tooltip="Annotation placement mode"
        >
          <Flag size={16} />
        </button>
        <button
          type="button"
          className={tokenPlaceMode ? 'map-icon-btn map-token-place-btn fast-tooltip active' : 'map-icon-btn map-token-place-btn fast-tooltip'}
          onClick={() => {
            const next = !tokenPlaceMode
            setTokenPlaceMode(next)
            if (next) {
              setTokenSelectMode(false)
              setAnnotationPlaceMode(false)
            }
          }}
          aria-label="Toggle token placement mode"
          data-tooltip="Token placement mode"
        >
          <ChessPawn size={16} />
        </button>
        <button
          type="button"
          className={streamingMode ? 'map-icon-btn fast-tooltip active' : 'map-icon-btn fast-tooltip'}
          onClick={() => setStreamingMode(!streamingMode)}
          aria-label="Toggle streaming mode"
          data-tooltip="Streaming mode"
        >
          <TvMinimalPlay size={16} />
        </button>
        <button
          type="button"
          className={
            gridAdjustMode && gridType === 'square'
              ? 'map-icon-btn map-grid-btn fast-tooltip fast-tooltip-right active'
              : 'map-icon-btn map-grid-btn fast-tooltip fast-tooltip-right'
          }
          onClick={() => onSetGridType('square')}
          aria-label="Square grid overlay"
          data-tooltip={gridAdjustMode && gridType === 'square' ? 'Cancel square grid' : 'Square grid'}
        >
          <Grid3X3 size={16} />
        </button>
        <button
          type="button"
          className={gridType === 'hex-pointy'
            ? 'map-icon-btn map-hex-pointy-btn fast-tooltip fast-tooltip-right active'
            : 'map-icon-btn map-hex-pointy-btn fast-tooltip fast-tooltip-right'}
          onClick={() => onSetGridType('hex-pointy')}
          disabled={hexDetecting}
          aria-label="Hex grid pointy-top orientation"
          data-tooltip={hexDetecting ? 'Detecting hex...' : 'Hex grid: pointy-top'}
        >
          {hexDetecting ? <LoaderCircle size={16} className="map-icon-spin" /> : <Hexagon size={16} />}
        </button>
        <button
          type="button"
          className={gridType === 'hex-flat'
            ? 'map-icon-btn map-hex-flat-btn fast-tooltip fast-tooltip-right active'
            : 'map-icon-btn map-hex-flat-btn fast-tooltip fast-tooltip-right'}
          onClick={() => onSetGridType('hex-flat')}
          disabled={hexDetecting}
          aria-label="Hex grid flat-top orientation"
          data-tooltip={hexDetecting ? 'Detecting hex...' : 'Hex grid: flat-top'}
        >
          {hexDetecting ? <LoaderCircle size={16} className="map-icon-spin" /> : <Hexagon size={16} className="map-hex-flat-icon" />}
        </button>
        <button
          type="button"
          className={gridVisible ? 'map-icon-btn map-grid-visibility-btn fast-tooltip fast-tooltip-right' : 'map-icon-btn map-grid-visibility-btn fast-tooltip fast-tooltip-right active'}
          onClick={onToggleGridVisible}
          aria-label="Toggle grid visibility"
          data-tooltip={gridVisible ? 'Hide grid' : 'Show grid'}
        >
          <EyeOff size={16} />
        </button>
        <button
          type="button"
          className={gridCalibrateMode ? 'map-icon-btn map-ruler-btn fast-tooltip fast-tooltip-right active' : 'map-icon-btn map-ruler-btn fast-tooltip fast-tooltip-right'}
          onClick={onToggleGridCalibrate}
          aria-label="Calibrate grid scale"
          data-tooltip={gridCalibrateMode ? 'Measuring' : "Calibrate 10'"}
        >
          <Ruler size={16} />
        </button>
        <button
          type="button"
          className={
            distanceTrackerMode === 'roll' || distanceTrackerMode === 'first'
              ? 'map-icon-btn map-distance-tracker-btn fast-tooltip fast-tooltip-right active'
              : 'map-icon-btn map-distance-tracker-btn fast-tooltip fast-tooltip-right'
          }
          onClick={onResetDistanceTracker}
          aria-label="Reset movement distance tracker"
          data-tooltip={
            distanceTrackerMode === 'roll'
              ? `d6: ${distanceTrackerRoll ?? '-'}`
              : distanceTrackerMode === 'first'
                ? `1st turn/${ENCOUNTER_CHECK_DISTANCE_FEET}'`
              : `${distanceFeetLabel}/${ENCOUNTER_CHECK_DISTANCE_FEET}'`
          }
        >
          {DistanceRollIcon ? (
            <DistanceRollIcon size={16} />
          ) : (
            <span className="map-distance-tracker-value">{distanceTrackerLabel}</span>
          )}
        </button>
      </div>
      {gridAdjustMode ? (
        <div className="map-grid-adjust-panel">
          <p className="map-grid-adjust-hint">Adjusting grid: mouse wheel scales, drag pans alignment.</p>
          {hexDetectConfidence !== null ? (
            <p className="map-grid-adjust-hint">
              Hex detect confidence: {Math.round(hexDetectConfidence * 100)}%.
            </p>
          ) : null}
          <ModeConfirmAction
            saved={gridAdjustSaved}
            label="Apply grid"
            onApply={onApplyGrid}
            ariaLabel="Apply grid"
            disabled={!gridAdjustReady}
          />
        </div>
      ) : null}
      {gridCalibrateMode ? (
        <div className="map-grid-calibration-panel">
          <p className="map-grid-calibration-hint">Click two points across one square side, then drag dots to refine.</p>
          <ModeConfirmAction
            saved={gridCalibrateSaved}
            label="Apply calibration"
            onApply={onApplyGridCalibration}
            ariaLabel="Apply calibration"
            disabled={!gridCalibrateReady}
          />
        </div>
      ) : null}
      {tokenPlaceMode ? (
        <div className="map-token-config">
          {(() => {
            const spawnMonster = mapMonsters.find((m) => m.id === selectedTokenAssetId) ?? null
            const combinedAssets = [
              ...tokenAssets.map((a) => ({ id: a.id, name: a.name, imageUrl: a.imageUrl, archived: a.archived })),
              ...mapMonsters.map((m) => ({
                id: m.id,
                name: m.name,
                imageUrl: m.tokenIcon.icon === 'custom' ? (m.tokenIcon.customImageUrl ?? '') : '',
                archived: false as const,
                monsterId: m.id,
              })),
            ]
            const effectiveImageUrl = spawnMonster
              ? (spawnMonster.tokenIcon.icon === 'custom' ? spawnMonster.tokenIcon.customImageUrl ?? '' : '')
              : selectedTokenImageUrl
            return (
              <TokenIconEditor
                className="map-token-icon-editor"
                minSize={16}
                maxSize={TOKEN_SIZE_MAX}
                value={{ icon: selectedTokenAssetId ? 'custom' : 'pawn', color: tokenColor, size: tokenSize } satisfies TokenIconConfig}
                onChange={(next) => {
                  setTokenColor(next.color)
                  setTokenSize(next.size)
                }}
                tokenAssets={combinedAssets}
                selectedTokenAssetId={selectedTokenAssetId}
                onSelectedTokenAssetIdChange={setSelectedTokenAssetId}
                onArchiveTokenAsset={onArchiveTokenAsset}
                onRequestDeleteTokenAsset={onRequestDeleteTokenAsset}
                selectedTokenImageUrl={effectiveImageUrl}
                uploadingTokenImage={uploadingTokenImage}
                onUploadTokenImage={onUploadTokenImage}
              />
            )
          })()}
        </div>
      ) : null}
      {!streamingMode ? (
        <section className="token-cards-panel" aria-label="Token cards">
          <div className="token-cards-header">
            <h4 className="token-cards-title">Tokens</h4>
            <button
              type="button"
              className="token-cards-toggle fast-tooltip"
              onClick={() => setTokensCollapsed((current) => !current)}
              aria-label={tokensCollapsed ? 'Expand tokens' : 'Collapse tokens'}
              data-tooltip={tokensCollapsed ? 'Expand tokens' : 'Collapse tokens'}
            >
              {tokensCollapsed ? '+' : '-'}
            </button>
          </div>
          {!tokensCollapsed ? (
            <div className="token-list">
            {tokens.map((token, index) => (
              <div
                key={token.id}
                className={selectedTokenIds.includes(token.id) ? 'token-row selected' : 'token-row'}
                onClick={() => onSelectTokenCard(token.id)}
              >
              <span className="token-row-icon" style={{ color: token.color }} aria-hidden>
                {token.tokenImageUrl ? (
                  <img src={token.tokenImageUrl} alt="" className="token-row-image" />
                ) : (
                  <ChessPawn size={14} />
                )}
              </span>
              <input
                type="text"
                className="token-row-label-input"
                value={tokenNameDrafts[token.id] ?? token.name}
                onFocus={() =>
                  setTokenNameDrafts((prev) => ({
                    ...prev,
                    [token.id]: token.name,
                  }))
                }
                onChange={(event) =>
                  setTokenNameDrafts((prev) => ({
                    ...prev,
                    [token.id]: event.target.value,
                  }))
                }
                onBlur={(event) => void commitTokenLabelEdit(token, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur()
                  }
                }}
                aria-label={`Token ${index + 1} name`}
                placeholder={`Token ${index + 1}`}
              />
              {!token.tokenImageUrl ? (
                <input
                  type="color"
                  value={token.color}
                  onChange={(event) => void onUpdateToken(token.id, { color: event.target.value })}
                  aria-label={`Token ${index + 1} color`}
                />
              ) : null}
              <button
                type="button"
                className="token-row-delete"
                onClick={() => onRequestDeleteToken(token.id)}
                aria-label={`Delete token ${index + 1}`}
                title="Delete token"
              >
                <Trash2 size={14} />
              </button>
              <IconValueSlider
                className="token-row-size-row"
                icon={<ALargeSmall size={14} />}
                tooltip="Token Size"
                value={token.size}
                min={16}
                max={TOKEN_SIZE_MAX}
                step={1}
                ariaLabel={`Token ${index + 1} size`}
                onChange={(nextSize) => void onUpdateTokenSize(token.id, nextSize)}
              />
              <div className="token-row-toggles">
                <button
                  type="button"
                  className={token.party ? 'token-toggle-btn map-icon-btn fast-tooltip active' : 'token-toggle-btn map-icon-btn fast-tooltip'}
                  onClick={() => {
                    const next = !token.party
                    if (next) {
                      const viewDistance = tokenViewDistanceSliderValue(token)
                      void onUpdateToken(token.id, {
                        party: next,
                        viewDistance,
                      })
                      return
                    }
                    void onUpdateToken(token.id, { party: next })
                  }}
                  aria-label="Toggle party token"
                  data-tooltip="Party token"
                >
                  <User size={14} />
                </button>
                <button
                  type="button"
                  className={token.revealName ? 'token-toggle-btn map-icon-btn fast-tooltip active' : 'token-toggle-btn map-icon-btn fast-tooltip'}
                  onClick={() => void onUpdateToken(token.id, { revealName: !token.revealName })}
                  aria-label="Toggle reveal name"
                  data-tooltip="Reveal name"
                >
                  <Tag size={14} />
                </button>
                <button
                  type="button"
                  className={token.hidden ? 'token-toggle-btn map-icon-btn fast-tooltip active' : 'token-toggle-btn map-icon-btn fast-tooltip'}
                  onClick={() => void onUpdateToken(token.id, { hidden: !token.hidden })}
                  aria-label="Toggle hide token"
                  data-tooltip="Hide token"
                >
                  <EyeOff size={14} />
                </button>
              </div>
              {token.party ? (
                <div className="token-view-distance" aria-label="Token view distance">
                  <span className="token-view-distance-icon fast-tooltip" data-tooltip="View Distance" aria-hidden>
                    <Binoculars size={14} />
                  </span>
                  <input
                    className="token-view-distance-slider"
                    type="range"
                    min={8}
                    max={600}
                    step={2}
                    value={tokenViewDistanceSliderValue(token)}
                    onChange={(event) => void onUpdateTokenViewDistance(token.id, Number(event.target.value))}
                  />
                  <span className="token-view-distance-value">{tokenViewDistanceSliderValue(token)}</span>
                </div>
              ) : null}
            </div>
          ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
