import { useCallback, useMemo, useRef, useState } from 'react'
import { Excalidraw, exportToBlob } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { Loader2, X } from 'lucide-react'
import { BLANK_MAP_HEIGHT, BLANK_MAP_WIDTH } from '../lib/constants'

export type BlankMapSceneResult = {
  sceneJson: string
  blob: Blob
  width: number
  height: number
}

type MapDrawingEditorProps = {
  mapName: string
  // Serialized Excalidraw scene from a previous edit, or '' for a fresh canvas.
  initialSceneJson: string
  backgroundColor: string
  onCancel: () => void
  onSave: (result: BlankMapSceneResult) => Promise<void>
}

type ParsedScene = {
  elements: readonly unknown[]
  appState: Record<string, unknown>
  files: Record<string, unknown>
}

function parseScene(sceneJson: string, backgroundColor: string): ParsedScene {
  const fallback: ParsedScene = {
    elements: [],
    appState: { viewBackgroundColor: backgroundColor },
    files: {},
  }
  if (!sceneJson) return fallback
  try {
    const parsed = JSON.parse(sceneJson) as Partial<ParsedScene>
    return {
      elements: Array.isArray(parsed.elements) ? parsed.elements : [],
      appState: {
        viewBackgroundColor: backgroundColor,
        ...(parsed.appState && typeof parsed.appState === 'object' ? parsed.appState : {}),
      },
      files: parsed.files && typeof parsed.files === 'object' ? parsed.files : {},
    }
  } catch {
    return fallback
  }
}

// Render a neutral placeholder image when the GM saves an empty canvas, so the
// map is still shareable and behaves like any other uploaded image.
async function blankImageBlob(backgroundColor: string): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = BLANK_MAP_WIDTH
  canvas.height = BLANK_MAP_HEIGHT
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Failed to render blank canvas'))), 'image/png')
  })
}

export function MapDrawingEditor({
  mapName,
  initialSceneJson,
  backgroundColor,
  onCancel,
  onSave,
}: MapDrawingEditorProps) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const initialScene = useMemo(() => parseScene(initialSceneJson, backgroundColor), [initialSceneJson, backgroundColor])

  const handleSave = useCallback(async () => {
    const api = apiRef.current
    if (!api || saving) return
    setSaving(true)
    setError(null)
    try {
      const elements = api.getSceneElements()
      const appState = api.getAppState()
      const files = api.getFiles()
      const liveElements = elements.filter((element) => !element.isDeleted)

      let blob: Blob
      let width = BLANK_MAP_WIDTH
      let height = BLANK_MAP_HEIGHT
      if (liveElements.length === 0) {
        blob = await blankImageBlob(appState.viewBackgroundColor || backgroundColor)
      } else {
        blob = await exportToBlob({
          elements,
          appState: {
            ...appState,
            exportBackground: true,
            exportWithDarkMode: false,
            viewBackgroundColor: appState.viewBackgroundColor || backgroundColor,
          },
          files,
          mimeType: 'image/png',
          exportPadding: 24,
          getDimensions: (w, h) => ({ width: w, height: h, scale: 2 }),
        })
        const bitmap = await createImageBitmap(blob)
        width = bitmap.width
        height = bitmap.height
        bitmap.close()
      }

      const sceneJson = JSON.stringify({
        elements,
        appState: { viewBackgroundColor: appState.viewBackgroundColor || backgroundColor },
        files,
      })
      await onSave({ sceneJson, blob, width, height })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the drawing')
      setSaving(false)
    }
  }, [backgroundColor, onSave, saving])

  return (
    <div className="map-drawing-editor" role="dialog" aria-modal aria-label={`Edit drawing: ${mapName}`}>
      <div className="map-drawing-editor-bar">
        <span className="map-drawing-editor-title">Drawing: {mapName}</span>
        {error ? <span className="map-drawing-editor-error">{error}</span> : null}
        <div className="map-drawing-editor-actions">
          <button type="button" className="map-drawing-editor-cancel" onClick={onCancel} disabled={saving}>
            <X size={15} />
            Cancel
          </button>
          <button type="button" className="map-drawing-editor-save" onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2 size={15} className="map-icon-spin" /> : null}
            {saving ? 'Saving...' : 'Save & share'}
          </button>
        </div>
      </div>
      <div className="map-drawing-editor-canvas">
        <Excalidraw
          excalidrawAPI={(api) => { apiRef.current = api }}
          initialData={{
            elements: initialScene.elements as never,
            appState: initialScene.appState as never,
            files: initialScene.files as never,
            scrollToContent: true,
          }}
        />
      </div>
    </div>
  )
}
