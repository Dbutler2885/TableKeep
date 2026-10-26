import { useCallback, useMemo } from 'react'
import type { ActiveToolState } from '../lib/activeToolState'
import { isGridAdjustDirty } from '../lib/gridAdjustDirty'
import type { MapDimensions } from '../lib/inlineMapSizing'
import { activeGridLine, errorMessage, gridCellPixels, isMeasurementToolEnabled } from '../lib/mapGridView'
import { measurementDistanceFeet, measurementDistanceLabel } from '../lib/measurementDistance'
import type { TokenPlacementDisplay } from '../lib/tokenPlacementQueue'
import { getMapToolGuidance } from '../lib/toolGuidance'
import type { MapRecord } from '../lib/types'
import type { useGridTools } from './useGridTools'

type GridViewOptions = {
  grid: ReturnType<typeof useGridTools>
  selectedMap: MapRecord | null
  dimensions: MapDimensions
  activeToolState: ActiveToolState
  placementDisplay: TokenPlacementDisplay
  setMapError: (message: string) => void
}

// What the grid tools show: the calibration and measurement lines, the measured
// distance, the tool guidance, and whether measuring and applying are possible.
export function useGridView({ grid, selectedMap, dimensions, activeToolState, placementDisplay, setMapError }: GridViewOptions) {
  const { gridAdjustMode, applyGridCalibration, effectiveGridCellScale } = grid
  const { activeMapDimension, activeMapWidth, activeMapHeight } = dimensions
  const toolGuidance = useMemo(
    () => getMapToolGuidance(activeToolState, placementDisplay, { gridAdjustMode }),
    [activeToolState, gridAdjustMode, placementDisplay],
  )
  const handleApplyGridCalibration = useCallback(() => {
    void applyGridCalibration().catch((error) => {
      setMapError(errorMessage(error, 'Failed to save grid calibration'))
    })
  }, [applyGridCalibration, setMapError])
  const gridCalibrationLine = useMemo(
    () => activeGridLine(grid.gridCalibrateMode, grid.gridCalibrateStart, grid.gridCalibrateEnd, grid.gridCalibratePreview),
    [grid.gridCalibrateEnd, grid.gridCalibrateMode, grid.gridCalibratePreview, grid.gridCalibrateStart],
  )
  const gridMeasurementLine = useMemo(
    () => activeGridLine(grid.gridMeasureMode, grid.gridMeasureStart, grid.gridMeasureEnd, grid.gridMeasurePreview),
    [grid.gridMeasureEnd, grid.gridMeasureMode, grid.gridMeasurePreview, grid.gridMeasureStart],
  )
  const measurementFeet = useMemo(() => {
    return measurementDistanceFeet({
      line: gridMeasurementLine,
      effectiveGridCellScale,
      activeMapDimension,
      activeMapWidth,
      activeMapHeight,
    })
  }, [activeMapDimension, activeMapHeight, activeMapWidth, effectiveGridCellScale, gridMeasurementLine])
  const measurementFeetLabel = useMemo(() => measurementDistanceLabel(measurementFeet), [measurementFeet])
  return {
    activeGridCellPx: gridCellPixels(effectiveGridCellScale, activeMapDimension),
    toolGuidance,
    gridAdjustReady: isGridAdjustDirty(selectedMap, grid.gridAdjustDraft),
    handleApplyGridCalibration,
    gridCalibrationLine,
    gridMeasurementLine,
    measurementFeetLabel,
    measurementToolEnabled: isMeasurementToolEnabled(grid.effectiveGridEnabled, gridAdjustMode, selectedMap),
  }
}

export type GridView = ReturnType<typeof useGridView>
