import { useEffect, useEffectEvent, type Dispatch } from 'react'
import type { Role } from '../../../types/app'
import type { ActiveToolAction } from '../lib/activeToolState'
import { isTextEntry } from '../lib/bareMapInteractions'
import type { TokenAssetRecord } from '../lib/types'

// Commits the open annotation editor when the GM presses anywhere outside it.
export function useAnnotationOutsideCommit(activeAnnotationId: string, commitActiveAnnotation: () => Promise<void>, setActiveAnnotationId: (id: string) => void) {
  useEffect(() => {
    if (!activeAnnotationId) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.closest('.map-annotation-popover,.map-annotation-btn,.map-player-label-btn')) return
      void commitActiveAnnotation()
      setActiveAnnotationId('')
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [activeAnnotationId, commitActiveAnnotation, setActiveAnnotationId])
}

type MapStateResetOptions = {
  selectedMapId: string
  onMapChange: () => void
  selectedTokenAssetId: string
  tokenAssets: TokenAssetRecord[]
  setSelectedTokenAssetId: (assetId: string) => void
  viewAsPlayer: boolean
  setActiveAnnotationId: (id: string) => void
}

// Resets that follow from state changes: everything transient when the selected
// map changes, a token asset selection whose asset is gone, and the open
// annotation once the GM views the map as a player.
export function useMapStateResets(options: MapStateResetOptions) {
  const { selectedMapId, selectedTokenAssetId, tokenAssets, setSelectedTokenAssetId, viewAsPlayer, setActiveAnnotationId } = options
  const resetForMap = useEffectEvent(options.onMapChange)
  useEffect(() => {
    resetForMap()
  }, [selectedMapId])

  useEffect(() => {
    if (!selectedTokenAssetId) return
    const existsAsAsset = tokenAssets.some((asset) => asset.id === selectedTokenAssetId)
    if (!existsAsAsset) setSelectedTokenAssetId('')
  }, [selectedTokenAssetId, tokenAssets, setSelectedTokenAssetId])

  useEffect(() => {
    if (!viewAsPlayer) return
    setActiveAnnotationId('')
  }, [setActiveAnnotationId, viewAsPlayer])
}

// Reset transient view/tool/layout state on every (re-)entry into Map Run.
// Keyed on runSession so leaving and re-entering Run resets again. Persistent
// map/token/fog/annotation data is untouched (no Firestore writes here).
export function useRunEntryReset(runSession: number, desktopGm: boolean, phase: 'preview' | 'run', reset: () => void) {
  const resetForRun = useEffectEvent(() => {
    if (desktopGm && phase === 'run') reset()
  })
  useEffect(() => {
    resetForRun()
  }, [runSession])
}

type EscapeKeyOptions = {
  role: Role | null
  dispatchActiveTool: Dispatch<ActiveToolAction>
  closeActiveMeasurementMode: () => void
  setPlacementQueue: (queue: null) => void
  setTokenSelectionBox: (box: null) => void
}

// Escape is a universal transient-state cancel for the GM map workspace: it clears the
// active tool, any token-placement queue, and an in-progress box-select. It never
// undoes applied changes (placed tokens / painted fog) and never leaves Map Run.
// Typing Escape inside a text field (e.g. an annotation editor) is left to that field.
export function useMapEscapeKey({ role, dispatchActiveTool, closeActiveMeasurementMode, setPlacementQueue, setTokenSelectionBox }: EscapeKeyOptions) {
  useEffect(() => {
    if (role !== 'gm') return
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const target = event.target as HTMLElement | null
      if (target && isTextEntry(target)) return
      dispatchActiveTool({ type: 'escape' })
      closeActiveMeasurementMode()
      setPlacementQueue(null)
      setTokenSelectionBox(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [role, closeActiveMeasurementMode, dispatchActiveTool, setPlacementQueue, setTokenSelectionBox])
}
