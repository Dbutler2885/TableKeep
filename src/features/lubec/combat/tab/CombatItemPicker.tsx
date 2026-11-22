import { useState } from 'react'
import type { LubecGmItem } from '../../../ruleSets/lubec/gear/gmItem'
import { combatItemOptions } from './combatFloorRows'
import { floorPickLimit } from './combatSetupModel'

type PickerProps = {
  items: readonly LubecGmItem[]
  onPlace: (item: LubecGmItem, qty: number) => void
  /** With a count, the GM chooses how many before placing; without, each press places one. */
  withCount?: boolean
  busy?: boolean
}

function CountStepper({ qty, max, onQty }: { qty: number; max: number; onQty: (qty: number) => void }) {
  return (
    <span className="stepper-q">
      <button type="button" onClick={() => onQty(Math.max(1, qty - 1))} aria-label="Fewer">−</button>
      <b>{qty}</b>
      <button type="button" onClick={() => onQty(Math.min(max, qty + 1))} aria-label="More">+</button>
    </span>
  )
}

type SelectProps = { items: readonly LubecGmItem[]; value: string; onChoose: (id: string) => void }

function ItemSelect({ items, value, onChoose }: SelectProps) {
  return (
    <select aria-label="Your Items" value={value} onChange={(event) => onChoose(event.target.value)}>
      <option value="">Choose from your Items...</option>
      {combatItemOptions(items).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
  )
}

type CountProps = { chosen: LubecGmItem | undefined; withCount: boolean; qty: number; onQty: (qty: number) => void }

// The count shows once an item is chosen, for a picker that asks how many.
function PickCount({ chosen, withCount, qty, onQty }: CountProps) {
  if (!withCount || !chosen) return null
  return <CountStepper qty={qty} max={floorPickLimit(chosen)} onQty={onQty} />
}

/** Choose one of the GM's Items, by a label that tells same-named items apart, and place it on the Floor. */
export function CombatItemPicker({ items, onPlace, withCount = false, busy = false }: PickerProps) {
  const [chosenId, setChosenId] = useState('')
  const [qty, setQty] = useState(1)
  const chosen = items.find((item) => item.id === chosenId)
  const choose = (id: string) => {
    setChosenId(id)
    setQty(1)
  }
  return (
    <div className="item-pick">
      <ItemSelect items={items} value={chosen ? chosenId : ''} onChoose={choose} />
      <PickCount chosen={chosen} withCount={withCount} qty={qty} onQty={setQty} />
      <button type="button" className="btn rust small" disabled={!chosen || busy} onClick={() => onPlace(chosen!, qty)}>Place on Floor</button>
    </div>
  )
}
