import type { RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { LUBEC_DROP_MARK, lubecDropCostText } from './dragGeometry'
import { LubecPicture } from './LubecGearArt'
import { lubecDropClass, type LubecDragView } from './lubecDragMarks'

type LayerProps = {
  view: LubecDragView | null
  item: LubecItem | undefined
  ghost: RefObject<HTMLDivElement | null>
  dropZone: RefObject<HTMLDivElement | null>
}

// The picked-up card: its picture and name, sized like the thing it came from, with the chip under it
// that says what dropping here costs, or why it can't go here. Over the drop zone, which sits at the
// foot of the window, the chip goes above the card so the window's edge never cuts it. `useLubecDrag` moves it.
const ghostClass = (hot: LubecDragView['hot']) =>
  `drag-ghost${hot?.ok ? ' snap' : ''}${hot?.mark === LUBEC_DROP_MARK ? ' at-drop' : ''}`

function Ghost({ view, item, ghost }: Omit<LayerProps, 'dropZone'> & { view: LubecDragView; item: LubecItem }) {
  const { hot } = view
  return (
    <div ref={ghost} className={ghostClass(hot)} aria-hidden="true">
      <LubecPicture item={item} frame="pic" />
      <span className="nm">{item.name}</span>
      {hot ? <span className={`chip${hot.ok ? '' : ' no'}`}>{lubecDropCostText(hot)}</span> : null}
    </div>
  )
}

/**
 * What a drag draws over the page (B's `.drag-ghost` and `#drop-ground`): the
 * picked-up card, and the drop zone at the foot of the window, where a thing
 * is dropped and goes to the GM (Rules M4 and M8). Both are drawn outside the
 * sheet, whose fit zoom would otherwise move them away from the pointer.
 */
export function LubecDragLayer({ view, item, ghost, dropZone }: LayerProps) {
  if (!view || !item) return null
  const layer = (
    <div className="lubec-gear-drag">
      <Ghost view={view} item={item} ghost={ghost} />
      <div ref={dropZone} className={`drop-ground${lubecDropClass(view, LUBEC_DROP_MARK)}`} aria-hidden="true">
        <span>Drop it</span>
        <small>It leaves the sheet</small>
      </div>
    </div>
  )
  return view.layer ? createPortal(layer, view.layer) : layer
}
