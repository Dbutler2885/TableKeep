import type { MapRecord, NpcSummary, TokenAssetRecord, TokenRecord } from '../lib/types'

export function aToken(overrides: Partial<TokenRecord> & { id: string }): TokenRecord {
  return {
    x: 0.5,
    y: 0.5,
    color: '#336699',
    size: 28,
    sizeScale: null,
    rotationDeg: 0,
    flipHorizontal: false,
    flipVertical: false,
    viewDistance: null,
    viewDistanceScale: null,
    party: false,
    name: '',
    revealName: false,
    hidden: false,
    tokenImagePath: '',
    tokenImageUrl: '',
    tokenImageWidth: 0,
    tokenImageHeight: 0,
    monsterId: '',
    ...overrides,
  }
}

export function anNpc(overrides: Partial<NpcSummary> & { id: string; name: string }): NpcSummary {
  return {
    title: '',
    tags: [],
    portraitUrl: null,
    portraitFocusX: 50,
    portraitFocusY: 40,
    tokenIcon: { icon: 'pawn', color: '#aa3300', size: 30 },
    playerDescription: '',
    playerNotes: '',
    ...overrides,
  }
}

export function aTokenAsset(overrides: Partial<TokenAssetRecord> & { id: string; name: string }): TokenAssetRecord {
  return {
    imagePath: `assets/${overrides.id}.png`,
    imageUrl: `https://img.test/${overrides.id}.png`,
    width: 64,
    height: 64,
    archived: false,
    ...overrides,
  }
}

export function aMap(overrides: Partial<MapRecord> & { id: string }): MapRecord {
  return {
    name: `Map ${overrides.id}`,
    kind: 'image',
    imagePath: `maps/${overrides.id}.png`,
    imageUrl: `https://img.test/${overrides.id}.png`,
    backgroundColor: '#ffffff',
    fogDataUrl: '',
    fogImagePath: '',
    fogImageUrl: '',
    visionBlockDataUrl: '',
    visionBlockImagePath: '',
    visionBlockImageUrl: '',
    fullyHidden: false,
    width: 1000,
    height: 800,
    sortOrder: 0,
    visibleToPlayers: false,
    gridEnabled: false,
    gridVisible: true,
    gridCellScale: 0.05,
    gridOffsetX: 0,
    gridOffsetY: 0,
    gridType: 'square',
    gridUnitsPerCell: 5,
    gridCalibrated: false,
    sceneNpcIds: [],
    presentedNpcId: '',
    drawingScene: '',
    updatedAtMs: 0,
    ...overrides,
  }
}
