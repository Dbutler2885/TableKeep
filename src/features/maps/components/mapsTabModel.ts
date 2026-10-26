import type { ComponentProps, Dispatch } from 'react'
import type { Role } from '../../../types/app'
import type { CharacterTab } from '../../character/CharacterTab'
import type { BlankMapDrawing } from '../hooks/useBlankMapDrawing'
import type { BrushCanvasHandlers, BrushCursor } from '../hooks/useBrushCursor'
import type { GmCharacterSheets } from '../hooks/useGmCharacterSheets'
import type { GridView } from '../hooks/useGridView'
import type { InlineMapSize } from '../hooks/useInlineMapSize'
import type { MapToolActions, useMeasurementTools } from '../hooks/useMapToolActions'
import type { TokenGeometry } from '../hooks/useMapsTabRefs'
import type { PlacementQueueActions, PlacementSources } from '../hooks/useTokenPlacement'
import type { useEncounterTracking } from '../hooks/useEncounterTracking'
import type { useFogTools } from '../hooks/useFogTools'
import type { useGmCharacterSelection } from '../hooks/useGmCharacterSelection'
import type { useGridTools } from '../hooks/useGridTools'
import type { useMapData } from '../hooks/useMapData'
import type { useMapPaneVisibility } from '../hooks/useMapPaneVisibility'
import type { useMapViewport } from '../hooks/useMapViewport'
import type { useMapWorkspace } from '../hooks/useMapWorkspace'
import type { useSceneNpcs } from '../hooks/useSceneNpcPicker'
import type { useTokenAnimation } from '../hooks/useTokenAnimation'
import type { useTokenAssets } from '../hooks/useTokenAssets'
import type { useTokenDrag } from '../hooks/useTokenDrag'
import type { useTokenSelection } from '../hooks/useTokenSelection'
import type { ActiveToolAction, ActiveToolState } from '../lib/activeToolState'
import type { BareMapContext } from '../lib/bareMapInteractions'
import type { MapDimensions } from '../lib/inlineMapSizing'
import type { MapToolFlags } from '../lib/mapToolFlags'
import type { TokenPlacementDisplay } from '../lib/tokenPlacementQueue'

// Everything the Maps tab's panes read, as MapsTab assembles it from its hooks.
// The panes take the parts they need from it; the leaf components take plain props.
export type MapsTabModel = {
  campaignId: string
  groupId: string
  role: Role | null
  characterTabProps: ComponentProps<typeof CharacterTab> | undefined
  selectMap: (mapId: string) => void
  workspace: ReturnType<typeof useMapWorkspace> & { enterMapRun: () => void; backToPreview: () => void }
  panes: ReturnType<typeof useMapPaneVisibility>
  help: { open: boolean; setOpen: (open: boolean) => void }
  view: MapToolFlags & {
    activeToolState: ActiveToolState
    dispatchActiveTool: Dispatch<ActiveToolAction>
    // The GM stage renders the player-facing map state. Map Preview is always
    // player-facing (read-only); in Map Run the Player View Preview toggle drives it.
    viewAsPlayer: boolean
    // The GM is looking at the GM view of the map, not the player-facing one.
    gmView: boolean
    placing: boolean
    isMobileZoomMapView: boolean
  }
  toolActions: MapToolActions & ReturnType<typeof useMeasurementTools>
  settings: {
    fogBrushSize: number
    setFogBrushSize: (size: number) => void
    npcSceneMode: boolean
    setNpcSceneMode: (value: boolean) => void
    tokenColor: string
    setTokenColor: (value: string) => void
    tokenSize: number
    setTokenSize: (value: number) => void
  }
  size: InlineMapSize
  dimensions: MapDimensions
  mapData: ReturnType<typeof useMapData>
  scene: ReturnType<typeof useSceneNpcs>
  sources: PlacementSources
  placement: PlacementQueueActions & { placementDisplay: TokenPlacementDisplay }
  characters: ReturnType<typeof useGmCharacterSelection> & GmCharacterSheets
  selection: ReturnType<typeof useTokenSelection>
  fog: ReturnType<typeof useFogTools>
  brush: { active: boolean; mode: string; cursor: BrushCursor; handlers: BrushCanvasHandlers }
  encounter: ReturnType<typeof useEncounterTracking>
  grid: ReturnType<typeof useGridTools>
  gridView: GridView
  drawing: BlankMapDrawing
  viewport: ReturnType<typeof useMapViewport>
  geometry: TokenGeometry
  animation: ReturnType<typeof useTokenAnimation>
  tokenDrag: ReturnType<typeof useTokenDrag>
  tokenAssets: ReturnType<typeof useTokenAssets>
  inlineReady: { handleInlineImageReady: (image: HTMLImageElement) => void; handleInlineBlankReady: (width: number, height: number) => void }
  bareMap: BareMapContext
}
