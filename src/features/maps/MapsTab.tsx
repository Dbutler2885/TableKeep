import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type {
  ChangeEventHandler,
  MouseEventHandler,
  TouchEventHandler,
} from 'react'
import {
  Check,
  ChessPawn,
  ScrollText,
  ChevronLeft,
  ChevronRight,
  Circle,
  Map as MapIcon,
  Minus,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  TvMinimalPlay,
  Upload,
  X,
} from 'lucide-react'
import type { Role } from '../../types/app'
import { CharacterTab } from '../character/CharacterTab'
import { ConfirmModal } from '../common/ConfirmModal'
import type {
  MapRecord,
  TokenPathAnimation,
  TokenRecord,
  Waypoint,
} from './lib/types'
import {
  ENCOUNTER_CHECK_DISTANCE_FEET,
  ENCOUNTER_CHECK_TURNS,
  FOG_CANVAS_MAX_DIM,
  TOKEN_REFERENCE_DIMENSION,
} from './lib/constants'
import {
  renderTokenDimensions as calculateTokenDimensions,
  renderTokenViewDistance as calculateTokenViewDistance,
  tokenViewDistanceSliderValue,
} from './lib/tokenRenderGeometry'
import {
  clientPointToNormalizedPoint,
  tokenPointToCanvasPoint as calculateTokenCanvasPoint,
} from './lib/canvasCoordinates'
import { isGridAdjustDirty } from './lib/gridAdjustDirty'
import { measurementDistanceFeet, measurementDistanceLabel } from './lib/measurementDistance'
import { useVisionReveal } from './hooks/useVisionReveal'
import { isTokenVisibleOnFog, isTokenPartiallyVisibleOnFog } from './lib/tokenVisibility'
import { activeToolReducer, initialActiveToolState, type ActiveMapTool } from './lib/activeToolState'
import { resolveMapInteractionIntent, type MapInteractionButton } from './lib/mapInteractionResolution'
import { getMapToolGuidance, MAP_INTERACTION_HELP_SECTIONS } from './lib/toolGuidance'
import {
  dropTokenPlacement,
  getTokenPlacementDisplay,
  startMonsterTokenPlacement,
  startOneAtATimeTokenPlacement,
  startWholePartyTokenPlacement,
  type MonsterTokenPlacementSource,
  type TokenPlacementQueueState,
  type TokenPlacementSource,
} from './lib/tokenPlacementQueue'
import {
  buildWholePartyTokenPlacementSources,
  toGenericTokenPlacementSource,
  toMonsterTokenPlacementSource,
  toNpcTokenPlacementSource,
} from './lib/tokenPlacementSources'
import { isPlayerOwnedLivingPartyCharacter } from './lib/partyCharacterEligibility'
import { GridOverlay } from './components/GridOverlay'
import { PlayerMapControls } from './components/PlayerMapControls'
import { TokenLayer } from './components/TokenLayer'
import { AnnotationLayer } from './components/AnnotationLayer'
import { MapDrawingEditor, type BlankMapSceneResult } from './components/MapDrawingEditor'
import { InlineMapStage } from './components/InlineMapStage'
import { GmMapTopToolPanel } from './components/GmMapTopToolPanel'
import { GmMapControls } from './components/GmMapControls'
import { normalizeTokenRotation } from './lib/tokenRotation'
import { MOBILE_BREAKPOINT } from '../../constants/layout'
import { useGridTools } from './hooks/useGridTools'
import { useMapWorkspace } from './hooks/useMapWorkspace'
import { useMapData } from './hooks/useMapData'
import { useMapViewport } from './hooks/useMapViewport'
import { useFogTools } from './hooks/useFogTools'
import { useTokenSelection } from './hooks/useTokenSelection'
import { useTokenAnimation } from './hooks/useTokenAnimation'
import { useTokenDrag } from './hooks/useTokenDrag'
import { useEncounterTracking } from './hooks/useEncounterTracking'
import { useTokenAssets } from './hooks/useTokenAssets'


export function MapsTab({
  campaignId,
  groupId,
  role,
  gmUserId,
  characterTabProps,
}: {
  campaignId: string
  groupId: string
  role: Role | null
  gmUserId: string | null
  characterTabProps?: React.ComponentProps<typeof CharacterTab>
}) {
  const workspaceGroupId = groupId
  const [selectedMapId, setSelectedMapId] = useState('')
  const { phase, runSession, enterRun, exitRun, resetToPreview } = useMapWorkspace()
  const [isMobile, setIsMobile] = useState<boolean>(() => window.innerWidth <= MOBILE_BREAKPOINT)
  const [mobileMapView, setMobileMapView] = useState<'list' | 'detail'>('list')
  const [mobileGmPane, setMobileGmPane] = useState<'map' | 'tokens' | 'characters'>('map')
  const [mobilePlayerPane, setMobilePlayerPane] = useState<'map' | 'controls' | 'character'>('map')
  const [playerEmbeddedPane, setPlayerEmbeddedPane] = useState<'map' | 'character'>('map')
  const [desktopGmPane, setDesktopGmPane] = useState<'map' | 'character'>('map')
  const [selectedGmCharacterId, setSelectedGmCharacterId] = useState('')
  const [interactionHelpOpen, setInteractionHelpOpen] = useState(false)
  const [activeToolState, dispatchActiveTool] = useReducer(activeToolReducer, initialActiveToolState)
  const [placementQueue, setPlacementQueue] = useState<TokenPlacementQueueState | null>(null)
  const [fogBrushSize, setFogBrushSize] = useState(120)
  const fogBrushStrength = 0.7
  // When set, the blank-map drawing editor (Excalidraw) is open for this map id.
  const [drawingEditorMapId, setDrawingEditorMapId] = useState<string | null>(null)
  const [npcSceneMode, setNpcSceneMode] = useState(false)
  const [tokenColor, setTokenColor] = useState('#b45309')
  const [tokenSize, setTokenSize] = useState(28)
  const [inlineBaseSize, setInlineBaseSize] = useState({ width: 0, height: 0 })
  const [inlineFogSize, setInlineFogSize] = useState({ width: 0, height: 0 })
  const [inlineImageReady, setInlineImageReady] = useState(false)
  const inlineMapLayerRef = useRef<HTMLDivElement | null>(null)
  const inlineStageRef = useRef<HTMLDivElement | null>(null)
  const selectedMapRef = useRef<MapRecord | null>(null)
  const brushCursorRef = useRef<HTMLDivElement | null>(null)
  const brushCursorClientRef = useRef<{ x: number; y: number } | null>(null)
  const suppressNextMapClickRef = useRef(false)
  const inlineLosSeenCanvasRef = useRef<HTMLCanvasElement | null>(null)
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
  const pendingPlacedTokenNamesRef = useRef<string[]>([])

  useEffect(() => {
    const updateMobileState = () => {
      const mobile = window.innerWidth <= MOBILE_BREAKPOINT
      setIsMobile(mobile)
      if (!mobile) {
        setMobileMapView('list')
        setMobileGmPane('map')
        setMobilePlayerPane('map')
      }
    }

    updateMobileState()
    window.addEventListener('resize', updateMobileState)
    return () => window.removeEventListener('resize', updateMobileState)
  }, [])

  // --- GM map workspace phase (desktop only; mobile keeps its pane navigation) ---
  const desktopGm = role === 'gm' && !isMobile
  const desktopGmRun = desktopGm && phase === 'run'
  const previewMode = desktopGm && phase === 'preview'
  const fogTool = activeToolState.activeTool?.type === 'fog' ? activeToolState.activeTool.tool : null
  const visionTool = activeToolState.activeTool?.type === 'vision'
    ? activeToolState.activeTool.tool === 'hardBlock'
      ? 'drawFull'
      : activeToolState.activeTool.tool === 'softBlock'
        ? 'draw'
        : 'erase'
    : null
  const tokenSelectMode = activeToolState.activeTool?.type === 'boxSelect'
  const annotationPlaceMode =
    activeToolState.activeTool?.type === 'annotation' && activeToolState.activeTool.tool === 'marker'
  const playerLabelPlaceMode =
    activeToolState.activeTool?.type === 'annotation' && activeToolState.activeTool.tool === 'playerLabel'
  const handToolActive = activeToolState.activeTool?.type === 'hand'
  const gmHideLabels = activeToolState.toggles.gmHideLabels
  // Player View Preview: an independent visibility toggle (slice 02 reducer) that lets
  // the GM see the player-facing map layer state while keeping GM controls visible. It
  // is NOT a screen-share mode. It coexists with active tools (toggling it never changes
  // the active tool).
  const playerViewPreview = activeToolState.toggles.playerViewPreview
  // Whether the GM stage renders the player-facing map state. Map Preview is always
  // player-facing (read-only); in Map Run the Player View Preview toggle drives it.
  const viewAsPlayer = playerViewPreview || previewMode

  const showListPane = isMobile ? mobileMapView === 'list' : !desktopGmRun
  const showMapPane = !isMobile || mobileMapView === 'detail'
  const showEmbeddedCharacter = role !== 'gm' && !!characterTabProps && (isMobile ? mobilePlayerPane === 'character' : playerEmbeddedPane === 'character')
  const showEmbeddedMap = role === 'gm' || !characterTabProps || (isMobile ? mobilePlayerPane !== 'character' : playerEmbeddedPane === 'map')
  const fogDisplayOpacity = role === 'gm' ? (viewAsPlayer ? 1 : 0.45) : 1
  const visionOverlayOpacity = role === 'gm' && !viewAsPlayer && visionTool ? 0.38 : 0
  const losSeenOverlayOpacity = role === 'gm' && !viewAsPlayer ? 0.75 : 0
  const activeMapLayerRef = inlineMapLayerRef
  const activeMapDimension = Math.max(
    1,
    Math.min(inlineBaseSize.width, inlineBaseSize.height),
  )
  const activeMapWidth = inlineBaseSize.width
  const activeMapHeight = inlineBaseSize.height
  const activeFogDimension = Math.max(
    1,
    Math.min(inlineFogSize.width, inlineFogSize.height),
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
    mapCharacters,
    mapNpcs,
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
    handleCreateBlankMap,
    startRename,
    saveRename,
    deleteMap,
    togglePlayerVisibility,
    handleDragStart,
    handleDrop,
    updateToken,
    requestDeleteTokens,
    confirmDeleteToken,
    toggleTokenHidden,
    placeQueuedToken,
    updateSceneNpcIds,
    setPresentedNpcId,
    placeAnnotation,
    commitActiveAnnotation,
    deleteAnnotation,
    toggleAnnotationHidden,
    toggleAnnotationPointerDirection,
    moveAnnotationPosition,
    persistAnnotationPosition,
    saveBlankMapDrawing,
    saveTokenAssetFile,
    archiveTokenAsset,
    requestDeleteTokenAsset,
    confirmDeleteTokenAsset,
  } = useMapData({
    campaignId,
    groupId: workspaceGroupId,
    role,
    selectedMapId,
    setSelectedMapId,
    getDropPoint: (clientX, clientY) => getDropPointRef.current(clientX, clientY),
    tokensRef,
    recentlyDroppedRef,
    lastAnimatedPathIdRef,
    startTokenPathAnimationRef,
  })

  useEffect(() => {
    selectedMapRef.current = selectedMap
  }, [selectedMap])

  const sceneNpcs = useMemo(
    () => mapNpcs.filter((npc) => selectedMap?.sceneNpcIds.includes(npc.id)),
    [mapNpcs, selectedMap?.sceneNpcIds],
  )
  const presentedNpc = useMemo(
    () => mapNpcs.find((npc) => npc.id === selectedMap?.presentedNpcId) ?? null,
    [mapNpcs, selectedMap?.presentedNpcId],
  )
  const partyPlacementSources = useMemo(
    () => buildWholePartyTokenPlacementSources(mapCharacters, gmUserId),
    [gmUserId, mapCharacters],
  )
  const monsterPlacementSources = useMemo(
    () => mapMonsters.map(toMonsterTokenPlacementSource),
    [mapMonsters],
  )
  const npcPlacementSources = useMemo(
    () => mapNpcs.map(toNpcTokenPlacementSource),
    [mapNpcs],
  )
  const genericPlacementSources = useMemo(
    () => tokenAssets.filter((asset) => !asset.archived).map(toGenericTokenPlacementSource),
    [tokenAssets],
  )
  const placementDisplay = useMemo(
    () => getTokenPlacementDisplay(placementQueue),
    [placementQueue],
  )
  const gmCharacterOrderIds = useMemo(
    () => partyPlacementSources.map((source) => source.id),
    [partyPlacementSources],
  )
  const gmWorkspaceCharacters = useMemo(() => {
    if (!characterTabProps) return []
    const eligibleCharacters = characterTabProps.characters.filter((character) =>
      isPlayerOwnedLivingPartyCharacter(character, gmUserId),
    )
    const byId = new Map<string, (typeof eligibleCharacters)[number]>(
      eligibleCharacters.map((character) => [character.id, character]),
    )
    const ordered = gmCharacterOrderIds
      .map((id) => byId.get(id))
      .filter((character): character is NonNullable<typeof character> => Boolean(character))
    const orderedIds = new Set(ordered.map((character) => character.id))
    const extras = eligibleCharacters
      .filter((character) => !orderedIds.has(character.id))
      .sort((a, b) => a.name.localeCompare(b.name))
    return [...ordered, ...extras]
  }, [characterTabProps, gmCharacterOrderIds, gmUserId])
  const selectedGmCharacter = useMemo(
    () => gmWorkspaceCharacters.find((character) => character.id === selectedGmCharacterId) ?? gmWorkspaceCharacters[0] ?? null,
    [gmWorkspaceCharacters, selectedGmCharacterId],
  )
  const selectedGmCharacterIndex = selectedGmCharacter
    ? Math.max(0, gmWorkspaceCharacters.findIndex((character) => character.id === selectedGmCharacter.id))
    : -1
  const selectedGmCharacterTabProps = selectedGmCharacter && characterTabProps
    ? {
      ...characterTabProps,
      characters: [selectedGmCharacter],
      selectedCharacterId: selectedGmCharacter.id,
      selectedCharacter: selectedGmCharacter,
    }
    : null

  useEffect(() => {
    if (gmWorkspaceCharacters.length === 0) {
      setSelectedGmCharacterId('')
      if (desktopGmPane === 'character') setDesktopGmPane('map')
      if (mobileGmPane === 'characters') setMobileGmPane('map')
      return
    }
    if (!gmWorkspaceCharacters.some((character) => character.id === selectedGmCharacterId)) {
      setSelectedGmCharacterId(gmWorkspaceCharacters[0].id)
    }
  }, [desktopGmPane, gmWorkspaceCharacters, mobileGmPane, selectedGmCharacterId])

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
    return () => {
      cleanupInline()
    }
  }, [
    selectedMap?.id,
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
    groupId: workspaceGroupId,
    role,
    selectedMap,
    setMapError,
    isMobile,
    mobileGmPane,
    mobilePlayerPane,
    inlineFogSize,
    fogTool,
    visionTool,
    tokenPlaceMode: placementQueue !== null,
    fogBrushSize,
    activeFogDimension,
    fogBrushStrength,
    tokenAnimationsRef,
    pendingFogReloadRef,
  })
  const {
    fogDrawing,
    pauseFogStroke,
    inlineFogReady,
    effectiveFogBrushSize,
    inlineFogCanvasRef,
    inlineVisionCanvasRef,
    activeFogCanvasRef,
    activeVisionCanvasRef,
    persistFog,
    markFogLocalEdit,
    beginFogLocalEdit,
    endFogLocalEdit,
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
  } = fog

  const activeBrushTool = role === 'gm' && placementQueue === null && Boolean(fogTool || visionTool)
  const brushCursorMode = fogTool
    ? `fog-${fogTool}`
    : visionTool === 'drawFull'
      ? 'vision-draw-full'
      : visionTool
        ? `vision-${visionTool}`
        : ''

  const hideBrushCursor = useCallback(() => {
    const cursor = brushCursorRef.current
    brushCursorClientRef.current = null
    if (!cursor) return
    cursor.dataset.visible = 'false'
  }, [])

  const updateBrushCursorFromClient = useCallback((clientX: number, clientY: number) => {
    if (!activeBrushTool) {
      hideBrushCursor()
      return
    }
    const canvas = activeFogCanvasRef.current
    const cursor = brushCursorRef.current
    if (!canvas || !cursor) return
    const rect = canvas.getBoundingClientRect()
    const layoutWidth = canvas.offsetWidth
    const layoutHeight = canvas.offsetHeight
    // canvas.width/height of 1 is the un-sized placeholder (Math.max(1, inlineFogSize.*))
    // before fog dimensions are measured. Dividing the brush size by it inflates the
    // cursor to ~full-map size (the stray giant oval), so treat it as not-ready.
    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      layoutWidth <= 0 ||
      layoutHeight <= 0 ||
      canvas.width <= 1 ||
      canvas.height <= 1
    ) {
      hideBrushCursor()
      return
    }
    const x = Math.max(0, Math.min(layoutWidth, ((clientX - rect.left) / rect.width) * layoutWidth))
    const y = Math.max(0, Math.min(layoutHeight, ((clientY - rect.top) / rect.height) * layoutHeight))
    const width = Math.max(1, (effectiveFogBrushSize / canvas.width) * layoutWidth)
    const height = Math.max(1, (effectiveFogBrushSize / canvas.height) * layoutHeight)
    cursor.style.setProperty('--brush-cursor-x', `${x}px`)
    cursor.style.setProperty('--brush-cursor-y', `${y}px`)
    cursor.style.width = `${width}px`
    cursor.style.height = `${height}px`
    brushCursorClientRef.current = { x: clientX, y: clientY }
    cursor.dataset.visible = 'true'
  }, [activeBrushTool, activeFogCanvasRef, effectiveFogBrushSize, hideBrushCursor])

  useEffect(() => {
    hideBrushCursor()
  }, [brushCursorMode, hideBrushCursor, selectedMap?.id])

  useEffect(() => {
    const point = brushCursorClientRef.current
    if (!point) return
    updateBrushCursorFromClient(point.x, point.y)
  }, [effectiveFogBrushSize, updateBrushCursorFromClient])

  const handleBrushCanvasMouseDown: MouseEventHandler<HTMLCanvasElement> = (event) => {
    updateBrushCursorFromClient(event.clientX, event.clientY)
    handleFogPointerDown(event)
  }

  const handleBrushCanvasMouseMove: MouseEventHandler<HTMLCanvasElement> = (event) => {
    updateBrushCursorFromClient(event.clientX, event.clientY)
    if (fogDrawing && (event.buttons & 1) !== 1) {
      handleFogPointerUp()
      return
    }
    handleFogPointerMove(event)
  }

  const handleBrushCanvasMouseEnter: MouseEventHandler<HTMLCanvasElement> = (event) => {
    updateBrushCursorFromClient(event.clientX, event.clientY)
    if (!fogDrawing) return
    if ((event.buttons & 1) !== 1) {
      handleFogPointerUp()
      return
    }
    handleFogPointerMove(event)
  }

  const handleBrushCanvasMouseUp: MouseEventHandler<HTMLCanvasElement> = (event) => {
    updateBrushCursorFromClient(event.clientX, event.clientY)
    handleFogPointerUp()
  }

  const handleBrushCanvasMouseLeave: MouseEventHandler<HTMLCanvasElement> = (event) => {
    hideBrushCursor()
    pauseFogStroke()
    if (fogDrawing && (event.buttons & 1) !== 1) {
      handleFogPointerUp()
    }
  }

  const handleBrushCanvasTouchStart: TouchEventHandler<HTMLCanvasElement> = (event) => {
    const touch = event.touches[0]
    if (touch) updateBrushCursorFromClient(touch.clientX, touch.clientY)
    handleFogTouchStart(event)
  }

  const handleBrushCanvasTouchMove: TouchEventHandler<HTMLCanvasElement> = (event) => {
    const touch = event.touches[0]
    if (touch) updateBrushCursorFromClient(touch.clientX, touch.clientY)
    handleFogTouchMove(event)
  }

  const handleBrushCanvasTouchEnd: TouchEventHandler<HTMLCanvasElement> = (event) => {
    hideBrushCursor()
    handleFogTouchEnd(event)
  }

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
    const layer = activeMapLayerRef.current
    return clientPointToNormalizedPoint(
      { clientX, clientY },
      canvas ? { rect: canvas.getBoundingClientRect(), width: canvas.width, height: canvas.height } : null,
      layer?.getBoundingClientRect() ?? null,
    )
  }

  // Keep getDropPointRef in sync so useMapData (called below) can use it.
  getDropPointRef.current = getTokenDropPoint

  const grid = useGridTools({
    selectedMap,
    role,
    campaignId,
    groupId: workspaceGroupId,
    activeMapWidth,
    activeMapHeight,
    activeMapDimension,
    inlineBaseSize,
    setMaps,
    setMapError,
    getTokenDropPoint,
    resetDistanceTracker,
  })

  const {
    gridCalibrateMode,
    gridMeasureMode,
    gridAdjustMode,
    gridAdjustDraft,
    gridCalibrateStart,
    gridCalibrateEnd,
    gridCalibratePreview,
    gridMeasureStart,
    gridMeasureEnd,
    gridMeasurePreview,
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
    toggleGridMeasureMode,
    toggleGridVisibility,
    setGridType,
    applyGridAdjust,
    applyGridCalibration,
    resetGrid,
    handleGridLayerWheel,
    handleGridLayerMouseDown,
    handleGridCalibrateClick,
    handleGridMeasureClick,
    handleGridCalibrateMouseMove,
    handleGridMeasureMouseMove,
    handleGridMeasureHandleMouseDown,
    handleGridCalibrateHandleMouseDown,
  } = grid

  const activeGridCellPx = Math.max(
    8,
    Math.min(520, Math.round(effectiveGridCellScale * activeMapDimension)),
  )
  const toolGuidance = useMemo(
    () => getMapToolGuidance(activeToolState, placementDisplay, { gridAdjustMode }),
    [activeToolState, gridAdjustMode, placementDisplay],
  )

  const renderMapGridOverlay = () => (
    <GridOverlay
      enabled={effectiveGridEnabled}
      visible={effectiveGridVisible}
      type={effectiveGridType}
      pending={gridAdjustMode}
      cellScale={effectiveGridCellScale}
      offsetX={effectiveGridOffsetX}
      offsetY={effectiveGridOffsetY}
      mapWidth={Math.max(1, inlineBaseSize.width)}
      mapHeight={Math.max(1, inlineBaseSize.height)}
    />
  )
  const activeAnnotation = annotations.find((annotation) => annotation.id === activeAnnotationId) ?? null
  const gridAdjustReady = isGridAdjustDirty(selectedMap, gridAdjustDraft)
  const handleApplyGridCalibration = useCallback(() => {
    void applyGridCalibration().catch((error) => {
      const message = error instanceof Error ? error.message : 'Failed to save grid calibration'
      setMapError(message)
    })
  }, [applyGridCalibration, setMapError])
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
  const gridMeasurementLine = useMemo(() => {
    if (!gridMeasureMode || !gridMeasureStart) return null
    const end = gridMeasureEnd ?? gridMeasurePreview
    if (!end) return null
    return { start: gridMeasureStart, end }
  }, [gridMeasureEnd, gridMeasureMode, gridMeasurePreview, gridMeasureStart])
  const measurementFeet = useMemo(() => {
    return measurementDistanceFeet({
      line: gridMeasurementLine,
      effectiveGridCellScale,
      activeMapDimension,
      activeMapWidth,
      activeMapHeight,
    })
  }, [activeMapDimension, activeMapHeight, activeMapWidth, effectiveGridCellScale, gridMeasurementLine])
  const measurementFeetLabel = useMemo(() => measurementDistanceLabel(measurementFeet), [measurementFeet])
  const measurementToolEnabled = effectiveGridEnabled || gridAdjustMode || Boolean(selectedMap?.gridCalibrated)

  const closeActiveMeasurementMode = useCallback(() => {
    if (gridCalibrateMode) toggleGridCalibrateMode()
    if (gridMeasureMode) toggleGridMeasureMode()
  }, [gridCalibrateMode, gridMeasureMode, toggleGridCalibrateMode, toggleGridMeasureMode])

  const clearActiveToolIfCurrent = useCallback((matches: (tool: ActiveMapTool) => boolean) => {
    const current = activeToolState.activeTool
    if (current && matches(current)) dispatchActiveTool({ type: 'clearActiveTool' })
  }, [activeToolState.activeTool])

  const setFogTool = useCallback((tool: 'reveal' | 'hide' | null) => {
    if (activeToolState.activeTool?.type === 'measurement') closeActiveMeasurementMode()
    if (!tool) {
      clearActiveToolIfCurrent((current) => current.type === 'fog')
      return
    }
    setPlacementQueue(null)
    dispatchActiveTool({ type: 'selectTool', tool: { type: 'fog', tool } })
  }, [activeToolState.activeTool?.type, clearActiveToolIfCurrent, closeActiveMeasurementMode])

  const setVisionTool = useCallback((tool: 'draw' | 'drawFull' | 'erase' | null) => {
    if (activeToolState.activeTool?.type === 'measurement') closeActiveMeasurementMode()
    if (!tool) {
      clearActiveToolIfCurrent((current) => current.type === 'vision')
      return
    }
    const visionBlockTool = tool === 'drawFull' ? 'hardBlock' : tool === 'draw' ? 'softBlock' : 'erase'
    setPlacementQueue(null)
    dispatchActiveTool({ type: 'selectTool', tool: { type: 'vision', tool: visionBlockTool } })
  }, [activeToolState.activeTool?.type, clearActiveToolIfCurrent, closeActiveMeasurementMode])

  const openDrawingEditor = useCallback(async (mapId?: string) => {
    if (role !== 'gm') return
    if (mapId) {
      setDrawingEditorMapId(mapId)
      return
    }
    const newId = await handleCreateBlankMap()
    if (newId) setDrawingEditorMapId(newId)
  }, [handleCreateBlankMap, role])

  const handleSaveBlankDrawing = useCallback(async (result: BlankMapSceneResult) => {
    if (!drawingEditorMapId) return
    await saveBlankMapDrawing(drawingEditorMapId, result.sceneJson, result.blob, result.width, result.height)
    setDrawingEditorMapId(null)
  }, [drawingEditorMapId, saveBlankMapDrawing])

  const drawingEditorMap = drawingEditorMapId
    ? maps.find((map) => map.id === drawingEditorMapId) ?? null
    : null

  const setTokenSelectMode = useCallback((value: boolean) => {
    if (activeToolState.activeTool?.type === 'measurement') closeActiveMeasurementMode()
    if (!value) {
      clearActiveToolIfCurrent((current) => current.type === 'boxSelect')
      return
    }
    setPlacementQueue(null)
    dispatchActiveTool({ type: 'selectTool', tool: { type: 'boxSelect' } })
  }, [activeToolState.activeTool?.type, clearActiveToolIfCurrent, closeActiveMeasurementMode])

  const setAnnotationPlaceMode = useCallback((value: boolean) => {
    if (activeToolState.activeTool?.type === 'measurement') closeActiveMeasurementMode()
    if (!value) {
      clearActiveToolIfCurrent((current) => current.type === 'annotation' && current.tool === 'marker')
      return
    }
    setPlacementQueue(null)
    dispatchActiveTool({ type: 'selectTool', tool: { type: 'annotation', tool: 'marker' } })
  }, [activeToolState.activeTool?.type, clearActiveToolIfCurrent, closeActiveMeasurementMode])

  const setPlayerLabelPlaceMode = useCallback((value: boolean) => {
    if (activeToolState.activeTool?.type === 'measurement') closeActiveMeasurementMode()
    if (!value) {
      clearActiveToolIfCurrent((current) => current.type === 'annotation' && current.tool === 'playerLabel')
      return
    }
    setPlacementQueue(null)
    dispatchActiveTool({ type: 'selectTool', tool: { type: 'annotation', tool: 'playerLabel' } })
  }, [activeToolState.activeTool?.type, clearActiveToolIfCurrent, closeActiveMeasurementMode])

  const setHandToolActive = useCallback((value: boolean) => {
    if (activeToolState.activeTool?.type === 'measurement') closeActiveMeasurementMode()
    if (!value) {
      clearActiveToolIfCurrent((current) => current.type === 'hand')
      return
    }
    setPlacementQueue(null)
    dispatchActiveTool({ type: 'selectTool', tool: { type: 'hand' } })
  }, [activeToolState.activeTool?.type, clearActiveToolIfCurrent, closeActiveMeasurementMode])

  const setGmHideLabels = useCallback((value: boolean) => {
    dispatchActiveTool({ type: 'setGmHideLabels', hidden: value })
  }, [])

  // Independent toggle: never touches the active tool.
  const setPlayerViewPreview = useCallback((value: boolean) => {
    dispatchActiveTool({ type: 'setPlayerViewPreview', enabled: value })
  }, [])

  const resetActiveMapTools = useCallback(() => {
    dispatchActiveTool({ type: 'reset' })
    setPlacementQueue(null)
  }, [])

  const toggleGridCalibrateTool = useCallback(() => {
    setPlacementQueue(null)
    dispatchActiveTool({ type: 'toggleTool', tool: { type: 'measurement', tool: 'calibrateGrid' } })
    toggleGridCalibrateMode()
  }, [toggleGridCalibrateMode])

  const toggleGridMeasureTool = useCallback(() => {
    setPlacementQueue(null)
    dispatchActiveTool({ type: 'toggleTool', tool: { type: 'measurement', tool: 'measureDistance' } })
    toggleGridMeasureMode()
  }, [toggleGridMeasureMode])

  const setGridTypeTool = useCallback((gridType: 'square' | 'hex-pointy' | 'hex-flat') => {
    if (activeToolState.activeTool?.type === 'measurement') {
      dispatchActiveTool({ type: 'clearActiveTool' })
    }
    setPlacementQueue(null)
    setGridType(gridType)
  }, [activeToolState.activeTool?.type, setGridType])

  const startSinglePlacement = useCallback((
    source: Exclude<TokenPlacementSource, MonsterTokenPlacementSource>,
  ) => {
    const queue = startOneAtATimeTokenPlacement(source)
    setPlacementQueue(queue)
    dispatchActiveTool({
      type: 'startTokenPlacement',
      placement: { kind: source.kind, queueId: `${source.kind}-${source.id}` },
    })
  }, [])

  const startWholePartyPlacement = useCallback(() => {
    const queue = startWholePartyTokenPlacement(partyPlacementSources)
    if (!queue) return
    setPlacementQueue(queue)
    dispatchActiveTool({
      type: 'startTokenPlacement',
      placement: { kind: 'wholeParty', queueId: 'whole-party' },
    })
  }, [partyPlacementSources])

  const startMonsterPlacement = useCallback((source: MonsterTokenPlacementSource, count: number) => {
    const queue = startMonsterTokenPlacement(source, count)
    if (!queue) return
    setPlacementQueue(queue)
    dispatchActiveTool({
      type: 'startTokenPlacement',
      placement: { kind: 'monster', queueId: `${source.kind}-${source.id}` },
    })
  }, [])

  const cancelPlacement = useCallback(() => {
    setPlacementQueue(null)
    dispatchActiveTool({ type: 'cancelTokenPlacement' })
  }, [])

  const clearAnnotationPlacementTool = useCallback(() => {
    if (activeToolState.activeTool?.type === 'annotation') {
      dispatchActiveTool({ type: 'clearActiveTool' })
    }
  }, [activeToolState.activeTool])

  const openGmCharacterSheet = useCallback((characterId: string) => {
    setSelectedGmCharacterId(characterId)
    characterTabProps?.setSelectedCharacterId(characterId)
    if (isMobile) {
      setMobileGmPane('characters')
    } else {
      setDesktopGmPane('character')
    }
  }, [characterTabProps, isMobile])

  const pageGmCharacter = useCallback((direction: -1 | 1) => {
    if (gmWorkspaceCharacters.length === 0) return
    const currentIndex = selectedGmCharacterIndex >= 0 ? selectedGmCharacterIndex : 0
    const nextIndex = (currentIndex + direction + gmWorkspaceCharacters.length) % gmWorkspaceCharacters.length
    openGmCharacterSheet(gmWorkspaceCharacters[nextIndex].id)
  }, [gmWorkspaceCharacters, openGmCharacterSheet, selectedGmCharacterIndex])

  const runPlacementDrop = useCallback((point: { x: number; y: number }) => {
    const result = dropTokenPlacement(placementQueue, point, [
      ...tokens,
      ...pendingPlacedTokenNamesRef.current,
    ])
    if (result.command) {
      const { command } = result
      pendingPlacedTokenNamesRef.current = [...pendingPlacedTokenNamesRef.current, command.name]
      void placeQueuedToken(command).catch(() => {
        pendingPlacedTokenNamesRef.current = pendingPlacedTokenNamesRef.current.filter((name) => name !== command.name)
      })
    }
    setPlacementQueue(result.nextQueue)
    if (result.completed) dispatchActiveTool({ type: 'cancelTokenPlacement' })
  }, [placeQueuedToken, placementQueue, tokens])

  useEffect(() => {
    if (activeToolState.activeTool?.type !== 'measurement') return
    if (gridCalibrateMode || gridMeasureMode) return
    dispatchActiveTool({ type: 'clearActiveTool' })
  }, [activeToolState.activeTool, gridCalibrateMode, gridMeasureMode])

  useEffect(() => {
    if (activeToolState.tokenPlacement) return
    setPlacementQueue(null)
  }, [activeToolState.tokenPlacement])

  useEffect(() => {
    pendingPlacedTokenNamesRef.current = pendingPlacedTokenNamesRef.current.filter(
      (pendingName) => !tokens.some((token) => token.name === pendingName),
    )
  }, [tokens])

  const gmTokenNameClassName = (token: TokenRecord) => {
    if (playerViewPreview) {
      return token.revealName ? 'map-token-name gm-hover-only' : 'map-token-name gm-hidden'
    }
    return token.revealName ? 'map-token-name' : 'map-token-name gm-hover-only'
  }

  const isMobileZoomMapView = isMobile && (role !== 'gm' || mobileGmPane === 'map')
  const isInlineZoomMapView = true

  const renderTokenDimensions = (token: TokenRecord) => calculateTokenDimensions(token, activeMapDimension)
  const renderTokenViewDistance = (token: TokenRecord) => calculateTokenViewDistance(token, activeFogDimension)
  const renderBrushCursor = () => {
    if (!activeBrushTool) return null
    return (
      <div
        ref={brushCursorRef}
        className={['map-brush-cursor', brushCursorMode].filter(Boolean).join(' ')}
        aria-hidden
      />
    )
  }

  const viewport = useMapViewport({
    role,
    tokens,
    inlineBaseSize,
    activeFogDimension,
    inlineMapLayerRef,
    fogTool,
    visionTool,
    tokenPlaceMode: placementQueue !== null,
    annotationPlaceMode,
    playerLabelPlaceMode,
    allowGmInlinePan: previewMode,
    handToolActive,
    isMobileZoomMapView,
    renderTokenViewDistance,
    renderTokenDimensions,
  })

  const {
    playerZoom,
    playerPan,
    playerDragging,
    cameraLock,
    playerPanRef,
    toggleCameraLock,
    resetPlayerViewport,
    setPlayerPan,
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
  const renderTokenGlyphStyle = (token: TokenRecord): React.CSSProperties => ({
    transform: [
      `rotate(${normalizeTokenRotation(token.rotationDeg)}deg)`,
      `scale(${token.flipHorizontal ? -1 : 1}, ${token.flipVertical ? -1 : 1})`,
    ].join(' '),
  })
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
      playerViewPreview,
      selectedMap?.fullyHidden ?? true,
      activeFogCanvasRef.current,
    )

  const selectMap = (mapId: string) => {
    const mapChanged = mapId !== selectedMapId
    if (mapChanged) {
      setInlineImageReady(false)
      setInlineFogSize({ width: 0, height: 0 })
    }
    setSelectedMapId(mapId)
    resetPlayerViewport()
    // Desktop GM always lands in Map Preview when (re-)selecting a map.
    resetToPreview()
    if (isMobile) {
      setMobileMapView('detail')
      if (role === 'gm') {
        setMobileGmPane('map')
      } else {
        setMobilePlayerPane('map')
        setPlayerEmbeddedPane('map')
      }
    }
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

  const { revealFromTokenPoint, revealFromTokenStroke } = useVisionReveal({
    selectedMap,
    markFogLocalEdit,
    stampFog,
  })

  const tokenAnimation = useTokenAnimation({
    tokens,
    tokenAnimationsRef,
    role,
    cameraLock,
    setPlayerPan,
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
    return calculateTokenCanvasPoint({
      point,
      tokenSizePx,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      activeMapDimension,
    })
  }

  const tokenDrag = useTokenDrag({
    campaignId,
    groupId: workspaceGroupId,
    role,
    selectedMap,
    tokens,
    selectedTokenIds,
    getTokenDropPoint,
    renderTokenDimensions,
    tokenPointToCanvasPoint,
    activeFogCanvasRef,
    activeVisionCanvasRef,
    playerViewPreview,
    renderTokenViewDistance,
    revealFromTokenPoint,
    revealFromTokenStroke,
    activeMapWidth,
    activeMapHeight,
    activeGridCellPx,
    onMovementFeet,
    setTokens,
    persistFog,
    beginFogLocalEdit,
    endFogLocalEdit,
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
    return (
      <span className="map-token-glyph" style={renderTokenGlyphStyle(token)}>
        {token.tokenImageUrl ? (
          <img
            src={token.tokenImageUrl}
            alt=""
            className="map-token-image"
            style={{ width: `${dimensions.width}px`, height: `${dimensions.height}px` }}
            draggable={false}
          />
        ) : (
          <ChessPawn size={dimensions.baseSize} />
        )}
      </span>
    )
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
        onMouseDown={(event) => {
          if (placementQueue) return
          clearAnnotationPlacementTool()
          startTokenDrag(token.id, event)
        }}
        onTouchStart={(event) => {
          if (placementQueue) return
          clearAnnotationPlacementTool()
          handleTokenTouchStart(token.id, event)
        }}
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
    if ((role === 'gm' && !viewAsPlayer) || token.hidden) return null
    if (layer === 'under-fog' && token.party) return null
    if (layer === 'over-fog' && !token.party) return null

    const draggedPosition = dragTokenPositions?.[token.id]
    const animPos = animatedTokenPositions[token.id]
    const x = draggedPosition?.x ?? animPos?.x ?? token.x
    const y = draggedPosition?.y ?? animPos?.y ?? token.y
    const isAnimating = Boolean(animPos) && !draggedPosition
    const isGmStreaming = role === 'gm' && playerViewPreview

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
          if (placementQueue) return
          clearAnnotationPlacementTool()
          if (isGmStreaming) startTokenDrag(token.id, event)
        }}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          clearAnnotationPlacementTool()
          if (!isGmStreaming) togglePlayerTokenSelection(token.id)
        }}
        onTouchStart={(event) => {
          if (placementQueue) return
          if (!isGmStreaming) return
          clearAnnotationPlacementTool()
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

  // Bare-map interactions (token/annotation/label have their own element handlers and
  // are early-returned below) are routed through the pure interaction grammar so the
  // active tool state decides the intent rather than ad-hoc conditionals.
  const interactionButton = (button: number): MapInteractionButton =>
    button === 0 ? 'left' : button === 1 ? 'middle' : button === 2 ? 'right' : 'none'

  const handleMapLayerMouseDown: MouseEventHandler<HTMLDivElement> = (event) => {
    if (role !== 'gm') return
    if (gridCalibrateMode || gridMeasureMode) return
    const target = event.target as HTMLElement
    if (!placementQueue && target.closest('.map-token,.map-annotation-btn,.map-player-label-btn,.map-player-label-static,.map-annotation-popover')) return
    const intent = resolveMapInteractionIntent(activeToolState, {
      phase: 'drag',
      button: interactionButton(event.button),
      shiftKey: event.shiftKey,
      target: 'bareMap',
    })
    // Box-select owns left-drag; pan (shift/middle/hand) is handled at the stage level.
    if (intent.type === 'pan') {
      suppressNextMapClickRef.current = true
      return
    }
    if (intent.type !== 'box-select') return
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
    if (!placementQueue && (event.target as HTMLElement).closest('.map-token,.map-annotation-btn,.map-player-label-btn,.map-player-label-static,.map-annotation-popover')) return
    // Measurement tools consume bare-map clicks before the grammar (which treats the
    // measurement tool as a no-op for clicks).
    if (gridCalibrateMode) {
      event.preventDefault()
      handleGridCalibrateClick(event.clientX, event.clientY)
      return
    }
    if (gridMeasureMode) {
      event.preventDefault()
      handleGridMeasureClick(event.clientX, event.clientY)
      return
    }
    const intent = resolveMapInteractionIntent(activeToolState, {
      phase: 'click',
      button: interactionButton(event.button),
      shiftKey: event.shiftKey,
      target: 'bareMap',
    })
    // With no placement tool active, a bare-map click is "click outside": it deselects
    // the current token selection. It does not disturb editing context (an open
    // annotation editor commits via its own outside-pointerdown handler).
    if (intent.type !== 'place') {
      if (selectedTokenIds.length > 0) setSelectedTokenIds([])
      return
    }
    event.preventDefault()
    if (intent.tool === 'token') {
      const point = getTokenDropPoint(event.clientX, event.clientY)
      if (point) runPlacementDrop(point)
      return
    }
    if (intent.tool === 'marker') {
      void placeAnnotation(event.clientX, event.clientY, 'gm')
      return
    }
    if (intent.tool === 'playerLabel') {
      void placeAnnotation(event.clientX, event.clientY, 'player')
    }
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
      if (target.closest('.map-annotation-popover,.map-annotation-btn,.map-player-label-btn')) return
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
    pendingPlacedTokenNamesRef.current = []
    resetDistanceTracker()
    resetGrid()
    setInlineImageReady(false)
    setInlineFogSize({ width: 0, height: 0 })
  }, [selectedMapId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedTokenAssetId) return
    const existsAsAsset = tokenAssets.some((asset) => asset.id === selectedTokenAssetId)
    if (!existsAsAsset) setSelectedTokenAssetId('')
  }, [selectedTokenAssetId, tokenAssets, setSelectedTokenAssetId])

  useEffect(() => {
    if (!viewAsPlayer) return
    setActiveAnnotationId('')
  }, [viewAsPlayer])

  const handleInlineImageReady = useCallback(function handleInlineImageReadyCallback(target: HTMLImageElement, attempt = 0) {
    const currentMap = selectedMapRef.current
    if (!currentMap || target.dataset.mapId !== currentMap.id) return
    const measuredWidth = Math.round(target.clientWidth || target.getBoundingClientRect().width)
    const measuredHeight = Math.round(target.clientHeight || target.getBoundingClientRect().height)
    if ((measuredWidth <= 0 || measuredHeight <= 0) && attempt < 8) {
      window.requestAnimationFrame(() => handleInlineImageReadyCallback(target, attempt + 1))
      return
    }
    const displayWidth = Math.max(1, measuredWidth || target.naturalWidth)
    const displayHeight = Math.max(1, measuredHeight || target.naturalHeight)
    setInlineBaseSize({
      width: displayWidth,
      height: displayHeight,
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
  }, [invalidateInlineOverlayCache])

  const handleInlineBlankReady = useCallback((displayWidth: number, displayHeight: number) => {
    const currentMap = selectedMapRef.current
    if (!currentMap || currentMap.kind !== 'blank') return
    const safeDisplayWidth = Math.max(1, Math.round(displayWidth))
    const safeDisplayHeight = Math.max(1, Math.round(displayHeight))
    setInlineBaseSize({
      width: safeDisplayWidth,
      height: safeDisplayHeight,
    })
    const sourceWidth = Math.max(1, currentMap.width)
    const sourceHeight = Math.max(1, currentMap.height)
    const fogScale = Math.min(1, FOG_CANVAS_MAX_DIM / Math.max(sourceWidth, sourceHeight, 1))
    const fogWidth = Math.max(1, Math.round(sourceWidth * fogScale))
    const fogHeight = Math.max(1, Math.round(sourceHeight * fogScale))
    setInlineFogSize({
      width: fogWidth,
      height: fogHeight,
    })
    invalidateInlineOverlayCache()
    clearLosSeenCanvas(inlineLosSeenCanvasRef.current, fogWidth, fogHeight)
    setInlineImageReady(true)
  }, [invalidateInlineOverlayCache])

  const loadingMaskClassName = role === 'gm' && !viewAsPlayer
    ? 'map-fog-loading-mask gm'
    : 'map-fog-loading-mask'

  useEffect(() => {
    clearLosSeenCanvas(inlineLosSeenCanvasRef.current, Math.max(1, inlineFogSize.width), Math.max(1, inlineFogSize.height))
  }, [selectedMap?.id, inlineFogSize.width, inlineFogSize.height])

  // Reset transient view/tool/layout state on every (re-)entry into Map Run.
  // Keyed on runSession so leaving and re-entering Run resets again. Persistent
  // map/token/fog/annotation data is untouched (no Firestore writes here).
  useEffect(() => {
    if (!desktopGm || phase !== 'run') return
    resetActiveMapTools()
    setNpcSceneMode(false)
    setSelectedTokenIds([])
    setTokenSelectionBox(null)
    setActiveAnnotationId('')
    setActiveAnnotationDraft('')
    resetDistanceTracker()
    resetGrid()
    resetPlayerViewport()
  }, [runSession]) // eslint-disable-line react-hooks/exhaustive-deps

  // Escape is a universal transient-state cancel for the GM map workspace: it clears the
  // active tool, any token-placement queue, and an in-progress box-select. It never
  // undoes applied changes (placed tokens / painted fog) and never leaves Map Run.
  // Typing Escape inside a text field (e.g. an annotation editor) is left to that field.
  useEffect(() => {
    if (role !== 'gm') return
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      dispatchActiveTool({ type: 'escape' })
      closeActiveMeasurementMode()
      setPlacementQueue(null)
      setTokenSelectionBox(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [role, closeActiveMeasurementMode, setTokenSelectionBox])

  const enterMapRun = () => {
    enterRun()
  }

  const handleBackToPreview = () => {
    exitRun()
    resetPlayerViewport()
    resetActiveMapTools()
  }

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
  const measurementOverlayNode = gridMeasurementLine ? (
    <div className="map-grid-calibration-overlay map-grid-measurement-overlay" aria-hidden>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <line
          x1={gridMeasurementLine.start.x * 100}
          y1={gridMeasurementLine.start.y * 100}
          x2={gridMeasurementLine.end.x * 100}
          y2={gridMeasurementLine.end.y * 100}
        />
      </svg>
      <button
        type="button"
        className="map-grid-calibration-handle"
        style={{ left: `${gridMeasurementLine.start.x * 100}%`, top: `${gridMeasurementLine.start.y * 100}%` }}
        onMouseDown={(event) => handleGridMeasureHandleMouseDown(event, 'start')}
        aria-label="Move measurement start"
      />
      <button
        type="button"
        className="map-grid-calibration-handle"
        style={{ left: `${gridMeasurementLine.end.x * 100}%`, top: `${gridMeasurementLine.end.y * 100}%` }}
        onMouseDown={(event) => handleGridMeasureHandleMouseDown(event, 'end')}
        aria-label="Move measurement end"
      />
      <div
        className="map-grid-measurement-label"
        style={{
          left: `${((gridMeasurementLine.start.x + gridMeasurementLine.end.x) / 2) * 100}%`,
          top: `${((gridMeasurementLine.start.y + gridMeasurementLine.end.y) / 2) * 100}%`,
        }}
      >
        {measurementFeetLabel}
      </div>
    </div>
  ) : null

  const displayAnnotations = role === 'gm'
    ? (viewAsPlayer
      ? annotations.filter((annotation) => annotation.kind === 'player' && !annotation.hidden)
      : (gmHideLabels ? [] : annotations))
    : annotations.filter((annotation) => annotation.kind === 'player' && !annotation.hidden)

  const annotationLayerNode = displayAnnotations.length > 0 || (role === 'gm' && !viewAsPlayer) ? (
    <AnnotationLayer
      annotations={displayAnnotations}
      activeAnnotationId={activeAnnotationId}
      activeAnnotationDraft={activeAnnotationDraft}
      setActiveAnnotationId={setActiveAnnotationId}
      setActiveAnnotationDraft={setActiveAnnotationDraft}
      onCommitActiveAnnotation={commitActiveAnnotation}
      onDeleteAnnotation={deleteAnnotation}
      onToggleAnnotationHidden={toggleAnnotationHidden}
      onToggleAnnotationPointerDirection={toggleAnnotationPointerDirection}
      onMoveAnnotation={moveAnnotationPosition}
      onPersistAnnotationPosition={persistAnnotationPosition}
      autosizeAnnotationTextarea={autosizeAnnotationTextarea}
      onBeginEditAnnotation={clearAnnotationPlacementTool}
      editable={role === 'gm' && !viewAsPlayer && !placementQueue}
      className={placementQueue ? 'placing' : ''}
    />
  ) : null

  const renderGmMapControls = (showTopTools: boolean) => (
    <GmMapControls
      campaignId={campaignId}
      groupId={workspaceGroupId}
      showTopTools={showTopTools}
      fogTool={fogTool}
      setFogTool={setFogTool}
      visionTool={visionTool}
      setVisionTool={setVisionTool}
      fogBrushSize={fogBrushSize}
      setFogBrushSize={setFogBrushSize}
      tokenSelectMode={tokenSelectMode}
      setTokenSelectMode={setTokenSelectMode}
      annotationPlaceMode={annotationPlaceMode}
      setAnnotationPlaceMode={setAnnotationPlaceMode}
      playerLabelPlaceMode={playerLabelPlaceMode}
      setPlayerLabelPlaceMode={setPlayerLabelPlaceMode}
      gmHideLabels={gmHideLabels}
      setGmHideLabels={setGmHideLabels}
      handToolActive={handToolActive}
      setHandToolActive={setHandToolActive}
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
      placementDisplay={placementDisplay}
      partyPlacementSources={partyPlacementSources}
      monsterPlacementSources={monsterPlacementSources}
      npcPlacementSources={npcPlacementSources}
      genericPlacementSources={genericPlacementSources}
      onStartSinglePlacement={startSinglePlacement}
      onStartWholePartyPlacement={startWholePartyPlacement}
      onStartMonsterPlacement={startMonsterPlacement}
      onCancelPlacement={cancelPlacement}
      playerViewPreview={playerViewPreview}
      setPlayerViewPreview={setPlayerViewPreview}
      npcSceneMode={npcSceneMode}
      setNpcSceneMode={setNpcSceneMode}
      gridVisible={effectiveGridVisible}
      gridType={effectiveGridType}
      gridAdjustMode={gridAdjustMode}
      onToggleGridVisible={() => void toggleGridVisibility()}
      onSetGridType={setGridTypeTool}
      onApplyGrid={applyGridAdjust}
      hexDetecting={hexDetecting}
      hexDetectConfidence={hexDetectConfidence}
      gridAdjustReady={gridAdjustReady}
      gridAdjustSaved={Boolean(gridAdjustSavedAt)}
      gridCalibrateMode={gridCalibrateMode}
      onToggleGridCalibrate={toggleGridCalibrateTool}
      gridCalibrateReady={Boolean(gridCalibrateStart && gridCalibrateEnd)}
      gridCalibrateSaved={Boolean(gridCalibrateSavedAt)}
      onApplyGridCalibration={handleApplyGridCalibration}
      measurementToolEnabled={measurementToolEnabled}
      gridMeasureMode={gridMeasureMode}
      onToggleGridMeasure={toggleGridMeasureTool}
      measurementFeetLabel={measurementFeetLabel}
      distanceTrackerFeet={distanceTrackerFeet}
      distanceTrackerMode={distanceTrackerMode}
      distanceTrackerRoll={distanceTrackerRoll}
      onResetDistanceTracker={resetDistanceTracker}
      applyFogPreset={applyFogPreset}
      canApplyPreset={Boolean(selectedMap)}
      fullyHidden={selectedMap?.fullyHidden === true}
      tokens={tokens}
      selectedTokenIds={selectedTokenIds}
      onSelectedTokenIdsChange={setSelectedTokenIds}
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
      onRequestDeleteTokens={requestDeleteTokens}
      mapNpcs={mapNpcs}
      sceneNpcs={sceneNpcs}
      presentedNpc={presentedNpc}
      selectedMapSceneNpcIds={selectedMap?.sceneNpcIds ?? []}
      onToggleSceneNpc={(npcId, enabled) => {
        const currentIds = selectedMap?.sceneNpcIds ?? []
        const nextIds = enabled
          ? currentIds.includes(npcId) ? currentIds : [...currentIds, npcId]
          : currentIds.filter((id) => id !== npcId)
        void updateSceneNpcIds(nextIds)
      }}
      onPresentNpc={(npcId) => void setPresentedNpcId(npcId)}
      onClearPresentedNpc={() => void setPresentedNpcId('')}
    />
  )

  const renderGmCharacterTabs = () => {
    if (role !== 'gm' || gmWorkspaceCharacters.length === 0) return null
    return (
      <div className="map-gm-character-tabs" role="tablist" aria-label="GM map workspace views">
        <button
          type="button"
          className={desktopGmPane === 'map' ? 'map-gm-character-tab active' : 'map-gm-character-tab'}
          onClick={() => setDesktopGmPane('map')}
          aria-selected={desktopGmPane === 'map'}
          role="tab"
        >
          <MapIcon size={15} />
          <span>Map</span>
        </button>
        {gmWorkspaceCharacters.map((character) => {
          const source = partyPlacementSources.find((entry) => entry.id === character.id)
          const imageUrl = source?.tokenIcon?.icon === 'custom' ? source.tokenIcon.customImageUrl ?? '' : ''
          const color = source?.tokenIcon?.color ?? '#b45309'
          const active = desktopGmPane === 'character' && selectedGmCharacter?.id === character.id
          return (
            <button
              key={character.id}
              type="button"
              className={active ? 'map-gm-character-tab active' : 'map-gm-character-tab'}
              onClick={() => openGmCharacterSheet(character.id)}
              aria-selected={active}
              role="tab"
            >
              <span className="map-gm-character-tab-icon" style={{ color }}>
                {imageUrl ? <img src={imageUrl} alt="" /> : <ChessPawn size={14} />}
              </span>
              <span>{character.name || 'Unnamed'}</span>
            </button>
          )
        })}
      </div>
    )
  }

  const renderMobileGmCharacterPane = () => (
    <div className="map-mobile-character-pane">
      <div className="map-mobile-character-pager">
        <button
          type="button"
          onClick={() => pageGmCharacter(-1)}
          disabled={gmWorkspaceCharacters.length <= 1}
          aria-label="Previous character sheet"
        >
          <ChevronLeft size={16} />
        </button>
        <span>{selectedGmCharacter?.name || 'Character Sheets'}</span>
        <button
          type="button"
          onClick={() => pageGmCharacter(1)}
          disabled={gmWorkspaceCharacters.length <= 1}
          aria-label="Next character sheet"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      {selectedGmCharacterTabProps ? (
        <div className="map-embedded-character">
          <CharacterTab {...selectedGmCharacterTabProps} embeddedMode />
        </div>
      ) : (
        <div className="map-embedded-character map-empty-character-pane">
          <p>No character sheets available.</p>
        </div>
      )}
    </div>
  )



  return (
    <div className={desktopGmRun ? 'maps-layout map-run-layout' : 'maps-layout'}>
      {showListPane ? (
        <aside className="maps-sidebar">
          <div className="maps-sidebar-header">
            <h2>Maps</h2>
            {role === 'gm' ? (
              <div className="maps-create-actions">
                <button
                  type="button"
                  className="upload-trigger map-blank-create-btn"
                  onClick={() => void openDrawingEditor()}
                  disabled={uploading}
                >
                  <Pencil size={16} />
                  Draw
                </button>
                <label className="upload-trigger">
                  <Upload size={16} />
                  {uploading ? 'Uploading...' : 'Upload'}
                  <input type="file" accept="image/*" onChange={handleMapUpload} disabled={uploading} />
                </label>
              </div>
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
                      {role === 'gm' && map.kind === 'blank' && !map.imageUrl ? <span className="map-thumb blank" aria-hidden /> : null}
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
        <div className={desktopGmRun ? 'maps-content-shell map-run-shell' : 'maps-content-shell'}>
          {role !== 'gm' && characterTabProps ? (
            <div className="map-player-top-nav" role="tablist" aria-label="Player map views">
              <button
                type="button"
                className={playerEmbeddedPane === 'map' ? 'active' : ''}
                onClick={() => setPlayerEmbeddedPane('map')}
                aria-label="Show map"
              >
                <MapIcon size={16} />
                <span>Map</span>
              </button>
              <button
                type="button"
                className={playerEmbeddedPane === 'character' ? 'active' : ''}
                onClick={() => setPlayerEmbeddedPane('character')}
                aria-label="Show character sheet"
              >
                <ScrollText size={16} />
                <span>Character</span>
              </button>
            </div>
          ) : null}

          {desktopGmRun ? renderGmCharacterTabs() : null}

          {(desktopGmRun || (isMobile && role === 'gm' && mobileMapView === 'detail' && mobileGmPane === 'map')) ? (
            <GmMapTopToolPanel
              fogTool={fogTool}
              setFogTool={setFogTool}
              visionTool={visionTool}
              setVisionTool={setVisionTool}
              fogBrushSize={fogBrushSize}
              setFogBrushSize={setFogBrushSize}
              tokenSelectMode={tokenSelectMode}
              setTokenSelectMode={setTokenSelectMode}
              annotationPlaceMode={annotationPlaceMode}
              setAnnotationPlaceMode={setAnnotationPlaceMode}
              playerLabelPlaceMode={playerLabelPlaceMode}
              setPlayerLabelPlaceMode={setPlayerLabelPlaceMode}
              gmHideLabels={gmHideLabels}
              setGmHideLabels={setGmHideLabels}
              handToolActive={handToolActive}
              setHandToolActive={setHandToolActive}
              npcSceneMode={npcSceneMode}
              setNpcSceneMode={setNpcSceneMode}
              playerViewPreview={playerViewPreview}
              setPlayerViewPreview={setPlayerViewPreview}
              gridVisible={effectiveGridVisible}
              gridType={effectiveGridType}
              gridAdjustMode={gridAdjustMode}
              onToggleGridVisible={() => void toggleGridVisibility()}
              onSetGridType={setGridTypeTool}
              hexDetecting={hexDetecting}
              gridCalibrateMode={gridCalibrateMode}
              onToggleGridCalibrate={toggleGridCalibrateTool}
              gridCalibrateReady={Boolean(gridCalibrateStart && gridCalibrateEnd)}
              gridCalibrateSaved={Boolean(gridCalibrateSavedAt)}
              onApplyGridCalibration={handleApplyGridCalibration}
              measurementToolEnabled={measurementToolEnabled}
              gridMeasureMode={gridMeasureMode}
              onToggleGridMeasure={toggleGridMeasureTool}
              distanceTrackerFeet={distanceTrackerFeet}
              distanceTrackerMode={distanceTrackerMode}
              distanceTrackerRoll={distanceTrackerRoll}
              onResetDistanceTracker={resetDistanceTracker}
              applyFogPreset={applyFogPreset}
              canApplyPreset={Boolean(selectedMap)}
              fullyHidden={selectedMap?.fullyHidden === true}
              guidance={toolGuidance}
              onOpenHelp={() => setInteractionHelpOpen(true)}
            />
          ) : null}

          {desktopGmRun ? (
            <aside className="map-controls map-run-token-controls">
              {renderGmMapControls(false)}
            </aside>
          ) : null}

          <div
            className={[
              role === 'gm' ? 'maps-main gm' : 'maps-main player',
              isMobile && role === 'gm' ? 'mobile-gm' : '',
              isMobile && role !== 'gm' ? 'mobile-player' : '',
              desktopGmRun ? 'run' : '',
              (!showEmbeddedMap || (desktopGmRun && desktopGmPane !== 'map')) ? 'maps-main-hidden' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {previewMode && selectedMap ? (
              <button
                type="button"
                className="map-run-btn"
                onClick={enterMapRun}
                aria-label="Run this map"
              >
                <TvMinimalPlay size={15} />
                Run
              </button>
            ) : null}
            {desktopGmRun ? (
              <button
                type="button"
                className="map-preview-back-btn"
                onClick={handleBackToPreview}
                aria-label="Back to map preview"
              >
                <ChevronLeft size={16} />
                Back
              </button>
            ) : null}
            {role === 'gm' && selectedMap?.kind === 'blank' && !desktopGmRun && (!isMobile || mobileGmPane === 'map') ? (
              <div className="map-preview-drawing-toolbar">
                <button
                  type="button"
                  className="map-edit-drawing-btn"
                  onClick={() => void openDrawingEditor(selectedMap.id)}
                >
                  <Pencil size={15} />
                  Edit drawing
                </button>
              </div>
            ) : null}
            {!isMobile || (role === 'gm' ? mobileGmPane === 'map' : mobilePlayerPane === 'map') ? (
              <InlineMapStage
              stageRef={inlineStageRef}
              mapLayerRef={inlineMapLayerRef}
              stageClassName={isMobileZoomMapView ? 'map-stage mobile-player-stage' : 'map-stage'}
              selectedMap={selectedMap}
              mapLayerClassName={isMobileZoomMapView ? 'map-zoom-layer mobile-player-zoom' : 'map-zoom-layer'}
              mapLayerStyle={
                isInlineZoomMapView
                  ? {
                    transform: `translate(${playerPan.x}px, ${playerPan.y}px) scale(${playerZoom})`,
                    cursor: playerDragging ? 'grabbing' : playerZoom > 1 ? 'grab' : undefined,
                  }
                  : undefined
              }
              onImageReady={handleInlineImageReady}
              onBlankReady={handleInlineBlankReady}
              onStageWheel={isInlineZoomMapView ? handlePlayerWheel : undefined}
              onStageMouseDown={isInlineZoomMapView ? handlePlayerMouseDown : undefined}
              onStageMouseMove={isInlineZoomMapView ? handlePlayerMouseMove : undefined}
              onStageMouseUp={isInlineZoomMapView ? endPlayerDrag : undefined}
              onStageMouseLeave={isInlineZoomMapView ? endPlayerDrag : undefined}
              onMapLayerContextMenu={(event) => event.preventDefault()}
              onMapLayerWheel={(event) => handleGridLayerWheel(event)}
              onMapLayerMouseDown={(event) => {
                if (handleGridLayerMouseDown(event)) return
                handleMapLayerMouseDown(event)
              }}
              onMapLayerMouseMove={(event) => {
                handleGridCalibrateMouseMove(event.clientX, event.clientY)
                handleGridMeasureMouseMove(event.clientX, event.clientY)
              }}
              onMapLayerClick={handleMapLayerClick}
              onMapLayerTouchStart={handleMobilePlayerTouchStart}
              onMapLayerTouchMove={handleMobilePlayerTouchMove}
              onMapLayerTouchEnd={handleMobilePlayerTouchEnd}
              onMapLayerTouchCancel={handleMobilePlayerTouchEnd}
            >
              {renderMapGridOverlay()}
              {gridAdjustMode && effectiveGridEnabled && effectiveGridVisible ? <div className="map-grid-adjust-overlay" /> : null}
              {calibrationOverlayNode}
              {measurementOverlayNode}
              {role !== 'gm' || viewAsPlayer ? (
                <TokenLayer
                  className={placementQueue ? 'map-token-layer under-fog placing' : 'map-token-layer under-fog'}
                  ariaLabel="Map tokens under fog"
                  tokens={tokens}
                  renderToken={(token, index) => renderPlayerTokenItem(token, index, 'under-fog')}
                />
              ) : null}
              <canvas
                ref={inlineFogCanvasRef}
                className={placementQueue || (!fogTool && !visionTool) ? 'map-fog-canvas read-only' : 'map-fog-canvas brush'}
                width={Math.max(1, inlineFogSize.width)}
                height={Math.max(1, inlineFogSize.height)}
                style={{ opacity: fogDisplayOpacity }}
                onMouseDown={handleBrushCanvasMouseDown}
                onMouseEnter={handleBrushCanvasMouseEnter}
                onMouseMove={handleBrushCanvasMouseMove}
                onMouseUp={handleBrushCanvasMouseUp}
                onMouseLeave={handleBrushCanvasMouseLeave}
                onTouchStart={handleBrushCanvasTouchStart}
                onTouchMove={handleBrushCanvasTouchMove}
                onTouchEnd={handleBrushCanvasTouchEnd}
                onTouchCancel={handleBrushCanvasTouchEnd}
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
              {role === 'gm' && !viewAsPlayer ? (
                <TokenLayer
                  className={placementQueue ? 'map-token-layer gm placing' : 'map-token-layer gm'}
                  tokens={tokens}
                  renderToken={renderTokenItem}
                />
              ) : null}
              {role !== 'gm' || viewAsPlayer ? (
                <TokenLayer
                  className={placementQueue ? 'map-token-layer player-over-fog placing' : 'map-token-layer player-over-fog'}
                  ariaLabel="Map party tokens"
                  tokens={tokens}
                  renderToken={(token, index) => renderPlayerTokenItem(token, index, 'over-fog')}
                />
              ) : null}
              {role === 'gm' && tokenSelectionBox && selectionRectStyle ? (
                <div className="map-token-selection-box" style={selectionRectStyle} />
              ) : null}
              {annotationLayerNode}
              {renderBrushCursor()}
              {selectedMap?.kind !== 'blank' && (!inlineImageReady || !inlineFogReady) ? <div className={loadingMaskClassName} aria-hidden /> : null}
            </InlineMapStage>
            ) : null}

            {role === 'gm' && (isMobile ? mobileGmPane === 'tokens' : phase === 'run' && !desktopGmRun) ? (
              <aside className="map-controls">
                {renderGmMapControls(!isMobile)}
              </aside>
            ) : null}

            {role !== 'gm' && !isMobile ? (
              <aside className="map-controls">
                <PlayerMapControls
                  cameraLock={cameraLock}
                  onToggleCameraLock={toggleCameraLock}
                  presentedNpc={presentedNpc}
                />
              </aside>
            ) : null}

            {role !== 'gm' && isMobile && mobilePlayerPane === 'controls' ? (
              <aside className="map-controls">
                <PlayerMapControls
                  cameraLock={cameraLock}
                  onToggleCameraLock={toggleCameraLock}
                  presentedNpc={presentedNpc}
                />
              </aside>
            ) : null}
          </div>

          {role !== 'gm' && characterTabProps && showEmbeddedCharacter ? (
            <div className="map-embedded-character">
              <CharacterTab {...characterTabProps} embeddedMode />
            </div>
          ) : null}

          {desktopGmRun && desktopGmPane === 'character' ? (
            <div className="map-embedded-character map-gm-embedded-character">
              {selectedGmCharacterTabProps ? <CharacterTab {...selectedGmCharacterTabProps} embeddedMode /> : <p>No character selected.</p>}
            </div>
          ) : null}

          {isMobile && role === 'gm' && mobileGmPane === 'characters' ? renderMobileGmCharacterPane() : null}

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
                <MapIcon size={16} />
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
              {characterTabProps ? (
                <button
                  type="button"
                  className={mobilePlayerPane === 'character' ? 'active' : ''}
                  onClick={() => setMobilePlayerPane('character')}
                  disabled={mobilePlayerPane === 'character'}
                  aria-label="Character pane"
                >
                  <ScrollText size={16} />
                </button>
              ) : null}
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
                <MapIcon size={16} />
              </button>
              <button
                type="button"
                className={mobileGmPane === 'tokens' ? 'active' : ''}
                onClick={() => setMobileGmPane('tokens')}
                disabled={mobileGmPane === 'tokens'}
                aria-label="Token panel"
              >
                <ChessPawn size={16} />
              </button>
              {characterTabProps ? (
                <button
                  type="button"
                  className={mobileGmPane === 'characters' ? 'active' : ''}
                  onClick={() => {
                    if (!selectedGmCharacter && gmWorkspaceCharacters[0]) {
                      openGmCharacterSheet(gmWorkspaceCharacters[0].id)
                      return
                    }
                    setMobileGmPane('characters')
                  }}
                  disabled={mobileGmPane === 'characters'}
                  aria-label="Character sheets"
                >
                  <ScrollText size={16} />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
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
        title={(tokenDeleteCandidate?.length ?? 0) > 1 ? 'Delete Tokens?' : 'Delete Token?'}
        message={
          tokenDeleteCandidate && tokenDeleteCandidate.length > 0
            ? `Permanently remove ${
              tokenDeleteCandidate.length === 1
                ? `"${tokenDeleteCandidate[0].name || 'Token'}"`
                : `${tokenDeleteCandidate.length} tokens: ${tokenDeleteCandidate.map((token) => `"${token.name || 'Token'}"`).join(', ')}`
            } from the map?`
            : 'Permanently remove this token from the map?'
        }
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
      {interactionHelpOpen ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label="Map interaction help">
          <div className="confirm-modal map-help-modal">
            <h3>Map Controls</h3>
            <div className="map-help-sections">
              {MAP_INTERACTION_HELP_SECTIONS.map((section) => (
                <section key={section.title} className="map-help-section">
                  <h4>{section.title}</h4>
                  <p>{section.body}</p>
                </section>
              ))}
            </div>
            <div className="confirm-actions">
              <button type="button" onClick={() => setInteractionHelpOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
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
      {drawingEditorMap ? (
        <MapDrawingEditor
          mapName={drawingEditorMap.name}
          initialSceneJson={drawingEditorMap.drawingScene}
          backgroundColor={drawingEditorMap.backgroundColor}
          stampScopeKey={campaignId}
          onCancel={() => setDrawingEditorMapId(null)}
          onSave={handleSaveBlankDrawing}
        />
      ) : null}
    </div>
  )
}
