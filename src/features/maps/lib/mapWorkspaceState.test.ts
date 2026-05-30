import { describe, expect, it } from 'vitest'
import {
  initialMapWorkspaceState,
  mapWorkspaceReducer,
  type MapWorkspaceState,
} from './mapWorkspaceState'

describe('mapWorkspaceReducer', () => {
  it('starts in Preview with no run sessions', () => {
    expect(initialMapWorkspaceState).toEqual({ phase: 'preview', runSession: 0 })
  })

  it('enters Run from Preview and bumps the run session', () => {
    const next = mapWorkspaceReducer(initialMapWorkspaceState, { type: 'enterRun' })
    expect(next.phase).toBe('run')
    expect(next.runSession).toBe(1)
  })

  it('treats enterRun while already running as a no-op (no extra reset)', () => {
    const running: MapWorkspaceState = { phase: 'run', runSession: 1 }
    const next = mapWorkspaceReducer(running, { type: 'enterRun' })
    expect(next).toBe(running)
  })

  it('exits Run back to Preview, preserving the run session count', () => {
    const running: MapWorkspaceState = { phase: 'run', runSession: 1 }
    const next = mapWorkspaceReducer(running, { type: 'exitRun' })
    expect(next.phase).toBe('preview')
    expect(next.runSession).toBe(1)
  })

  it('bumps the run session again on re-entry so transient state resets each time', () => {
    let state = initialMapWorkspaceState
    state = mapWorkspaceReducer(state, { type: 'enterRun' })
    expect(state.runSession).toBe(1)
    state = mapWorkspaceReducer(state, { type: 'exitRun' })
    state = mapWorkspaceReducer(state, { type: 'enterRun' })
    expect(state.phase).toBe('run')
    expect(state.runSession).toBe(2)
  })

  it('returns to Preview when a map is selected while running', () => {
    const running: MapWorkspaceState = { phase: 'run', runSession: 3 }
    const next = mapWorkspaceReducer(running, { type: 'selectMap' })
    expect(next.phase).toBe('preview')
    expect(next.runSession).toBe(3)
  })

  it('is a no-op when selectMap fires while already in Preview', () => {
    const next = mapWorkspaceReducer(initialMapWorkspaceState, { type: 'selectMap' })
    expect(next).toBe(initialMapWorkspaceState)
  })

  it('is a no-op when exitRun fires while already in Preview', () => {
    const next = mapWorkspaceReducer(initialMapWorkspaceState, { type: 'exitRun' })
    expect(next).toBe(initialMapWorkspaceState)
  })
})
