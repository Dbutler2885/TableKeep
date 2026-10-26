// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { aMap } from '../test/mapFixtures'
import { useBlankMapDrawing } from './useBlankMapDrawing'
import { useGmCharacterSheets } from './useGmCharacterSheets'
import { useMapToolActions } from './useMapToolActions'
import { useTokenDropPoint } from './useMapsTabRefs'

afterEach(() => cleanup())

describe('the GM character sheets', () => {
  const characters = [{ id: 'c1', name: 'Mirelda' }, { id: 'c2', name: 'Osric' }]

  function sheets(overrides: Record<string, unknown> = {}) {
    const options = {
      selection: {
        setSelectedGmCharacterId: vi.fn(),
        gmWorkspaceCharacters: characters,
        selectedGmCharacter: null,
        selectedGmCharacterIndex: -1,
        ...overrides,
      },
      characterTabProps: undefined,
      isMobile: false,
      setMobileGmPane: vi.fn(),
      setDesktopGmPane: vi.fn(),
    } as unknown as Parameters<typeof useGmCharacterSheets>[0]
    return { options, result: renderHook(() => useGmCharacterSheets(options)).result }
  }

  it('opens a sheet in the desktop character view without a character tab', () => {
    const { options, result } = sheets()
    act(() => result.current.openGmCharacterSheet('c2'))
    expect(options.selection.setSelectedGmCharacterId).toHaveBeenCalledWith('c2')
    expect(options.setDesktopGmPane).toHaveBeenCalledWith('character')
  })

  it('pages from the first sheet when none is selected, and not at all without sheets', () => {
    const { options, result } = sheets()
    act(() => result.current.pageGmCharacter(1))
    expect(options.selection.setSelectedGmCharacterId).toHaveBeenCalledWith('c2')
    const empty = sheets({ gmWorkspaceCharacters: [] })
    act(() => empty.result.current.pageGmCharacter(1))
    expect(empty.options.selection.setSelectedGmCharacterId).not.toHaveBeenCalled()
  })

  it('opens the phone character pane, on the first sheet when none is chosen', () => {
    const { options, result } = sheets()
    act(() => result.current.openGmCharacters())
    expect(options.selection.setSelectedGmCharacterId).toHaveBeenCalledWith('c1')
    const chosen = sheets({ selectedGmCharacter: characters[1] })
    act(() => chosen.result.current.openGmCharacters())
    expect(chosen.options.setMobileGmPane).toHaveBeenCalledWith('characters')
    expect(chosen.options.selection.setSelectedGmCharacterId).not.toHaveBeenCalled()
  })
})

describe('the blank map drawing editor', () => {
  it('opens only for the GM, and saves nothing with no map open', async () => {
    const handleCreateBlankMap = vi.fn(async () => 'new')
    const saveBlankMapDrawing = vi.fn(async () => {})
    const { result } = renderHook(() => useBlankMapDrawing({ role: 'player', maps: [aMap({ id: 'new' })], handleCreateBlankMap, saveBlankMapDrawing }))
    await act(async () => {
      await result.current.openDrawingEditor()
    })
    expect(handleCreateBlankMap).not.toHaveBeenCalled()
    await act(async () => {
      await result.current.handleSaveBlankDrawing({ sceneJson: '{}', blob: new Blob(), width: 1, height: 1 })
    })
    expect(saveBlankMapDrawing).not.toHaveBeenCalled()
    expect(result.current.drawingEditorMap).toBeNull()
  })

  it('closes the editor', async () => {
    const { result } = renderHook(() => useBlankMapDrawing({ role: 'gm', maps: [aMap({ id: 'm1' })], handleCreateBlankMap: vi.fn(), saveBlankMapDrawing: vi.fn() }))
    await act(async () => {
      await result.current.openDrawingEditor('m1')
    })
    expect(result.current.drawingEditorMap?.id).toBe('m1')
    act(() => result.current.closeDrawingEditor())
    expect(result.current.drawingEditorMap).toBeNull()
  })
})

describe('the drop point', () => {
  const rect = (width: number) => ({ left: 0, top: 0, width, height: width }) as DOMRect

  it('measures against the fog canvas, then the map layer, and finds nothing without either', () => {
    const canvas = { width: 50, height: 50, getBoundingClientRect: () => rect(100) } as unknown as HTMLCanvasElement
    const layer = { getBoundingClientRect: () => rect(200) } as unknown as HTMLDivElement
    const dropRef = { current: () => null as { x: number; y: number } | null }
    const canvasRef = { current: canvas as HTMLCanvasElement | null }
    const layerRef = { current: layer as HTMLDivElement | null }
    const { result } = renderHook(() => useTokenDropPoint(canvasRef, layerRef, dropRef))
    expect(result.current(50, 50)).toEqual({ x: 0.5, y: 0.5 })
    expect(dropRef.current(50, 50)).toEqual({ x: 0.5, y: 0.5 })
    canvasRef.current = null
    expect(result.current(50, 50)).toEqual({ x: 0.25, y: 0.25 })
    layerRef.current = null
    expect(result.current(50, 50)).toBeNull()
  })
})

describe('the tool actions', () => {
  it('turns a tool off only while it is the active one', () => {
    const dispatchActiveTool = vi.fn()
    const context = { activeTool: { type: 'hand' as const }, dispatchActiveTool, setPlacementQueue: vi.fn(), closeActiveMeasurementMode: vi.fn() }
    const { result } = renderHook(() => useMapToolActions(context))
    act(() => result.current.setFogTool(null))
    act(() => result.current.setAnnotationPlaceMode(false))
    expect(dispatchActiveTool).not.toHaveBeenCalled()
    act(() => result.current.setHandToolActive(false))
    expect(dispatchActiveTool).toHaveBeenCalledWith({ type: 'clearActiveTool' })
    act(() => result.current.clearAnnotationPlacementTool())
    expect(dispatchActiveTool).toHaveBeenCalledTimes(1)
  })
})
