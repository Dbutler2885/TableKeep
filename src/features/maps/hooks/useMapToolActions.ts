import { useCallback, useEffect, type Dispatch } from 'react'
import type { ActiveMapTool, ActiveToolAction } from '../lib/activeToolState'
import type { FogTool, VisionTool } from '../lib/gmToolToggles'
import { fogToolChoice, isAnnotationTool, isToolType, toolChoiceWhen, visionToolChoice } from '../lib/mapToolFlags'
import type { TokenPlacementQueueState } from '../lib/tokenPlacementQueue'

type GridType = 'square' | 'hex-pointy' | 'hex-flat'

type MeasurementGrid = {
  gridCalibrateMode: boolean
  gridMeasureMode: boolean
  toggleGridCalibrateMode: () => void
  toggleGridMeasureMode: () => void
  setGridType: (gridType: GridType) => void
}

type ToolContext = {
  activeTool: ActiveMapTool | null
  dispatchActiveTool: Dispatch<ActiveToolAction>
  setPlacementQueue: (queue: TokenPlacementQueueState | null) => void
}

// The grid's measuring modes, which are tools too: they toggle with their grid
// mode, and any other tool closes them.
export function useMeasurementTools({ activeTool, dispatchActiveTool, setPlacementQueue }: ToolContext, grid: MeasurementGrid) {
  const { gridCalibrateMode, gridMeasureMode, toggleGridCalibrateMode, toggleGridMeasureMode, setGridType } = grid
  const closeActiveMeasurementMode = useCallback(() => {
    if (gridCalibrateMode) toggleGridCalibrateMode()
    if (gridMeasureMode) toggleGridMeasureMode()
  }, [gridCalibrateMode, gridMeasureMode, toggleGridCalibrateMode, toggleGridMeasureMode])

  const toggleGridCalibrateTool = useCallback(() => {
    setPlacementQueue(null)
    dispatchActiveTool({ type: 'toggleTool', tool: { type: 'measurement', tool: 'calibrateGrid' } })
    toggleGridCalibrateMode()
  }, [dispatchActiveTool, setPlacementQueue, toggleGridCalibrateMode])

  const toggleGridMeasureTool = useCallback(() => {
    setPlacementQueue(null)
    dispatchActiveTool({ type: 'toggleTool', tool: { type: 'measurement', tool: 'measureDistance' } })
    toggleGridMeasureMode()
  }, [dispatchActiveTool, setPlacementQueue, toggleGridMeasureMode])

  const setGridTypeTool = useCallback((gridType: GridType) => {
    if (isToolType(activeTool, 'measurement')) dispatchActiveTool({ type: 'clearActiveTool' })
    setPlacementQueue(null)
    setGridType(gridType)
  }, [activeTool, dispatchActiveTool, setGridType, setPlacementQueue])

  return { closeActiveMeasurementMode, toggleGridCalibrateTool, toggleGridMeasureTool, setGridTypeTool }
}

// A measuring tool whose grid mode has ended is no longer the active tool.
export function useMeasurementToolSync(activeTool: ActiveMapTool | null, dispatchActiveTool: Dispatch<ActiveToolAction>, grid: Pick<MeasurementGrid, 'gridCalibrateMode' | 'gridMeasureMode'>) {
  const { gridCalibrateMode, gridMeasureMode } = grid
  useEffect(() => {
    if (!isToolType(activeTool, 'measurement')) return
    if (gridCalibrateMode || gridMeasureMode) return
    dispatchActiveTool({ type: 'clearActiveTool' })
  }, [activeTool, dispatchActiveTool, gridCalibrateMode, gridMeasureMode])
}

type ExclusiveToolContext = ToolContext & { closeActiveMeasurementMode: () => void }

// Picking a tool closes any measuring mode and any placement; turning a tool off
// clears it only if it is still the active one.
function chooseTool(context: ExclusiveToolContext, tool: ActiveMapTool | null, isCurrent: (current: ActiveMapTool) => boolean) {
  const { activeTool, dispatchActiveTool } = context
  if (isToolType(activeTool, 'measurement')) context.closeActiveMeasurementMode()
  if (!tool) {
    if (activeTool && isCurrent(activeTool)) dispatchActiveTool({ type: 'clearActiveTool' })
    return
  }
  context.setPlacementQueue(null)
  dispatchActiveTool({ type: 'selectTool', tool })
}

const isFog = (tool: ActiveMapTool) => tool.type === 'fog'
const isVision = (tool: ActiveMapTool) => tool.type === 'vision'
const isBoxSelect = (tool: ActiveMapTool) => tool.type === 'boxSelect'
const isMarker = (tool: ActiveMapTool) => isAnnotationTool(tool, 'marker')
const isPlayerLabel = (tool: ActiveMapTool) => isAnnotationTool(tool, 'playerLabel')
const isHand = (tool: ActiveMapTool) => tool.type === 'hand'

// What the GM tool buttons call to change the active tool and the view toggles.
export function useMapToolActions(context: ExclusiveToolContext) {
  const { activeTool, dispatchActiveTool, setPlacementQueue, closeActiveMeasurementMode } = context
  const choose = useCallback(
    (tool: ActiveMapTool | null, isCurrent: (current: ActiveMapTool) => boolean) => {
      chooseTool({ activeTool, dispatchActiveTool, setPlacementQueue, closeActiveMeasurementMode }, tool, isCurrent)
    },
    [activeTool, closeActiveMeasurementMode, dispatchActiveTool, setPlacementQueue],
  )
  return {
    setFogTool: useCallback((tool: FogTool | null) => choose(fogToolChoice(tool), isFog), [choose]),
    setVisionTool: useCallback((tool: VisionTool | null) => choose(visionToolChoice(tool), isVision), [choose]),
    setTokenSelectMode: useCallback((value: boolean) => choose(toolChoiceWhen(value, { type: 'boxSelect' }), isBoxSelect), [choose]),
    setAnnotationPlaceMode: useCallback((value: boolean) => choose(toolChoiceWhen(value, { type: 'annotation', tool: 'marker' }), isMarker), [choose]),
    setPlayerLabelPlaceMode: useCallback((value: boolean) => choose(toolChoiceWhen(value, { type: 'annotation', tool: 'playerLabel' }), isPlayerLabel), [choose]),
    setHandToolActive: useCallback((value: boolean) => choose(toolChoiceWhen(value, { type: 'hand' }), isHand), [choose]),
    setGmHideLabels: useCallback((value: boolean) => dispatchActiveTool({ type: 'setGmHideLabels', hidden: value }), [dispatchActiveTool]),
    // Independent toggle: never touches the active tool.
    setPlayerViewPreview: useCallback((value: boolean) => dispatchActiveTool({ type: 'setPlayerViewPreview', enabled: value }), [dispatchActiveTool]),
    resetActiveMapTools: useCallback(() => {
      dispatchActiveTool({ type: 'reset' })
      setPlacementQueue(null)
    }, [dispatchActiveTool, setPlacementQueue]),
    clearAnnotationPlacementTool: useCallback(() => {
      if (isToolType(activeTool, 'annotation')) dispatchActiveTool({ type: 'clearActiveTool' })
    }, [activeTool, dispatchActiveTool]),
  }
}

export type MapToolActions = ReturnType<typeof useMapToolActions>
