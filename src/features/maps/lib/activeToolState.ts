export type FogTool = 'hide' | 'reveal'
export type VisionBlockTool = 'hardBlock' | 'softBlock' | 'erase'
export type AnnotationTool = 'marker' | 'playerLabel'
export type MeasurementTool = 'measureDistance' | 'calibrateGrid'

export type ActiveMapTool =
  | { type: 'fog'; tool: FogTool }
  | { type: 'vision'; tool: VisionBlockTool }
  | { type: 'annotation'; tool: AnnotationTool }
  | { type: 'measurement'; tool: MeasurementTool }
  | { type: 'hand' }
  | { type: 'boxSelect' }

export type TokenPlacementKind =
  | 'npc'
  | 'monster'
  | 'genericToken'
  | 'partyCharacter'
  | 'wholeParty'

export type TokenPlacementState = {
  kind: TokenPlacementKind
  queueId?: string
}

export type MapToolToggles = {
  gridVisible: boolean
  gmHideLabels: boolean
  playerViewPreview: boolean
}

export type ActiveToolState = {
  activeTool: ActiveMapTool | null
  tokenPlacement: TokenPlacementState | null
  toggles: MapToolToggles
}

export type ActiveToolAction =
  | { type: 'selectTool'; tool: ActiveMapTool }
  | { type: 'toggleTool'; tool: ActiveMapTool }
  | { type: 'clearActiveTool' }
  | { type: 'startTokenPlacement'; placement: TokenPlacementState }
  | { type: 'cancelTokenPlacement' }
  | { type: 'toggleGridVisibility' }
  | { type: 'setGridVisibility'; visible: boolean }
  | { type: 'toggleGmHideLabels' }
  | { type: 'setGmHideLabels'; hidden: boolean }
  | { type: 'togglePlayerViewPreview' }
  | { type: 'setPlayerViewPreview'; enabled: boolean }
  | { type: 'escape' }
  | { type: 'reset' }

export const initialActiveToolState: ActiveToolState = {
  activeTool: null,
  tokenPlacement: null,
  toggles: {
    gridVisible: true,
    gmHideLabels: false,
    playerViewPreview: false,
  },
}

export function activeToolReducer(
  state: ActiveToolState,
  action: ActiveToolAction,
): ActiveToolState {
  switch (action.type) {
    case 'selectTool':
      return {
        ...state,
        activeTool: action.tool,
        tokenPlacement: null,
      }
    case 'toggleTool':
      return {
        ...state,
        activeTool: isSameActiveTool(state.activeTool, action.tool) ? null : action.tool,
        tokenPlacement: null,
      }
    case 'clearActiveTool':
      if (!state.activeTool) return state
      return { ...state, activeTool: null }
    case 'startTokenPlacement':
      return {
        ...state,
        activeTool: null,
        tokenPlacement: action.placement,
      }
    case 'cancelTokenPlacement':
      if (!state.tokenPlacement) return state
      return { ...state, tokenPlacement: null }
    case 'toggleGridVisibility':
      return {
        ...state,
        toggles: { ...state.toggles, gridVisible: !state.toggles.gridVisible },
      }
    case 'setGridVisibility':
      if (state.toggles.gridVisible === action.visible) return state
      return {
        ...state,
        toggles: { ...state.toggles, gridVisible: action.visible },
      }
    case 'toggleGmHideLabels':
      return {
        ...state,
        toggles: { ...state.toggles, gmHideLabels: !state.toggles.gmHideLabels },
      }
    case 'setGmHideLabels':
      if (state.toggles.gmHideLabels === action.hidden) return state
      return {
        ...state,
        toggles: { ...state.toggles, gmHideLabels: action.hidden },
      }
    case 'togglePlayerViewPreview':
      return {
        ...state,
        toggles: { ...state.toggles, playerViewPreview: !state.toggles.playerViewPreview },
      }
    case 'setPlayerViewPreview':
      if (state.toggles.playerViewPreview === action.enabled) return state
      return {
        ...state,
        toggles: { ...state.toggles, playerViewPreview: action.enabled },
      }
    case 'escape':
      if (!state.activeTool && !state.tokenPlacement) return state
      return { ...state, activeTool: null, tokenPlacement: null }
    case 'reset':
      return initialActiveToolState
    default:
      return state
  }
}

function isSameActiveTool(left: ActiveMapTool | null, right: ActiveMapTool): boolean {
  if (!left || left.type !== right.type) return false
  if (!('tool' in left) || !('tool' in right)) return true

  switch (left.type) {
    case 'fog':
    case 'vision':
    case 'annotation':
    case 'measurement':
      return left.tool === right.tool
    default:
      return false
  }
}
