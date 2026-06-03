import { describe, expect, it } from 'vitest'
import { initialActiveToolState, type ActiveToolState } from './activeToolState'
import { getMapToolGuidance } from './toolGuidance'
import { getTokenPlacementDisplay, startMonsterTokenPlacement } from './tokenPlacementQueue'

const noPlacement = getTokenPlacementDisplay(null)

function withState(overrides: Partial<ActiveToolState>): ActiveToolState {
  return {
    ...initialActiveToolState,
    ...overrides,
    toggles: {
      ...initialActiveToolState.toggles,
      ...overrides.toggles,
    },
  }
}

describe('getMapToolGuidance', () => {
  it('clears guidance when no active tool or placement exists', () => {
    expect(getMapToolGuidance(initialActiveToolState, noPlacement)).toBeNull()
  })

  it('derives guidance from the active tool', () => {
    expect(getMapToolGuidance(withState({ activeTool: { type: 'fog', tool: 'hide' } }), noPlacement)?.title).toBe('Adding Fog')
    expect(getMapToolGuidance(withState({ activeTool: { type: 'annotation', tool: 'playerLabel' } }), noPlacement)?.body).toContain('Player facing labels')
    expect(getMapToolGuidance(withState({ activeTool: { type: 'boxSelect' } }), noPlacement)?.title).toBe('Selecting Tokens')
  })

  it('describes fog as player visibility changes', () => {
    expect(getMapToolGuidance(withState({ activeTool: { type: 'fog', tool: 'hide' } }), noPlacement)?.body).toContain(
      'hide areas from players',
    )
    expect(getMapToolGuidance(withState({ activeTool: { type: 'fog', tool: 'reveal' } }), noPlacement)?.body).toContain(
      'reveal areas to players',
    )
  })

  it('uses tooltip language for hard and soft vision blockers', () => {
    expect(getMapToolGuidance(withState({ activeTool: { type: 'vision', tool: 'hardBlock' } }), noPlacement)?.body).toContain(
      'Blocks sight into painted area and beyond',
    )
    expect(getMapToolGuidance(withState({ activeTool: { type: 'vision', tool: 'softBlock' } }), noPlacement)?.body).toContain(
      'Reveals painted area, blocks sight beyond',
    )
  })

  it('uses GM notes copy for GM-facing annotation placement', () => {
    expect(getMapToolGuidance(withState({ activeTool: { type: 'annotation', tool: 'marker' } }), noPlacement)).toEqual({
      title: 'GM Notes',
      body: 'GM facing notes. Click map to place. Click icon to edit note.',
    })
  })

  it('explains how to use and accept grid calibration', () => {
    const guidance = getMapToolGuidance(
      withState({ activeTool: { type: 'measurement', tool: 'calibrateGrid' } }),
      noPlacement,
    )

    expect(guidance?.body).toContain('Grid calibration')
    expect(guidance?.body).toContain('10 foot span')
    expect(guidance?.body).toContain('Click check to save')
  })

  it('explains grid adjustment even though grid type selection is not an active tool', () => {
    const guidance = getMapToolGuidance(initialActiveToolState, noPlacement, { gridAdjustMode: true })

    expect(guidance?.title).toBe('Adjusting Grid')
    expect(guidance?.body).toContain('Mouse wheel scales grid')
    expect(guidance?.body).toContain('Drag map to align')
    expect(guidance?.body).toContain('Click check to save')
  })

  it('prioritizes placement guidance over active tool guidance', () => {
    const queue = startMonsterTokenPlacement({
      kind: 'monster',
      id: 'goblin',
      name: 'Goblin',
      tokenIcon: null,
    }, 3)
    const guidance = getMapToolGuidance(
      withState({ activeTool: { type: 'fog', tool: 'hide' } }),
      getTokenPlacementDisplay(queue),
    )

    expect(guidance?.title).toBe('Placing Token')
    expect(guidance?.body).toContain('Goblin')
    expect(guidance?.body).toContain('3 placements remain')
  })
})
