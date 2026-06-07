import { useReducer } from 'react'
import { initialMapWorkspaceState, mapWorkspaceReducer } from '../lib/mapWorkspaceState'

/**
 * Owns the GM map-workspace phase (Map Preview vs Map Run) for the workspace
 * shell. `runSession` increments on each fresh entry into Run so the shell can
 * re-run transient view/tool/layout resets every time Run is (re-)entered.
 */
export function useMapWorkspace() {
  const [state, dispatch] = useReducer(mapWorkspaceReducer, initialMapWorkspaceState)
  return {
    phase: state.phase,
    runSession: state.runSession,
    enterRun: () => dispatch({ type: 'enterRun' }),
    exitRun: () => dispatch({ type: 'exitRun' }),
    resetToPreview: () => dispatch({ type: 'selectMap' }),
  }
}
