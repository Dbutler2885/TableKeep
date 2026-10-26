import { useState, type KeyboardEvent } from 'react'
import type { LubecSupply } from '../../ruleSets/lubec/gear/gearRecord'

/** The form fields that name a supply: what a firearm takes, what a holder holds, and what a loose stack goes into. */
export type LubecSupplyFieldKey = 'wTakes' | 'hTakes' | 'fits'

/** Makes the supply named and picks it in the field; false when the name is refused, so the maker stays open. */
export type LubecMakeSupply = (field: LubecSupplyFieldKey, name: string) => boolean

type SupplyProps = {
  field: LubecSupplyFieldKey
  label: string
  value: string
  empty: string
  /** The maker's example names. */
  placeholder: string
  supplies: readonly LubecSupply[]
  onValue: (value: string) => void
  onMake: LubecMakeSupply
}

// The select's last option opens the maker, and the select keeps what it had.
const MAKE_SUPPLY = '__make'

type MakerProps = { name: string; placeholder: string; onName: (name: string) => void; onMake: () => void; onCancel: () => void }

/** B's ammo maker: a new supply's name, Make it and Cancel. Enter makes it; Escape closes the maker and leaves the form open. */
function SupplyMaker({ name, placeholder, onName, onMake, onCancel }: MakerProps) {
  const keys = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onMake()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onCancel()
    }
  }
  return (
    <div className="ammo-maker">
      <label className="field"><span className="label">New supply</span>
        {/* The maker opens because the player asked for it, so its one field takes the focus, as B's does. */}
        <input type="text" autoComplete="off" autoFocus placeholder={placeholder} value={name} onChange={(e) => onName(e.target.value)} onKeyDown={keys} />
      </label>
      <button type="button" className="btn" onClick={onMake}>Make it</button>
      <button type="button" className="btn line" onClick={onCancel}>Cancel</button>
    </div>
  )
}

/** A pick of the supplies (Rule L1): what a gun or holder takes, or what a loose stack goes into, with "+ Make a supply" at the end. */
export function LubecSupplyField({ field, label, value, empty, placeholder, supplies, onValue, onMake }: SupplyProps) {
  const [maker, setMaker] = useState<string | null>(null)
  const pick = (next: string) => {
    if (next !== MAKE_SUPPLY) {
      setMaker(null)
      onValue(next)
    } else setMaker('')
  }
  const make = () => {
    if (onMake(field, maker ?? '')) setMaker(null)
  }
  return (
    <>
      <label className="field"><span className="label">{label}</span>
        <select value={value} onChange={(e) => pick(e.target.value)}>
          <option value="">{empty}</option>
          {supplies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          <option value={MAKE_SUPPLY}>+ Make a supply</option>
        </select>
      </label>
      {maker === null ? null : <SupplyMaker name={maker} placeholder={placeholder} onName={setMaker} onMake={make} onCancel={() => setMaker(null)} />}
    </>
  )
}
