import { KIND_NAMES } from '../../ruleSets/lubec/gear/gearRules'
import type { LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { qtyText } from './gearLabels'
import { LubecPicture } from './LubecGearArt'
import { LubecWeightTag } from './LubecGearSlot'

type RowProps = {
  item: LubecItem
  /** Opens the thing's card; null for a viewer who may only look, whose row is not a button. */
  onOpen: ((itemId: string) => void) | null
  /** False for small stuff, whose row names only the thing (B). */
  kindLine?: boolean
}

/** A thing in a carrier's list (B's `renderDetail` row): its picture, its name and count, its kind, and its size and weight tags. */
export function LubecCarrierRow({ item, onOpen, kindLine = true }: RowProps) {
  const body = (
    <>
      <LubecPicture item={item} frame="thumb" />
      <span>{`${item.name} ${qtyText(item)}`.trim()}{kindLine && item.kind !== 'thing' ? <small>{KIND_NAMES[item.kind]}</small> : null}</span>
      <span className="tags">{kindLine && item.size > 1 ? <span className="tag blue">{item.size} slots</span> : null}<LubecWeightTag item={item} /></span>
    </>
  )
  if (!onOpen) return <div className="row-item static">{body}</div>
  return <button type="button" className="row-item" onClick={() => onOpen(item.id)}>{body}</button>
}
