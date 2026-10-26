import { useMemo, useReducer, useState, type ComponentProps } from 'react'
import type { Role } from '../../types/app'
import type { CharacterTab } from '../character/CharacterTab'
import { MapsContentShell } from './components/MapsContentShell'
import { MapsSidebar } from './components/MapsSidebar'
import { MapsTabDialogs } from './components/MapsTabDialogs'
import type { MapsTabModel } from './components/mapsTabModel'
import { useBlankMapDrawing } from './hooks/useBlankMapDrawing'
import { brushCanvasHandlers, useBrushCursor } from './hooks/useBrushCursor'
import { useEncounterTracking } from './hooks/useEncounterTracking'
import { useFogTools } from './hooks/useFogTools'
import { useGmCharacterSelection } from './hooks/useGmCharacterSelection'
import { useGmCharacterSheets } from './hooks/useGmCharacterSheets'
import { useGridTools } from './hooks/useGridTools'
import { useGridView } from './hooks/useGridView'
import { useInlineMapReady, useInlineMapSize, useMapLayerSize, useSelectedMapRef } from './hooks/useInlineMapSize'
import { useMapData } from './hooks/useMapData'
import { useMapPaneVisibility } from './hooks/useMapPaneVisibility'
import { useAnnotationOutsideCommit, useMapEscapeKey, useMapStateResets, useRunEntryReset } from './hooks/useMapResets'
import { selectMapFrom } from './lib/mapSelection'
import { tokenGeometry, useMapsTabRefs, useSharedAnimationRefs, useTokenDropPoint } from './hooks/useMapsTabRefs'
import { useMapToolActions, useMeasurementTools, useMeasurementToolSync } from './hooks/useMapToolActions'
import { useMapViewport } from './hooks/useMapViewport'
import { useMapWorkspace } from './hooks/useMapWorkspace'
import { useSceneNpcs } from './hooks/useSceneNpcPicker'
import { useTokenAnimation } from './hooks/useTokenAnimation'
import { useTokenAssets } from './hooks/useTokenAssets'
import { useTokenBoxSelection } from './hooks/useTokenBoxSelection'
import { useTokenDrag } from './hooks/useTokenDrag'
import { usePlacementDisplay, usePlacementDrop, usePlacementQueueActions, usePlacementSources } from './hooks/useTokenPlacement'
import { useTokenSelection } from './hooks/useTokenSelection'
import { useVisionReveal } from './hooks/useVisionReveal'
import { activeToolReducer, initialActiveToolState } from './lib/activeToolState'
import { brushCursorMode, isBrushActive } from './lib/brushCursor'
import { mapDimensions } from './lib/inlineMapSizing'
import { isMobileZoomMapView, viewModes } from './lib/mapsTabLayout'
import { deriveToolFlags } from './lib/mapToolFlags'
import type { TokenPlacementQueueState } from './lib/tokenPlacementQueue'

function MapsTabView({ model, selectedMapId }: { model: MapsTabModel; selectedMapId: string }) {
  const { panes } = model
  return (
    <div className={panes.desktopGmRun ? 'maps-layout map-run-layout' : 'maps-layout'}>
      {panes.showListPane ? <MapsSidebar model={model} selectedMapId={selectedMapId} /> : null}

      {panes.showMapPane ? <MapsContentShell model={model} isGm={model.role === 'gm'} /> : null}

      <MapsTabDialogs model={model} />
    </div>
  )
}

type MapsTabProps = {
  campaignId: string
  groupId: string
  role: Role | null
  gmUserId: string | null
  characterTabProps?: ComponentProps<typeof CharacterTab>
}

// The campaign's maps: the list, the GM's map workspace in preview and run, and
// the players' view of the maps the GM reveals. MapsTab wires the map hooks
// together in the order their effects must run, and hands the panes the result.
export function MapsTab({ campaignId, groupId, role, gmUserId, characterTabProps }: MapsTabProps) {
  const [selectedMapId, setSelectedMapId] = useState('')
  const workspace = useMapWorkspace()
  const panes = useMapPaneVisibility({ role, phase: workspace.phase, hasCharacterTab: Boolean(characterTabProps) })
  const [interactionHelpOpen, setInteractionHelpOpen] = useState(false)
  const [activeToolState, dispatchActiveTool] = useReducer(activeToolReducer, initialActiveToolState)
  const [placementQueue, setPlacementQueue] = useState<TokenPlacementQueueState | null>(null)
  const [fogBrushSize, setFogBrushSize] = useState(120)
  const fogBrushStrength = 0.7
  const [npcSceneMode, setNpcSceneMode] = useState(false)
  const [tokenColor, setTokenColor] = useState('#b45309')
  const [tokenSize, setTokenSize] = useState(28)
  const size = useInlineMapSize()
  const refs = useMapsTabRefs()

  const tools = deriveToolFlags(activeToolState)
  const { viewAsPlayer, gmView } = viewModes(role, tools.playerViewPreview, panes.previewMode)
  const placing = placementQueue !== null
  const dimensions = mapDimensions(size.inlineBaseSize, size.inlineFogSize)

  const mapData = useMapData({
    campaignId,
    groupId,
    role,
    selectedMapId,
    setSelectedMapId,
    getDropPoint: (clientX, clientY) => refs.getDropPointRef.current(clientX, clientY),
    tokensRef: refs.tokensRef,
    recentlyDroppedRef: refs.recentlyDroppedRef,
    lastAnimatedPathIdRef: refs.lastAnimatedPathIdRef,
    startTokenPathAnimationRef: refs.startTokenPathAnimationRef,
  })
  const { selectedMap } = mapData
  const shownMapId = selectedMap?.id
  const selectedMapRef = useSelectedMapRef(selectedMap)

  const scene = useSceneNpcs(mapData.mapNpcs, selectedMap)
  const sources = usePlacementSources(mapData, gmUserId)
  const placementDisplay = usePlacementDisplay(placementQueue)
  const gmCharacterOrderIds = useMemo(
    () => sources.partyPlacementSources.map((source) => source.id),
    [sources.partyPlacementSources],
  )
  const characterSelection = useGmCharacterSelection({
    characterTabProps,
    gmUserId,
    gmCharacterOrderIds,
    desktopGmPane: panes.desktopGmPane,
    setDesktopGmPane: panes.setDesktopGmPane,
    mobileGmPane: panes.mobileGmPane,
    setMobileGmPane: panes.setMobileGmPane,
  })

  useMapLayerSize({
    layerRef: size.inlineMapLayerRef,
    setSize: size.setInlineBaseSize,
    mapId: shownMapId,
    isMobile: panes.isMobile,
    mobileMapView: panes.mobileMapView,
    mobileGmPane: panes.mobileGmPane,
    mobilePlayerPane: panes.mobilePlayerPane,
  })

  const selection = useTokenSelection({ role, tokens: mapData.tokens, selectedMapId })

  const fog = useFogTools({
    campaignId,
    groupId,
    role,
    selectedMap,
    setMapError: mapData.setMapError,
    isMobile: panes.isMobile,
    mobileGmPane: panes.mobileGmPane,
    mobilePlayerPane: panes.mobilePlayerPane,
    inlineFogSize: size.inlineFogSize,
    fogTool: tools.fogTool,
    visionTool: tools.visionTool,
    tokenPlaceMode: placing,
    fogBrushSize,
    activeFogDimension: dimensions.activeFogDimension,
    fogBrushStrength,
    tokenAnimationsRef: refs.tokenAnimationsRef,
    pendingFogReloadRef: refs.pendingFogReloadRef,
  })

  const brushActive = isBrushActive(role, placing, tools.fogTool, tools.visionTool)
  const brushMode = brushCursorMode(tools.fogTool, tools.visionTool)
  const brushCursor = useBrushCursor({
    active: brushActive,
    mode: brushMode,
    fogCanvasRef: fog.activeFogCanvasRef,
    brushSize: fog.effectiveFogBrushSize,
    mapId: shownMapId,
  })

  const encounter = useEncounterTracking()

  const getTokenDropPoint = useTokenDropPoint(fog.activeFogCanvasRef, size.inlineMapLayerRef, refs.getDropPointRef)

  const grid = useGridTools({
    selectedMap,
    role,
    campaignId,
    groupId,
    activeMapWidth: dimensions.activeMapWidth,
    activeMapHeight: dimensions.activeMapHeight,
    activeMapDimension: dimensions.activeMapDimension,
    inlineBaseSize: size.inlineBaseSize,
    setMaps: mapData.setMaps,
    setMapError: mapData.setMapError,
    getTokenDropPoint,
    resetDistanceTracker: encounter.resetDistanceTracker,
  })

  const gridView = useGridView({
    grid,
    selectedMap,
    dimensions,
    activeToolState,
    placementDisplay,
    setMapError: mapData.setMapError,
  })

  const toolContext = { activeTool: activeToolState.activeTool, dispatchActiveTool, setPlacementQueue }
  const measurementTools = useMeasurementTools(toolContext, grid)
  const toolActions = useMapToolActions({ ...toolContext, closeActiveMeasurementMode: measurementTools.closeActiveMeasurementMode })
  const drawing = useBlankMapDrawing({
    role,
    maps: mapData.maps,
    handleCreateBlankMap: mapData.handleCreateBlankMap,
    saveBlankMapDrawing: mapData.saveBlankMapDrawing,
  })
  const characterSheets = useGmCharacterSheets({
    selection: characterSelection,
    characterTabProps,
    isMobile: panes.isMobile,
    setMobileGmPane: panes.setMobileGmPane,
    setDesktopGmPane: panes.setDesktopGmPane,
  })
  useMeasurementToolSync(activeToolState.activeTool, dispatchActiveTool, grid)
  const placementQueueActions = usePlacementQueueActions({
    setPlacementQueue,
    dispatchActiveTool,
    tokenPlacement: activeToolState.tokenPlacement,
    partyPlacementSources: sources.partyPlacementSources,
  })
  const placementDrop = usePlacementDrop({
    placementQueue,
    setPlacementQueue,
    dispatchActiveTool,
    tokens: mapData.tokens,
    placeQueuedToken: mapData.placeQueuedToken,
  })

  const mobileZoomView = isMobileZoomMapView(panes.isMobile, role, panes.mobileGmPane)
  const geometry = tokenGeometry(dimensions, fog.activeFogCanvasRef)

  const viewport = useMapViewport({
    role,
    tokens: mapData.tokens,
    inlineBaseSize: size.inlineBaseSize,
    activeFogDimension: dimensions.activeFogDimension,
    inlineMapLayerRef: size.inlineMapLayerRef,
    fogTool: tools.fogTool,
    visionTool: tools.visionTool,
    tokenPlaceMode: placing,
    annotationPlaceMode: tools.annotationPlaceMode,
    playerLabelPlaceMode: tools.playerLabelPlaceMode,
    allowGmInlinePan: panes.previewMode,
    handToolActive: tools.handToolActive,
    isMobileZoomMapView: mobileZoomView,
    renderTokenViewDistance: geometry.renderTokenViewDistance,
    renderTokenDimensions: geometry.renderTokenDimensions,
  })

  const { revealFromTokenPoint, revealFromTokenStroke } = useVisionReveal({
    selectedMap,
    markFogLocalEdit: fog.markFogLocalEdit,
    stampFog: fog.stampFog,
  })

  const animation = useTokenAnimation({
    tokens: mapData.tokens,
    tokenAnimationsRef: refs.tokenAnimationsRef,
    role,
    cameraLock: viewport.cameraLock,
    setPlayerPan: viewport.setPlayerPan,
    playerPanRef: viewport.playerPanRef,
    activeFogCanvasRef: fog.activeFogCanvasRef,
    activeVisionCanvasRef: fog.activeVisionCanvasRef,
    renderTokenViewDistance: geometry.renderTokenViewDistance,
    renderTokenDimensions: geometry.renderTokenDimensions,
    revealFromTokenPoint,
    revealFromTokenStroke,
    bumpFogSampleTick: fog.bumpFogSampleTick,
    pendingFogReloadRef: refs.pendingFogReloadRef,
  })
  useSharedAnimationRefs(refs, animation)

  const tokenDrag = useTokenDrag({
    campaignId,
    groupId,
    role,
    selectedMap,
    tokens: mapData.tokens,
    selectedTokenIds: selection.selectedTokenIds,
    getTokenDropPoint,
    renderTokenDimensions: geometry.renderTokenDimensions,
    tokenPointToCanvasPoint: geometry.tokenPointToCanvasPoint,
    activeFogCanvasRef: fog.activeFogCanvasRef,
    activeVisionCanvasRef: fog.activeVisionCanvasRef,
    playerViewPreview: tools.playerViewPreview,
    renderTokenViewDistance: geometry.renderTokenViewDistance,
    revealFromTokenPoint,
    revealFromTokenStroke,
    activeMapWidth: dimensions.activeMapWidth,
    activeMapHeight: dimensions.activeMapHeight,
    activeGridCellPx: gridView.activeGridCellPx,
    onMovementFeet: encounter.onMovementFeet,
    setTokens: mapData.setTokens,
    persistFog: fog.persistFog,
    beginFogLocalEdit: fog.beginFogLocalEdit,
    endFogLocalEdit: fog.endFogLocalEdit,
    recentlyDroppedRef: refs.recentlyDroppedRef,
    lastAnimatedPathIdRef: refs.lastAnimatedPathIdRef,
    setSelectedTokenIds: selection.setSelectedTokenIds,
  })

  const tokenAssets = useTokenAssets({ role, setMapError: mapData.setMapError, saveTokenAssetFile: mapData.saveTokenAssetFile, inlineStageRef: size.inlineStageRef })

  useTokenBoxSelection({
    role,
    tokenSelectionBox: selection.tokenSelectionBox,
    setTokenSelectionBox: selection.setTokenSelectionBox,
    setSelectedTokenIds: selection.setSelectedTokenIds,
    getTokenDropPoint,
    tokens: mapData.tokens,
    suppressNextMapClickRef: refs.suppressNextMapClickRef,
  })

  useAnnotationOutsideCommit(mapData.activeAnnotationId, mapData.commitActiveAnnotation, mapData.setActiveAnnotationId)

  useMapStateResets({
    selectedMapId,
    onMapChange: () => {
      mapData.setActiveAnnotationId('')
      mapData.setActiveAnnotationDraft('')
      selection.setSelectedTokenIds([])
      selection.setTokenSelectionBox(null)
      placementDrop.forgetPendingNames()
      encounter.resetDistanceTracker()
      grid.resetGrid()
      size.forgetMapSize()
    },
    selectedTokenAssetId: mapData.selectedTokenAssetId,
    tokenAssets: mapData.tokenAssets,
    setSelectedTokenAssetId: mapData.setSelectedTokenAssetId,
    viewAsPlayer,
    setActiveAnnotationId: mapData.setActiveAnnotationId,
  })

  const inlineReady = useInlineMapReady({
    size,
    selectedMapRef,
    mapId: shownMapId,
    invalidateInlineOverlayCache: fog.invalidateInlineOverlayCache,
  })

  useRunEntryReset(workspace.runSession, panes.desktopGm, workspace.phase, () => {
    toolActions.resetActiveMapTools()
    setNpcSceneMode(false)
    selection.setSelectedTokenIds([])
    selection.setTokenSelectionBox(null)
    mapData.setActiveAnnotationId('')
    mapData.setActiveAnnotationDraft('')
    encounter.resetDistanceTracker()
    grid.resetGrid()
    viewport.resetPlayerViewport()
  })

  useMapEscapeKey({
    role,
    dispatchActiveTool,
    closeActiveMeasurementMode: measurementTools.closeActiveMeasurementMode,
    setPlacementQueue,
    setTokenSelectionBox: selection.setTokenSelectionBox,
  })

  const model: MapsTabModel = {
    campaignId,
    groupId,
    role,
    characterTabProps,
    selectMap: (mapId) => selectMapFrom({
      role,
      selectedMapId,
      setSelectedMapId,
      forgetMapSize: size.forgetMapSize,
      resetPlayerViewport: viewport.resetPlayerViewport,
      resetToPreview: workspace.resetToPreview,
      isMobile: panes.isMobile,
      setMobileMapView: panes.setMobileMapView,
      setMobileGmPane: panes.setMobileGmPane,
      setMobilePlayerPane: panes.setMobilePlayerPane,
      setPlayerEmbeddedPane: panes.setPlayerEmbeddedPane,
    }, mapId),
    workspace: {
      ...workspace,
      enterMapRun: workspace.enterRun,
      backToPreview: () => {
        workspace.exitRun()
        viewport.resetPlayerViewport()
        toolActions.resetActiveMapTools()
      },
    },
    panes,
    help: { open: interactionHelpOpen, setOpen: setInteractionHelpOpen },
    view: { ...tools, activeToolState, dispatchActiveTool, viewAsPlayer, gmView, placing, isMobileZoomMapView: mobileZoomView },
    toolActions: { ...toolActions, ...measurementTools },
    settings: { fogBrushSize, setFogBrushSize, npcSceneMode, setNpcSceneMode, tokenColor, setTokenColor, tokenSize, setTokenSize },
    size,
    dimensions,
    mapData,
    scene,
    sources,
    placement: { ...placementQueueActions, placementDisplay },
    characters: { ...characterSelection, ...characterSheets },
    selection,
    fog,
    brush: { active: brushActive, mode: brushMode, cursor: brushCursor, handlers: brushCanvasHandlers(fog, brushCursor) },
    encounter,
    grid,
    gridView,
    drawing,
    viewport,
    geometry,
    animation,
    tokenDrag,
    tokenAssets,
    inlineReady,
    bareMap: {
      role,
      activeToolState,
      placing,
      gridCalibrateMode: grid.gridCalibrateMode,
      gridMeasureMode: grid.gridMeasureMode,
      suppressNextMapClickRef: refs.suppressNextMapClickRef,
      selectedTokenIds: selection.selectedTokenIds,
      setSelectedTokenIds: selection.setSelectedTokenIds,
      setTokenSelectionBox: selection.setTokenSelectionBox,
      getTokenDropPoint,
      runPlacementDrop: placementDrop.runPlacementDrop,
      placeAnnotation: mapData.placeAnnotation,
      handleGridCalibrateClick: grid.handleGridCalibrateClick,
      handleGridMeasureClick: grid.handleGridMeasureClick,
    },
  }

  return <MapsTabView model={model} selectedMapId={selectedMapId} />
}
