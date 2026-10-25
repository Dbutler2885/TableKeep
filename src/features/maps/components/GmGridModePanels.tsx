import { ModeConfirmAction } from './ModeConfirmAction'

export type GmGridModePanelsProps = {
  gridAdjustMode: boolean
  onApplyGrid: () => void
  hexDetectConfidence: number | null
  gridAdjustReady: boolean
  gridAdjustSaved: boolean
  gridCalibrateMode: boolean
  gridCalibrateReady: boolean
  gridCalibrateSaved: boolean
  onApplyGridCalibration: () => void
  gridMeasureMode: boolean
  measurementFeetLabel: string
}

type GridAdjustPanelProps = Pick<GmGridModePanelsProps, 'onApplyGrid' | 'hexDetectConfidence' | 'gridAdjustReady' | 'gridAdjustSaved'>

function GridAdjustPanel({ onApplyGrid, hexDetectConfidence, gridAdjustReady, gridAdjustSaved }: GridAdjustPanelProps) {
  return (
    <div className="map-grid-adjust-panel">
      <p className="map-grid-adjust-hint">Adjusting grid: mouse wheel scales, drag pans alignment.</p>
      {hexDetectConfidence !== null ? (
        <p className="map-grid-adjust-hint">
          Hex detect confidence: {Math.round(hexDetectConfidence * 100)}%.
        </p>
      ) : null}
      <ModeConfirmAction
        saved={gridAdjustSaved}
        label="Apply grid"
        onApply={onApplyGrid}
        ariaLabel="Apply grid"
        disabled={!gridAdjustReady}
      />
    </div>
  )
}

type GridCalibrationPanelProps = Pick<GmGridModePanelsProps, 'gridCalibrateReady' | 'gridCalibrateSaved' | 'onApplyGridCalibration'>

function GridCalibrationPanel({ gridCalibrateReady, gridCalibrateSaved, onApplyGridCalibration }: GridCalibrationPanelProps) {
  return (
    <div className="map-grid-calibration-panel">
      <p className="map-grid-calibration-hint">Click two points across one square side, then drag dots to refine.</p>
      <ModeConfirmAction
        saved={gridCalibrateSaved}
        label="Apply calibration"
        onApply={onApplyGridCalibration}
        ariaLabel="Apply calibration"
        disabled={!gridCalibrateReady}
      />
    </div>
  )
}

function GridMeasurementPanel({ measurementFeetLabel }: { measurementFeetLabel: string }) {
  return (
    <div className="map-grid-calibration-panel">
      <p className="map-grid-calibration-hint">Click two points to measure, then drag dots to refine.</p>
      <p className="map-grid-measurement-readout">Distance: {measurementFeetLabel}</p>
    </div>
  )
}

// The hint and apply panel for whichever grid mode is on.
export function GmGridModePanels(props: GmGridModePanelsProps) {
  return (
    <>
      {props.gridAdjustMode ? <GridAdjustPanel {...props} /> : null}
      {props.gridCalibrateMode ? <GridCalibrationPanel {...props} /> : null}
      {props.gridMeasureMode ? <GridMeasurementPanel measurementFeetLabel={props.measurementFeetLabel} /> : null}
    </>
  )
}
