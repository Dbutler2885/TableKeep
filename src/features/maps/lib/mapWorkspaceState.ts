export type MapWorkspacePhase = 'preview' | 'run'

export type MapWorkspaceState = {
  phase: MapWorkspacePhase
  // Increments on each fresh transition into 'run'. The workspace shell keys a
  // transient-reset effect on this so that every time Map Run is (re-)entered,
  // view/tool/layout state is reset.
  runSession: number
}

export type MapWorkspaceAction =
  | { type: 'enterRun' }
  | { type: 'exitRun' }
  | { type: 'selectMap' } // choosing or switching a map returns to Preview

export const initialMapWorkspaceState: MapWorkspaceState = {
  phase: 'preview',
  runSession: 0,
}

export function mapWorkspaceReducer(
  state: MapWorkspaceState,
  action: MapWorkspaceAction,
): MapWorkspaceState {
  switch (action.type) {
    case 'enterRun':
      // Idempotent while already running so repeated enter calls don't re-reset.
      if (state.phase === 'run') return state
      return { phase: 'run', runSession: state.runSession + 1 }
    case 'exitRun':
      if (state.phase === 'preview') return state
      return { ...state, phase: 'preview' }
    case 'selectMap':
      if (state.phase === 'preview') return state
      return { ...state, phase: 'preview' }
    default:
      return state
  }
}
