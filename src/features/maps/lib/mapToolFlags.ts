import type { ActiveMapTool, ActiveToolState, AnnotationTool, VisionBlockTool } from './activeToolState'
import type { FogTool, VisionTool } from './gmToolToggles'

const VISION_TOOL_BY_BLOCK: Record<VisionBlockTool, VisionTool> = {
  hardBlock: 'drawFull',
  softBlock: 'draw',
  erase: 'erase',
}

const VISION_BLOCK_BY_TOOL: Record<VisionTool, VisionBlockTool> = {
  drawFull: 'hardBlock',
  draw: 'softBlock',
  erase: 'erase',
}

export function isToolType(tool: ActiveMapTool | null, type: ActiveMapTool['type']) {
  return tool?.type === type
}

function activeFogTool(tool: ActiveMapTool | null): FogTool | null {
  return tool?.type === 'fog' ? tool.tool : null
}

function activeVisionTool(tool: ActiveMapTool | null): VisionTool | null {
  return tool?.type === 'vision' ? VISION_TOOL_BY_BLOCK[tool.tool] : null
}

export function isAnnotationTool(tool: ActiveMapTool | null, which: AnnotationTool) {
  return tool?.type === 'annotation' && tool.tool === which
}

// The GM tool buttons' view of the active tool state.
export function deriveToolFlags(state: ActiveToolState) {
  const tool = state.activeTool
  return {
    fogTool: activeFogTool(tool),
    visionTool: activeVisionTool(tool),
    tokenSelectMode: isToolType(tool, 'boxSelect'),
    annotationPlaceMode: isAnnotationTool(tool, 'marker'),
    playerLabelPlaceMode: isAnnotationTool(tool, 'playerLabel'),
    handToolActive: isToolType(tool, 'hand'),
    gmHideLabels: state.toggles.gmHideLabels,
    // Player View Preview: an independent visibility toggle that lets the GM see
    // the player-facing map layer state while keeping GM controls visible. It is
    // NOT a screen-share mode, and toggling it never changes the active tool.
    playerViewPreview: state.toggles.playerViewPreview,
  }
}

export type MapToolFlags = ReturnType<typeof deriveToolFlags>

// The tool a button picks, or null when it is being turned off.
export function fogToolChoice(tool: FogTool | null): ActiveMapTool | null {
  return tool ? { type: 'fog', tool } : null
}

export function visionToolChoice(tool: VisionTool | null): ActiveMapTool | null {
  return tool ? { type: 'vision', tool: VISION_BLOCK_BY_TOOL[tool] } : null
}

export function toolChoiceWhen(on: boolean, tool: ActiveMapTool): ActiveMapTool | null {
  return on ? tool : null
}
