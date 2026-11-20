import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Minus, Plus, RotateCcw, X } from 'lucide-react'
import { MAX_MEDIA_ZOOM, MIN_MEDIA_ZOOM } from './handoutViewport'
import { useHandoutDialog } from './useHandoutDialog'
import { useHandoutZoom } from './useHandoutZoom'

type Props = {
  title: string; width: number; height: number; onClose: () => void
  children: (scale: number) => ReactNode; navigation?: ReactNode; resetKey?: number | string
}
export function HandoutLightbox({ title, width, height, onClose, children, navigation, resetKey = 'media' }: Props) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const { view, stageRef, pointers, onKeyDown, zoom, reset } = useHandoutZoom(width, height, resetKey)
  useHandoutDialog(dialogRef, onClose)
  return createPortal(
    <div className="handout-lightbox-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={dialogRef} className="handout-lightbox" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="handout-lightbox-header">
          <h3 id={titleId}>{title}</h3>
          <div className="handout-view-controls">
            {navigation}
            <button type="button" aria-label="Zoom out" disabled={view.scale <= MIN_MEDIA_ZOOM} onClick={() => zoom(0.8)}><Minus size={17} /></button>
            <output aria-label="Zoom level">{Math.round(view.scale * 100)}%</output>
            <button type="button" aria-label="Zoom in" disabled={view.scale >= MAX_MEDIA_ZOOM} onClick={() => zoom(1.25)}><Plus size={17} /></button>
            <button type="button" onClick={reset} aria-label="Reset zoom"><RotateCcw size={16} />Reset</button>
            <button type="button" onClick={onClose} data-handout-close aria-label="Close full-size viewer"><X size={18} />Close</button>
          </div>
        </header>
        <div ref={stageRef} className="handout-lightbox-stage" role="region" aria-label="Pan and zoom handout" tabIndex={0} {...pointers} onKeyDown={onKeyDown}>
          <div className="handout-lightbox-media" style={{ width, height, transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
            {children(view.scale)}
          </div>
        </div>
        <p className="handout-lightbox-help">Drag to pan. Use the wheel or pinch to zoom. Reset returns to 100%. Escape closes.</p>
      </div>
    </div>,
    document.querySelector('main.shell-root') ?? document.body,
  )
}
