import { useState } from 'react'
import { lubecCarry } from '../../ruleSets/lubec/gear/carriers'
import type { LubecGear } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecCarryingToast } from './carrierLabels'
import type { LubecGearCarry } from './LubecCarrierDetail'

/** The Gear page's views (B's `show`): On you, the Carriers list, and one carrier's detail. */
export type LubecGearView = { name: 'on-you' | 'carriers' } | { name: 'carrier'; carrierId: string }

/** Which view is showing, and B's `show` and `openCarrier`. */
export function useLubecGearView() {
  const [view, setView] = useState<LubecGearView>({ name: 'on-you' })
  return { view, show: (name: 'on-you' | 'carriers') => setView({ name }), openCarrier: (carrierId: string) => setView({ name: 'carrier', carrierId }) }
}

export type LubecCarrierActsOptions = { gear: LubecGear; change: ((gear: LubecGear) => void) | null; toast: (text: string) => void }

// Carrying it, or putting it down, is one commit; carrying says so (B's `carryPrompt`).
const carryOf = ({ gear, change, toast }: LubecCarrierActsOptions): LubecGearCarry => change && ((id, carried) => {
  change(lubecCarry(gear, id, carried))
  const c = gear.carriers.find((x) => x.id === id)
  if (carried && c) toast(lubecCarryingToast(c))
})

/** The Carriers view's edits: carrying a carrier, and the add-carrier dialog, open or not. None for a viewer who may only look. */
export function useLubecCarrierActs(options: LubecCarrierActsOptions) {
  const [adding, setAdding] = useState(false)
  return { onCarry: carryOf(options), onNewCarrier: options.change && (() => setAdding(true)), adding, close: () => setAdding(false) }
}

export type LubecCarrierActs = ReturnType<typeof useLubecCarrierActs>
