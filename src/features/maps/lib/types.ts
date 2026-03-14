import type { TokenIconConfig } from '../../tokens/TokenIconEditor'
import type { CharacterRecord } from '../../../types/app'

export type MapRecord = {
  id: string
  name: string
  imagePath: string
  imageUrl: string
  fogDataUrl: string
  fogImagePath: string
  fogImageUrl: string
  visionBlockDataUrl: string
  visionBlockImagePath: string
  visionBlockImageUrl: string
  fullyHidden: boolean
  width: number
  height: number
  sortOrder: number
  visibleToPlayers: boolean
  gridEnabled: boolean
  gridVisible: boolean
  gridCellScale: number
  gridOffsetX: number
  gridOffsetY: number
  gridType: 'square' | 'hex-pointy' | 'hex-flat'
  gridUnitsPerCell: number
  gridCalibrated: boolean
  sceneNpcIds: string[]
  presentedNpcId: string
  updatedAtMs: number
}

export type TokenRecord = {
  id: string
  x: number
  y: number
  color: string
  size: number
  sizeScale: number | null
  viewDistance: number | null
  viewDistanceScale: number | null
  party: boolean
  name: string
  revealName: boolean
  hidden: boolean
  tokenImagePath: string
  tokenImageUrl: string
  tokenImageWidth: number
  tokenImageHeight: number
  monsterId: string
  characterId?: string
  npcId?: string
}

export type AnnotationRecord = {
  id: string
  x: number
  y: number
  text: string
  kind: 'gm' | 'player'
  hidden: boolean
  pointerDirection: 'up' | 'down'
}

export type TokenAssetRecord = {
  id: string
  name: string
  imagePath: string
  imageUrl: string
  width: number
  height: number
  archived: boolean
}

// Minimal monster data loaded in MapsTab for the token spawn picker.
export type MonsterSummary = {
  id: string
  name: string
  tokenIcon: TokenIconConfig
}

export type CharacterTokenSummary = Pick<CharacterRecord, 'id' | 'name' | 'tokenIcon'>

export type NpcSummary = {
  id: string
  name: string
  title: string
  portraitPath?: string
  portraitUrl: string | null
  portraitFocusX: number
  portraitFocusY: number
  tokenIcon: TokenIconConfig
  playerDescription: string
  playerNotes: string
}

export type CanvasClipRect = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type GridAdjustDraft = {
  gridEnabled: boolean
  gridVisible: boolean
  gridCellScale: number
  gridOffsetX: number
  gridOffsetY: number
  gridType: 'square' | 'hex-pointy' | 'hex-flat'
}

export type Waypoint = { x: number; y: number; t?: number }

export type TokenPathAnimation = {
  path: Waypoint[]
  startTime: number
  duration: number
  brushSize: number
  tokenSizeScale: number
  party: boolean
  lastRevealTime: number
  lastRevealCanvasPos: { x: number; y: number } | null
}

export type TokenImageDraft = {
  imageUrl: string
  focusX: number
  focusY: number
  zoom: number
  assetName?: string
  fileBaseName: string
}

export type WheelRectSnapshot = {
  centerX: number
  centerY: number
}
