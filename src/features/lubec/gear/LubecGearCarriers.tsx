import { useEffect, useRef } from 'react'
import { lubecCarried } from '../../ruleSets/lubec/gear/carriers'
import type { LubecCarrier, LubecGear } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecCarrierAddedToast } from './carrierLabels'
import { LubecCarrierDetail, type LubecGearCarry } from './LubecCarrierDetail'
import { LubecCarrierDialog } from './LubecCarrierDialog'
import { LubecCarrierUse, LubecCarriersList } from './LubecCarriersList'
import type { LubecGearAdd } from './LubecGearPack'
import { lubecMarkOf, useLubecDropClass } from './lubecDragMarks'
import type { LubecCarrierActs, LubecCarrierActsOptions, LubecGearView } from './useLubecCarriers'

// B starts a carrier at the top of the page: the list scrolls back to its top on a desktop, and a phone brings the view up when it is above the screen.
function useTopOnOpen(key: string) {
  const ref = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.scrollTop = 0
    if (el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start' })
  }, [key])
  return ref
}

type CarriedRowProps = { gear: LubecGear; carrier: LubecCarrier; onOpenCarrier: (id: string) => void; onCarry: LubecGearCarry }

// A carried carrier on On you: things can be dragged onto it, and it opens or is put down from here.
function CarriedRow({ gear, carrier, onOpenCarrier, onCarry }: CarriedRowProps) {
  const lit = useLubecDropClass(lubecMarkOf(carrier.id, null))
  return (
    <div className={`row-item static${lit}`} data-drop={carrier.id}>
      <span>{carrier.name}<small><LubecCarrierUse gear={gear} carrier={carrier} /></small></span>
      <span className="tags">
        <button type="button" className="btn line small" onClick={() => onOpenCarrier(carrier.id)}>Open</button>
        {onCarry ? <button type="button" className="btn line small" onClick={() => onCarry(carrier.id, false)}>Put it down</button> : null}
      </span>
    </div>
  )
}

type CarryingProps = Omit<CarriedRowProps, 'carrier'>

/** B's Carrying panel on On you (`renderCarryingAndGround`): the carriers carried by special dispensation, shown only while there are any. */
export function LubecCarrying(props: CarryingProps) {
  const carried = lubecCarried(props.gear)
  if (!carried.length) return null
  return (
    <div className="panel ink">
      <div className="section-head"><h2>Carrying</h2><span className="tag red">Special dispensation</span></div>
      <div className="row-list">{carried.map((c) => <CarriedRow key={c.id} carrier={c} {...props} />)}</div>
    </div>
  )
}

type ViewProps = {
  gear: LubecGear
  owner: string
  view: Exclude<LubecGearView, { name: 'on-you' }>
  show: (name: 'on-you' | 'carriers') => void
  openCarrier: (id: string) => void
  onNewCarrier: (() => void) | null
  onAdd: LubecGearAdd
  onOpenItem: ((itemId: string) => void) | null
  onCarry: LubecGearCarry
}

// The open carrier, or the list when it is gone (deleted, or never there).
function CarriersBody({ gear, owner, view, show, openCarrier, onNewCarrier, onAdd, onOpenItem, onCarry }: ViewProps) {
  const carrier = view.name === 'carrier' ? gear.carriers.find((c) => c.id === view.carrierId) : undefined
  if (carrier) return <LubecCarrierDetail gear={gear} carrier={carrier} owner={owner} onBack={() => show('carriers')} onCarry={onCarry} onAdd={onAdd} onOpenItem={onOpenItem} />
  return <LubecCarriersList gear={gear} owner={owner} onOnYou={() => show('on-you')} onOpenCarrier={openCarrier} onNewCarrier={onNewCarrier} onOpenItem={onOpenItem} />
}

/** The Carriers tab's panel: B's list of carriers, or one carrier's detail. On a desktop it scrolls inside the pane. */
export function LubecCarriersView(props: ViewProps) {
  const ref = useTopOnOpen(props.view.name === 'carrier' ? props.view.carrierId : '')
  return (
    <section ref={ref} id="lubec-gear-view-carriers" className="carriers-view" role="tabpanel" aria-labelledby="lubec-gear-tab-carriers">
      <CarriersBody {...props} />
    </section>
  )
}

type DialogOverProps = LubecCarrierActsOptions & { acts: LubecCarrierActs }

/** The add-carrier dialog over the page, while it is open for a viewer who may change the gear. The new carrier is one commit. */
export function LubecCarrierDialogOver({ gear, change, toast, acts }: DialogOverProps) {
  if (!acts.adding || !change) return null
  const onAdded = (next: LubecGear, carrier: LubecCarrier) => {
    change(next)
    acts.close()
    toast(lubecCarrierAddedToast(carrier))
  }
  return <LubecCarrierDialog gear={gear} onAdded={onAdded} onClose={acts.close} toast={toast} />
}
