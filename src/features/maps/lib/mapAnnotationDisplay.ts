import type { Role } from '../../../types/app'
import type { AnnotationRecord } from './types'

function shownPlayerLabels(annotations: AnnotationRecord[]) {
  return annotations.filter((annotation) => annotation.kind === 'player' && !annotation.hidden)
}

// Players, and the GM viewing as a player, see the shown player labels only; the GM
// otherwise sees everything unless labels are hidden in the GM view.
export function displayedAnnotations(annotations: AnnotationRecord[], role: Role | null, viewAsPlayer: boolean, gmHideLabels: boolean) {
  if (role !== 'gm' || viewAsPlayer) return shownPlayerLabels(annotations)
  return gmHideLabels ? [] : annotations
}

// Fits the annotation editor to its text, within a share of the viewport.
export function autosizeAnnotationTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return
  textarea.style.width = 'auto'
  textarea.style.height = 'auto'

  const viewportWidth = Math.max(window.innerWidth, 320)
  const viewportHeight = Math.max(window.innerHeight, 320)
  const minWidth = 168
  const maxWidth = Math.min(420, Math.floor(viewportWidth * 0.56))
  const nextWidth = Math.min(maxWidth, Math.max(minWidth, Math.ceil(textarea.scrollWidth) + 2))
  textarea.style.width = `${nextWidth}px`

  const minHeight = 56
  const maxHeight = Math.min(280, Math.floor(viewportHeight * 0.5))
  const nextHeight = Math.min(maxHeight, Math.max(minHeight, Math.ceil(textarea.scrollHeight) + 2))
  textarea.style.height = `${nextHeight}px`
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
}
