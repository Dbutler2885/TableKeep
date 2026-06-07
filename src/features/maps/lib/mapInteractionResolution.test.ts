import { describe, expect, it } from 'vitest'
import { initialActiveToolState, type ActiveToolState } from './activeToolState'
import { resolveMapInteractionIntent, type MapInteractionEvent } from './mapInteractionResolution'

const leftDragBareMap: MapInteractionEvent = {
  phase: 'drag',
  button: 'left',
  target: 'bareMap',
}

const leftClickBareMap: MapInteractionEvent = {
  phase: 'click',
  button: 'left',
  target: 'bareMap',
}

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

describe('resolveMapInteractionIntent', () => {
  it('resolves active fog and vision left-drags to paint intents', () => {
    expect(
      resolveMapInteractionIntent(
        withState({ activeTool: { type: 'fog', tool: 'hide' } }),
        leftDragBareMap,
      ),
    ).toEqual({ type: 'paint', tool: { type: 'fog', tool: 'hide' } })

    expect(
      resolveMapInteractionIntent(
        withState({ activeTool: { type: 'vision', tool: 'softBlock' } }),
        leftDragBareMap,
      ),
    ).toEqual({ type: 'paint', tool: { type: 'vision', tool: 'softBlock' } })
  })

  it('resolves annotation and label tools to placement on bare-map left-click', () => {
    expect(
      resolveMapInteractionIntent(
        withState({ activeTool: { type: 'annotation', tool: 'marker' } }),
        leftClickBareMap,
      ),
    ).toEqual({ type: 'place', tool: 'marker' })

    expect(
      resolveMapInteractionIntent(
        withState({ activeTool: { type: 'annotation', tool: 'playerLabel' } }),
        leftClickBareMap,
      ),
    ).toEqual({ type: 'place', tool: 'playerLabel' })
  })

  it('does not place annotations on shift-left-click', () => {
    expect(
      resolveMapInteractionIntent(
        withState({ activeTool: { type: 'annotation', tool: 'marker' } }),
        {
          ...leftClickBareMap,
          shiftKey: true,
        },
      ),
    ).toEqual({ type: 'no-op' })
  })

  it('resolves token placement queues to placement on any left-click target', () => {
    const state = withState({ tokenPlacement: { kind: 'monster', queueId: 'encounter-1' } })

    expect(resolveMapInteractionIntent(state, leftClickBareMap)).toEqual({
      type: 'place',
      tool: 'token',
    })
    expect(
      resolveMapInteractionIntent(state, {
        phase: 'click',
        button: 'left',
        target: 'token',
      }),
    ).toEqual({ type: 'place', tool: 'token' })
    expect(
      resolveMapInteractionIntent(state, {
        phase: 'click',
        button: 'left',
        target: 'annotation',
      }),
    ).toEqual({ type: 'place', tool: 'token' })
  })

  it('does not place queued tokens on shift-left-click', () => {
    expect(
      resolveMapInteractionIntent(
        withState({ tokenPlacement: { kind: 'monster', queueId: 'encounter-1' } }),
        {
          ...leftClickBareMap,
          shiftKey: true,
        },
      ),
    ).toEqual({ type: 'no-op' })
  })

  it('resolves token placement left-drags on tokens to no-op', () => {
    const state = withState({ tokenPlacement: { kind: 'monster', queueId: 'encounter-1' } })

    expect(
      resolveMapInteractionIntent(state, {
        phase: 'drag',
        button: 'left',
        target: 'token',
      }),
    ).toEqual({ type: 'no-op' })
  })

  it('resolves middle mouse, shift-left-drag, and the hand tool to pan', () => {
    expect(
      resolveMapInteractionIntent(initialActiveToolState, {
        phase: 'drag',
        button: 'middle',
        target: 'bareMap',
      }),
    ).toEqual({ type: 'pan', via: 'middleMouse' })

    expect(
      resolveMapInteractionIntent(initialActiveToolState, {
        phase: 'drag',
        button: 'left',
        shiftKey: true,
        target: 'bareMap',
      }),
    ).toEqual({ type: 'pan', via: 'shiftLeftDrag' })

    expect(
      resolveMapInteractionIntent(withState({ activeTool: { type: 'hand' } }), leftDragBareMap),
    ).toEqual({ type: 'pan', via: 'handTool' })
  })

  it('keeps middle and shift panning available during token placement', () => {
    const state = withState({ tokenPlacement: { kind: 'wholeParty', queueId: 'party' } })

    expect(
      resolveMapInteractionIntent(state, {
        phase: 'drag',
        button: 'middle',
        target: 'token',
      }),
    ).toEqual({ type: 'pan', via: 'middleMouse' })
    expect(
      resolveMapInteractionIntent(state, {
        phase: 'drag',
        button: 'left',
        shiftKey: true,
        target: 'token',
      }),
    ).toEqual({ type: 'pan', via: 'shiftLeftDrag' })
  })

  it('lets box-select own left-drag while active', () => {
    const state = withState({ activeTool: { type: 'boxSelect' } })

    expect(resolveMapInteractionIntent(state, leftDragBareMap)).toEqual({ type: 'box-select' })
    expect(
      resolveMapInteractionIntent(state, {
        phase: 'drag',
        button: 'left',
        target: 'token',
      }),
    ).toEqual({ type: 'box-select' })
  })

  it('resolves token left-drag to drag-token and token left-click to select-token by default', () => {
    expect(
      resolveMapInteractionIntent(initialActiveToolState, {
        phase: 'drag',
        button: 'left',
        target: 'token',
      }),
    ).toEqual({ type: 'drag-token' })

    expect(
      resolveMapInteractionIntent(initialActiveToolState, {
        phase: 'click',
        button: 'left',
        target: 'token',
      }),
    ).toEqual({ type: 'select-token' })
  })

  it('resolves bare-map left-click with no active tool to no-op', () => {
    expect(resolveMapInteractionIntent(initialActiveToolState, leftClickBareMap)).toEqual({
      type: 'no-op',
    })
  })

  it('does not default bare-map left-drag to pan with no active tool', () => {
    expect(resolveMapInteractionIntent(initialActiveToolState, leftDragBareMap)).toEqual({
      type: 'no-op',
    })
  })

  it('resolves annotation and label clicks to edit-annotation', () => {
    expect(
      resolveMapInteractionIntent(initialActiveToolState, {
        phase: 'click',
        button: 'left',
        target: 'annotation',
      }),
    ).toEqual({ type: 'edit-annotation', target: 'annotation' })

    expect(
      resolveMapInteractionIntent(initialActiveToolState, {
        phase: 'click',
        button: 'left',
        target: 'label',
      }),
    ).toEqual({ type: 'edit-annotation', target: 'label' })
  })

  it('does not place annotations on existing map items while annotation placement is active', () => {
    const state = withState({ activeTool: { type: 'annotation', tool: 'marker' } })

    expect(
      resolveMapInteractionIntent(state, {
        phase: 'click',
        button: 'left',
        target: 'annotation',
      }),
    ).toEqual({ type: 'edit-annotation', target: 'annotation' })

    expect(
      resolveMapInteractionIntent(state, {
        phase: 'click',
        button: 'left',
        target: 'label',
      }),
    ).toEqual({ type: 'edit-annotation', target: 'label' })

    expect(
      resolveMapInteractionIntent(state, {
        phase: 'click',
        button: 'left',
        target: 'token',
      }),
    ).toEqual({ type: 'select-token' })
  })

  it('resolves context-menu events to suppression intent', () => {
    expect(
      resolveMapInteractionIntent(initialActiveToolState, {
        phase: 'contextMenu',
        button: 'right',
        target: 'bareMap',
      }),
    ).toEqual({ type: 'suppress-context-menu' })
  })
})
