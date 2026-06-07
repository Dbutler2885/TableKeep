import { describe, expect, it } from 'vitest'
import {
  activeToolReducer,
  initialActiveToolState,
  type ActiveMapTool,
  type ActiveToolState,
} from './activeToolState'

const fogHide: ActiveMapTool = { type: 'fog', tool: 'hide' }
const visionHardBlock: ActiveMapTool = { type: 'vision', tool: 'hardBlock' }
const annotationMarker: ActiveMapTool = { type: 'annotation', tool: 'marker' }

describe('activeToolReducer', () => {
  it('starts with no active tool or token placement queue', () => {
    expect(initialActiveToolState.activeTool).toBeNull()
    expect(initialActiveToolState.tokenPlacement).toBeNull()
  })

  it('selecting one active tool deactivates the previous active tool', () => {
    let state = activeToolReducer(initialActiveToolState, { type: 'selectTool', tool: fogHide })
    expect(state.activeTool).toEqual(fogHide)

    state = activeToolReducer(state, { type: 'selectTool', tool: visionHardBlock })
    expect(state.activeTool).toEqual(visionHardBlock)

    state = activeToolReducer(state, { type: 'selectTool', tool: annotationMarker })
    expect(state.activeTool).toEqual(annotationMarker)
  })

  it('toggleTool clears the active tool when toggling the selected tool again', () => {
    let state = activeToolReducer(initialActiveToolState, { type: 'toggleTool', tool: fogHide })
    expect(state.activeTool).toEqual(fogHide)

    state = activeToolReducer(state, { type: 'toggleTool', tool: fogHide })
    expect(state.activeTool).toBeNull()
  })

  it('independent visibility toggles do not change the active tool', () => {
    let state = activeToolReducer(initialActiveToolState, { type: 'selectTool', tool: fogHide })

    state = activeToolReducer(state, { type: 'toggleGridVisibility' })
    expect(state.activeTool).toEqual(fogHide)
    expect(state.toggles.gridVisible).toBe(false)

    state = activeToolReducer(state, { type: 'toggleGmHideLabels' })
    expect(state.activeTool).toEqual(fogHide)
    expect(state.toggles.gmHideLabels).toBe(true)

    state = activeToolReducer(state, { type: 'togglePlayerViewPreview' })
    expect(state.activeTool).toEqual(fogHide)
    expect(state.toggles.playerViewPreview).toBe(true)
  })

  it('starting token placement clears the active map tool', () => {
    const drawing = activeToolReducer(initialActiveToolState, { type: 'selectTool', tool: visionHardBlock })
    const placing = activeToolReducer(drawing, {
      type: 'startTokenPlacement',
      placement: { kind: 'monster', queueId: 'encounter-1' },
    })

    expect(placing.activeTool).toBeNull()
    expect(placing.tokenPlacement).toEqual({ kind: 'monster', queueId: 'encounter-1' })
  })

  it('selecting a top-panel tool cancels token placement', () => {
    const placing = activeToolReducer(initialActiveToolState, {
      type: 'startTokenPlacement',
      placement: { kind: 'wholeParty', queueId: 'party' },
    })
    const drawing = activeToolReducer(placing, { type: 'selectTool', tool: fogHide })

    expect(drawing.activeTool).toEqual(fogHide)
    expect(drawing.tokenPlacement).toBeNull()
  })

  it('Escape clears active transient tool state without changing independent toggles', () => {
    const state: ActiveToolState = {
      activeTool: visionHardBlock,
      tokenPlacement: { kind: 'monster', queueId: 'encounter-1' },
      toggles: {
        gridVisible: false,
        gmHideLabels: true,
        playerViewPreview: true,
      },
    }

    const next = activeToolReducer(state, { type: 'escape' })

    expect(next.activeTool).toBeNull()
    expect(next.tokenPlacement).toBeNull()
    expect(next.toggles).toEqual(state.toggles)
    expect(next).not.toHaveProperty('commands')
  })

  it('Player View Preview coexists with active tools and token placement', () => {
    let state = activeToolReducer(initialActiveToolState, { type: 'selectTool', tool: visionHardBlock })
    state = activeToolReducer(state, { type: 'togglePlayerViewPreview' })
    expect(state.activeTool).toEqual(visionHardBlock)
    expect(state.toggles.playerViewPreview).toBe(true)

    state = activeToolReducer(state, {
      type: 'startTokenPlacement',
      placement: { kind: 'npc', queueId: 'npc-1' },
    })
    state = activeToolReducer(state, { type: 'setPlayerViewPreview', enabled: false })

    expect(state.activeTool).toBeNull()
    expect(state.tokenPlacement).toEqual({ kind: 'npc', queueId: 'npc-1' })
    expect(state.toggles.playerViewPreview).toBe(false)
  })

  it('reset returns to the initial no-active-tool state', () => {
    const state: ActiveToolState = {
      activeTool: { type: 'hand' },
      tokenPlacement: { kind: 'genericToken' },
      toggles: {
        gridVisible: false,
        gmHideLabels: true,
        playerViewPreview: true,
      },
    }

    expect(activeToolReducer(state, { type: 'reset' })).toEqual(initialActiveToolState)
  })
})
