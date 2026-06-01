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
    expect(getMapToolGuidance(withState({ activeTool: { type: 'annotation', tool: 'playerLabel' } }), noPlacement)?.body).toContain('Click bare map space')
    expect(getMapToolGuidance(withState({ activeTool: { type: 'boxSelect' } }), noPlacement)?.title).toBe('Selecting Tokens')
  })

  it('explains how to use and accept grid calibration', () => {
    const guidance = getMapToolGuidance(
      withState({ activeTool: { type: 'measurement', tool: 'calibrateGrid' } }),
      noPlacement,
    )

    expect(guidance?.body).toContain('Click two points on the map to define a 10 foot span')
    expect(guidance?.body).toContain('confirm with the check button')
    expect(guidance?.body).toContain('Press the ruler tool again to cancel')
  })

  it('explains grid adjustment even though grid type selection is not an active tool', () => {
    const guidance = getMapToolGuidance(initialActiveToolState, noPlacement, { gridAdjustMode: true })

    expect(guidance?.title).toBe('Adjusting Grid')
    expect(guidance?.body).toContain('mouse wheel')
    expect(guidance?.body).toContain('selected grid button again to cancel')
    expect(guidance?.body).toContain('check button to accept')
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
