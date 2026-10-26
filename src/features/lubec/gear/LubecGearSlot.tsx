import type { CSSProperties, ReactNode } from 'react'
import { SIZE_NAMES } from '../../ruleSets/lubec/gear/gearRules'
import type { LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { LubecPicture } from './LubecGearArt'
import { subLine, weightTagText, type LubecSupplyName } from './gearLabels'
import { lubecMarkOf, useLubecDropClass } from './lubecDragMarks'

/** Every item card carries its picture, or its kind's outline when it has none. */
export function LubecSlotPic({ item }: { item: LubecItem }) {
  return <LubecPicture item={item} frame="slot-pic" />
}

export function LubecWeightTag({ item }: { item: LubecItem }) {
  const text = weightTagText(item)
  return text ? <span className="tag">{text}</span> : null
}

type SlotTextProps = { item: LubecItem; supplyName: LubecSupplyName; sizeTag?: boolean }

/** An item's name, the line under it and its tags (B's slotInner and packInner). */
export function LubecSlotText({ item, supplyName, sizeTag = false }: SlotTextProps) {
  const line = subLine(item, supplyName)
  return (
    <span className="slot-text">
      <span className="name">{item.name}</span>
      {line ? <span className="qty">{line}</span> : null}
      {sizeTag && item.size > 1 ? <span className="tag blue">{SIZE_NAMES[item.size]} / {item.size} slots</span> : null}
      <LubecWeightTag item={item} />
    </span>
  )
}

/** What an empty slot shows: a plus for whoever may add to it, and "Empty". */
export function LubecEmptyInner({ canAdd }: { canAdd: boolean }) {
  return (
    <>
      {canAdd ? <span className="plus" aria-hidden="true">+</span> : null}
      <span>Empty</span>
    </>
  )
}

type EmptySlotProps = {
  className?: string
  style?: CSSProperties
  /** The place a dragged thing goes when it is let go here (Rule M7). */
  drop?: string
  label: string
  /** Adds an item here; null for a viewer who may only look. */
  onAdd: (() => void) | null
  children?: ReactNode
}

/** An empty slot: a button that adds an item there, or for a viewer who may only look, a plain box. */
export function LubecEmptySlot({ className = 'slot', style, drop, label, onAdd, children }: EmptySlotProps) {
  const inner = <>{children}<LubecEmptyInner canAdd={onAdd !== null} /></>
  const box = { className: `${className}${useLubecDropClass(lubecMarkOf(drop, null))}`, style, 'data-drop': drop }
  if (!onAdd) return <div {...box}>{inner}</div>
  return <button type="button" {...box} aria-label={label} onClick={onAdd}>{inner}</button>
}

type ItemBoxProps = {
  item: LubecItem
  className: string
  style?: CSSProperties
  /** The place a dragged thing goes when it is let go on this one, which swaps them (Rule M9); none in the main pocket. */
  drop?: string
  /** Opens the item's card; null for a viewer who may only look. */
  onOpen: ((itemId: string) => void) | null
  children: ReactNode
}

/** A box holding an item: a button that opens its card, and that a drag picks up, or for a viewer who may only look, a plain box. */
export function LubecItemBox({ item, className, style, drop, onOpen, children }: ItemBoxProps) {
  const box = { className: `${className}${useLubecDropClass(lubecMarkOf(drop, item.id))}`, style, 'data-item': item.id, 'data-drop': drop }
  if (!onOpen) return <div {...box}>{children}</div>
  return <button type="button" {...box} onClick={() => onOpen(item.id)}>{children}</button>
}
