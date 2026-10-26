// @vitest-environment jsdom
/**
 * What the Maps tab does end to end, with the hooks that reach Firestore,
 * Storage or a canvas replaced by stubs (see test/mapsTabStubs.ts), and the
 * character sheet and drawing editor replaced by stubs that record their
 * props. Everything else - the tool state, the layout, placement, selection,
 * the GM controls - runs for real, so these tests pin how the tab wires its
 * hooks and panes together.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { Role } from '../../types/app'
import { ruleSets } from '../ruleSets/registry'
import { MapRuleSetContext } from './mapRuleSet'
import { aMap, aToken, anNpc } from './test/mapFixtures'
import {
  aPartyCharacter,
  animationStub,
  dragStub,
  fogStub,
  gridStub,
  mapDataStub,
  tokenAssetsStub,
  viewportStub,
} from './test/mapsTabStubs'
import type { MapsTab as MapsTabType } from './MapsTab'

type Stub = Record<string, unknown>

const h = vi.hoisted(() => ({
  mapData: {} as Stub,
  fog: {} as Stub,
  grid: {} as Stub,
  viewport: {} as Stub,
  animation: {} as Stub,
  drag: {} as Stub,
  assets: {} as Stub,
  vision: {} as Stub,
  args: {} as Record<string, Record<string, unknown>>,
  drawingEditor: null as null | { mapName: string; onSave: (result: unknown) => Promise<void>; onCancel: () => void },
  characterTabs: [] as Array<Record<string, unknown>>,
  resizeCallbacks: [] as Array<() => void>,
}))

vi.mock('./hooks/useMapData', () => ({
  useMapData: (args: { selectedMapId: string; role: Role | null }) => {
    h.args.mapData = args
    const maps = h.mapData.maps as Array<{ id: string; visibleToPlayers: boolean }>
    return {
      ...h.mapData,
      visibleMaps: args.role === 'gm' ? maps : maps.filter((map) => map.visibleToPlayers),
      selectedMap: maps.find((map) => map.id === args.selectedMapId) ?? null,
    }
  },
}))
vi.mock('./hooks/useFogTools', () => ({ useFogTools: (args: Stub) => { h.args.fog = args; return h.fog } }))
vi.mock('./hooks/useGridTools', () => ({ useGridTools: (args: Stub) => { h.args.grid = args; return h.grid } }))
vi.mock('./hooks/useMapViewport', () => ({ useMapViewport: (args: Stub) => { h.args.viewport = args; return h.viewport } }))
vi.mock('./hooks/useTokenAnimation', () => ({ useTokenAnimation: (args: Stub) => { h.args.animation = args; return h.animation } }))
vi.mock('./hooks/useTokenDrag', () => ({ useTokenDrag: (args: Stub) => { h.args.drag = args; return h.drag } }))
vi.mock('./hooks/useTokenAssets', () => ({ useTokenAssets: (args: Stub) => { h.args.assets = args; return h.assets } }))
vi.mock('./hooks/useVisionReveal', () => ({ useVisionReveal: (args: Stub) => { h.args.vision = args; return h.vision } }))
vi.mock('../../firebase', () => ({ db: { name: 'db-stub' } }))
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  doc: (_db: unknown, path: string) => ({ path }),
  onSnapshot: () => () => {},
}))
vi.mock('./components/MapDrawingEditor', () => ({
  MapDrawingEditor: (props: NonNullable<typeof h.drawingEditor>) => {
    h.drawingEditor = props
    return <div data-testid="drawing-editor">{props.mapName}</div>
  },
}))
vi.mock('../character/CharacterTab', () => ({
  CharacterTab: (props: Record<string, unknown>) => {
    h.characterTabs.push(props)
    const characters = props.characters as Array<{ name: string }>
    return <div data-testid="character-tab" data-embedded={String(props.embeddedMode)}>{characters.map((character) => character.name).join(',')}</div>
  },
}))

const { MapsTab } = await import('./MapsTab')

type TabOptions = {
  role?: Role | null
  width?: number
  characterTabProps?: ComponentProps<typeof MapsTabType>['characterTabProps']
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
}

function renderTab({ role = 'gm', width = 1440, characterTabProps }: TabOptions = {}) {
  setViewportWidth(width)
  const ui = () => (
    <MapRuleSetContext value={ruleSets.ose}>
      <MapsTab campaignId="campaign-1" groupId="group-1" role={role} gmUserId="gm-1" characterTabProps={characterTabProps} />
    </MapRuleSetContext>
  )
  const view = render(ui())
  return { ...view, rerender: () => view.rerender(ui()) }
}

function setData(stub: 'mapData' | 'fog' | 'grid' | 'viewport' | 'animation' | 'drag' | 'assets', values: Stub) {
  h[stub] = { ...h[stub], ...values }
}

function button(label: string) {
  return screen.getByRole('button', { name: label })
}

function mapRow(name: string) {
  const row = Array.from(document.querySelectorAll<HTMLElement>('.map-row')).find((entry) => entry.querySelector('strong')?.textContent === name || entry.querySelector('img')?.getAttribute('alt') === name)
  if (!row) throw new Error(`No map row named ${name}`)
  return row
}

function selectMap(name: string) {
  fireEvent.click(mapRow(name).querySelector('.map-select') as HTMLElement)
}

function layer() {
  return document.querySelector('.map-zoom-layer') as HTMLElement
}

function fogCanvas() {
  return document.querySelector('.map-fog-canvas') as HTMLCanvasElement
}

function enterRun() {
  fireEvent.click(button('Run this map'))
}

// The map image reports a natural size of 2000 x 1000 and lays out at 800 x 400.
function loadMapImage(width = 800, height = 400) {
  const image = document.querySelector('.inline-map-image') as HTMLImageElement
  Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 2000 })
  Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 1000 })
  Object.defineProperty(image, 'clientWidth', { configurable: true, value: width })
  Object.defineProperty(image, 'clientHeight', { configurable: true, value: height })
  fireEvent.load(image)
  return image
}

const castle = aMap({ id: 'castle', name: 'Castle', visibleToPlayers: true })
const cave = aMap({ id: 'cave', name: 'Cave', imageUrl: 'https://img.test/cave.png' })
const sketch = aMap({ id: 'sketch', name: 'Sketch', kind: 'blank', imageUrl: '', width: 600, height: 300 })

const layerRect = { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }
const zeroRect = { ...layerRect, width: 0, height: 0, right: 0, bottom: 0 }

beforeEach(() => {
  h.mapData = mapDataStub({ maps: [castle, cave, sketch] })
  h.fog = fogStub()
  h.grid = gridStub({
    toggleGridCalibrateMode: vi.fn(() => setData('grid', { gridCalibrateMode: !h.grid.gridCalibrateMode })),
    toggleGridMeasureMode: vi.fn(() => setData('grid', { gridMeasureMode: !h.grid.gridMeasureMode })),
  })
  h.viewport = viewportStub()
  h.animation = animationStub()
  h.drag = dragStub()
  h.assets = tokenAssetsStub()
  h.vision = { revealFromTokenPoint: vi.fn(), revealFromTokenStroke: vi.fn() }
  h.args = {}
  h.drawingEditor = null
  h.characterTabs = []
  h.resizeCallbacks = []
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { h.resizeCallbacks.push(callback) }
    observe() {}
    disconnect() {}
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
    return (this.classList.contains('map-zoom-layer') ? layerRect : zeroRect) as DOMRect
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('the map list', () => {
  it('lets a GM draw or upload a map, and shows the role', () => {
    renderTab()
    expect(button('Draw')).toBeTruthy()
    expect(screen.getByText('Upload')).toBeTruthy()
    expect(screen.getByText('Role: gm')).toBeTruthy()
  })

  it('shows a player no create actions and only the revealed maps', () => {
    renderTab({ role: 'player' })
    expect(screen.queryByText('Upload')).toBeNull()
    expect(Array.from(document.querySelectorAll('.map-row strong')).map((name) => name.textContent)).toEqual(['Castle'])
    expect(document.querySelector('.map-thumb')).toBeNull()
    expect(document.querySelector('.map-visibility-btn')).toBeNull()
    expect(document.querySelector('.map-actions')).toBeNull()
  })

  it('says when maps are loading, when there are none and when none is revealed', () => {
    setData('mapData', { mapsLoading: true })
    const { rerender } = renderTab({ role: null })
    expect(screen.getByText('Loading maps...')).toBeTruthy()
    expect(screen.getByText('Role: unknown')).toBeTruthy()
    setData('mapData', { mapsLoading: false, maps: [] })
    rerender()
    expect(screen.getByText('No maps uploaded yet.')).toBeTruthy()
    setData('mapData', { maps: [cave] })
    rerender()
    expect(screen.getByText('No maps revealed to players yet.')).toBeTruthy()
  })

  it('shows the GM a thumbnail, a visibility toggle and edit actions for each map', () => {
    renderTab()
    const caveRow = mapRow('Cave')
    expect(caveRow.querySelector('img.map-thumb')?.getAttribute('src')).toBe('https://img.test/cave.png')
    expect(mapRow('Sketch').querySelector('.map-thumb.blank')).toBeTruthy()
    expect(within(mapRow('Castle')).getByLabelText('Visible to players').className).toBe('map-visibility-btn on')
    fireEvent.click(within(caveRow).getByLabelText('Hidden from players'))
    expect(h.mapData.togglePlayerVisibility).toHaveBeenCalledWith(cave, true)
    expect(h.args.mapData.selectedMapId).toBe('')
    fireEvent.click(within(caveRow).getByLabelText('Delete Cave'))
    expect(h.mapData.setDeleteCandidate).toHaveBeenCalledWith(cave)
    fireEvent.click(caveRow.querySelector('.map-edit-btn') as HTMLElement)
    expect(h.mapData.startRename).toHaveBeenCalledWith(cave)
  })

  it('renames a map in place', () => {
    setData('mapData', { editingMapId: 'cave', editName: 'Deep Cave' })
    renderTab()
    const input = screen.getByLabelText('Edit map name') as HTMLInputElement
    expect(input.value).toBe('Deep Cave')
    fireEvent.change(input, { target: { value: 'Deeper' } })
    expect(h.mapData.setEditName).toHaveBeenCalledWith('Deeper')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(h.args.mapData.selectedMapId).toBe('')
    fireEvent.click(input.closest('.map-row')?.querySelector('.map-edit-btn') as HTMLElement)
    expect(h.mapData.saveRename).toHaveBeenCalledWith('cave')
  })

  it('disables deleting a map while it is being deleted, and shows map errors', () => {
    setData('mapData', { deletingMapId: 'cave', mapError: 'Upload failed' })
    renderTab()
    expect((screen.getByLabelText('Delete Cave') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Upload failed').className).toBe('error')
  })

  it('reorders maps by dragging, marking the dragged and hovered rows', () => {
    setData('mapData', { draggingMapId: 'castle', dragOverMapId: 'cave' })
    const { rerender } = renderTab()
    expect(mapRow('Castle').className).toBe('map-row dragging')
    expect(mapRow('Cave').className).toBe('map-row drag-over')
    expect(mapRow('Castle').getAttribute('draggable')).toBe('true')
    fireEvent.dragStart(mapRow('Sketch'))
    expect(h.mapData.handleDragStart).toHaveBeenCalledWith('sketch')
    fireEvent.dragOver(mapRow('Sketch'))
    expect(h.mapData.setDragOverMapId).toHaveBeenLastCalledWith('sketch')
    vi.mocked(h.mapData.setDragOverMapId as () => void).mockClear()
    fireEvent.dragOver(mapRow('Cave'))
    expect(h.mapData.setDragOverMapId).not.toHaveBeenCalled()
    fireEvent.dragLeave(mapRow('Sketch'))
    expect(h.mapData.setDragOverMapId).not.toHaveBeenCalled()
    fireEvent.dragLeave(mapRow('Cave'))
    expect(h.mapData.setDragOverMapId).toHaveBeenCalledWith('')
    fireEvent.drop(mapRow('Cave'))
    expect(h.mapData.handleDrop).toHaveBeenCalledWith('cave')
    fireEvent.dragEnd(mapRow('Castle'))
    expect(h.mapData.setDraggingMapId).toHaveBeenCalledWith('')
    setData('mapData', { draggingMapId: '', dragOverMapId: '' })
    rerender()
    expect(mapRow('Castle').className).toBe('map-row')
  })

  it('does not let a player drag maps', () => {
    renderTab({ role: 'player' })
    expect(mapRow('Castle').getAttribute('draggable')).toBe('false')
  })

  it('selects a map by click, Enter or Space, and marks it active', () => {
    renderTab()
    selectMap('Cave')
    expect(h.args.mapData.selectedMapId).toBe('cave')
    expect(mapRow('Cave').className).toBe('map-row active')
    fireEvent.keyDown(mapRow('Castle').querySelector('.map-select') as HTMLElement, { key: 'Enter' })
    expect(h.args.mapData.selectedMapId).toBe('castle')
    fireEvent.keyDown(mapRow('Cave').querySelector('.map-select') as HTMLElement, { key: ' ' })
    expect(h.args.mapData.selectedMapId).toBe('cave')
    fireEvent.keyDown(mapRow('Castle').querySelector('.map-select') as HTMLElement, { key: 'a' })
    expect(h.args.mapData.selectedMapId).toBe('cave')
  })

  it('uploads the chosen file once and clears the input', () => {
    renderTab()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], 'map.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(h.mapData.handleMapUpload).toHaveBeenCalledWith(file)
    fireEvent.change(input, { target: { files: [] } })
    expect(h.mapData.handleMapUpload).toHaveBeenCalledTimes(1)
  })

  it('disables creating maps during an upload', () => {
    setData('mapData', { uploading: true })
    renderTab()
    expect((button('Draw') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Uploading...')).toBeTruthy()
  })
})

describe('drawing blank maps', () => {
  it('creates a blank map and opens it in the drawing editor, then saves it', async () => {
    const { rerender } = renderTab()
    await act(async () => {
      fireEvent.click(button('Draw'))
    })
    expect(h.mapData.handleCreateBlankMap).toHaveBeenCalled()
    expect(screen.queryByTestId('drawing-editor')).toBeNull()
    setData('mapData', { maps: [castle, aMap({ id: 'blank-new', name: 'New sketch', kind: 'blank' })] })
    rerender()
    expect(screen.getByTestId('drawing-editor').textContent).toBe('New sketch')
    await act(async () => {
      await h.drawingEditor?.onSave({ sceneJson: '{}', blob: 'blob', width: 10, height: 20 })
    })
    expect(h.mapData.saveBlankMapDrawing).toHaveBeenCalledWith('blank-new', '{}', 'blob', 10, 20)
    expect(screen.queryByTestId('drawing-editor')).toBeNull()
  })

  it('opens nothing when no blank map could be created', async () => {
    setData('mapData', { handleCreateBlankMap: vi.fn(async () => '') })
    renderTab()
    await act(async () => {
      fireEvent.click(button('Draw'))
    })
    expect(screen.queryByTestId('drawing-editor')).toBeNull()
  })

  it('edits the drawing of the selected blank map, and cancels', () => {
    renderTab()
    selectMap('Sketch')
    fireEvent.click(screen.getByText('Edit drawing'))
    expect(screen.getByTestId('drawing-editor').textContent).toBe('Sketch')
    act(() => h.drawingEditor?.onCancel())
    expect(screen.queryByTestId('drawing-editor')).toBeNull()
  })

  it('does not offer a player the drawing editor', () => {
    setData('mapData', { maps: [{ ...sketch, visibleToPlayers: true }] })
    renderTab({ role: 'player' })
    selectMap('Sketch')
    expect(screen.queryByText('Edit drawing')).toBeNull()
  })
})

describe('preview and run', () => {
  it('lands the GM in preview, runs the map, and goes back', () => {
    renderTab()
    expect(screen.getByText('Select a map from the list.')).toBeTruthy()
    expect(screen.queryByLabelText('Run this map')).toBeNull()
    selectMap('Castle')
    expect(document.querySelector('.maps-layout')?.className).toBe('maps-layout')
    expect(document.querySelector('.maps-main')?.className).toBe('maps-main gm')
    expect(document.querySelector('.map-tools-panel')).toBeNull()
    enterRun()
    expect(document.querySelector('.maps-layout')?.className).toBe('maps-layout map-run-layout')
    expect(document.querySelector('.maps-content-shell')?.className).toBe('maps-content-shell map-run-shell')
    expect(document.querySelector('.maps-main')?.className).toBe('maps-main gm run')
    expect(document.querySelector('.maps-sidebar')).toBeNull()
    expect(document.querySelector('.map-run-token-controls .map-controls-body')).toBeTruthy()
    expect(document.querySelector('.map-tools-panel')).toBeTruthy()
    expect(screen.queryByText('Edit drawing')).toBeNull()
    fireEvent.click(button('Back to map preview'))
    expect(document.querySelector('.maps-layout')?.className).toBe('maps-layout')
    expect(h.viewport.resetPlayerViewport).toHaveBeenCalled()
  })

  it('resets the transient state on every entry into run', () => {
    renderTab()
    selectMap('Castle')
    vi.mocked(h.grid.resetGrid as () => void).mockClear()
    enterRun()
    expect(h.grid.resetGrid).toHaveBeenCalledTimes(1)
    expect(h.mapData.setActiveAnnotationId).toHaveBeenCalledWith('')
    fireEvent.click(button('Back to map preview'))
    enterRun()
    expect(h.grid.resetGrid).toHaveBeenCalledTimes(2)
  })

  it('pans the map stage in preview', () => {
    renderTab()
    selectMap('Castle')
    expect(h.args.viewport.allowGmInlinePan).toBe(true)
    enterRun()
    expect(h.args.viewport.allowGmInlinePan).toBe(false)
  })

  it('returns to preview and resets the map state when another map is selected', () => {
    renderTab()
    selectMap('Castle')
    enterRun()
    fireEvent.click(button('Back to map preview'))
    vi.mocked(h.grid.resetGrid as () => void).mockClear()
    selectMap('Cave')
    expect(h.grid.resetGrid).toHaveBeenCalledTimes(1)
    expect(h.mapData.setActiveAnnotationDraft).toHaveBeenCalledWith('')
  })

  it('lays the zoomed, panned map layer over the stage', () => {
    setData('viewport', { playerZoom: 2, playerPan: { x: 5, y: -4 } })
    const { rerender } = renderTab()
    selectMap('Castle')
    expect(layer().style.transform).toBe('translate(5px, -4px) scale(2)')
    expect(layer().style.cursor).toBe('grab')
    setData('viewport', { playerDragging: true })
    rerender()
    expect(layer().style.cursor).toBe('grabbing')
    setData('viewport', { playerDragging: false, playerZoom: 1 })
    rerender()
    expect(layer().style.cursor).toBe('')
    expect(layer().className).toBe('map-zoom-layer')
    expect(document.querySelector('.map-stage')?.className).toBe('map-stage')
  })

  it('wires the stage and layer events to the viewport and grid tools', () => {
    renderTab()
    selectMap('Castle')
    const stage = document.querySelector('.map-stage') as HTMLElement
    fireEvent.wheel(stage)
    fireEvent.mouseDown(stage)
    fireEvent.mouseMove(stage)
    fireEvent.mouseUp(stage)
    fireEvent.mouseLeave(stage)
    expect(h.viewport.handlePlayerWheel).toHaveBeenCalled()
    expect(h.viewport.handlePlayerMouseDown).toHaveBeenCalled()
    expect(h.viewport.handlePlayerMouseMove).toHaveBeenCalled()
    expect(h.viewport.endPlayerDrag).toHaveBeenCalledTimes(2)
    fireEvent.wheel(layer())
    expect(h.grid.handleGridLayerWheel).toHaveBeenCalled()
    fireEvent.mouseMove(layer(), { clientX: 3, clientY: 4 })
    expect(h.grid.handleGridCalibrateMouseMove).toHaveBeenCalledWith(3, 4)
    expect(h.grid.handleGridMeasureMouseMove).toHaveBeenCalledWith(3, 4)
    fireEvent.touchStart(layer())
    fireEvent.touchMove(layer())
    fireEvent.touchEnd(layer())
    fireEvent.touchCancel(layer())
    expect(h.viewport.handleMobilePlayerTouchStart).toHaveBeenCalled()
    expect(h.viewport.handleMobilePlayerTouchMove).toHaveBeenCalled()
    expect(h.viewport.handleMobilePlayerTouchEnd).toHaveBeenCalledTimes(2)
    const menu = fireEvent.contextMenu(layer())
    expect(menu).toBe(false)
  })

  it('lets the grid tools take a layer mouse down first', () => {
    setData('grid', { handleGridLayerMouseDown: vi.fn(() => true) })
    renderTab()
    selectMap('Castle')
    enterRun()
    fireEvent.click(button('Toggle token drag-select mode'))
    fireEvent.mouseDown(layer(), { button: 0, clientX: 10, clientY: 10 })
    expect(document.querySelector('.map-token-selection-box')).toBeNull()
  })
})

describe('sizing the map', () => {
  it('sizes the fog canvases from the loaded image and clears the seen-area canvas', () => {
    renderTab()
    selectMap('Castle')
    expect(fogCanvas().width).toBe(1)
    expect(document.querySelector('.map-fog-loading-mask')?.className).toBe('map-fog-loading-mask')
    enterRun()
    expect(document.querySelector('.map-fog-loading-mask')?.className).toBe('map-fog-loading-mask gm')
    loadMapImage()
    expect(fogCanvas().width).toBe(384)
    expect(fogCanvas().height).toBe(192)
    expect((document.querySelector('.map-los-seen-canvas') as HTMLCanvasElement).width).toBe(384)
    expect(h.fog.invalidateInlineOverlayCache).toHaveBeenCalled()
    expect(h.args.fog.inlineFogSize).toEqual({ width: 384, height: 192 })
    expect(h.args.grid.activeMapWidth).toBe(800)
    expect(h.args.grid.activeMapDimension).toBe(400)
    expect(document.querySelector('.map-fog-loading-mask')).toBeNull()
  })

  it('caps the fog canvas at its maximum dimension', () => {
    renderTab()
    selectMap('Castle')
    const image = document.querySelector('.inline-map-image') as HTMLImageElement
    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 8000 })
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 2000 })
    Object.defineProperty(image, 'clientWidth', { configurable: true, value: 800 })
    Object.defineProperty(image, 'clientHeight', { configurable: true, value: 200 })
    fireEvent.load(image)
    expect(fogCanvas().width).toBeLessThan(8000)
    expect(fogCanvas().width / fogCanvas().height).toBe(4)
  })

  it('waits for the image to lay out before measuring it', () => {
    vi.useFakeTimers()
    try {
      renderTab()
      selectMap('Castle')
      const image = loadMapImage(0, 0)
      expect(fogCanvas().width).toBe(1)
      Object.defineProperty(image, 'clientWidth', { configurable: true, value: 640 })
      Object.defineProperty(image, 'clientHeight', { configurable: true, value: 320 })
      act(() => { vi.advanceTimersByTime(50) })
      expect(fogCanvas().width).toBe(384)
      expect(h.args.grid.activeMapWidth).toBe(640)
    } finally {
      vi.useRealTimers()
    }
  })

  it('gives up waiting after eight frames and uses the natural size', () => {
    vi.useFakeTimers()
    try {
      renderTab()
      selectMap('Castle')
      loadMapImage(0, 0)
      act(() => { vi.advanceTimersByTime(500) })
      expect(h.args.grid.activeMapWidth).toBe(2000)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores an image that loads for a map no longer selected', () => {
    renderTab()
    selectMap('Castle')
    const image = document.querySelector('.inline-map-image') as HTMLImageElement
    image.dataset.mapId = 'other'
    fireEvent.load(image)
    expect(fogCanvas().width).toBe(1)
  })

  // The blank surface measures itself before the tab has caught up with the
  // selection, so each measurement is read against the map the tab last saw:
  // the first one for a newly selected blank map is dropped, and a later one
  // sizes the fog from the source size the tab saw before.
  it('sizes the fog canvases for an unsaved blank map from its source size', () => {
    const { rerender } = renderTab()
    selectMap('Sketch')
    expect(fogCanvas().width).toBe(1)
    expect(document.querySelector('.map-fog-loading-mask')).toBeNull()
    setData('mapData', { maps: [castle, cave, { ...sketch, width: 640 }] })
    rerender()
    expect(fogCanvas().width).toBe(384)
    expect(fogCanvas().height).toBe(192)
    expect(h.args.grid.activeMapWidth).toBe(100)
    expect(h.fog.invalidateInlineOverlayCache).toHaveBeenCalled()
  })

  it('drops a blank surface measurement read against an image map', () => {
    renderTab()
    selectMap('Castle')
    selectMap('Sketch')
    expect(fogCanvas().width).toBe(1)
  })

  it('follows the map layer as it resizes', () => {
    renderTab()
    selectMap('Castle')
    Object.defineProperty(layer(), 'clientWidth', { configurable: true, value: 500 })
    Object.defineProperty(layer(), 'clientHeight', { configurable: true, value: 250 })
    act(() => h.resizeCallbacks.forEach((callback) => callback()))
    expect(h.args.grid.activeMapWidth).toBe(500)
    expect(h.args.grid.activeMapHeight).toBe(250)
  })

  it('shows the loading mask until the fog is ready, lighter for players', () => {
    setData('fog', { inlineFogReady: false })
    setData('mapData', { maps: [castle] })
    renderTab({ role: 'player' })
    selectMap('Castle')
    loadMapImage()
    expect(document.querySelector('.map-fog-loading-mask')?.className).toBe('map-fog-loading-mask')
  })
})

describe('the GM tools', () => {
  function runCastle() {
    const view = renderTab()
    selectMap('Castle')
    enterRun()
    return view
  }

  it('turns fog tools on and off, with a brush cursor', () => {
    runCastle()
    expect(fogCanvas().className).toBe('map-fog-canvas read-only')
    expect(document.querySelector('.map-brush-cursor')).toBeNull()
    fireEvent.click(document.querySelector('.map-tools-panel .map-fog-hide-btn') as HTMLElement)
    expect(h.args.fog.fogTool).toBe('hide')
    expect(fogCanvas().className).toBe('map-fog-canvas brush')
    expect(document.querySelector('.map-brush-cursor')?.className).toBe('map-brush-cursor fog-hide')
    fireEvent.click(document.querySelector('.map-tools-panel .map-fog-reveal-btn') as HTMLElement)
    expect(h.args.fog.fogTool).toBe('reveal')
    fireEvent.click(document.querySelector('.map-tools-panel .map-fog-reveal-btn') as HTMLElement)
    expect(h.args.fog.fogTool).toBeNull()
  })

  it('maps the vision block tools onto the vision brush', () => {
    runCastle()
    const vision = (label: string) => fireEvent.click(document.querySelector(`.map-tools-panel [aria-label="${label}"]`) as HTMLElement)
    vision('Hard vision block')
    expect(h.args.fog.visionTool).toBe('drawFull')
    expect(document.querySelector('.map-brush-cursor')?.className).toBe('map-brush-cursor vision-draw-full')
    expect((document.querySelector('.map-vision-canvas') as HTMLElement).style.opacity).toBe('0.38')
    vision('Soft vision block')
    expect(h.args.fog.visionTool).toBe('draw')
    expect(document.querySelector('.map-brush-cursor')?.className).toBe('map-brush-cursor vision-draw')
    vision('Erase vision blocks')
    expect(h.args.fog.visionTool).toBe('erase')
    expect(document.querySelector('.map-brush-cursor')?.className).toBe('map-brush-cursor vision-erase')
    vision('Erase vision blocks')
    expect(h.args.fog.visionTool).toBeNull()
    expect((document.querySelector('.map-vision-canvas') as HTMLElement).style.opacity).toBe('0')
  })

  it('switches between annotation, label, box select and hand tools', () => {
    runCastle()
    const tool = (label: string) => fireEvent.click(document.querySelector(`.map-tools-panel [aria-label="${label}"]`) as HTMLElement)
    tool('Toggle GM notes placement')
    expect(h.args.viewport.annotationPlaceMode).toBe(true)
    tool('Toggle player label placement mode')
    expect(h.args.viewport.annotationPlaceMode).toBe(false)
    expect(h.args.viewport.playerLabelPlaceMode).toBe(true)
    tool('Toggle player label placement mode')
    expect(h.args.viewport.playerLabelPlaceMode).toBe(false)
    tool('Toggle hand pan tool')
    expect(h.args.viewport.handToolActive).toBe(true)
    tool('Toggle hand pan tool')
    expect(h.args.viewport.handToolActive).toBe(false)
    tool('Toggle token drag-select mode')
    expect(document.querySelector('.map-tools-panel [aria-label="Toggle token drag-select mode"]')?.className).toContain('active')
    tool('Toggle token drag-select mode')
    expect(document.querySelector('.map-tools-panel [aria-label="Toggle token drag-select mode"]')?.className).not.toContain('active')
    tool('Toggle GM notes placement')
    tool('Toggle GM notes placement')
    expect(h.args.viewport.annotationPlaceMode).toBe(false)
  })

  it('hides labels and previews the player view without changing the tool', () => {
    setData('mapData', { annotations: [{ id: 'a1', x: 0.1, y: 0.1, text: 'Note', kind: 'gm', hidden: false, pointerDirection: 'up' }] })
    runCastle()
    expect(document.querySelectorAll('.map-annotation-btn, .map-player-label-btn').length).toBeGreaterThan(0)
    fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Hide labels in GM view"]') as HTMLElement)
    expect(document.querySelectorAll('.map-annotation-btn, .map-player-label-btn')).toHaveLength(0)
    fireEvent.click(document.querySelector('.map-tools-panel .map-fog-hide-btn') as HTMLElement)
    fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Toggle player view preview"]') as HTMLElement)
    expect(h.args.drag.playerViewPreview).toBe(true)
    expect(h.args.fog.fogTool).toBe('hide')
    expect(fogCanvas().style.opacity).toBe('1')
    expect((document.querySelector('.map-los-seen-canvas') as HTMLElement).style.opacity).toBe('0')
    expect(screen.queryByLabelText('Token cards')).toBeNull()
  })

  it('shows the fog half-transparent to the GM and the seen area', () => {
    runCastle()
    expect(fogCanvas().style.opacity).toBe('0.45')
    expect((document.querySelector('.map-los-seen-canvas') as HTMLElement).style.opacity).toBe('0.75')
  })

  it('opens and closes the interaction help', () => {
    runCastle()
    fireEvent.click(document.querySelector('.map-tools-panel .map-tool-info-btn, .map-tools-panel [aria-label="Map controls help"]') as HTMLElement)
    const help = screen.getByRole('dialog', { name: 'Map interaction help' })
    expect(help.querySelectorAll('.map-help-section').length).toBeGreaterThan(0)
    fireEvent.click(within(help).getByText('Close'))
    expect(screen.queryByRole('dialog', { name: 'Map interaction help' })).toBeNull()
  })

  it('closes a measurement tool when another tool is picked', () => {
    const { rerender } = runCastle()
    fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Calibrate grid scale"]') as HTMLElement)
    expect(h.grid.toggleGridCalibrateMode).toHaveBeenCalledTimes(1)
    setData('grid', { gridCalibrateMode: true })
    rerender()
    fireEvent.click(document.querySelector('.map-tools-panel .map-fog-hide-btn') as HTMLElement)
    expect(h.grid.toggleGridCalibrateMode).toHaveBeenCalledTimes(2)
    expect(h.args.fog.fogTool).toBe('hide')
  })

  it('closes a measuring tool from each tool setter', () => {
    const { rerender } = runCastle()
    const measure = () => {
      fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Measure map distance"]') as HTMLElement)
      setData('grid', { gridMeasureMode: true, effectiveGridEnabled: true })
      rerender()
    }
    setData('grid', { effectiveGridEnabled: true })
    rerender()
    const labels = ['Hard vision block', 'Toggle token drag-select mode', 'Toggle GM notes placement', 'Toggle player label placement mode', 'Toggle hand pan tool']
    labels.forEach((label, index) => {
      measure()
      fireEvent.click(document.querySelector(`.map-tools-panel [aria-label="${label}"]`) as HTMLElement)
      expect(h.grid.toggleGridMeasureMode).toHaveBeenCalledTimes(2 * index + 2)
      setData('grid', { gridMeasureMode: false })
      rerender()
    })
  })

  it('clears a measuring tool whose grid mode has ended', () => {
    const { rerender } = runCastle()
    fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Calibrate grid scale"]') as HTMLElement)
    setData('grid', { gridCalibrateMode: true })
    rerender()
    setData('grid', { gridCalibrateMode: false })
    rerender()
    fireEvent.click(document.querySelector('.map-tools-panel .map-fog-hide-btn') as HTMLElement)
    expect(h.grid.toggleGridCalibrateMode).toHaveBeenCalledTimes(1)
  })

  it('picks a grid type, leaving any measuring tool', () => {
    const { rerender } = runCastle()
    fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Calibrate grid scale"]') as HTMLElement)
    setData('grid', { gridCalibrateMode: true })
    rerender()
    fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Square grid overlay"]') as HTMLElement)
    expect(h.grid.setGridType).toHaveBeenCalledWith('square')
    fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Hex grid flat-top orientation"]') as HTMLElement)
    expect(h.grid.setGridType).toHaveBeenLastCalledWith('hex-flat')
    fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Toggle grid visibility"]') as HTMLElement)
    expect(h.grid.toggleGridVisibility).toHaveBeenCalled()
  })

  it('reports a failed grid calibration as a map error', async () => {
    setData('grid', { gridCalibrateMode: true, gridCalibrateStart: { x: 0, y: 0 }, gridCalibrateEnd: { x: 1, y: 1 }, applyGridCalibration: vi.fn(async () => { throw new Error('No grid') }) })
    runCastle()
    await act(async () => {
      fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Apply calibration"]') as HTMLElement)
    })
    expect(h.mapData.setMapError).toHaveBeenCalledWith('No grid')
  })

  it('reports a non-error calibration failure with a generic message', async () => {
    setData('grid', { gridCalibrateMode: true, gridCalibrateStart: { x: 0, y: 0 }, gridCalibrateEnd: { x: 1, y: 1 }, applyGridCalibration: vi.fn(async () => { throw 'nope' }) })
    runCastle()
    await act(async () => {
      fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Apply calibration"]') as HTMLElement)
    })
    expect(h.mapData.setMapError).toHaveBeenCalledWith('Failed to save grid calibration')
  })

  it('enables measuring once a grid exists, is adjusted or is calibrated', () => {
    const { rerender } = runCastle()
    const measure = () => document.querySelector('.map-tools-panel [aria-label="Measure map distance"]') as HTMLButtonElement
    expect(measure().disabled).toBe(true)
    setData('grid', { gridAdjustMode: true })
    rerender()
    expect(measure().disabled).toBe(false)
    setData('grid', { gridAdjustMode: false })
    setData('mapData', { maps: [{ ...castle, gridCalibrated: true }, cave, sketch] })
    rerender()
    expect(measure().disabled).toBe(false)
  })

  it('applies the fog presets to the selected map', () => {
    setData('mapData', { maps: [{ ...castle, fullyHidden: true }, cave, sketch] })
    runCastle()
    fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Unhide all"]') as HTMLElement)
    expect(h.fog.applyFogPreset).toHaveBeenCalledWith('unhide-all')
  })
})

describe('the grid overlays', () => {
  it('draws the calibration line with draggable ends, pulsing when asked', () => {
    setData('grid', { gridCalibrateMode: true, gridCalibrateStart: { x: 0.1, y: 0.2 }, gridCalibratePreview: { x: 0.3, y: 0.4 }, gridCalibratePulse: true })
    const { rerender } = renderTab()
    selectMap('Castle')
    const overlay = document.querySelector('.map-grid-calibration-overlay') as HTMLElement
    expect(overlay.className).toBe('map-grid-calibration-overlay pulse')
    const line = overlay.querySelector('line') as SVGLineElement
    expect([line.getAttribute('x1'), line.getAttribute('y1'), line.getAttribute('x2'), line.getAttribute('y2')]).toEqual(['10', '20', '30', '40'])
    fireEvent.mouseDown(screen.getByLabelText('Move calibration start point'))
    expect(h.grid.handleGridCalibrateHandleMouseDown).toHaveBeenLastCalledWith(expect.anything(), 'start')
    fireEvent.mouseDown(screen.getByLabelText('Move calibration end point'))
    expect(h.grid.handleGridCalibrateHandleMouseDown).toHaveBeenLastCalledWith(expect.anything(), 'end')
    expect(screen.getByLabelText('Move calibration end point').style.left).toBe('30%')
    setData('grid', { gridCalibrateEnd: { x: 0.5, y: 0.6 }, gridCalibratePulse: false })
    rerender()
    expect(document.querySelector('.map-grid-calibration-overlay')?.className).toBe('map-grid-calibration-overlay')
    expect(screen.getByLabelText('Move calibration end point').style.left).toBe('50%')
    setData('grid', { gridCalibrateEnd: null, gridCalibratePreview: null })
    rerender()
    expect(document.querySelector('.map-grid-calibration-overlay')).toBeNull()
    setData('grid', { gridCalibrateMode: false, gridCalibrateEnd: { x: 0.5, y: 0.6 } })
    rerender()
    expect(document.querySelector('.map-grid-calibration-overlay')).toBeNull()
  })

  it('draws the measurement line with its distance label', () => {
    setData('grid', { gridMeasureMode: true, gridMeasureStart: { x: 0.1, y: 0.1 }, gridMeasurePreview: { x: 0.5, y: 0.3 }, effectiveGridEnabled: true })
    const { rerender } = renderTab()
    selectMap('Castle')
    loadMapImage()
    const overlay = document.querySelector('.map-grid-measurement-overlay') as HTMLElement
    const label = overlay.querySelector('.map-grid-measurement-label') as HTMLElement
    expect(label.style.left).toBe('30%')
    expect(label.style.top).toBe('20%')
    expect(label.textContent).toMatch(/ft|'/)
    fireEvent.mouseDown(screen.getByLabelText('Move measurement start'))
    expect(h.grid.handleGridMeasureHandleMouseDown).toHaveBeenLastCalledWith(expect.anything(), 'start')
    fireEvent.mouseDown(screen.getByLabelText('Move measurement end'))
    expect(h.grid.handleGridMeasureHandleMouseDown).toHaveBeenLastCalledWith(expect.anything(), 'end')
    setData('grid', { gridMeasureEnd: { x: 0.9, y: 0.9 } })
    rerender()
    expect((document.querySelector('.map-grid-measurement-label') as HTMLElement).style.left).toBe('50%')
    setData('grid', { gridMeasureEnd: null, gridMeasurePreview: null })
    rerender()
    expect(document.querySelector('.map-grid-measurement-overlay')).toBeNull()
    setData('grid', { gridMeasureMode: false, gridMeasureEnd: { x: 0.9, y: 0.9 } })
    rerender()
    expect(document.querySelector('.map-grid-measurement-overlay')).toBeNull()
  })

  it('shades the map while the grid is being adjusted', () => {
    setData('grid', { gridAdjustMode: true, effectiveGridEnabled: true, effectiveGridVisible: true })
    const { rerender } = renderTab()
    selectMap('Castle')
    expect(document.querySelector('.map-grid-adjust-overlay')).toBeTruthy()
    setData('grid', { effectiveGridVisible: false })
    rerender()
    expect(document.querySelector('.map-grid-adjust-overlay')).toBeNull()
    setData('grid', { effectiveGridVisible: true, effectiveGridEnabled: false })
    rerender()
    expect(document.querySelector('.map-grid-adjust-overlay')).toBeNull()
  })
})

describe('the brush cursor', () => {
  function brushOn() {
    const view = renderTab()
    selectMap('Castle')
    loadMapImage()
    enterRun()
    fireEvent.click(document.querySelector('.map-tools-panel .map-fog-hide-btn') as HTMLElement)
    const canvas = fogCanvas()
    canvas.getBoundingClientRect = () => ({ ...layerRect, width: 400, height: 200 }) as DOMRect
    Object.defineProperty(canvas, 'offsetWidth', { configurable: true, value: 800 })
    Object.defineProperty(canvas, 'offsetHeight', { configurable: true, value: 400 })
    return { canvas, cursor: document.querySelector('.map-brush-cursor') as HTMLElement, rerender: view.rerender }
  }

  it('follows the pointer at the brush size and paints with the fog tools', () => {
    const { canvas, cursor } = brushOn()
    fireEvent.mouseMove(canvas, { clientX: 100, clientY: 50, buttons: 0 })
    expect(cursor.dataset.visible).toBe('true')
    expect(cursor.style.getPropertyValue('--brush-cursor-x')).toBe('200px')
    expect(cursor.style.getPropertyValue('--brush-cursor-y')).toBe('100px')
    expect(cursor.style.width).toBe('250px')
    expect(cursor.style.height).toBe('250px')
    expect(h.fog.handleFogPointerMove).toHaveBeenCalled()
    fireEvent.mouseMove(canvas, { clientX: 900, clientY: -20 })
    expect(cursor.style.getPropertyValue('--brush-cursor-x')).toBe('800px')
    expect(cursor.style.getPropertyValue('--brush-cursor-y')).toBe('0px')
    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 })
    expect(h.fog.handleFogPointerDown).toHaveBeenCalled()
    fireEvent.mouseUp(canvas, { clientX: 10, clientY: 10 })
    expect(h.fog.handleFogPointerUp).toHaveBeenCalledTimes(1)
  })

  it('resizes the cursor when the brush size changes', () => {
    const { canvas, cursor, rerender } = brushOn()
    fireEvent.mouseMove(canvas, { clientX: 100, clientY: 50 })
    setData('fog', { effectiveFogBrushSize: 240 })
    rerender()
    expect(cursor.style.width).toBe('500px')
    fireEvent.click(document.querySelector('.map-tools-panel .map-fog-hide-btn') as HTMLElement)
    setData('fog', { effectiveFogBrushSize: 120 })
    rerender()
    expect(document.querySelector('.map-brush-cursor')).toBeNull()
  })

  it('hides the cursor until the canvas has a size, and on leaving', () => {
    const { canvas, cursor } = brushOn()
    Object.defineProperty(canvas, 'offsetWidth', { configurable: true, value: 0 })
    fireEvent.mouseMove(canvas, { clientX: 100, clientY: 50 })
    expect(cursor.dataset.visible).toBe('false')
    Object.defineProperty(canvas, 'offsetWidth', { configurable: true, value: 800 })
    fireEvent.mouseEnter(canvas, { clientX: 100, clientY: 50 })
    expect(cursor.dataset.visible).toBe('true')
    fireEvent.mouseLeave(canvas, { buttons: 0 })
    expect(cursor.dataset.visible).toBe('false')
    expect(h.fog.pauseFogStroke).toHaveBeenCalled()
    expect(h.fog.handleFogPointerUp).not.toHaveBeenCalled()
  })

  it('ends a stroke whose button was released off the canvas', () => {
    setData('fog', { fogDrawing: true })
    const { canvas } = brushOn()
    fireEvent.mouseMove(canvas, { clientX: 10, clientY: 10, buttons: 0 })
    expect(h.fog.handleFogPointerUp).toHaveBeenCalledTimes(1)
    expect(h.fog.handleFogPointerMove).not.toHaveBeenCalled()
    fireEvent.mouseMove(canvas, { clientX: 10, clientY: 10, buttons: 1 })
    expect(h.fog.handleFogPointerMove).toHaveBeenCalledTimes(1)
    fireEvent.mouseEnter(canvas, { clientX: 10, clientY: 10, buttons: 0 })
    expect(h.fog.handleFogPointerUp).toHaveBeenCalledTimes(2)
    fireEvent.mouseEnter(canvas, { clientX: 10, clientY: 10, buttons: 1 })
    expect(h.fog.handleFogPointerMove).toHaveBeenCalledTimes(2)
    fireEvent.mouseLeave(canvas, { buttons: 0 })
    expect(h.fog.handleFogPointerUp).toHaveBeenCalledTimes(3)
    fireEvent.mouseLeave(canvas, { buttons: 1 })
    expect(h.fog.handleFogPointerUp).toHaveBeenCalledTimes(3)
  })

  it('does not resume a stroke on entering when none is in progress', () => {
    const { canvas } = brushOn()
    fireEvent.mouseEnter(canvas, { clientX: 10, clientY: 10, buttons: 1 })
    expect(h.fog.handleFogPointerMove).not.toHaveBeenCalled()
  })

  it('follows touches and paints with them', () => {
    const { canvas, cursor } = brushOn()
    fireEvent.touchStart(canvas, { touches: [{ clientX: 100, clientY: 50 }] })
    expect(cursor.dataset.visible).toBe('true')
    expect(h.fog.handleFogTouchStart).toHaveBeenCalled()
    fireEvent.touchMove(canvas, { touches: [{ clientX: 120, clientY: 50 }] })
    expect(h.fog.handleFogTouchMove).toHaveBeenCalled()
    fireEvent.touchStart(canvas, { touches: [] })
    fireEvent.touchMove(canvas, { touches: [] })
    expect(h.fog.handleFogTouchStart).toHaveBeenCalledTimes(2)
    fireEvent.touchEnd(canvas)
    expect(cursor.dataset.visible).toBe('false')
    fireEvent.touchCancel(canvas)
    expect(h.fog.handleFogTouchEnd).toHaveBeenCalledTimes(2)
  })

  it('hides the cursor when no brush is active', () => {
    const { canvas } = brushOn()
    fireEvent.click(document.querySelector('.map-tools-panel .map-fog-hide-btn') as HTMLElement)
    expect(document.querySelector('.map-brush-cursor')).toBeNull()
    fireEvent.mouseMove(canvas, { clientX: 100, clientY: 50 })
    expect(h.fog.handleFogPointerMove).toHaveBeenCalled()
  })

  it('treats an unsized fog canvas as not ready', () => {
    renderTab()
    selectMap('Castle')
    enterRun()
    fireEvent.click(document.querySelector('.map-tools-panel .map-fog-hide-btn') as HTMLElement)
    const canvas = fogCanvas()
    canvas.getBoundingClientRect = () => ({ ...layerRect, width: 400, height: 200 }) as DOMRect
    Object.defineProperty(canvas, 'offsetWidth', { configurable: true, value: 800 })
    Object.defineProperty(canvas, 'offsetHeight', { configurable: true, value: 400 })
    fireEvent.mouseMove(canvas, { clientX: 100, clientY: 50 })
    expect((document.querySelector('.map-brush-cursor') as HTMLElement).dataset.visible).toBe('false')
  })

  it('does nothing before the cursor and canvas exist', () => {
    renderTab()
    selectMap('Castle')
    enterRun()
    const canvas = fogCanvas()
    setData('fog', { activeFogCanvasRef: { current: null } })
    fireEvent.click(document.querySelector('.map-tools-panel .map-fog-hide-btn') as HTMLElement)
    fireEvent.mouseMove(canvas, { clientX: 100, clientY: 50 })
    expect((document.querySelector('.map-brush-cursor') as HTMLElement).dataset.visible).toBe('false')
  })
})

describe('placing tokens', () => {
  const mirelda = aPartyCharacter('pc-1', 'Mirelda')
  const osric = aPartyCharacter('pc-2', 'Osric')

  function runWithParty() {
    setData('mapData', { mapCharacters: [mirelda, osric], mapMonsters: [{ id: 'm-1', name: 'Goblin', tokenIcon: { icon: 'pawn', color: '#0a0', size: 30 } }] })
    const view = renderTab()
    selectMap('Castle')
    loadMapImage()
    enterRun()
    return view
  }

  it('places one character where the map is clicked, then stops', async () => {
    runWithParty()
    fireEvent.click(button('Show party token sources'))
    fireEvent.click(within(screen.getByText('Mirelda').closest('.map-placement-row') as HTMLElement).getByText('Place'))
    expect(document.querySelector('.map-placement-active-name')?.textContent).toBe('Mirelda')
    expect(document.querySelector('.map-token-layer.gm')?.className).toBe('map-token-layer gm placing')
    expect(fogCanvas().className).toBe('map-fog-canvas read-only')
    expect(h.args.fog.tokenPlaceMode).toBe(true)
    await act(async () => {
      fireEvent.click(layer(), { button: 0, clientX: 25, clientY: 50 })
    })
    expect(h.mapData.placeQueuedToken).toHaveBeenCalledWith(expect.objectContaining({ name: 'Mirelda', point: { x: 0.25, y: 0.5 } }))
    expect(document.querySelector('.map-placement-active')).toBeNull()
  })

  it('places the whole party one click at a time', async () => {
    runWithParty()
    fireEvent.click(button('Whole Party'))
    expect(document.querySelector('.map-placement-active-meta')?.textContent).toBe('2 left')
    await act(async () => {
      fireEvent.click(layer(), { button: 0, clientX: 10, clientY: 10 })
    })
    expect(document.querySelector('.map-placement-active-name')?.textContent).toBe('Osric')
    await act(async () => {
      fireEvent.click(layer(), { button: 0, clientX: 20, clientY: 10 })
    })
    expect(vi.mocked(h.mapData.placeQueuedToken as () => void).mock.calls.map(([command]) => (command as { name: string }).name)).toEqual(['Mirelda', 'Osric'])
    expect(document.querySelector('.map-placement-active')).toBeNull()
  })

  it('names repeated monsters apart, counting tokens still being saved', async () => {
    setData('mapData', { placeQueuedToken: vi.fn(() => new Promise(() => {})) })
    runWithParty()
    fireEvent.click(button('Show non-party token sources'))
    fireEvent.change(screen.getByLabelText('Select non-party token source'), { target: { value: 'monster:m-1' } })
    fireEvent.click(button('Increase count'))
    fireEvent.click(within(document.querySelector('.map-placement-stage') as HTMLElement).getByText('Place'))
    expect(document.querySelector('.map-placement-active-meta')?.textContent).toBe('2 left')
    await act(async () => {
      fireEvent.click(layer(), { button: 0, clientX: 10, clientY: 10 })
    })
    await act(async () => {
      fireEvent.click(layer(), { button: 0, clientX: 20, clientY: 10 })
    })
    const names = vi.mocked(h.mapData.placeQueuedToken as () => void).mock.calls.map(([command]) => (command as { name: string }).name)
    expect(new Set(names).size).toBe(2)
  })

  it('forgets a token name whose save failed', async () => {
    setData('mapData', { placeQueuedToken: vi.fn(async () => { throw new Error('denied') }) })
    runWithParty()
    fireEvent.click(button('Show party token sources'))
    fireEvent.click(within(screen.getByText('Mirelda').closest('.map-placement-row') as HTMLElement).getByText('Place'))
    await act(async () => {
      fireEvent.click(layer(), { button: 0, clientX: 25, clientY: 50 })
    })
    fireEvent.click(within(screen.getByText('Mirelda').closest('.map-placement-row') as HTMLElement).getByText('Place'))
    await act(async () => {
      fireEvent.click(layer(), { button: 0, clientX: 25, clientY: 50 })
    })
    const names = vi.mocked(h.mapData.placeQueuedToken as () => void).mock.calls.map(([command]) => (command as { name: string }).name)
    expect(names).toEqual(['Mirelda', 'Mirelda'])
  })

  it('cancels a placement, and a tool pick cancels it too', () => {
    runWithParty()
    fireEvent.click(button('Whole Party'))
    fireEvent.click(within(document.querySelector('.map-placement-active') as HTMLElement).getByText('Cancel'))
    expect(document.querySelector('.map-placement-active')).toBeNull()
    fireEvent.click(button('Whole Party'))
    fireEvent.click(document.querySelector('.map-tools-panel .map-fog-hide-btn') as HTMLElement)
    expect(document.querySelector('.map-placement-active')).toBeNull()
  })

  it('places nothing when the click lands off the map', () => {
    runWithParty()
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(() => zeroRect as DOMRect)
    fireEvent.click(button('Whole Party'))
    fireEvent.click(layer(), { button: 0, clientX: 25, clientY: 50 })
    expect(h.mapData.placeQueuedToken).not.toHaveBeenCalled()
  })

  it('ignores the whole party button with no party', () => {
    setData('mapData', { mapCharacters: [] })
    renderTab()
    selectMap('Castle')
    enterRun()
    expect((button('Whole Party') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('clicking the bare map', () => {
  function runCastle() {
    const view = renderTab()
    selectMap('Castle')
    loadMapImage()
    enterRun()
    return view
  }

  it('places a GM note or a player label with the annotation tools', () => {
    runCastle()
    fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Toggle GM notes placement"]') as HTMLElement)
    fireEvent.click(layer(), { button: 0, clientX: 7, clientY: 8 })
    expect(h.mapData.placeAnnotation).toHaveBeenLastCalledWith(7, 8, 'gm')
    fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Toggle player label placement mode"]') as HTMLElement)
    fireEvent.click(layer(), { button: 0, clientX: 9, clientY: 8 })
    expect(h.mapData.placeAnnotation).toHaveBeenLastCalledWith(9, 8, 'player')
  })

  it('hands clicks to the calibration and measuring tools first', () => {
    setData('grid', { gridCalibrateMode: true })
    const { rerender } = runCastle()
    fireEvent.click(layer(), { clientX: 1, clientY: 2 })
    expect(h.grid.handleGridCalibrateClick).toHaveBeenCalledWith(1, 2)
    setData('grid', { gridCalibrateMode: false, gridMeasureMode: true })
    rerender()
    fireEvent.click(layer(), { clientX: 3, clientY: 4 })
    expect(h.grid.handleGridMeasureClick).toHaveBeenCalledWith(3, 4)
  })

  it('deselects the selected tokens on a plain click', () => {
    setData('mapData', { tokens: [aToken({ id: 't1', name: 'Gob', monsterId: 'm' })] })
    runCastle()
    fireEvent.click(screen.getByLabelText('Monsters token 1 name').closest('.token-row') as HTMLElement)
    expect(document.querySelector('.map-token.selected')).toBeTruthy()
    fireEvent.click(layer(), { button: 0 })
    expect(document.querySelector('.map-token.selected')).toBeNull()
    fireEvent.click(layer(), { button: 0 })
    expect(document.querySelector('.map-token.selected')).toBeNull()
  })

  it('ignores clicks on tokens and annotations unless placing', () => {
    setData('mapData', { tokens: [aToken({ id: 't1', name: 'Gob', monsterId: 'm' })] })
    runCastle()
    fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Toggle GM notes placement"]') as HTMLElement)
    fireEvent.click(document.querySelector('.map-token') as HTMLElement, { button: 0 })
    expect(h.mapData.placeAnnotation).not.toHaveBeenCalled()
  })

  it('ignores the bare map for a player', () => {
    setData('mapData', { maps: [castle] })
    renderTab({ role: 'player' })
    selectMap('Castle')
    fireEvent.click(layer(), { button: 0 })
    fireEvent.mouseDown(layer(), { button: 0 })
    expect(h.mapData.placeAnnotation).not.toHaveBeenCalled()
  })

  it('swallows the click that ends a pan', () => {
    runCastle()
    fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Toggle GM notes placement"]') as HTMLElement)
    fireEvent.mouseDown(layer(), { button: 1 })
    fireEvent.click(layer(), { button: 0 })
    expect(h.mapData.placeAnnotation).not.toHaveBeenCalled()
    fireEvent.click(layer(), { button: 0 })
    expect(h.mapData.placeAnnotation).toHaveBeenCalledTimes(1)
  })

  it('ignores a mouse down in the measuring modes and on tokens', () => {
    setData('grid', { gridMeasureMode: true })
    setData('mapData', { tokens: [aToken({ id: 't1', monsterId: 'm' })] })
    const { rerender } = runCastle()
    fireEvent.mouseDown(layer(), { button: 1 })
    setData('grid', { gridMeasureMode: false })
    rerender()
    fireEvent.click(layer(), { clientX: 1, clientY: 1 })
    expect(h.grid.handleGridMeasureClick).not.toHaveBeenCalled()
    fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Toggle token drag-select mode"]') as HTMLElement)
    fireEvent.mouseDown(document.querySelector('.map-token') as HTMLElement, { button: 0 })
    expect(document.querySelector('.map-token-selection-box')).toBeNull()
  })

  it('draws a selection box and selects the tokens inside it', () => {
    setData('mapData', { tokens: [aToken({ id: 'in', x: 0.2, y: 0.2, monsterId: 'm' }), aToken({ id: 'out', x: 0.8, y: 0.8, monsterId: 'm' })] })
    runCastle()
    fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Toggle token drag-select mode"]') as HTMLElement)
    fireEvent.mouseDown(layer(), { button: 0, clientX: 10, clientY: 10 })
    expect(document.querySelector('.map-token-selection-box')).toBeTruthy()
    fireEvent.mouseMove(window, { clientX: 40, clientY: 30 })
    const box = document.querySelector('.map-token-selection-box') as HTMLElement
    expect([box.style.left, box.style.top, box.style.width, box.style.height].map((value) => Math.round(Number.parseFloat(value)))).toEqual([10, 10, 30, 20])
    fireEvent.mouseUp(window, { clientX: 40, clientY: 30 })
    expect(document.querySelector('.map-token-selection-box')).toBeNull()
    expect(Array.from(document.querySelectorAll('.map-token.selected'))).toHaveLength(1)
    fireEvent.click(layer(), { button: 0 })
    expect(Array.from(document.querySelectorAll('.map-token.selected'))).toHaveLength(1)
  })

  it('clears the selection with a box too small to hold anything', () => {
    setData('mapData', { tokens: [aToken({ id: 'in', x: 0.2, y: 0.2, monsterId: 'm' })] })
    runCastle()
    fireEvent.click(screen.getByLabelText('Monsters token 1 name').closest('.token-row') as HTMLElement)
    fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Toggle token drag-select mode"]') as HTMLElement)
    fireEvent.mouseDown(layer(), { button: 0, clientX: 10, clientY: 10 })
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(() => zeroRect as DOMRect)
    fireEvent.mouseMove(window, { clientX: 40, clientY: 30 })
    fireEvent.mouseUp(window, { clientX: 10, clientY: 10 })
    expect(document.querySelector('.map-token.selected')).toBeNull()
  })

  it('starts no selection box off the map', () => {
    runCastle()
    fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Toggle token drag-select mode"]') as HTMLElement)
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(() => zeroRect as DOMRect)
    fireEvent.mouseDown(layer(), { button: 0, clientX: 10, clientY: 10 })
    expect(document.querySelector('.map-token-selection-box')).toBeNull()
  })
})

describe('GM tokens', () => {
  const gob = aToken({ id: 'gob', name: ' Gob ', monsterId: 'm', x: 0.25, y: 0.75, color: '#ff0000', rotationDeg: 450, flipHorizontal: true })
  const crate = aToken({ id: 'crate', name: '', hidden: true, revealName: true, tokenImageUrl: 'https://img.test/crate.png', size: 40, sizeScale: 0.5 })

  function runWithTokens() {
    setData('mapData', { tokens: [gob, crate] })
    const view = renderTab()
    selectMap('Castle')
    loadMapImage()
    enterRun()
    return view
  }

  function gmToken(index: number) {
    return document.querySelectorAll<HTMLElement>('.map-token-layer.gm .map-token')[index]
  }

  it('draws each token at its position with its name, glyph and state', () => {
    runWithTokens()
    expect(gmToken(0).className).toBe('map-token')
    expect([gmToken(0).style.left, gmToken(0).style.top, gmToken(0).style.color]).toEqual(['25%', '75%', 'rgb(255, 0, 0)'])
    expect((gmToken(0).querySelector('.map-token-glyph') as HTMLElement).style.transform).toBe('rotate(90deg) scale(-1, 1)')
    expect(gmToken(0).querySelector('.map-token-name')?.textContent).toBe('Gob')
    expect(gmToken(0).querySelector('.map-token-name')?.className).toBe('map-token-name gm-hover-only')
    expect(gmToken(0).querySelector('.map-token-hidden-badge')).toBeNull()
    expect(gmToken(1).className).toBe('map-token gm-hidden-token')
    expect(gmToken(1).querySelector('.map-token-name')?.textContent).toBe('Token 2')
    expect(gmToken(1).querySelector('.map-token-name')?.className).toBe('map-token-name')
    expect(gmToken(1).querySelector('.map-token-hidden-badge')?.textContent).toBe('H')
    expect(gmToken(1).querySelector('img.map-token-image')?.getAttribute('src')).toBe('https://img.test/crate.png')
    const nameStyle = (gmToken(0).querySelector('.map-token-name') as HTMLElement).style
    expect([nameStyle.fontSize, nameStyle.transform]).toEqual(['10px', 'translate(-50%, 8px)'])
  })

  it('draws dragged and animated tokens at their live positions', () => {
    setData('drag', { dragTokenPositions: { gob: { x: 0.5, y: 0.5 } } })
    setData('animation', { animatedTokenPositions: { gob: { x: 0.1, y: 0.1 }, crate: { x: 0.3, y: 0.4 } } })
    runWithTokens()
    expect(gmToken(0).className).toBe('map-token dragging')
    expect(gmToken(0).style.left).toBe('50%')
    expect(gmToken(1).className).toBe('map-token animating gm-hidden-token')
    expect(gmToken(1).style.top).toBe('40%')
  })

  it('drags a token, dropping any annotation tool, but not while placing', () => {
    setData('mapData', { mapCharacters: [aPartyCharacter('pc-1', 'Mirelda')] })
    runWithTokens()
    fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Toggle GM notes placement"]') as HTMLElement)
    fireEvent.mouseDown(gmToken(0))
    expect(h.drag.startTokenDrag).toHaveBeenCalledWith('gob', expect.anything())
    expect(h.args.viewport.annotationPlaceMode).toBe(false)
    fireEvent.touchStart(gmToken(0))
    expect(h.drag.handleTokenTouchStart).toHaveBeenCalledWith('gob', expect.anything())
    fireEvent.touchEnd(gmToken(0))
    fireEvent.touchCancel(gmToken(0))
    expect(h.drag.handleTokenTouchEnd).toHaveBeenCalledTimes(2)
    fireEvent.click(button('Whole Party'))
    fireEvent.mouseDown(gmToken(0))
    fireEvent.touchStart(gmToken(0))
    expect(h.drag.startTokenDrag).toHaveBeenCalledTimes(1)
    expect(h.drag.handleTokenTouchStart).toHaveBeenCalledTimes(1)
  })

  it('keeps an annotation tool other than placement while dragging', () => {
    runWithTokens()
    fireEvent.click(document.querySelector('.map-tools-panel .map-fog-hide-btn') as HTMLElement)
    fireEvent.mouseDown(gmToken(0))
    expect(h.args.fog.fogTool).toBe('hide')
  })

  it('hides and shows a token from its badge by click or key', () => {
    runWithTokens()
    const hide = within(gmToken(0)).getByLabelText('Hide token')
    expect(hide.getAttribute('title')).toBe('Hide token')
    expect(fireEvent.mouseDown(hide)).toBe(false)
    expect(h.drag.startTokenDrag).not.toHaveBeenCalled()
    fireEvent.click(hide)
    expect(h.mapData.toggleTokenHidden).toHaveBeenCalledWith('gob')
    fireEvent.keyDown(within(gmToken(1)).getByLabelText('Show token'), { key: 'Enter' })
    fireEvent.keyDown(within(gmToken(1)).getByLabelText('Show token'), { key: ' ' })
    fireEvent.keyDown(within(gmToken(1)).getByLabelText('Show token'), { key: 'a' })
    expect(vi.mocked(h.mapData.toggleTokenHidden as () => void).mock.calls).toEqual([['gob'], ['crate'], ['crate']])
  })

  it('marks the selected tokens', () => {
    runWithTokens()
    fireEvent.click(screen.getByLabelText('Monsters token 1 name').closest('.token-row') as HTMLElement)
    expect(gmToken(0).className).toBe('map-token selected')
  })

  it('names tokens for the player view preview', () => {
    runWithTokens()
    fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Toggle player view preview"]') as HTMLElement)
    expect(document.querySelector('.map-token-layer.gm')).toBeNull()
  })

  it('sizes and rotates token glyphs from the map size', () => {
    runWithTokens()
    const image = gmToken(1).querySelector('img') as HTMLImageElement
    expect(image.style.width).not.toBe('')
    expect(image.getAttribute('draggable')).toBe('false')
  })
})

describe('player tokens', () => {
  const scout = aToken({ id: 'scout', name: 'Scout', party: true, revealName: true, x: 0.2, y: 0.2 })
  const ghoul = aToken({ id: 'ghoul', name: 'Ghoul', monsterId: 'm', x: 0.6, y: 0.6 })
  const secret = aToken({ id: 'secret', name: 'Secret', hidden: true })

  function renderPlayer(maps = [castle]) {
    setData('mapData', { maps, tokens: [scout, ghoul, secret] })
    const view = renderTab({ role: 'player' })
    selectMap('Castle')
    loadMapImage()
    return view
  }

  it('draws party tokens over the fog and others under it, never hidden ones', () => {
    renderPlayer()
    const under = document.querySelector('[aria-label="Map tokens under fog"]') as HTMLElement
    const over = document.querySelector('[aria-label="Map party tokens"]') as HTMLElement
    expect(Array.from(under.querySelectorAll('.map-token')).map((token) => token.getAttribute('aria-label'))).toEqual(['Ghoul'])
    expect(Array.from(over.querySelectorAll('.map-token')).map((token) => token.getAttribute('aria-label'))).toEqual(['Scout'])
    expect(over.querySelector('.map-token')?.className).toBe('map-token player')
    expect(over.querySelector('.map-token-name')?.textContent).toBe('Scout')
    expect(under.querySelector('.map-token-name')).toBeNull()
    expect(document.querySelector('.map-token-layer.gm')).toBeNull()
  })

  it('hides tokens under unrevealed fog on a fully hidden map', () => {
    setData('fog', { activeFogCanvasRef: { current: null } })
    renderPlayer([{ ...castle, fullyHidden: true }])
    expect(document.querySelector('[aria-label="Map tokens under fog"] .map-token')).toBeNull()
  })

  it('reads the fog canvas to decide what a player can see', () => {
    const alpha = { value: 255 }
    const context = { getImageData: () => ({ data: [0, 0, 0, alpha.value] }) }
    setData('fog', { activeFogCanvasRef: { current: { width: 100, height: 100, getContext: () => context } } })
    const { rerender } = renderPlayer([{ ...castle, fullyHidden: true }])
    expect(document.querySelector('[aria-label="Map tokens under fog"] .map-token')).toBeNull()
    alpha.value = 0
    rerender()
    expect(document.querySelector('[aria-label="Map tokens under fog"] .map-token')).toBeTruthy()
  })

  it('selects a token on click, and never drags it', () => {
    renderPlayer()
    const token = document.querySelector('[aria-label="Map party tokens"] .map-token') as HTMLElement
    fireEvent.mouseDown(token)
    fireEvent.touchStart(token)
    expect(h.drag.startTokenDrag).not.toHaveBeenCalled()
    expect(h.drag.handleTokenTouchStart).not.toHaveBeenCalled()
    fireEvent.click(token)
    expect(document.querySelector('[aria-label="Map party tokens"] .map-token')?.className).toBe('map-token player selected')
  })

  it('draws live positions for players too', () => {
    setData('drag', { dragTokenPositions: { scout: { x: 0.9, y: 0.9 } } })
    setData('animation', { animatedTokenPositions: { ghoul: { x: 0.4, y: 0.4 } } })
    renderPlayer()
    const over = document.querySelector('[aria-label="Map party tokens"] .map-token') as HTMLElement
    const under = document.querySelector('[aria-label="Map tokens under fog"] .map-token') as HTMLElement
    expect(over.style.left).toBe('90%')
    expect(under.className).toBe('map-token player animating')
    expect(under.style.left).toBe('40%')
  })

  it('lets the GM drag tokens in the player view preview, without selecting them', () => {
    setData('mapData', { tokens: [scout, ghoul] })
    renderTab()
    selectMap('Castle')
    loadMapImage()
    enterRun()
    fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Toggle player view preview"]') as HTMLElement)
    const token = document.querySelector('[aria-label="Map party tokens"] .map-token') as HTMLElement
    fireEvent.mouseDown(token)
    expect(h.drag.startTokenDrag).toHaveBeenCalledWith('scout', expect.anything())
    fireEvent.touchStart(token)
    expect(h.drag.handleTokenTouchStart).toHaveBeenCalledWith('scout', expect.anything())
    fireEvent.touchEnd(token)
    expect(h.drag.handleTokenTouchEnd).toHaveBeenCalled()
    fireEvent.click(token)
    expect(token.className).toBe('map-token player')
  })

  it('does not drag preview tokens while placing', () => {
    setData('mapData', { tokens: [scout], mapCharacters: [aPartyCharacter('pc-1', 'Mirelda')] })
    renderTab()
    selectMap('Castle')
    loadMapImage()
    enterRun()
    fireEvent.click(button('Whole Party'))
    fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Toggle player view preview"]') as HTMLElement)
    const token = document.querySelector('[aria-label="Map party tokens"] .map-token') as HTMLElement
    expect(document.querySelector('[aria-label="Map party tokens"]')?.className).toBe('map-token-layer player-over-fog placing')
    expect(document.querySelector('[aria-label="Map tokens under fog"]')?.className).toBe('map-token-layer under-fog placing')
    fireEvent.mouseDown(token)
    fireEvent.touchStart(token)
    expect(h.drag.startTokenDrag).not.toHaveBeenCalled()
    expect(h.drag.handleTokenTouchStart).not.toHaveBeenCalled()
  })

  it('previews the player view for the GM in map preview', () => {
    setData('mapData', { tokens: [scout, secret] })
    renderTab()
    selectMap('Castle')
    loadMapImage()
    expect(document.querySelector('[aria-label="Map party tokens"] .map-token')?.getAttribute('aria-label')).toBe('Scout')
    expect(fogCanvas().style.opacity).toBe('1')
  })
})

describe('annotations', () => {
  const note = { id: 'n1', x: 0.1, y: 0.1, text: 'Trap', kind: 'gm' as const, hidden: false, pointerDirection: 'up' as const }
  const label = { id: 'l1', x: 0.2, y: 0.2, text: 'Inn', kind: 'player' as const, hidden: false, pointerDirection: 'down' as const }
  const hiddenLabel = { ...label, id: 'l2', hidden: true }

  it('shows the GM every annotation, and players only the shown player labels', () => {
    setData('mapData', { annotations: [note, label, hiddenLabel] })
    renderTab()
    selectMap('Castle')
    loadMapImage()
    enterRun()
    const gmCount = document.querySelectorAll('.map-annotation-btn, .map-player-label-btn, .map-player-label-static').length
    expect(gmCount).toBe(3)
    fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Toggle player view preview"]') as HTMLElement)
    expect(document.querySelectorAll('.map-annotation-btn, .map-player-label-btn, .map-player-label-static').length).toBe(1)
    expect(h.mapData.setActiveAnnotationId).toHaveBeenCalledWith('')
  })

  it('shows players the shown player labels and nothing when there are none', () => {
    setData('mapData', { maps: [castle], annotations: [note, label, hiddenLabel] })
    const { rerender } = renderTab({ role: 'player' })
    selectMap('Castle')
    expect(document.querySelectorAll('.map-annotation-btn, .map-player-label-btn, .map-player-label-static').length).toBe(1)
    setData('mapData', { annotations: [note] })
    rerender()
    expect(document.querySelector('.map-annotation-layer, .map-annotations')).toBeNull()
  })

  it('commits the open annotation on a pointer down outside it', () => {
    setData('mapData', { annotations: [note], activeAnnotationId: 'n1', activeAnnotationDraft: 'Trap!' })
    renderTab()
    selectMap('Castle')
    fireEvent.pointerDown(document.body)
    expect(h.mapData.commitActiveAnnotation).toHaveBeenCalledTimes(1)
    expect(h.mapData.setActiveAnnotationId).toHaveBeenLastCalledWith('')
    const popover = document.createElement('div')
    popover.className = 'map-annotation-popover'
    document.body.appendChild(popover)
    fireEvent.pointerDown(popover)
    expect(h.mapData.commitActiveAnnotation).toHaveBeenCalledTimes(1)
    popover.remove()
  })

  it('autosizes the annotation editor to its text within the viewport', () => {
    setData('mapData', { annotations: [note], activeAnnotationId: 'n1', activeAnnotationDraft: 'Trap' })
    renderTab()
    selectMap('Castle')
    loadMapImage()
    enterRun()
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement
    expect(textarea.style.width).toBe('168px')
    expect(textarea.style.height).toBe('56px')
    expect(textarea.style.overflowY).toBe('hidden')
  })
})

describe('the Escape key', () => {
  it('drops the tool, the placement and the selection box, but not inside a text field', () => {
    setData('mapData', { mapCharacters: [aPartyCharacter('pc-1', 'Mirelda')] })
    renderTab()
    selectMap('Castle')
    loadMapImage()
    enterRun()
    fireEvent.click(document.querySelector('.map-tools-panel .map-fog-hide-btn') as HTMLElement)
    const input = document.createElement('input')
    document.body.appendChild(input)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(h.args.fog.fogTool).toBe('hide')
    input.remove()
    fireEvent.keyDown(window, { key: 'a' })
    expect(h.args.fog.fogTool).toBe('hide')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(h.args.fog.fogTool).toBeNull()
    fireEvent.click(button('Whole Party'))
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(document.querySelector('.map-placement-active')).toBeNull()
  })

  it('closes an open measuring mode', () => {
    setData('grid', { gridMeasureMode: true })
    renderTab()
    selectMap('Castle')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(h.grid.toggleGridMeasureMode).toHaveBeenCalled()
  })

  it('is left alone for players', () => {
    setData('grid', { gridMeasureMode: true })
    renderTab({ role: 'player' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(h.grid.toggleGridMeasureMode).not.toHaveBeenCalled()
  })
})

describe('the GM controls wiring', () => {
  const gob = aToken({ id: 'gob', name: 'Gob', monsterId: 'm', party: true })
  const ada = anNpc({ id: 'ada', name: 'Ada' })
  const bo = anNpc({ id: 'bo', name: 'Bo' })

  function runWith(maps = [{ ...castle, sceneNpcIds: ['ada'], presentedNpcId: 'ada' }, cave, sketch]) {
    setData('mapData', { maps, tokens: [gob], mapNpcs: [ada, bo] })
    renderTab()
    selectMap('Castle')
    enterRun()
  }

  it('saves a token size and view distance with their scales, updating the token at once', async () => {
    runWith()
    fireEvent.click(screen.getByLabelText('Party token 1 name').closest('.token-row') as HTMLElement)
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Selected token size'), { target: { value: '56' } })
    })
    expect(h.mapData.updateToken).toHaveBeenCalledWith('gob', { size: 56, sizeScale: 56 / 900 })
    const update = vi.mocked(h.mapData.setTokens as () => void).mock.calls[0][0] as unknown as (tokens: unknown[]) => unknown[]
    expect(update([gob, aToken({ id: 'other' })])).toEqual([{ ...gob, size: 56, sizeScale: 56 / 900 }, aToken({ id: 'other' })])
    await act(async () => {
      fireEvent.change(document.querySelector('.token-group-view-distance input') as HTMLElement, { target: { value: '100' } })
    })
    expect(h.mapData.updateToken).toHaveBeenCalledWith('gob', { viewDistance: 100, viewDistanceScale: 100 / 900 })
    const viewUpdate = vi.mocked(h.mapData.setTokens as () => void).mock.calls[1][0] as unknown as (tokens: unknown[]) => unknown[]
    expect(viewUpdate([gob, aToken({ id: 'other' })])).toEqual([{ ...gob, viewDistance: 100, viewDistanceScale: 100 / 900 }, aToken({ id: 'other' })])
  })

  it('adds and removes scene NPCs, and presents and clears one', () => {
    runWith()
    fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Toggle scene NPC panel"]') as HTMLElement)
    fireEvent.click(button('Preload'))
    expect(h.mapData.updateSceneNpcIds).toHaveBeenLastCalledWith(['ada', 'bo'])
    fireEvent.click(screen.getByLabelText('Remove from scene NPCs'))
    expect(h.mapData.updateSceneNpcIds).toHaveBeenLastCalledWith([])
    fireEvent.click(screen.getByLabelText('Hide presented NPC'))
    expect(h.mapData.setPresentedNpcId).toHaveBeenLastCalledWith('')
  })

  it('does not add a scene NPC twice, and presents one', () => {
    runWith([{ ...castle, sceneNpcIds: [] }, cave, sketch])
    fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Toggle scene NPC panel"]') as HTMLElement)
    fireEvent.click(button('Preload'))
    expect(h.mapData.updateSceneNpcIds).toHaveBeenLastCalledWith(['ada'])
    expect(screen.getByText('No NPCs preloaded for this map.')).toBeTruthy()
  })

  it('presents a scene NPC from its row', () => {
    runWith([{ ...castle, sceneNpcIds: ['bo'] }, cave, sketch])
    fireEvent.click(document.querySelector('.map-tools-panel [aria-label="Toggle scene NPC panel"]') as HTMLElement)
    fireEvent.click(screen.getByLabelText('Present NPC'))
    expect(h.mapData.setPresentedNpcId).toHaveBeenLastCalledWith('bo')
  })

  it('passes the token asset and placement data through', () => {
    setData('mapData', { selectedTokenAsset: { imageUrl: 'https://img.test/asset.png' }, tokenAssets: [{ id: 'a1', name: 'Crate', imagePath: 'p', imageUrl: 'u', width: 1, height: 1, archived: false }, { id: 'a2', name: 'Old', imagePath: 'p', imageUrl: 'u', width: 1, height: 1, archived: true }] })
    renderTab()
    selectMap('Castle')
    enterRun()
    fireEvent.click(button('Show non-party token sources'))
    expect(Array.from((screen.getByLabelText('Select non-party token source') as HTMLSelectElement).options).map((option) => option.textContent)).toEqual(['Choose a source', 'Generic asset...', 'Crate'])
  })

  it('forgets a selected token asset that no longer exists', () => {
    setData('mapData', { selectedTokenAssetId: 'gone', tokenAssets: [] })
    renderTab()
    expect(h.mapData.setSelectedTokenAssetId).toHaveBeenCalledWith('')
  })

  it('keeps a selected token asset that exists', () => {
    setData('mapData', { selectedTokenAssetId: 'a1', tokenAssets: [{ id: 'a1', name: 'Crate', imagePath: 'p', imageUrl: 'u', width: 1, height: 1, archived: false }] })
    renderTab()
    expect(h.mapData.setSelectedTokenAssetId).not.toHaveBeenCalled()
  })
})

describe('the GM character sheets', () => {
  const mirelda = aPartyCharacter('c1', 'Mirelda', { tokenIcon: { icon: 'custom', color: '#123456', size: 30, customImageUrl: 'https://img.test/mirelda.png' } })
  const osric = aPartyCharacter('c2', 'Osric')
  const stored = [
    { id: 'c1', name: 'Mirelda', ownerUserId: 'p1', creationStatus: 'active', hpCurrent: 5 },
    { id: 'c2', name: 'Osric', ownerUserId: 'p2', creationStatus: 'active', hpCurrent: 5 },
    { id: 'c3', name: '', ownerUserId: 'p3', creationStatus: 'active', hpCurrent: 5 },
  ]

  function characterTabProps() {
    return { characters: stored, setSelectedCharacterId: vi.fn() } as unknown as TabOptions['characterTabProps']
  }

  it('offers a tab per party character in run, and opens each sheet', () => {
    setData('mapData', { mapCharacters: [osric, mirelda] })
    const props = characterTabProps()
    renderTab({ characterTabProps: props })
    selectMap('Castle')
    enterRun()
    const tabs = screen.getByRole('tablist', { name: 'GM map workspace views' })
    expect(Array.from(tabs.querySelectorAll('button')).map((tab) => tab.textContent)).toEqual(['Map', 'Osric', 'Mirelda', 'Unnamed'])
    expect(tabs.querySelectorAll('button')[0].className).toBe('map-gm-character-tab active')
    expect(tabs.querySelector('img')?.getAttribute('src')).toBe('https://img.test/mirelda.png')
    expect((tabs.querySelectorAll('.map-gm-character-tab-icon')[0] as HTMLElement).style.color).toBe('rgb(34, 102, 51)')
    expect((tabs.querySelectorAll('.map-gm-character-tab-icon')[2] as HTMLElement).style.color).toBe('rgb(180, 83, 9)')
    fireEvent.click(within(tabs).getByText('Mirelda'))
    expect(props?.setSelectedCharacterId).toHaveBeenCalledWith('c1')
    expect(screen.getByTestId('character-tab').textContent).toBe('Mirelda')
    expect(document.querySelector('.maps-main')?.className).toContain('maps-main-hidden')
    expect(within(tabs).getByText('Mirelda').closest('button')?.getAttribute('aria-selected')).toBe('true')
    fireEvent.click(within(tabs).getByText('Map'))
    expect(screen.queryByTestId('character-tab')).toBeNull()
  })

  it('offers no character tabs without party characters', () => {
    renderTab({ characterTabProps: { characters: [], setSelectedCharacterId: vi.fn() } as unknown as TabOptions['characterTabProps'] })
    selectMap('Castle')
    enterRun()
    expect(screen.queryByRole('tablist', { name: 'GM map workspace views' })).toBeNull()
  })

  it('pages through the sheets on a phone', () => {
    setData('mapData', { mapCharacters: [mirelda, osric] })
    const props = characterTabProps()
    renderTab({ width: 600, characterTabProps: props })
    selectMap('Castle')
    fireEvent.click(button('Character sheets'))
    expect(document.querySelector('.map-mobile-character-pager span')?.textContent).toBe('Mirelda')
    fireEvent.click(button('Next character sheet'))
    expect(document.querySelector('.map-mobile-character-pager span')?.textContent).toBe('Osric')
    fireEvent.click(button('Next character sheet'))
    fireEvent.click(button('Next character sheet'))
    expect(document.querySelector('.map-mobile-character-pager span')?.textContent).toBe('Mirelda')
    fireEvent.click(button('Previous character sheet'))
    expect(document.querySelector('.map-mobile-character-pager span')?.textContent).toBe('Character Sheets')
    expect(screen.getByTestId('character-tab').getAttribute('data-embedded')).toBe('true')
  })

  it('opens the first sheet from the phone nav when none is chosen', () => {
    setData('mapData', { mapCharacters: [mirelda] })
    const props = characterTabProps()
    renderTab({ width: 600, characterTabProps: props })
    selectMap('Castle')
    fireEvent.click(button('Character sheets'))
    expect(props?.setSelectedCharacterId).not.toHaveBeenCalled()
    fireEvent.click(button('Map pane'))
    fireEvent.click(button('Character sheets'))
    expect(document.querySelector('.map-mobile-character-pane')).toBeTruthy()
  })

  it('says when there are no sheets on a phone', () => {
    renderTab({ width: 600, characterTabProps: { characters: [], setSelectedCharacterId: vi.fn() } as unknown as TabOptions['characterTabProps'] })
    selectMap('Castle')
    fireEvent.click(button('Character sheets'))
    expect(screen.getByText('No character sheets available.')).toBeTruthy()
    expect((button('Next character sheet') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(button('Next character sheet'))
  })

  it('says when no sheet is selected on the desktop', () => {
    setData('mapData', { mapCharacters: [mirelda] })
    renderTab({ characterTabProps: { characters: [stored[0]], setSelectedCharacterId: vi.fn() } as unknown as TabOptions['characterTabProps'] })
    selectMap('Castle')
    enterRun()
    fireEvent.click(within(screen.getByRole('tablist', { name: 'GM map workspace views' })).getByText('Mirelda'))
    expect(screen.getByTestId('character-tab')).toBeTruthy()
  })
})

describe('the player panes', () => {
  function characterTabProps() {
    return { characters: [{ id: 'c1', name: 'Mirelda', ownerUserId: 'player-1' }], setSelectedCharacterId: vi.fn() } as unknown as TabOptions['characterTabProps']
  }

  it('switches a player between the map and their character sheet', () => {
    setData('mapData', { maps: [castle] })
    renderTab({ role: 'player', characterTabProps: characterTabProps() })
    const nav = screen.getByRole('tablist', { name: 'Player map views' })
    expect(within(nav).getByLabelText('Show map').className).toBe('active')
    expect(document.querySelector('.map-controls .player-map-controls, .map-controls')).toBeTruthy()
    fireEvent.click(within(nav).getByLabelText('Show character sheet'))
    expect(within(nav).getByLabelText('Show character sheet').className).toBe('active')
    expect(screen.getByTestId('character-tab').getAttribute('data-embedded')).toBe('true')
    expect(document.querySelector('.maps-main')?.className).toBe('maps-main player maps-main-hidden')
    fireEvent.click(within(nav).getByLabelText('Show map'))
    expect(screen.queryByTestId('character-tab')).toBeNull()
  })

  it('shows a player without a sheet only the map', () => {
    setData('mapData', { maps: [castle] })
    renderTab({ role: 'player' })
    expect(screen.queryByRole('tablist', { name: 'Player map views' })).toBeNull()
    expect(document.querySelector('.maps-main')?.className).toBe('maps-main player')
  })

  it('moves a player on a phone between the list, the map, the controls and the sheet', () => {
    setData('mapData', { maps: [castle] })
    renderTab({ role: 'player', width: 600, characterTabProps: characterTabProps() })
    expect(document.querySelector('.maps-sidebar')).toBeTruthy()
    expect(document.querySelector('.maps-content-shell')).toBeNull()
    selectMap('Castle')
    expect(document.querySelector('.maps-sidebar')).toBeNull()
    expect(document.querySelector('.maps-main')?.className).toBe('maps-main player mobile-player')
    expect(document.querySelector('.map-stage')?.className).toBe('map-stage mobile-player-stage')
    expect(layer().className).toBe('map-zoom-layer mobile-player-zoom')
    expect(document.querySelector('aside.map-controls')).toBeNull()
    fireEvent.click(button('Controls pane'))
    expect(document.querySelector('aside.map-controls')).toBeTruthy()
    expect(document.querySelector('.map-stage')).toBeNull()
    fireEvent.click(button('Character pane'))
    expect(screen.getByTestId('character-tab')).toBeTruthy()
    fireEvent.click(button('Back to map list'))
    expect(document.querySelector('.maps-sidebar')).toBeTruthy()
  })

  it('locks the camera from the player controls', () => {
    setData('mapData', { maps: [castle] })
    renderTab({ role: 'player' })
    const controls = document.querySelector('aside.map-controls') as HTMLElement
    fireEvent.click(within(controls).getAllByRole('button')[0])
    expect(h.viewport.toggleCameraLock).toHaveBeenCalled()
  })
})

describe('the GM on a phone', () => {
  it('moves between the list, the map and the token panel', () => {
    renderTab({ width: 600 })
    selectMap('Castle')
    expect(document.querySelector('.maps-main')?.className).toBe('maps-main gm mobile-gm')
    expect(document.querySelector('.map-tools-panel')).toBeTruthy()
    expect(document.querySelector('.map-stage')?.className).toBe('map-stage mobile-player-stage')
    expect(h.args.viewport.isMobileZoomMapView).toBe(true)
    fireEvent.click(button('Token panel'))
    expect(document.querySelector('aside.map-controls .map-controls-body')).toBeTruthy()
    expect(document.querySelector('aside.map-controls .map-tools-panel')).toBeNull()
    expect(document.querySelector('.map-stage')).toBeNull()
    expect(h.args.viewport.isMobileZoomMapView).toBe(false)
    fireEvent.click(button('Map pane'))
    expect(document.querySelector('.map-stage')).toBeTruthy()
  })

  it('offers the blank map drawing toolbar only on the map pane', () => {
    renderTab({ width: 600 })
    selectMap('Sketch')
    expect(screen.getByText('Edit drawing')).toBeTruthy()
    fireEvent.click(button('Token panel'))
    expect(screen.queryByText('Edit drawing')).toBeNull()
  })
})

describe('the dialogs', () => {
  it('crops a token image, zooming, cancelling and applying', () => {
    setData('assets', { tokenImageDraft: { imageUrl: 'https://img.test/draft.png', focusX: 30, focusY: 60, zoom: 1.5 } })
    renderTab()
    const dialog = screen.getByRole('dialog', { name: 'Adjust token image' })
    const image = dialog.querySelector('img') as HTMLImageElement
    expect([image.style.objectPosition, image.style.transform]).toEqual(['30% 60%', 'scale(1.5)'])
    fireEvent.click(within(dialog).getByLabelText('Zoom out token crop'))
    expect(h.assets.adjustTokenImageDraftZoom).toHaveBeenLastCalledWith(-0.2)
    fireEvent.click(within(dialog).getByLabelText('Zoom in token crop'))
    expect(h.assets.adjustTokenImageDraftZoom).toHaveBeenLastCalledWith(0.2)
    fireEvent.click(within(dialog).getByLabelText('Cancel token image crop'))
    expect(h.assets.setTokenImageDraft).toHaveBeenCalledWith(null)
    fireEvent.click(within(dialog).getByLabelText('Apply token image crop'))
    expect(h.assets.applyTokenImageDraft).toHaveBeenCalled()
    const zone = dialog.querySelector('.monster-portrait-drag-zone') as HTMLElement
    fireEvent.pointerDown(zone)
    fireEvent.pointerMove(zone)
    fireEvent.pointerUp(zone)
    fireEvent.pointerCancel(zone)
    expect(h.assets.handleTokenImageDraftDragStart).toHaveBeenCalled()
    expect(h.assets.handleTokenImageDraftDragMove).toHaveBeenCalled()
    expect(h.assets.clearTokenImageDraftDrag).toHaveBeenCalledTimes(2)
  })

  it('confirms deleting a map', () => {
    setData('mapData', { deleteCandidate: cave })
    const { rerender } = renderTab()
    const dialog = screen.getByText('Delete Map?').closest('.confirm-modal') as HTMLElement
    expect(dialog.textContent).toContain('Permanently remove "Cave" from this campaign?')
    fireEvent.click(within(dialog).getByText('Delete'))
    expect(h.mapData.deleteMap).toHaveBeenCalled()
    fireEvent.click(within(dialog).getByText('Cancel'))
    expect(h.mapData.setDeleteCandidate).toHaveBeenCalledWith(null)
    setData('mapData', { deletingMapId: 'cave' })
    rerender()
    expect((screen.getByText('Deleting...') as HTMLButtonElement).disabled).toBe(true)
  })

  it('confirms deleting one token or several', () => {
    setData('mapData', { tokenDeleteCandidate: [aToken({ id: 't1', name: '' })] })
    const { rerender } = renderTab()
    expect(screen.getByText('Delete Token?')).toBeTruthy()
    expect(screen.getByText('Permanently remove "Token" from the map?')).toBeTruthy()
    setData('mapData', { tokenDeleteCandidate: [aToken({ id: 't1', name: 'Gob' }), aToken({ id: 't2', name: '' })] })
    rerender()
    expect(screen.getByText('Delete Tokens?')).toBeTruthy()
    expect(screen.getByText('Permanently remove 2 tokens: "Gob", "Token" from the map?')).toBeTruthy()
    const dialog = screen.getByText('Delete Tokens?').closest('.confirm-modal') as HTMLElement
    fireEvent.click(within(dialog).getByText('Delete'))
    expect(h.mapData.confirmDeleteToken).toHaveBeenCalled()
    fireEvent.click(within(dialog).getByText('Cancel'))
    expect(h.mapData.setTokenDeleteCandidate).toHaveBeenCalledWith(null)
    setData('mapData', { tokenDeleteCandidate: [], deletingTokenId: 't1' })
    rerender()
    expect(screen.getByText('Permanently remove this token from the map?')).toBeTruthy()
    expect(screen.getByText('Delete Token?')).toBeTruthy()
    expect((screen.getByText('Deleting...') as HTMLButtonElement).disabled).toBe(true)
  })

  it('confirms deleting a token icon', () => {
    setData('mapData', { tokenAssetDeleteCandidate: { name: 'Crate' } })
    const { rerender } = renderTab()
    const dialog = screen.getByText('Delete Token Icon?').closest('.confirm-modal') as HTMLElement
    expect(dialog.textContent).toContain('Permanently remove "Crate" from token icons?')
    fireEvent.click(within(dialog).getByText('Delete'))
    expect(h.mapData.confirmDeleteTokenAsset).toHaveBeenCalled()
    fireEvent.click(within(dialog).getByText('Cancel'))
    expect(h.mapData.setTokenAssetDeleteCandidate).toHaveBeenCalledWith(null)
    setData('mapData', { deletingTokenAssetId: 'a1' })
    rerender()
    expect((screen.getByText('Deleting...') as HTMLButtonElement).disabled).toBe(true)
  })

  it('alerts on an encounter from token movement, and dismisses it', () => {
    renderTab()
    selectMap('Castle')
    const onMovementFeet = h.args.drag.onMovementFeet as (feet: number) => void
    act(() => {
      for (let step = 0; step < 200; step += 1) onMovementFeet(30)
    })
    const alert = screen.getByRole('dialog', { name: 'Encounter alert' })
    expect(alert.textContent).toContain('You encounter a monster!')
    expect(alert.textContent).toContain('Test chance: 1 in 6.')
    fireEvent.click(within(alert).getByText('Continue'))
    expect(screen.queryByRole('dialog', { name: 'Encounter alert' })).toBeNull()
  })
})

describe('what the hooks are given', () => {
  it('feeds the drop point, the stage refs and the shared animation refs through', () => {
    renderTab()
    selectMap('Castle')
    loadMapImage()
    const getDropPoint = h.args.mapData.getDropPoint as (x: number, y: number) => unknown
    expect(getDropPoint(50, 25)).toEqual({ x: 0.5, y: 0.25 })
    const animation = h.animation as { tokensRef: { current: unknown }; startTokenPathAnimationRef: { current: unknown } }
    expect((h.args.mapData.tokensRef as { current: unknown }).current).toBe(animation.tokensRef.current)
    expect((h.args.mapData.startTokenPathAnimationRef as { current: unknown }).current).toBe(animation.startTokenPathAnimationRef.current)
    expect(h.args.assets.inlineStageRef).toBeTruthy()
    expect((h.args.assets.inlineStageRef as { current: HTMLElement }).current.className).toBe('map-stage')
  })

  it('measures token sizes and canvas points from the map size', () => {
    renderTab()
    selectMap('Castle')
    loadMapImage()
    const dimensions = h.args.viewport.renderTokenDimensions as (token: unknown) => { width: number }
    const viewDistance = h.args.viewport.renderTokenViewDistance as (token: unknown) => number
    expect(dimensions(aToken({ id: 't', sizeScale: 0.1 })).width).toBeGreaterThan(0)
    expect(viewDistance(aToken({ id: 't', viewDistanceScale: 0.1 }))).toBeGreaterThan(0)
    const toCanvas = h.args.drag.tokenPointToCanvasPoint as (point: { x: number; y: number }, size?: number) => unknown
    expect(toCanvas({ x: 0.5, y: 0.5 })).toEqual({ x: 192, y: 96 })
    expect(toCanvas({ x: 0.5, y: 0.5 }, 40)).toEqual({ x: 192, y: 96 - 40 * (192 / 400) * 0.5 })
    setData('fog', { activeFogCanvasRef: { current: null } })
    cleanup()
    renderTab()
    expect((h.args.drag.tokenPointToCanvasPoint as typeof toCanvas)({ x: 0.5, y: 0.5 })).toBeNull()
  })

  it('works out the grid cell size in pixels for token movement', () => {
    setData('grid', { effectiveGridCellScale: 0.0001 })
    renderTab()
    selectMap('Castle')
    loadMapImage()
    expect(h.args.drag.activeGridCellPx).toBe(8)
  })
})
