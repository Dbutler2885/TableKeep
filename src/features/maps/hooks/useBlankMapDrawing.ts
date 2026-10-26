import { useCallback, useState } from 'react'
import type { Role } from '../../../types/app'
import type { BlankMapSceneResult } from '../components/MapDrawingEditor'
import type { MapRecord } from '../lib/types'

type BlankMapDrawingOptions = {
  role: Role | null
  maps: MapRecord[]
  handleCreateBlankMap: () => Promise<string | null | undefined>
  saveBlankMapDrawing: (mapId: string, sceneJson: string, blob: Blob, width: number, height: number) => Promise<unknown>
}

function findMap(maps: MapRecord[], mapId: string | null) {
  return mapId ? maps.find((map) => map.id === mapId) ?? null : null
}

// The blank-map drawing editor (Excalidraw): which map it has open, opening it on a
// new blank map or an existing one, and saving the drawing back to that map.
export function useBlankMapDrawing({ role, maps, handleCreateBlankMap, saveBlankMapDrawing }: BlankMapDrawingOptions) {
  const [drawingEditorMapId, setDrawingEditorMapId] = useState<string | null>(null)

  const openDrawingEditor = useCallback(async (mapId?: string) => {
    if (role !== 'gm') return
    if (mapId) {
      setDrawingEditorMapId(mapId)
      return
    }
    const newId = await handleCreateBlankMap()
    if (newId) setDrawingEditorMapId(newId)
  }, [handleCreateBlankMap, role])

  const handleSaveBlankDrawing = useCallback(async (result: BlankMapSceneResult) => {
    if (!drawingEditorMapId) return
    await saveBlankMapDrawing(drawingEditorMapId, result.sceneJson, result.blob, result.width, result.height)
    setDrawingEditorMapId(null)
  }, [drawingEditorMapId, saveBlankMapDrawing])

  return {
    drawingEditorMap: findMap(maps, drawingEditorMapId),
    openDrawingEditor,
    handleSaveBlankDrawing,
    closeDrawingEditor: () => setDrawingEditorMapId(null),
  }
}

export type BlankMapDrawing = ReturnType<typeof useBlankMapDrawing>
