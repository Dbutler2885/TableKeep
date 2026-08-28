import {
  Check,
  Eraser,
  Eye,
  EyeOff,
  Flag,
  Grid3X3,
  Hand,
  Hexagon,
  Info,
  LoaderCircle,
  Pencil,
  PenTool,
  Ruler,
  RulerDimensionLine,
  SprayCan,
  SquareDashedMousePointer,
  Tag,
  TvMinimalPlay,
  UserRoundPen,
  X,
} from 'lucide-react'
import { getMapToolGuidance } from '../lib/toolGuidance'
import { BrushSizeControl } from './BrushSizeControl'
import { DistanceTrackerBadge } from './DistanceTrackerBadge'

export function GmMapTopToolPanel({
  fogTool,
  setFogTool,
  visionTool,
  setVisionTool,
  fogBrushSize,
  setFogBrushSize,
  tokenSelectMode,
  setTokenSelectMode,
  annotationPlaceMode,
  setAnnotationPlaceMode,
  playerLabelPlaceMode,
  setPlayerLabelPlaceMode,
  gmHideLabels,
  setGmHideLabels,
  handToolActive,
  setHandToolActive,
  npcSceneMode,
  setNpcSceneMode,
  playerViewPreview,
  setPlayerViewPreview,
  gridVisible,
  gridType,
  gridAdjustMode,
  onToggleGridVisible,
  onSetGridType,
  hexDetecting,
  gridCalibrateMode,
  onToggleGridCalibrate,
  gridCalibrateReady,
  gridCalibrateSaved,
  onApplyGridCalibration,
  measurementToolEnabled,
  gridMeasureMode,
  onToggleGridMeasure,
  distanceTrackerFeet,
  distanceTrackerMode,
  distanceTrackerRoll,
  onResetDistanceTracker,
  applyFogPreset,
  canApplyPreset,
  fullyHidden,
  guidance,
  onOpenHelp,
}: {
  fogTool: 'reveal' | 'hide' | null
  setFogTool: (tool: 'reveal' | 'hide' | null) => void
  visionTool: 'draw' | 'drawFull' | 'erase' | null
  setVisionTool: (tool: 'draw' | 'drawFull' | 'erase' | null) => void
  fogBrushSize: number
  setFogBrushSize: (size: number) => void
  tokenSelectMode: boolean
  setTokenSelectMode: (value: boolean) => void
  annotationPlaceMode: boolean
  setAnnotationPlaceMode: (value: boolean) => void
  playerLabelPlaceMode: boolean
  setPlayerLabelPlaceMode: (value: boolean) => void
  gmHideLabels: boolean
  setGmHideLabels: (value: boolean) => void
  handToolActive: boolean
  setHandToolActive: (value: boolean) => void
  npcSceneMode: boolean
  setNpcSceneMode: (value: boolean) => void
  playerViewPreview: boolean
  setPlayerViewPreview: (value: boolean) => void
  gridVisible: boolean
  gridType: 'square' | 'hex-pointy' | 'hex-flat'
  gridAdjustMode: boolean
  onToggleGridVisible: () => void
  onSetGridType: (gridType: 'square' | 'hex-pointy' | 'hex-flat') => void
  hexDetecting: boolean
  gridCalibrateMode: boolean
  onToggleGridCalibrate: () => void
  gridCalibrateReady: boolean
  gridCalibrateSaved: boolean
  onApplyGridCalibration: () => void
  measurementToolEnabled: boolean
  gridMeasureMode: boolean
  onToggleGridMeasure: () => void
  distanceTrackerFeet: number
  distanceTrackerMode: 'count' | 'first' | 'roll'
  distanceTrackerRoll: number | null
  onResetDistanceTracker: () => void
  applyFogPreset: (preset: 'hide-all' | 'unhide-all') => Promise<void>
  canApplyPreset: boolean
  fullyHidden: boolean
  guidance: ReturnType<typeof getMapToolGuidance>
  onOpenHelp: () => void
}) {
  const handleToggleFogPreset = () => {
    void applyFogPreset(fullyHidden ? 'unhide-all' : 'hide-all')
  }

  return (
    <div className="map-tools-panel">
      <BrushSizeControl fogBrushSize={fogBrushSize} setFogBrushSize={setFogBrushSize} />
      <div className="map-tool-group">
        <span className="map-section-label">Fog</span>
        <div className="map-section-grid">
          <button
            type="button"
            className={fogTool === 'hide' ? 'map-icon-btn map-fog-hide-btn fast-tooltip fast-tooltip-left active' : 'map-icon-btn map-fog-hide-btn fast-tooltip fast-tooltip-left'}
            onClick={() => setFogTool(fogTool === 'hide' ? null : 'hide')}
            aria-label="Add fog"
            data-tooltip="Add fog"
          >
            <SprayCan size={16} />
          </button>
          <button
            type="button"
            className={fogTool === 'reveal' ? 'map-icon-btn map-fog-reveal-btn fast-tooltip active' : 'map-icon-btn map-fog-reveal-btn fast-tooltip'}
            onClick={() => setFogTool(fogTool === 'reveal' ? null : 'reveal')}
            aria-label="Remove fog"
            data-tooltip="Remove fog"
          >
            <Eraser size={16} />
          </button>
          <button
            type="button"
            className={fullyHidden ? 'map-icon-btn map-hide-all-btn fast-tooltip active' : 'map-icon-btn map-hide-all-btn fast-tooltip'}
            onClick={handleToggleFogPreset}
            disabled={!canApplyPreset}
            aria-label={fullyHidden ? 'Unhide all' : 'Hide all'}
            data-tooltip={fullyHidden ? 'Unhide all' : 'Hide all'}
          >
            {fullyHidden ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
        </div>
      </div>
      <div className="map-tool-group">
        <span className="map-section-label">Vision Block</span>
        <div className="map-section-grid">
          <button
            type="button"
            className={visionTool === 'drawFull' ? 'map-icon-btn map-vision-full-btn fast-tooltip fast-tooltip-left active' : 'map-icon-btn map-vision-full-btn fast-tooltip fast-tooltip-left'}
            onClick={() => setVisionTool(visionTool === 'drawFull' ? null : 'drawFull')}
            aria-label="Hard vision block"
            data-tooltip="Hard block: blocks sight into painted area and beyond"
          >
            <PenTool size={16} />
          </button>
          <button
            type="button"
            className={visionTool === 'draw' ? 'map-icon-btn map-vision-draw-btn fast-tooltip active' : 'map-icon-btn map-vision-draw-btn fast-tooltip'}
            onClick={() => setVisionTool(visionTool === 'draw' ? null : 'draw')}
            aria-label="Soft vision block"
            data-tooltip="Soft block: reveals painted area, blocks sight beyond"
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            className={visionTool === 'erase' ? 'map-icon-btn map-vision-erase-btn fast-tooltip active' : 'map-icon-btn map-vision-erase-btn fast-tooltip'}
            onClick={() => setVisionTool(visionTool === 'erase' ? null : 'erase')}
            aria-label="Erase vision blocks"
            data-tooltip="Erase vision blocks"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="map-tool-group">
        <span className="map-section-label">Annotation</span>
        <div className="map-section-grid">
          <button
            type="button"
            className={annotationPlaceMode ? 'map-icon-btn map-annotation-place-btn fast-tooltip fast-tooltip-left active' : 'map-icon-btn map-annotation-place-btn fast-tooltip fast-tooltip-left'}
            onClick={() => setAnnotationPlaceMode(!annotationPlaceMode)}
            aria-label="Toggle GM notes placement"
            data-tooltip="GM Notes Placement"
          >
            <Flag size={16} />
          </button>
          <button
            type="button"
            className={playerLabelPlaceMode ? 'map-icon-btn map-player-label-mode-btn fast-tooltip active' : 'map-icon-btn map-player-label-mode-btn fast-tooltip'}
            onClick={() => setPlayerLabelPlaceMode(!playerLabelPlaceMode)}
            aria-label="Toggle player label placement mode"
            data-tooltip="Player label placement mode"
          >
            <Tag size={16} />
          </button>
          <button
            type="button"
            className={gmHideLabels ? 'map-icon-btn map-hide-labels-btn fast-tooltip active' : 'map-icon-btn map-hide-labels-btn fast-tooltip'}
            onClick={() => setGmHideLabels(!gmHideLabels)}
            aria-label={gmHideLabels ? 'Show labels in GM view' : 'Hide labels in GM view'}
            data-tooltip={gmHideLabels ? 'Show labels in GM view' : 'Hide labels in GM view'}
          >
            <EyeOff size={16} />
          </button>
        </div>
      </div>
      <div className="map-tool-group">
        <span className="map-section-label">Selection / Pan</span>
        <div className="map-section-grid">
          <button
            type="button"
            className={tokenSelectMode ? 'map-icon-btn map-token-select-btn fast-tooltip fast-tooltip-left active' : 'map-icon-btn map-token-select-btn fast-tooltip fast-tooltip-left'}
            onClick={() => setTokenSelectMode(!tokenSelectMode)}
            aria-label="Toggle token drag-select mode"
            data-tooltip="Token drag-select mode"
          >
            <SquareDashedMousePointer size={16} />
          </button>
          <button
            type="button"
            className={handToolActive ? 'map-icon-btn map-hand-tool-btn fast-tooltip active' : 'map-icon-btn map-hand-tool-btn fast-tooltip'}
            onClick={() => setHandToolActive(!handToolActive)}
            aria-label="Toggle hand pan tool"
            data-tooltip="Hand pan tool"
          >
            <Hand size={16} />
          </button>
        </div>
      </div>
      <div className="map-tool-group">
        <span className="map-section-label">Grid</span>
        <div className="map-section-grid">
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
            className={gridAdjustMode && gridType === 'hex-pointy'
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
            className={gridAdjustMode && gridType === 'hex-flat'
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
        </div>
      </div>
      <div className="map-tool-group">
        <span className="map-section-label">Measurement</span>
        <div className="map-section-grid">
          <button
            type="button"
            className={gridCalibrateMode ? 'map-icon-btn map-ruler-btn fast-tooltip fast-tooltip-right active' : 'map-icon-btn map-ruler-btn fast-tooltip fast-tooltip-right'}
            onClick={onToggleGridCalibrate}
            aria-label="Calibrate grid scale"
            data-tooltip={gridCalibrateMode ? 'Measuring' : "Calibrate 10'"}
          >
            <RulerDimensionLine size={16} />
          </button>
          <button
            type="button"
            className={gridCalibrateSaved ? 'map-icon-btn map-calibration-apply-btn fast-tooltip fast-tooltip-right active' : 'map-icon-btn map-calibration-apply-btn fast-tooltip fast-tooltip-right'}
            onClick={onApplyGridCalibration}
            disabled={!gridCalibrateMode || !gridCalibrateReady}
            aria-label="Apply calibration"
            data-tooltip={
              !gridCalibrateMode
                ? 'Start calibration first'
                : gridCalibrateReady
                  ? 'Apply calibration'
                  : 'Set two calibration points'
            }
          >
            <Check size={16} />
          </button>
          <button
            type="button"
            className={gridMeasureMode ? 'map-icon-btn map-measure-btn fast-tooltip fast-tooltip-right active' : 'map-icon-btn map-measure-btn fast-tooltip fast-tooltip-right'}
            onClick={onToggleGridMeasure}
            disabled={!measurementToolEnabled}
            aria-label="Measure map distance"
            data-tooltip={!measurementToolEnabled ? 'Lay or calibrate grid first' : gridMeasureMode ? 'Clear measurement' : 'Measure distance'}
          >
            <Ruler size={16} />
          </button>
          <DistanceTrackerBadge distanceTrackerFeet={distanceTrackerFeet} distanceTrackerMode={distanceTrackerMode} distanceTrackerRoll={distanceTrackerRoll} onResetDistanceTracker={onResetDistanceTracker} />
        </div>
      </div>
      <div className="map-tool-group">
        <span className="map-section-label">Scene NPC</span>
        <div className="map-section-grid">
          <button
            type="button"
            className={npcSceneMode ? 'map-icon-btn map-scene-npc-btn fast-tooltip fast-tooltip-left active' : 'map-icon-btn map-scene-npc-btn fast-tooltip fast-tooltip-left'}
            onClick={() => setNpcSceneMode(!npcSceneMode)}
            aria-label="Toggle scene NPC panel"
            data-tooltip="Scene NPCs"
          >
            <UserRoundPen size={16} />
          </button>
        </div>
      </div>
      <div className="map-tool-group">
        <span className="map-section-label">Player View</span>
        <div className="map-section-grid">
          <button
            type="button"
            className={playerViewPreview ? 'map-icon-btn map-streaming-btn fast-tooltip fast-tooltip-left active' : 'map-icon-btn map-streaming-btn fast-tooltip fast-tooltip-left'}
            onClick={() => setPlayerViewPreview(!playerViewPreview)}
            aria-label="Toggle player view preview"
            data-tooltip="Player view preview"
          >
            <TvMinimalPlay size={16} />
          </button>
        </div>
      </div>
      <div className={guidance ? 'map-tool-guidance active' : 'map-tool-guidance'} aria-live="polite">
        <div className="map-tool-guidance-copy">
          {guidance ? (
            <>
              <strong>{guidance.title}</strong>
              <span>{guidance.body}</span>
            </>
          ) : (
            <span>No active map tool.</span>
          )}
        </div>
        <button
          type="button"
          className="map-icon-btn map-tool-info-btn fast-tooltip fast-tooltip-left"
          onClick={onOpenHelp}
          aria-label="Open map interaction help"
          data-tooltip="Map controls help"
        >
          <Info size={16} />
        </button>
      </div>
    </div>
  )
}
