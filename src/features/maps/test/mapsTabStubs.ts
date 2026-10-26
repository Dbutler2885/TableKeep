import { vi } from 'vitest'
import type { AnnotationRecord, CharacterTokenSummary, MapRecord, TokenRecord } from '../lib/types'

// Stand-ins for the MapsTab hooks that reach Firestore, Storage or a canvas.
// Each returns plain values and a spy for every action, so a suite can set the
// data the tab sees and check what the tab asked for.

export type Ref<T> = { current: T }

export function mapDataStub(overrides: Record<string, unknown> = {}) {
  return {
    maps: [] as MapRecord[],
    setMaps: vi.fn(),
    mapsLoading: false,
    mapError: '',
    setMapError: vi.fn(),
    uploading: false,
    editingMapId: '',
    editName: '',
    setEditName: vi.fn(),
    deleteCandidate: null as MapRecord | null,
    setDeleteCandidate: vi.fn(),
    deletingMapId: '',
    draggingMapId: '',
    setDraggingMapId: vi.fn(),
    dragOverMapId: '',
    setDragOverMapId: vi.fn(),
    tokens: [] as TokenRecord[],
    setTokens: vi.fn(),
    annotations: [] as AnnotationRecord[],
    activeAnnotationId: '',
    setActiveAnnotationId: vi.fn(),
    activeAnnotationDraft: '',
    setActiveAnnotationDraft: vi.fn(),
    tokenDeleteCandidate: null as TokenRecord[] | null,
    setTokenDeleteCandidate: vi.fn(),
    deletingTokenId: '',
    mapMonsters: [],
    mapCharacters: [] as CharacterTokenSummary[],
    mapNpcs: [],
    tokenAssets: [],
    selectedTokenAssetId: '',
    setSelectedTokenAssetId: vi.fn(),
    selectedTokenAsset: null,
    tokenAssetDeleteCandidate: null as { name: string } | null,
    setTokenAssetDeleteCandidate: vi.fn(),
    deletingTokenAssetId: '',
    handleMapUpload: vi.fn(async () => {}),
    handleCreateBlankMap: vi.fn(async () => 'blank-new'),
    startRename: vi.fn(),
    saveRename: vi.fn(async () => {}),
    deleteMap: vi.fn(async () => {}),
    togglePlayerVisibility: vi.fn(async () => {}),
    handleDragStart: vi.fn(),
    handleDrop: vi.fn(async () => {}),
    updateToken: vi.fn(async () => {}),
    requestDeleteTokens: vi.fn(),
    confirmDeleteToken: vi.fn(async () => {}),
    toggleTokenHidden: vi.fn(async () => {}),
    placeQueuedToken: vi.fn(async () => {}),
    updateSceneNpcIds: vi.fn(async () => {}),
    setPresentedNpcId: vi.fn(async () => {}),
    placeAnnotation: vi.fn(async () => {}),
    commitActiveAnnotation: vi.fn(async () => {}),
    deleteAnnotation: vi.fn(async () => {}),
    toggleAnnotationHidden: vi.fn(async () => {}),
    toggleAnnotationPointerDirection: vi.fn(async () => {}),
    moveAnnotationPosition: vi.fn(),
    persistAnnotationPosition: vi.fn(async () => {}),
    saveBlankMapDrawing: vi.fn(async () => {}),
    saveTokenAssetFile: vi.fn(async () => {}),
    archiveTokenAsset: vi.fn(async () => {}),
    requestDeleteTokenAsset: vi.fn(),
    confirmDeleteTokenAsset: vi.fn(async () => {}),
    ...overrides,
  }
}

export function fogStub(overrides: Record<string, unknown> = {}) {
  const inlineFogCanvasRef: Ref<HTMLCanvasElement | null> = { current: null }
  const inlineVisionCanvasRef: Ref<HTMLCanvasElement | null> = { current: null }
  return {
    fogDrawing: false,
    pauseFogStroke: vi.fn(),
    inlineFogReady: true,
    effectiveFogBrushSize: 120,
    inlineFogCanvasRef,
    inlineVisionCanvasRef,
    activeFogCanvasRef: inlineFogCanvasRef,
    activeVisionCanvasRef: inlineVisionCanvasRef,
    persistFog: vi.fn(),
    markFogLocalEdit: vi.fn(),
    beginFogLocalEdit: vi.fn(),
    endFogLocalEdit: vi.fn(),
    applyFogPreset: vi.fn(async () => {}),
    bumpFogSampleTick: vi.fn(),
    stampFog: vi.fn(),
    handleFogPointerDown: vi.fn(),
    handleFogPointerMove: vi.fn(),
    handleFogPointerUp: vi.fn(),
    handleFogTouchStart: vi.fn(),
    handleFogTouchMove: vi.fn(),
    handleFogTouchEnd: vi.fn(),
    invalidateInlineOverlayCache: vi.fn(),
    ...overrides,
  }
}

export function gridStub(overrides: Record<string, unknown> = {}) {
  return {
    gridCalibrateMode: false,
    gridMeasureMode: false,
    gridAdjustMode: false,
    gridAdjustDraft: null,
    gridCalibrateStart: null as { x: number; y: number } | null,
    gridCalibrateEnd: null as { x: number; y: number } | null,
    gridCalibratePreview: null as { x: number; y: number } | null,
    gridMeasureStart: null as { x: number; y: number } | null,
    gridMeasureEnd: null as { x: number; y: number } | null,
    gridMeasurePreview: null as { x: number; y: number } | null,
    gridCalibrateSavedAt: 0,
    gridAdjustSavedAt: 0,
    gridCalibratePulse: false,
    hexDetecting: false,
    hexDetectConfidence: null,
    effectiveGridEnabled: false,
    effectiveGridVisible: true,
    effectiveGridCellScale: 0.05,
    effectiveGridOffsetX: 0,
    effectiveGridOffsetY: 0,
    effectiveGridType: 'square',
    toggleGridCalibrateMode: vi.fn(),
    toggleGridMeasureMode: vi.fn(),
    toggleGridVisibility: vi.fn(async () => {}),
    setGridType: vi.fn(),
    applyGridAdjust: vi.fn(),
    applyGridCalibration: vi.fn(async () => {}),
    resetGrid: vi.fn(),
    handleGridLayerWheel: vi.fn(),
    handleGridLayerMouseDown: vi.fn(() => false),
    handleGridCalibrateClick: vi.fn(),
    handleGridMeasureClick: vi.fn(),
    handleGridCalibrateMouseMove: vi.fn(),
    handleGridMeasureMouseMove: vi.fn(),
    handleGridMeasureHandleMouseDown: vi.fn(),
    handleGridCalibrateHandleMouseDown: vi.fn(),
    ...overrides,
  }
}

export function viewportStub(overrides: Record<string, unknown> = {}) {
  return {
    playerZoom: 1,
    playerPan: { x: 0, y: 0 },
    playerDragging: false,
    cameraLock: false,
    playerPanRef: { current: { x: 0, y: 0 } },
    toggleCameraLock: vi.fn(),
    resetPlayerViewport: vi.fn(),
    setPlayerPan: vi.fn(),
    handlePlayerWheel: vi.fn(),
    handlePlayerMouseDown: vi.fn(),
    handlePlayerMouseMove: vi.fn(),
    endPlayerDrag: vi.fn(),
    handleMobilePlayerTouchStart: vi.fn(),
    handleMobilePlayerTouchMove: vi.fn(),
    handleMobilePlayerTouchEnd: vi.fn(),
    ...overrides,
  }
}

export function animationStub(overrides: Record<string, unknown> = {}) {
  return {
    animatedTokenPositions: {} as Record<string, { x: number; y: number }>,
    tokensRef: { current: [] as TokenRecord[] },
    recentlyDroppedRef: { current: new Set<string>() },
    lastAnimatedPathIdRef: { current: {} as Record<string, string> },
    startTokenPathAnimationRef: { current: vi.fn() },
    ...overrides,
  }
}

export function dragStub(overrides: Record<string, unknown> = {}) {
  return {
    dragTokenPositions: null as Record<string, { x: number; y: number }> | null,
    startTokenDrag: vi.fn(),
    handleTokenTouchStart: vi.fn(),
    handleTokenTouchEnd: vi.fn(),
    ...overrides,
  }
}

export function tokenAssetsStub(overrides: Record<string, unknown> = {}) {
  return {
    uploadingTokenImage: false,
    tokenImageDraft: null as { imageUrl: string; focusX: number; focusY: number; zoom: number } | null,
    setTokenImageDraft: vi.fn(),
    uploadTokenImage: vi.fn(async () => {}),
    applyTokenImageDraft: vi.fn(async () => {}),
    adjustTokenImageDraftZoom: vi.fn(),
    handleTokenImageDraftDragStart: vi.fn(),
    handleTokenImageDraftDragMove: vi.fn(),
    clearTokenImageDraftDrag: vi.fn(),
    ...overrides,
  }
}

// A map character summary that counts as a player's party character.
export function aPartyCharacter(id: string, name: string, overrides: Partial<CharacterTokenSummary> = {}): CharacterTokenSummary {
  return {
    id,
    name,
    ownerUserId: `player-${id}`,
    creationStatus: 'active',
    inPlay: true,
    tokenIcon: { icon: 'pawn', color: '#226633', size: 34 },
    ...overrides,
  } as CharacterTokenSummary
}
