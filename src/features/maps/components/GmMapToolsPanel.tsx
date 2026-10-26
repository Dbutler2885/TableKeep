import { Eraser, Eye, EyeOff, Flag, Hand, PenTool, Pencil, SprayCan, SquareDashedMousePointer, Tag, TvMinimalPlay, UserRoundPen, X } from 'lucide-react'
import {
  toggleAnnotationPlacement,
  toggleFogTool,
  togglePlayerLabelPlacement,
  toggleTokenSelect,
  toggleVisionTool,
  type GmToolControls,
} from '../lib/gmToolToggles'
import { BrushSizeControl } from './BrushSizeControl'
import { GmGridToolGroups, type GmGridToolGroupsProps } from './GmGridToolGroups'
import { MapToolButton } from './MapToolButton'

export type GmMapToolsPanelProps = GmToolControls & GmGridToolGroupsProps & {
  fogBrushSize: number
  setFogBrushSize: (size: number) => void
  gmHideLabels: boolean
  setGmHideLabels: (value: boolean) => void
  handToolActive: boolean
  setHandToolActive: (value: boolean) => void
  npcSceneMode: boolean
  setNpcSceneMode: (value: boolean) => void
  playerViewPreview: boolean
  setPlayerViewPreview: (value: boolean) => void
  applyFogPreset: (preset: 'hide-all' | 'unhide-all') => Promise<void>
  canApplyPreset: boolean
  fullyHidden: boolean
}

type FogToolGroupProps = Pick<GmMapToolsPanelProps, 'applyFogPreset' | 'canApplyPreset' | 'fullyHidden'> & {
  controls: GmToolControls
}

function FogToolGroup({ controls, applyFogPreset, canApplyPreset, fullyHidden }: FogToolGroupProps) {
  const presetLabel = fullyHidden ? 'Unhide all' : 'Hide all'
  return (
    <>
      <span className="map-section-label">Fog</span>
      <div className="map-section-grid">
        <MapToolButton
          className="map-icon-btn map-fog-hide-btn fast-tooltip fast-tooltip-left"
          active={controls.fogTool === 'hide'}
          onClick={() => toggleFogTool(controls, 'hide')}
          label="Add fog"
          tooltip="Add fog"
        >
          <SprayCan size={16} />
        </MapToolButton>
        <MapToolButton
          className="map-icon-btn map-fog-reveal-btn fast-tooltip"
          active={controls.fogTool === 'reveal'}
          onClick={() => toggleFogTool(controls, 'reveal')}
          label="Remove fog"
          tooltip="Remove fog"
        >
          <Eraser size={16} />
        </MapToolButton>
        <MapToolButton
          className="map-icon-btn map-hide-all-btn fast-tooltip"
          active={fullyHidden}
          onClick={() => void applyFogPreset(fullyHidden ? 'unhide-all' : 'hide-all')}
          disabled={!canApplyPreset}
          label={presetLabel}
          tooltip={presetLabel}
        >
          {fullyHidden ? <Eye size={16} /> : <EyeOff size={16} />}
        </MapToolButton>
      </div>
    </>
  )
}

function VisionToolGroup({ controls }: { controls: GmToolControls }) {
  return (
    <>
      <span className="map-section-label">Vision Block</span>
      <div className="map-section-grid">
        <MapToolButton
          className="map-icon-btn map-vision-full-btn fast-tooltip fast-tooltip-left"
          active={controls.visionTool === 'drawFull'}
          onClick={() => toggleVisionTool(controls, 'drawFull')}
          label="Hard vision block"
          tooltip="Hard block: blocks sight into painted area and beyond"
        >
          <PenTool size={16} />
        </MapToolButton>
        <MapToolButton
          className="map-icon-btn map-vision-draw-btn fast-tooltip"
          active={controls.visionTool === 'draw'}
          onClick={() => toggleVisionTool(controls, 'draw')}
          label="Soft vision block"
          tooltip="Soft block: reveals painted area, blocks sight beyond"
        >
          <Pencil size={16} />
        </MapToolButton>
        <MapToolButton
          className="map-icon-btn map-vision-erase-btn fast-tooltip"
          active={controls.visionTool === 'erase'}
          onClick={() => toggleVisionTool(controls, 'erase')}
          label="Erase vision blocks"
          tooltip="Erase vision blocks"
        >
          <X size={16} />
        </MapToolButton>
      </div>
    </>
  )
}

type AnnotationToolGroupProps = Pick<GmMapToolsPanelProps, 'gmHideLabels' | 'setGmHideLabels'> & {
  controls: GmToolControls
}

function AnnotationToolGroup({ controls, gmHideLabels, setGmHideLabels }: AnnotationToolGroupProps) {
  const hideLabelsLabel = gmHideLabels ? 'Show labels in GM view' : 'Hide labels in GM view'
  return (
    <>
      <span className="map-section-label">Annotation</span>
      <div className="map-section-grid">
        <MapToolButton
          className="map-icon-btn map-annotation-place-btn fast-tooltip fast-tooltip-left"
          active={controls.annotationPlaceMode}
          onClick={() => toggleAnnotationPlacement(controls)}
          label="Toggle GM notes placement"
          tooltip="GM Notes Placement"
        >
          <Flag size={16} />
        </MapToolButton>
        <MapToolButton
          className="map-icon-btn map-player-label-mode-btn fast-tooltip"
          active={controls.playerLabelPlaceMode}
          onClick={() => togglePlayerLabelPlacement(controls)}
          label="Toggle player label placement mode"
          tooltip="Player label placement mode"
        >
          <Tag size={16} />
        </MapToolButton>
        <MapToolButton
          className="map-icon-btn map-hide-labels-btn fast-tooltip"
          active={gmHideLabels}
          onClick={() => setGmHideLabels(!gmHideLabels)}
          label={hideLabelsLabel}
          tooltip={hideLabelsLabel}
        >
          <EyeOff size={16} />
        </MapToolButton>
      </div>
    </>
  )
}

type TokenToolGroupProps = Pick<GmMapToolsPanelProps, 'handToolActive' | 'setHandToolActive'> & {
  controls: GmToolControls
}

function TokenToolGroup({ controls, handToolActive, setHandToolActive }: TokenToolGroupProps) {
  return (
    <>
      <span className="map-section-label">Token</span>
      <div className="map-section-grid">
        <MapToolButton
          className="map-icon-btn map-token-select-btn fast-tooltip fast-tooltip-left"
          active={controls.tokenSelectMode}
          onClick={() => toggleTokenSelect(controls)}
          label="Toggle token drag-select mode"
          tooltip="Token drag-select mode"
        >
          <SquareDashedMousePointer size={16} />
        </MapToolButton>
        <MapToolButton
          className="map-icon-btn map-hand-tool-btn fast-tooltip"
          active={handToolActive}
          onClick={() => setHandToolActive(!handToolActive)}
          label="Toggle hand pan tool"
          tooltip="Hand pan tool"
        >
          <Hand size={16} />
        </MapToolButton>
      </div>
    </>
  )
}

type ViewToolGroupsProps = Pick<GmMapToolsPanelProps, 'npcSceneMode' | 'setNpcSceneMode' | 'playerViewPreview' | 'setPlayerViewPreview'>

function ViewToolGroups({ npcSceneMode, setNpcSceneMode, playerViewPreview, setPlayerViewPreview }: ViewToolGroupsProps) {
  return (
    <>
      <span className="map-section-label">Scene NPC</span>
      <div className="map-section-grid">
        <MapToolButton
          className="map-icon-btn map-scene-npc-btn fast-tooltip fast-tooltip-left"
          active={npcSceneMode}
          onClick={() => setNpcSceneMode(!npcSceneMode)}
          label="Toggle scene NPC panel"
          tooltip="Scene NPCs"
        >
          <UserRoundPen size={16} />
        </MapToolButton>
      </div>
      <span className="map-section-label">Player View Preview</span>
      <div className="map-section-grid">
        <MapToolButton
          className="map-icon-btn map-streaming-btn fast-tooltip fast-tooltip-left"
          active={playerViewPreview}
          onClick={() => setPlayerViewPreview(!playerViewPreview)}
          label="Toggle player view preview"
          tooltip="Player view preview"
        >
          <TvMinimalPlay size={16} />
        </MapToolButton>
      </div>
    </>
  )
}

// The GM's tool panel above the token controls: brush size, fog, vision blocks,
// annotations, token tools and views on the left, grid and measuring on the right.
export function GmMapToolsPanel(props: GmMapToolsPanelProps) {
  return (
    <div className="map-tools-panel">
      <BrushSizeControl fogBrushSize={props.fogBrushSize} setFogBrushSize={props.setFogBrushSize} />
      <div className="map-tools-left">
        <FogToolGroup controls={props} applyFogPreset={props.applyFogPreset} canApplyPreset={props.canApplyPreset} fullyHidden={props.fullyHidden} />
        <VisionToolGroup controls={props} />
        <AnnotationToolGroup controls={props} gmHideLabels={props.gmHideLabels} setGmHideLabels={props.setGmHideLabels} />
        <TokenToolGroup controls={props} handToolActive={props.handToolActive} setHandToolActive={props.setHandToolActive} />
        <ViewToolGroups
          npcSceneMode={props.npcSceneMode}
          setNpcSceneMode={props.setNpcSceneMode}
          playerViewPreview={props.playerViewPreview}
          setPlayerViewPreview={props.setPlayerViewPreview}
        />
      </div>
      <GmGridToolGroups {...props} />
    </div>
  )
}
