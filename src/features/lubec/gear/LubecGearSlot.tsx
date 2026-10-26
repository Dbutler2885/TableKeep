import type { CSSProperties, ReactNode } from 'react'
import { SIZE_NAMES } from '../../ruleSets/lubec/gear/gearRules'
import type { LubecItem, LubecItemKind } from '../../ruleSets/lubec/gear/gearRecord'
import { subLine, weightTagText, type LubecSupplyName } from './gearLabels'

// With no picture, a plain outline for the kind stands in, so rows keep their shape (B's KIND_GLYPH).
const KIND_GLYPH: Readonly<Record<LubecItemKind, readonly string[]>> = {
  thing: ['M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8'],
  weapon: ['M5 19L18 6l1.5-1.5M8 13l3 3M4 20l3-3'],
  armor: ['M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z'],
  consumable: ['M6 6c0-2 12-2 12 0v12c0 2-12 2-12 0zM6 6c0 2 12 2 12 0'],
  holder: ['M10 2.5h4M10.5 2.5v3M13.5 2.5v3', 'M12 5.5c-4.5 0-7 3-7 7.5 0 5 2.6 8.5 7 8.5s7-3.5 7-8.5c0-4.5-2.5-7.5-7-7.5z', 'M5.6 14h12.8'],
}

function LubecKindGlyph({ kind }: { kind: LubecItemKind }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {KIND_GLYPH[kind].map((d) => <path key={d} d={d} />)}
    </svg>
  )
}

// Every item card carries its picture, or its kind's outline when it has none.
// The stock drawings and uploaded pictures come with the item card; until then every item shows its kind.
export function LubecSlotPic({ item }: { item: LubecItem }) {
  return <span className="slot-pic none" aria-hidden="true"><LubecKindGlyph kind={item.kind} /></span>
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
