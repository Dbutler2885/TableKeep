// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { aMap, aToken } from '../test/mapFixtures'
import { initialActiveToolState, type ActiveToolState } from './activeToolState'
import { brushCursorGeometry, brushCursorMode, hideBrushCursorElement, isBrushActive } from './brushCursor'
import { nextSceneNpcIds, pagedIndex, scaledTokenUpdate, withTokenUpdate } from './gmMapUpdates'
import { clearLosSeenCanvas, fogSizeForSource, imageDisplaySize, isBlankMap, isImageOfMap, mapDimensions, measuredImageSize, needsAnotherFrame } from './inlineMapSizing'
import { displayedAnnotations } from './mapAnnotationDisplay'
import { activeGridLine, errorMessage, gridCellPixels, isMeasurementToolEnabled } from './mapGridView'
import { deleteConfirmLabel, mapListNotice, mapRowClassName, tokenDeleteMessage, tokenDeleteTitle } from './mapListDisplay'
import { deriveToolFlags, fogToolChoice, toolChoiceWhen, visionToolChoice } from './mapToolFlags'
import {
  gmTokenClassName,
  gmTokenNameClassName,
  isInPlayerLayer,
  isTokenPartlyShownOnFog,
  playerTokenClassName,
  tokenDisplayName,
  tokenLivePosition,
} from './mapTokenDisplay'
import {
  fogCanvasClassName,
  isMobileZoomMapView,
  mapLayerOpacities,
  mapLayerStyle,
  mapsMainClassName,
  showsDrawingToolbar,
  showsGmControlsPane,
  showsGmTopTools,
  showsLoadingMask,
  showsMapStage,
  showsPlayerControls,
  viewModes,
  type MapsPanes,
} from './mapsTabLayout'
import { boxSelectionIds, extendSelectionBox, selectionRectStyle } from './tokenBoxSelection'

function withTool(activeTool: ActiveToolState['activeTool']): ActiveToolState {
  return { ...initialActiveToolState, activeTool }
}

describe('tool flags', () => {
  it('reads each tool button from the active tool', () => {
    expect(deriveToolFlags(withTool({ type: 'fog', tool: 'hide' }))).toMatchObject({ fogTool: 'hide', visionTool: null })
    expect(deriveToolFlags(withTool({ type: 'vision', tool: 'hardBlock' })).visionTool).toBe('drawFull')
    expect(deriveToolFlags(withTool({ type: 'vision', tool: 'softBlock' })).visionTool).toBe('draw')
    expect(deriveToolFlags(withTool({ type: 'annotation', tool: 'playerLabel' }))).toMatchObject({ playerLabelPlaceMode: true, annotationPlaceMode: false })
    expect(deriveToolFlags(withTool(null))).toMatchObject({ fogTool: null, visionTool: null, tokenSelectMode: false, handToolActive: false })
  })

  it('turns a button press into the tool it picks', () => {
    expect(fogToolChoice('reveal')).toEqual({ type: 'fog', tool: 'reveal' })
    expect(fogToolChoice(null)).toBeNull()
    expect(visionToolChoice('erase')).toEqual({ type: 'vision', tool: 'erase' })
    expect(visionToolChoice(null)).toBeNull()
    expect(toolChoiceWhen(false, { type: 'hand' })).toBeNull()
  })
})

describe('the brush cursor', () => {
  const canvas = (overrides: Record<string, unknown> = {}) => ({
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 100 }) as DOMRect,
    offsetWidth: 400,
    offsetHeight: 200,
    width: 100,
    height: 50,
    ...overrides,
  })

  it('names the brush and knows when it is active', () => {
    expect(brushCursorMode('hide', null)).toBe('fog-hide')
    expect(brushCursorMode(null, 'drawFull')).toBe('vision-draw-full')
    expect(brushCursorMode(null, 'erase')).toBe('vision-erase')
    expect(brushCursorMode(null, null)).toBe('')
    expect(isBrushActive('gm', false, 'hide', null)).toBe(true)
    expect(isBrushActive('gm', true, 'hide', null)).toBe(false)
    expect(isBrushActive('player', false, 'hide', null)).toBe(false)
    expect(isBrushActive('gm', false, null, null)).toBe(false)
  })

  it('places the cursor in layout pixels, clamped to the canvas', () => {
    expect(brushCursorGeometry(110, 70, canvas(), 25)).toEqual({ x: 200, y: 100, width: 100, height: 100 })
    expect(brushCursorGeometry(-50, 500, canvas(), 25)).toMatchObject({ x: 0, y: 200 })
  })

  it('is not ready before the canvas is laid out and sized', () => {
    expect(brushCursorGeometry(0, 0, canvas({ offsetHeight: 0 }), 25)).toBeNull()
    expect(brushCursorGeometry(0, 0, canvas({ width: 1 }), 25)).toBeNull()
    expect(brushCursorGeometry(0, 0, canvas({ getBoundingClientRect: () => ({ width: 0, height: 5 }) }), 25)).toBeNull()
  })

  it('hides a cursor element when there is one', () => {
    const cursor = document.createElement('div')
    hideBrushCursorElement(cursor)
    expect(cursor.dataset.visible).toBe('false')
    expect(() => hideBrushCursorElement(null)).not.toThrow()
  })
})

describe('sizing the map', () => {
  it('measures against the smaller side', () => {
    expect(mapDimensions({ width: 800, height: 400 }, { width: 0, height: 0 })).toEqual({ activeMapDimension: 400, activeMapWidth: 800, activeMapHeight: 400, activeFogDimension: 1 })
  })

  it('caps the fog canvas and keeps its aspect', () => {
    expect(fogSizeForSource(2000, 1000)).toEqual({ width: 384, height: 192 })
    expect(fogSizeForSource(100, 50)).toEqual({ width: 100, height: 50 })
    expect(fogSizeForSource(0, 0)).toEqual({ width: 1, height: 1 })
  })

  it('measures an image by layout, and falls back to its natural size', () => {
    const image = { clientWidth: 0, clientHeight: 30, getBoundingClientRect: () => ({ width: 40.4, height: 0 }), naturalWidth: 500, naturalHeight: 250, dataset: { mapId: 'm1' } } as unknown as HTMLImageElement
    expect(measuredImageSize(image)).toEqual({ width: 40, height: 30 })
    expect(imageDisplaySize({ width: 0, height: 30 }, image)).toEqual({ width: 500, height: 30 })
    expect(needsAnotherFrame({ width: 0, height: 30 }, 3)).toBe(true)
    expect(needsAnotherFrame({ width: 0, height: 30 }, 8)).toBe(false)
    expect(needsAnotherFrame({ width: 10, height: 30 }, 0)).toBe(false)
    expect(isImageOfMap(image, aMap({ id: 'm1' }))).toBe(true)
    expect(isImageOfMap(image, aMap({ id: 'm2' }))).toBe(false)
    expect(isImageOfMap(image, null)).toBe(false)
    expect(isBlankMap(aMap({ id: 'b', kind: 'blank' }))).toBe(true)
    expect(isBlankMap(null)).toBe(false)
  })

  it('clears and resizes the line-of-sight canvas, when it can', () => {
    const clearRect = vi.fn()
    const canvas = { width: 10, height: 10, getContext: () => ({ clearRect }) } as unknown as HTMLCanvasElement
    clearLosSeenCanvas(canvas, 20, 30)
    expect([canvas.width, canvas.height]).toEqual([20, 30])
    expect(clearRect).toHaveBeenCalledWith(0, 0, 20, 30)
    clearLosSeenCanvas(canvas, 20, 30)
    expect(clearRect).toHaveBeenCalledTimes(2)
    clearLosSeenCanvas(canvas, 0, 30)
    clearLosSeenCanvas(canvas, 20, 0)
    clearLosSeenCanvas(null, 20, 30)
    expect(clearRect).toHaveBeenCalledTimes(2)
    clearLosSeenCanvas({ width: 1, height: 1, getContext: () => null } as unknown as HTMLCanvasElement, 5, 5)
  })
})

describe('box selection', () => {
  const tokens = [aToken({ id: 'a', x: 0.2, y: 0.2 }), aToken({ id: 'b', x: 0.8, y: 0.8 })]

  it('selects the tokens inside a box drawn either way', () => {
    expect(boxSelectionIds(tokens, { x: 0.5, y: 0.5 }, { x: 0.1, y: 0.1 })).toEqual(['a'])
    expect(boxSelectionIds(tokens, { x: 0, y: 0 }, { x: 1, y: 1 })).toEqual(['a', 'b'])
  })

  it('selects nothing with a box too small to be a drag', () => {
    expect(boxSelectionIds(tokens, { x: 0.2, y: 0.2 }, { x: 0.201, y: 0.6 })).toEqual(['a'])
    expect(boxSelectionIds(tokens, { x: 0.2, y: 0.2 }, { x: 0.201, y: 0.201 })).toEqual([])
  })

  it('extends a box and styles it', () => {
    expect(extendSelectionBox(null, { x: 1, y: 1 })).toBeNull()
    expect(extendSelectionBox({ start: { x: 0, y: 0 }, end: { x: 0, y: 0 } }, { x: 1, y: 1 })).toEqual({ start: { x: 0, y: 0 }, end: { x: 1, y: 1 } })
    expect(selectionRectStyle(null)).toBeNull()
    expect(selectionRectStyle({ start: { x: 0.5, y: 0.25 }, end: { x: 0.25, y: 0.5 } })).toEqual({ left: '25%', top: '25%', width: '25%', height: '25%' })
  })
})

describe('token display', () => {
  const token = aToken({ id: 't', x: 0.1, y: 0.2, name: '  ' })

  it('draws a token where it is dragged, else animated, else stored', () => {
    expect(tokenLivePosition(token, { x: 0.5, y: 0.5 }, { x: 0.7, y: 0.7 })).toEqual({ x: 0.5, y: 0.5, dragging: true, animating: false })
    expect(tokenLivePosition(token, undefined, { x: 0.7, y: 0.7 })).toEqual({ x: 0.7, y: 0.7, dragging: false, animating: true })
    expect(tokenLivePosition(token, undefined, undefined)).toEqual({ x: 0.1, y: 0.2, dragging: false, animating: false })
  })

  it('names and classes tokens', () => {
    expect(tokenDisplayName(token, 2)).toBe('Token 3')
    expect(gmTokenNameClassName(aToken({ id: 'a', revealName: true }), true)).toBe('map-token-name gm-hover-only')
    expect(gmTokenNameClassName(aToken({ id: 'a' }), true)).toBe('map-token-name gm-hidden')
    expect(gmTokenNameClassName(aToken({ id: 'a', revealName: true }), false)).toBe('map-token-name')
    expect(gmTokenNameClassName(aToken({ id: 'a' }), false)).toBe('map-token-name gm-hover-only')
    expect(gmTokenClassName({ dragging: true, animating: true, selected: true, hidden: true })).toBe('map-token dragging animating selected gm-hidden-token')
    expect(playerTokenClassName(true, true)).toBe('map-token player animating selected')
    expect(playerTokenClassName(false, false)).toBe('map-token player')
  })

  it('puts party tokens over the fog and the rest under it, never hidden ones', () => {
    const party = aToken({ id: 'p', party: true })
    expect(isInPlayerLayer(party, 'over-fog', false)).toBe(true)
    expect(isInPlayerLayer(party, 'under-fog', false)).toBe(false)
    expect(isInPlayerLayer(token, 'under-fog', false)).toBe(true)
    expect(isInPlayerLayer(token, 'under-fog', true)).toBe(false)
    expect(isInPlayerLayer(aToken({ id: 'h', hidden: true }), 'under-fog', false)).toBe(false)
  })

  it('scales a token to the fog canvas before sampling it', () => {
    const getImageData = vi.fn(() => ({ data: [0, 0, 0, 0] }))
    const fogCanvas = { width: 100, height: 50, getContext: () => ({ getImageData }) } as unknown as HTMLCanvasElement
    const fog = { role: 'player' as const, playerViewPreview: false, fullyHidden: true, fogCanvasRef: { current: fogCanvas } }
    expect(isTokenPartlyShownOnFog(token, { x: 0.5, y: 0.5 }, { width: 40, height: 40 }, fog, 100)).toBe(true)
    expect(isTokenPartlyShownOnFog(token, { x: 0.5, y: 0.5 }, { width: 40, height: 40 }, { ...fog, fogCanvasRef: { current: null } }, 100)).toBe(false)
  })
})

describe('the Maps tab layout', () => {
  const desktop: MapsPanes = { isMobile: false, mobileMapView: 'list', mobileGmPane: 'map', mobilePlayerPane: 'map', desktopGmPane: 'map', desktopGmRun: false, showEmbeddedMap: true }
  const phone: MapsPanes = { ...desktop, isMobile: true, mobileMapView: 'detail' }

  it('works out whether the viewer sees the player-facing map', () => {
    expect(viewModes('gm', false, false)).toEqual({ viewAsPlayer: false, gmView: true })
    expect(viewModes('gm', true, false)).toEqual({ viewAsPlayer: true, gmView: false })
    expect(viewModes('player', false, false)).toEqual({ viewAsPlayer: false, gmView: false })
  })

  it('picks the panes for the screen and role', () => {
    expect(isMobileZoomMapView(true, 'player', 'tokens')).toBe(true)
    expect(isMobileZoomMapView(true, 'gm', 'tokens')).toBe(false)
    expect(isMobileZoomMapView(false, 'player', 'map')).toBe(false)
    expect(showsGmTopTools({ ...desktop, desktopGmRun: true }, true)).toBe(true)
    expect(showsGmTopTools(phone, true)).toBe(true)
    expect(showsGmTopTools(phone, false)).toBe(false)
    expect(showsMapStage(desktop, false)).toBe(true)
    expect(showsMapStage({ ...phone, mobilePlayerPane: 'controls' }, false)).toBe(false)
    expect(showsMapStage({ ...phone, mobileGmPane: 'tokens' }, true)).toBe(false)
    expect(showsGmControlsPane(desktop, true, 'run')).toBe(true)
    expect(showsGmControlsPane({ ...desktop, desktopGmRun: true }, true, 'run')).toBe(false)
    expect(showsGmControlsPane({ ...phone, mobileGmPane: 'tokens' }, true, 'preview')).toBe(true)
    expect(showsGmControlsPane(desktop, false, 'run')).toBe(false)
    expect(showsPlayerControls(desktop, false)).toBe(true)
    expect(showsPlayerControls(phone, false)).toBe(false)
    expect(showsDrawingToolbar(desktop, true, aMap({ id: 'b', kind: 'blank' }))).toBe(true)
    expect(showsDrawingToolbar({ ...phone, mobileGmPane: 'tokens' }, true, aMap({ id: 'b', kind: 'blank' }))).toBe(false)
    expect(showsDrawingToolbar(desktop, true, null)).toBe(false)
  })

  it('classes the main pane', () => {
    expect(mapsMainClassName(desktop, true)).toBe('maps-main gm')
    expect(mapsMainClassName({ ...phone, showEmbeddedMap: false }, false)).toBe('maps-main player mobile-player maps-main-hidden')
    expect(mapsMainClassName({ ...desktop, desktopGmRun: true, desktopGmPane: 'character' }, true)).toBe('maps-main gm run maps-main-hidden')
    expect(mapsMainClassName(phone, true)).toBe('maps-main gm mobile-gm')
  })

  it('styles the map layer, the fog and the loading mask', () => {
    expect(mapLayerStyle({ x: 1, y: 2 }, 1, false)).toEqual({ transform: 'translate(1px, 2px) scale(1)', cursor: undefined })
    expect(mapLayerStyle({ x: 1, y: 2 }, 2, false).cursor).toBe('grab')
    expect(mapLayerStyle({ x: 1, y: 2 }, 2, true).cursor).toBe('grabbing')
    expect(mapLayerOpacities(true, 'draw')).toEqual({ fog: 0.45, vision: 0.38, losSeen: 0.75 })
    expect(mapLayerOpacities(true, null).vision).toBe(0)
    expect(mapLayerOpacities(false, 'draw')).toEqual({ fog: 1, vision: 0, losSeen: 0 })
    expect(fogCanvasClassName(false, 'hide', null)).toBe('map-fog-canvas brush')
    expect(fogCanvasClassName(true, 'hide', null)).toBe('map-fog-canvas read-only')
    expect(fogCanvasClassName(false, null, null)).toBe('map-fog-canvas read-only')
    expect(showsLoadingMask(aMap({ id: 'm' }), true, true)).toBe(false)
    expect(showsLoadingMask(aMap({ id: 'm' }), true, false)).toBe(true)
    expect(showsLoadingMask(aMap({ id: 'b', kind: 'blank' }), false, false)).toBe(false)
    expect(showsLoadingMask(null, false, true)).toBe(true)
  })
})

describe('map list and dialog text', () => {
  it('says what the map list is waiting for', () => {
    expect(mapListNotice(true, 0, 0, true)).toBe('Loading maps...')
    expect(mapListNotice(false, 0, 0, true)).toBe('No maps uploaded yet.')
    expect(mapListNotice(false, 2, 0, false)).toBe('No maps revealed to players yet.')
    expect(mapListNotice(false, 2, 0, true)).toBeNull()
    expect(mapRowClassName(true, true, true)).toBe('map-row active drag-over dragging')
  })

  it('words the delete confirmations', () => {
    expect(deleteConfirmLabel('')).toBe('Delete')
    expect(deleteConfirmLabel('m1')).toBe('Deleting...')
    expect(tokenDeleteTitle(null)).toBe('Delete Token?')
    expect(tokenDeleteTitle([aToken({ id: 'a' }), aToken({ id: 'b' })])).toBe('Delete Tokens?')
    expect(tokenDeleteMessage(null)).toBe('Permanently remove this token from the map?')
    expect(tokenDeleteMessage([aToken({ id: 'a', name: 'Gob' })])).toBe('Permanently remove "Gob" from the map?')
    expect(tokenDeleteMessage([aToken({ id: 'a', name: 'Gob' }), aToken({ id: 'b' })])).toBe('Permanently remove 2 tokens: "Gob", "Token" from the map?')
  })
})

describe('grid view', () => {
  it('draws a line only while its mode is on and it has a start and an end', () => {
    const start = { x: 0, y: 0 }
    expect(activeGridLine(false, start, start, null)).toBeNull()
    expect(activeGridLine(true, null, start, null)).toBeNull()
    expect(activeGridLine(true, start, null, null)).toBeNull()
    expect(activeGridLine(true, start, null, { x: 1, y: 1 })).toEqual({ start, end: { x: 1, y: 1 } })
    expect(activeGridLine(true, start, { x: 2, y: 2 }, { x: 1, y: 1 })?.end).toEqual({ x: 2, y: 2 })
  })

  it('enables measuring once a grid is laid, adjusted or calibrated', () => {
    expect(isMeasurementToolEnabled(false, false, null)).toBe(false)
    expect(isMeasurementToolEnabled(false, false, aMap({ id: 'm', gridCalibrated: true }))).toBe(true)
    expect(isMeasurementToolEnabled(true, false, null)).toBe(true)
    expect(gridCellPixels(0.05, 400)).toBe(20)
    expect(gridCellPixels(10, 400)).toBe(520)
    expect(errorMessage(new Error('x'), 'y')).toBe('x')
    expect(errorMessage('x', 'y')).toBe('y')
  })

  it('shows players only shown player labels, and the GM everything unless hidden', () => {
    const gm = { id: 'g', x: 0, y: 0, text: '', kind: 'gm' as const, hidden: false, pointerDirection: 'up' as const }
    const label = { ...gm, id: 'l', kind: 'player' as const }
    const hidden = { ...label, id: 'h', hidden: true }
    expect(displayedAnnotations([gm, label, hidden], 'player', false, false)).toEqual([label])
    expect(displayedAnnotations([gm, label, hidden], 'gm', true, false)).toEqual([label])
    expect(displayedAnnotations([gm, label, hidden], 'gm', false, false)).toEqual([gm, label, hidden])
    expect(displayedAnnotations([gm, label, hidden], 'gm', false, true)).toEqual([])
  })
})

describe('GM map updates', () => {
  it('stores a size or view distance with its scale', () => {
    expect(scaledTokenUpdate('size', 90)).toEqual({ size: 90, sizeScale: 0.1 })
    expect(scaledTokenUpdate('viewDistance', 180)).toEqual({ viewDistance: 180, viewDistanceScale: 0.2 })
    const tokens = [aToken({ id: 'a' }), aToken({ id: 'b' })]
    expect(withTokenUpdate(tokens, 'b', { size: 1 })).toEqual([tokens[0], { ...tokens[1], size: 1 }])
  })

  it('adds and removes scene NPCs once', () => {
    expect(nextSceneNpcIds(['a'], 'b', true)).toEqual(['a', 'b'])
    const current = ['a']
    expect(nextSceneNpcIds(current, 'a', true)).toBe(current)
    expect(nextSceneNpcIds(['a', 'b'], 'a', false)).toEqual(['b'])
  })

  it('pages around the character sheets', () => {
    expect(pagedIndex(0, -1, 3)).toBe(2)
    expect(pagedIndex(2, 1, 3)).toBe(0)
    expect(pagedIndex(-1, 1, 3)).toBe(1)
  })
})
