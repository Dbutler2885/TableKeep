import type { ActiveToolState, AnnotationTool, FogTool, VisionBlockTool } from './activeToolState'

export type MapInteractionButton = 'left' | 'middle' | 'right' | 'none'
export type MapInteractionPhase = 'click' | 'drag' | 'contextMenu'
export type MapInteractionTarget = 'bareMap' | 'token' | 'annotation' | 'label'

export type MapInteractionEvent = {
  phase: MapInteractionPhase
  button: MapInteractionButton
  shiftKey?: boolean
  target: MapInteractionTarget
}

export type MapInteractionIntent =
  | { type: 'pan'; via: 'middleMouse' | 'shiftLeftDrag' | 'handTool' }
  | { type: 'paint'; tool: { type: 'fog'; tool: FogTool } | { type: 'vision'; tool: VisionBlockTool } }
  | { type: 'place'; tool: AnnotationTool | 'token' }
  | { type: 'box-select' }
  | { type: 'drag-token' }
  | { type: 'select-token' }
  | { type: 'edit-annotation'; target: 'annotation' | 'label' }
  | { type: 'suppress-context-menu' }
  | { type: 'no-op' }

export function resolveMapInteractionIntent(
  state: ActiveToolState,
  event: MapInteractionEvent,
): MapInteractionIntent {
  if (event.phase === 'contextMenu') return { type: 'suppress-context-menu' }

  if (isMiddleDrag(event)) return { type: 'pan', via: 'middleMouse' }
  if (isShiftLeftDrag(event)) return { type: 'pan', via: 'shiftLeftDrag' }
  if (isShiftLeftClick(event)) return { type: 'no-op' }

  const { activeTool } = state
  if (activeTool?.type === 'hand' && isLeftDrag(event)) {
    return { type: 'pan', via: 'handTool' }
  }

  if (state.tokenPlacement) {
    return isLeftClick(event) ? { type: 'place', tool: 'token' } : { type: 'no-op' }
  }

  if (activeTool?.type === 'boxSelect' && isLeftDrag(event)) {
    return { type: 'box-select' }
  }

  if ((activeTool?.type === 'fog' || activeTool?.type === 'vision') && isLeftDrag(event)) {
    return { type: 'paint', tool: activeTool }
  }

  if (activeTool?.type === 'annotation' && isLeftClick(event) && event.target === 'bareMap') {
    return { type: 'place', tool: activeTool.tool }
  }

  if (isAnnotationTarget(event.target) && isLeftClick(event)) {
    return { type: 'edit-annotation', target: event.target }
  }

  if (event.target === 'token' && isLeftDrag(event)) return { type: 'drag-token' }
  if (event.target === 'token' && isLeftClick(event)) return { type: 'select-token' }

  return { type: 'no-op' }
}

function isLeftClick(event: MapInteractionEvent): boolean {
  return event.phase === 'click' && event.button === 'left'
}

function isShiftLeftClick(event: MapInteractionEvent): boolean {
  return isLeftClick(event) && event.shiftKey === true
}

function isLeftDrag(event: MapInteractionEvent): boolean {
  return event.phase === 'drag' && event.button === 'left'
}

function isMiddleDrag(event: MapInteractionEvent): boolean {
  return event.phase === 'drag' && event.button === 'middle'
}

function isShiftLeftDrag(event: MapInteractionEvent): boolean {
  return isLeftDrag(event) && event.shiftKey === true
}

function isAnnotationTarget(target: MapInteractionTarget): target is 'annotation' | 'label' {
  return target === 'annotation' || target === 'label'
}
