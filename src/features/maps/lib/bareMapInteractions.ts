import type { MouseEvent } from 'react'
import type { Role } from '../../../types/app'
import type { ActiveToolState, AnnotationTool } from './activeToolState'
import { resolveMapInteractionIntent, type MapInteractionButton } from './mapInteractionResolution'
import type { Point, SelectionBox } from './tokenBoxSelection'

// Bare-map interactions (token/annotation/label have their own element handlers and
// are early-returned below) are routed through the pure interaction grammar so the
// active tool state decides the intent rather than ad-hoc conditionals.

const MAP_OBJECT_SELECTOR = '.map-token,.map-annotation-btn,.map-player-label-btn,.map-player-label-static,.map-annotation-popover'

const INTERACTION_BUTTONS: MapInteractionButton[] = ['left', 'middle', 'right']

const ANNOTATION_KIND: Record<AnnotationTool, 'gm' | 'player'> = { marker: 'gm', playerLabel: 'player' }

export function interactionButton(button: number): MapInteractionButton {
  return INTERACTION_BUTTONS[button] ?? 'none'
}

export type BareMapContext = {
  role: Role | null
  activeToolState: ActiveToolState
  placing: boolean
  gridCalibrateMode: boolean
  gridMeasureMode: boolean
  suppressNextMapClickRef: { current: boolean }
  selectedTokenIds: string[]
  setSelectedTokenIds: (ids: string[]) => void
  setTokenSelectionBox: (box: SelectionBox | null) => void
  getTokenDropPoint: (clientX: number, clientY: number) => Point | null
  runPlacementDrop: (point: Point) => void
  placeAnnotation: (clientX: number, clientY: number, kind: 'gm' | 'player') => Promise<unknown>
  handleGridCalibrateClick: (clientX: number, clientY: number) => void
  handleGridMeasureClick: (clientX: number, clientY: number) => void
}

type MapMouseEvent = MouseEvent<HTMLDivElement>

// While nothing is being placed, the map's own objects handle their own clicks.
function isOnMapObject(placing: boolean, target: EventTarget) {
  return !placing && Boolean((target as HTMLElement).closest(MAP_OBJECT_SELECTOR))
}

function ignoresMapDrag(context: BareMapContext, target: EventTarget) {
  return context.role !== 'gm' || context.gridCalibrateMode || context.gridMeasureMode || isOnMapObject(context.placing, target)
}

function startSelectionBox(context: BareMapContext, event: MapMouseEvent) {
  const point = context.getTokenDropPoint(event.clientX, event.clientY)
  if (!point) return
  event.preventDefault()
  event.stopPropagation()
  context.setTokenSelectionBox({ start: point, end: point })
}

export function pressBareMap(context: BareMapContext, event: MapMouseEvent) {
  if (ignoresMapDrag(context, event.target)) return
  const intent = resolveMapInteractionIntent(context.activeToolState, {
    phase: 'drag',
    button: interactionButton(event.button),
    shiftKey: event.shiftKey,
    target: 'bareMap',
  })
  // Box-select owns left-drag; pan (shift/middle/hand) is handled at the stage level.
  if (intent.type === 'pan') {
    context.suppressNextMapClickRef.current = true
    return
  }
  if (intent.type === 'box-select') startSelectionBox(context, event)
}

// The click that ends a pan or a box select is not a click on the map.
function consumeSuppressedClick(suppressRef: { current: boolean }) {
  if (!suppressRef.current) return false
  suppressRef.current = false
  return true
}

// Measurement tools consume bare-map clicks before the grammar (which treats the
// measurement tool as a no-op for clicks).
function clickMeasurementTool(context: BareMapContext, event: MapMouseEvent) {
  if (context.gridCalibrateMode) {
    event.preventDefault()
    context.handleGridCalibrateClick(event.clientX, event.clientY)
    return true
  }
  if (!context.gridMeasureMode) return false
  event.preventDefault()
  context.handleGridMeasureClick(event.clientX, event.clientY)
  return true
}

// With no placement tool active, a bare-map click is "click outside": it deselects
// the current token selection. It does not disturb editing context (an open
// annotation editor commits via its own outside-pointerdown handler).
function deselectTokens(context: BareMapContext) {
  if (context.selectedTokenIds.length > 0) context.setSelectedTokenIds([])
}

function placeWithTool(context: BareMapContext, tool: AnnotationTool | 'token', event: MapMouseEvent) {
  if (tool !== 'token') {
    void context.placeAnnotation(event.clientX, event.clientY, ANNOTATION_KIND[tool])
    return
  }
  const point = context.getTokenDropPoint(event.clientX, event.clientY)
  if (point) context.runPlacementDrop(point)
}

export function clickBareMap(context: BareMapContext, event: MapMouseEvent) {
  if (context.role !== 'gm') return
  if (consumeSuppressedClick(context.suppressNextMapClickRef)) return
  if (isOnMapObject(context.placing, event.target)) return
  if (clickMeasurementTool(context, event)) return
  const intent = resolveMapInteractionIntent(context.activeToolState, {
    phase: 'click',
    button: interactionButton(event.button),
    shiftKey: event.shiftKey,
    target: 'bareMap',
  })
  if (intent.type !== 'place') {
    deselectTokens(context)
    return
  }
  event.preventDefault()
  placeWithTool(context, intent.tool, event)
}

// A text field keeps its own keys.
export function isTextEntry(target: HTMLElement) {
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

export function isActivationKey(key: string) {
  return key === 'Enter' || key === ' '
}
