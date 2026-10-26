import type { CSSProperties, ReactNode } from 'react'
import { SIZE_NAMES } from '../../ruleSets/lubec/gear/gearRules'
import type { LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { LubecPicture } from './LubecGearArt'
import { subLine, weightTagText, type LubecSupplyName } from './gearLabels'

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
  label: string
  /** Adds an item here; null for a viewer who may only look. */
  onAdd: (() => void) | null
  children?: ReactNode
}

/** An empty slot: a button that adds an item there, or for a viewer who may only look, a plain box. */
export function LubecEmptySlot({ className = 'slot', style, label, onAdd, children }: EmptySlotProps) {
  const inner = <>{children}<LubecEmptyInner canAdd={onAdd !== null} /></>
  if (!onAdd) return <div className={className} style={style}>{inner}</div>
  return <button type="button" className={className} style={style} aria-label={label} onClick={onAdd}>{inner}</button>
}

type ItemBoxProps = {
  item: LubecItem
  className: string
  style?: CSSProperties
  /** Opens the item's card; null for a viewer who may only look. */
  onOpen: ((itemId: string) => void) | null
  children: ReactNode
}

/** A box holding an item: a button that opens its card, or for a viewer who may only look, a plain box. */
export function LubecItemBox({ item, className, style, onOpen, children }: ItemBoxProps) {
  if (!onOpen) return <div className={className} style={style}>{children}</div>
  return <button type="button" className={className} style={style} onClick={() => onOpen(item.id)}>{children}</button>
}
