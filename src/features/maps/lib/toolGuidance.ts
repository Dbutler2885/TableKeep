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
    body: 'Map movement. Middle-drag, shift-drag, or use the hand tool to pan. Wheel or pinch to zoom.',
  },
  {
    title: 'Tokens',
    body: 'Map pieces. Click to select. Drag to move. Use selection mode to drag-select groups.',
  },
  {
    title: 'Fog and Vision',
    body: 'GM visibility tools. Left-drag to paint. Hide All and Reveal All apply immediately.',
  },
  {
    title: 'GM Notes and Labels',
    body: 'Map text. Click map to place. Click an icon or label to edit.',
  },
  {
    title: 'Placement',
    body: 'Token staging. Start from the token panel. Escape cancels the active tool without undoing saved map changes.',
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
      body: `Token placement. Click map to place ${name}.${count} Cancel or Escape to stop.`,
    }
  }

  if (context.gridAdjustMode) {
    return {
      title: 'Adjusting Grid',
      body: 'Grid alignment. Mouse wheel scales grid. Drag map to align. Click check to save.',
    }
  }

  const { activeTool } = state
  if (!activeTool) return null

  if (activeTool.type === 'fog') {
    return {
      title: activeTool.tool === 'hide' ? 'Adding Fog' : 'Removing Fog',
      body: activeTool.tool === 'hide'
        ? 'Player visibility. Left-drag map to hide areas from players. Shift-drag or middle-drag to pan.'
        : 'Player visibility. Left-drag map to reveal areas to players. Shift-drag or middle-drag to pan.',
    }
  }

  if (activeTool.type === 'vision') {
    return {
      title: activeTool.tool === 'erase' ? 'Erasing Vision Blocks' : activeTool.tool === 'hardBlock' ? 'Hard Vision Block' : 'Soft Vision Block',
      body: activeTool.tool === 'erase'
        ? 'Vision blocks. Left-drag map to erase blockers. Shift-drag or middle-drag to pan.'
        : activeTool.tool === 'hardBlock'
          ? 'Hard block. Blocks sight into painted area and beyond. Left-drag map to draw.'
          : 'Soft block. Reveals painted area, blocks sight beyond. Left-drag map to draw.',
    }
  }

  if (activeTool.type === 'annotation') {
    if (activeTool.tool === 'marker') {
      return {
        title: 'GM Notes',
        body: 'GM facing notes. Click map to place. Click icon to edit note.',
      }
    }

    return {
      title: 'Placing Player Labels',
      body: 'Player facing labels. Click map to place. Click label to edit.',
    }
  }

  if (activeTool.type === 'boxSelect') {
    return {
      title: 'Selecting Tokens',
      body: 'Token selection. Left-drag a box around tokens. Click token for single selection.',
    }
  }

  if (activeTool.type === 'hand') {
    return {
      title: 'Hand Tool',
      body: 'Map movement. Left-drag map to pan. Middle-drag and shift-drag also pan.',
    }
  }

  if (activeTool.type === 'measurement') {
    return {
      title: activeTool.tool === 'calibrateGrid' ? 'Calibrating Grid' : 'Measuring Distance',
      body: activeTool.tool === 'calibrateGrid'
        ? 'Grid calibration. Click two map points for a 10 foot span. Click check to save.'
        : 'Distance ruler. Click two map points. Drag endpoints to refine. Click ruler to clear.',
    }
  }

  return null
}
