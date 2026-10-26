import { autosizeAnnotationTextarea, displayedAnnotations } from '../lib/mapAnnotationDisplay'
import { AnnotationLayer } from './AnnotationLayer'
import type { MapsTabModel } from './mapsTabModel'

// The map's notes and labels, as the viewer may see them. The GM edits them in the
// GM view, except while placing tokens.
export function MapAnnotations({ model }: { model: MapsTabModel }) {
  const { mapData, view } = model
  const annotations = displayedAnnotations(mapData.annotations, model.role, view.viewAsPlayer, view.gmHideLabels)
  if (annotations.length === 0 && !view.gmView) return null
  return (
    <AnnotationLayer
      annotations={annotations}
      activeAnnotationId={mapData.activeAnnotationId}
      activeAnnotationDraft={mapData.activeAnnotationDraft}
      setActiveAnnotationId={mapData.setActiveAnnotationId}
      setActiveAnnotationDraft={mapData.setActiveAnnotationDraft}
      onCommitActiveAnnotation={mapData.commitActiveAnnotation}
      onDeleteAnnotation={mapData.deleteAnnotation}
      onToggleAnnotationHidden={mapData.toggleAnnotationHidden}
      onToggleAnnotationPointerDirection={mapData.toggleAnnotationPointerDirection}
      onMoveAnnotation={mapData.moveAnnotationPosition}
      onPersistAnnotationPosition={mapData.persistAnnotationPosition}
      autosizeAnnotationTextarea={autosizeAnnotationTextarea}
      onBeginEditAnnotation={model.toolActions.clearAnnotationPlacementTool}
      editable={view.gmView && !view.placing}
      className={view.placing ? 'placing' : ''}
    />
  )
}
