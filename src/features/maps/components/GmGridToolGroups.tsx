import { EyeOff, Grid3X3, Hexagon, LoaderCircle, Ruler, RulerDimensionLine } from 'lucide-react'
import { DistanceTrackerBadge } from './DistanceTrackerBadge'
import { MapToolButton } from './MapToolButton'

type GridType = 'square' | 'hex-pointy' | 'hex-flat'

export type GmGridToolGroupsProps = {
  gridVisible: boolean
  gridType: GridType
  gridAdjustMode: boolean
  onToggleGridVisible: () => void
  onSetGridType: (gridType: GridType) => void
  hexDetecting: boolean
  gridCalibrateMode: boolean
  onToggleGridCalibrate: () => void
  measurementToolEnabled: boolean
  gridMeasureMode: boolean
  onToggleGridMeasure: () => void
  distanceTrackerFeet: number
  distanceTrackerMode: 'count' | 'first' | 'roll'
  distanceTrackerRoll: number | null
  onResetDistanceTracker: () => void
}

type HexGridButtonProps = {
  orientation: 'hex-pointy' | 'hex-flat'
  active: boolean
  hexDetecting: boolean
  onSetGridType: (gridType: GridType) => void
}

const HEX_BUTTONS = {
  'hex-pointy': { className: 'map-icon-btn map-hex-pointy-btn fast-tooltip fast-tooltip-right', label: 'Hex grid pointy-top orientation', tooltip: 'Hex grid: pointy-top', iconClassName: undefined },
  'hex-flat': { className: 'map-icon-btn map-hex-flat-btn fast-tooltip fast-tooltip-right', label: 'Hex grid flat-top orientation', tooltip: 'Hex grid: flat-top', iconClassName: 'map-hex-flat-icon' },
}

function HexGridButton({ orientation, active, hexDetecting, onSetGridType }: HexGridButtonProps) {
  const button = HEX_BUTTONS[orientation]
  return (
    <MapToolButton
      className={button.className}
      active={active}
      onClick={() => onSetGridType(orientation)}
      disabled={hexDetecting}
      label={button.label}
      tooltip={hexDetecting ? 'Detecting hex...' : button.tooltip}
    >
      {hexDetecting ? <LoaderCircle size={16} className="map-icon-spin" /> : <Hexagon size={16} className={button.iconClassName} />}
    </MapToolButton>
  )
}

type GridTypeButtonsProps = Pick<GmGridToolGroupsProps, 'gridType' | 'gridAdjustMode' | 'onSetGridType' | 'hexDetecting'>

function GridTypeButtons({ gridType, gridAdjustMode, onSetGridType, hexDetecting }: GridTypeButtonsProps) {
  const adjusting = (type: GridType) => gridAdjustMode && gridType === type
  return (
    <div className="map-section-grid">
      <MapToolButton
        className="map-icon-btn map-grid-btn fast-tooltip fast-tooltip-right"
        active={adjusting('square')}
        onClick={() => onSetGridType('square')}
        label="Square grid overlay"
        tooltip={adjusting('square') ? 'Cancel square grid' : 'Square grid'}
      >
        <Grid3X3 size={16} />
      </MapToolButton>
      <HexGridButton orientation="hex-pointy" active={adjusting('hex-pointy')} hexDetecting={hexDetecting} onSetGridType={onSetGridType} />
      <HexGridButton orientation="hex-flat" active={adjusting('hex-flat')} hexDetecting={hexDetecting} onSetGridType={onSetGridType} />
    </div>
  )
}

function measureTooltip(enabled: boolean, measuring: boolean) {
  if (!enabled) return 'Lay or calibrate grid first'
  return measuring ? 'Clear measurement' : 'Measure distance'
}

type MeasurementButtonsProps = Omit<GmGridToolGroupsProps, 'gridVisible' | 'gridType' | 'gridAdjustMode' | 'onToggleGridVisible' | 'onSetGridType' | 'hexDetecting'>

function MeasurementButtons(props: MeasurementButtonsProps) {
  return (
    <div className="map-section-grid">
      <MapToolButton
        className="map-icon-btn map-ruler-btn fast-tooltip fast-tooltip-right"
        active={props.gridCalibrateMode}
        onClick={props.onToggleGridCalibrate}
        label="Calibrate grid scale"
        tooltip={props.gridCalibrateMode ? 'Measuring' : "Calibrate 10'"}
      >
        <RulerDimensionLine size={16} />
      </MapToolButton>
      <MapToolButton
        className="map-icon-btn map-measure-btn fast-tooltip fast-tooltip-right"
        active={props.gridMeasureMode}
        onClick={props.onToggleGridMeasure}
        disabled={!props.measurementToolEnabled}
        label="Measure map distance"
        tooltip={measureTooltip(props.measurementToolEnabled, props.gridMeasureMode)}
      >
        <Ruler size={16} />
      </MapToolButton>
      <DistanceTrackerBadge
        distanceTrackerFeet={props.distanceTrackerFeet}
        distanceTrackerMode={props.distanceTrackerMode}
        distanceTrackerRoll={props.distanceTrackerRoll}
        onResetDistanceTracker={props.onResetDistanceTracker}
      />
    </div>
  )
}

// The right-hand column of the GM tool panel: grid type and visibility, then
// calibration, measuring and the movement tracker.
export function GmGridToolGroups(props: GmGridToolGroupsProps) {
  return (
    <div className="map-tools-right">
      <span className="map-section-label">Grid Controls</span>
      <GridTypeButtons gridType={props.gridType} gridAdjustMode={props.gridAdjustMode} onSetGridType={props.onSetGridType} hexDetecting={props.hexDetecting} />
      <div className="map-section-grid map-section-grid-single">
        <MapToolButton
          className="map-icon-btn map-grid-visibility-btn fast-tooltip fast-tooltip-right"
          active={!props.gridVisible}
          onClick={props.onToggleGridVisible}
          label="Toggle grid visibility"
          tooltip={props.gridVisible ? 'Hide grid' : 'Show grid'}
        >
          <EyeOff size={16} />
        </MapToolButton>
      </div>
      <span className="map-section-label">Measurement</span>
      <MeasurementButtons {...props} />
    </div>
  )
}
