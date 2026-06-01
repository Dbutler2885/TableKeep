import type { ActiveToolState } from './activeToolState'
import type { TokenPlacementDisplay } from './tokenPlacementQueue'

export type MapToolGuidance = {
  title: string
  body: string
}

export type MapToolGuidanceContext = {
  gridAdjustMode?: boolean
}

export const MAP_INTERACTION_HELP_SECTIONS: MapToolGuidance[] = [
  {
    title: 'Navigate',
    body: 'Pan with middle mouse, shift-drag, or the hand tool. Use the wheel or touch gestures to zoom.',
  },
  {
    title: 'Tokens',
    body: 'Click tokens to select them, drag tokens to move them, or use drag-select when the selection tool is active.',
  },
  {
    title: 'Fog and Vision',
    body: 'Use left-drag with fog or vision tools active. Hide All and Reveal All apply immediately.',
  },
  {
    title: 'Annotations',
    body: 'Click bare map space to place labels or markers. Click an existing label or marker to edit it on the map.',
  },
  {
    title: 'Placement',
    body: 'Token placement starts from the token panel. Escape cancels active tools and placement queues without undoing saved map changes.',
  },
]

export function getMapToolGuidance(
  state: ActiveToolState,
  placementDisplay: TokenPlacementDisplay,
  context: MapToolGuidanceContext = {},
): MapToolGuidance | null {
  if (placementDisplay.active) {
    const name = placementDisplay.current?.name?.trim() || 'token'
    const count = placementDisplay.remaining > 1 ? ` ${placementDisplay.remaining} placements remain.` : ''
    return {
      title: 'Placing Token',
      body: `Click the map to place ${name}.${count} Click Cancel or press Escape to stop placing.`,
    }
  }

  if (context.gridAdjustMode) {
    return {
      title: 'Adjusting Grid',
      body: 'Use the mouse wheel on the map to scale the grid. Drag the map to align it. Press the selected grid button again to cancel, and use the check button to accept.',
    }
  }

  const { activeTool } = state
  if (!activeTool) return null

  if (activeTool.type === 'fog') {
    return {
      title: activeTool.tool === 'hide' ? 'Adding Fog' : 'Removing Fog',
      body: 'Left-drag on the map to paint. Shift-drag or middle-drag still pans.',
    }
  }

  if (activeTool.type === 'vision') {
    return {
      title: activeTool.tool === 'erase' ? 'Erasing Vision Blocks' : activeTool.tool === 'hardBlock' ? 'Hard Vision Block' : 'Soft Vision Block',
      body: 'Left-drag to draw this vision layer. Shift-drag or middle-drag still pans.',
    }
  }

  if (activeTool.type === 'annotation') {
    return {
      title: activeTool.tool === 'playerLabel' ? 'Placing Player Labels' : 'Placing Annotations',
      body: 'Click bare map space to place. Click an existing label, marker, or token to leave placement and edit or select it.',
    }
  }

  if (activeTool.type === 'boxSelect') {
    return {
      title: 'Selecting Tokens',
      body: 'Left-drag a box around tokens. Click a token directly for a single-token selection.',
    }
  }

  if (activeTool.type === 'hand') {
    return {
      title: 'Hand Tool',
      body: 'Left-drag the map to pan. Middle mouse and shift-drag also pan.',
    }
  }

  if (activeTool.type === 'measurement') {
    return {
      title: activeTool.tool === 'calibrateGrid' ? 'Calibrating Grid' : 'Measuring Distance',
      body: activeTool.tool === 'calibrateGrid'
        ? 'Click two points on the map to define a 10 foot span, then confirm with the check button. Press the ruler tool again to cancel.'
        : 'Click two map points to measure, then drag the endpoints to refine. Press the measure tool again to clear or cancel the measurement.',
    }
  }

  return null
}
