import { useState, type ReactNode } from 'react'
import { lubecCarrierTypeLabel } from '../../ruleSets/lubec/gear/carriers'
import type { LubecCarrier, LubecGear, LubecPocket } from '../../ruleSets/lubec/gear/gearRecord'
import { itemsIn, pocketUsed } from '../../ruleSets/lubec/gear/placement'
import { lubecDetailCountRest, lubecPocketCountRest, lubecPocketHasRoom } from './carrierLabels'
import type { LubecGearAdd } from './LubecGearPack'
import { LubecCarrierFacts, LubecCarrierUse } from './LubecCarriersList'
import { LubecCarrierRow } from './LubecCarrierRow'
import { LubecPrompt } from './LubecLoadPrompts'

/** Carries a carrier by special dispensation, or puts it down (Rule C3); null for a viewer who may only look. */
export type LubecGearCarry = ((carrierId: string, carried: boolean) => void) | null

type Opens = { onAdd: LubecGearAdd; onOpenItem: ((itemId: string) => void) | null }

type PocketProps = Opens & { gear: LubecGear; carrier: LubecCarrier; pocket: LubecPocket; k: number }

// One pocket: its things, and "+ Put something in" while it has room.
function PocketSection({ gear, carrier, pocket, k, onAdd, onOpenItem }: PocketProps) {
  const things = itemsIn(gear, carrier.id).filter((i) => i.pocket === k)
  return (
    <div className="pocket-section">
      <div className="section-head"><h3>{pocket.name}</h3><span className="count"><b>{pocketUsed(gear, carrier.id, k)}</b>{lubecPocketCountRest(pocket)}</span></div>
      <div className="row-list">
        {things.map((i) => <LubecCarrierRow key={i.id} item={i} onOpen={onOpenItem} />)}
        {onAdd && lubecPocketHasRoom(gear, carrier, k) ? <AddRow text="+ Put something in" onClick={() => onAdd(`${carrier.id}#${k}`)} /> : null}
      </div>
    </div>
  )
}

function AddRow({ text, onClick }: { text: string; onClick: () => void }) {
  return <button type="button" className="row-item add" onClick={onClick}><span>{text}</span><span /></button>
}

// Small stuff: things too small to take a slot, in any pocket (Rule S4).
function SmallSection({ gear, carrier, onAdd, onOpenItem }: Opens & { gear: LubecGear; carrier: LubecCarrier }) {
  const small = itemsIn(gear, carrier.id).filter((i) => i.pocket == null)
  return (
    <div className="pocket-section">
      <div className="section-head"><h3>Small stuff</h3><span className="count">no slots</span></div>
      <div className="row-list">
        {small.map((i) => <LubecCarrierRow key={i.id} item={i} onOpen={onOpenItem} kindLine={false} />)}
        {onAdd ? <AddRow text="+ Add a small thing" onClick={() => onAdd(`${carrier.id}#small`)} /> : null}
      </div>
    </div>
  )
}

type CarryProps = { carrier: LubecCarrier; onCarry: Exclude<LubecGearCarry, null> }

/** B's `carryPrompt`: carrying a carrier is the one way past the carry limit, by special dispensation from the table. */
function CarryPrompt({ carrier, onCarry, onClose }: CarryProps & { onClose: () => void }) {
  return (
    <LubecPrompt
      eyebrow={<span className="prompt-who">Past the carry limit</span>} title={`Carry ${carrier.name}?`}
      text="Carrying a carrier is the one way past the carry limit. It requires special dispensation from the table."
      error={null} onClose={onClose}
      buttons={[
        { label: 'Cancel', cls: 'line', onPress: onClose },
        { label: 'Carry it', cls: 'dispensation', sub: 'Requires special dispensation', onPress: () => { onClose(); onCarry(carrier.id, true) } },
      ]}
    />
  )
}

/** The red box (Rule C3): carrying it by special dispensation, or putting it down. */
function CarryArea({ carrier, onCarry }: CarryProps) {
  const [asking, setAsking] = useState(false)
  if (carrier.carried) {
    return (
      <div className="dispensation-box">
        <div className="head">Carried / special dispensation</div>
        <p>You are carrying {carrier.name} past the carry limit.</p>
        <button type="button" className="btn line" onClick={() => onCarry(carrier.id, false)}>Put it down</button>
      </div>
    )
  }
  return (
    <div className="dispensation-box">
      <div className="head">Requires special dispensation</div>
      <p>Carrying a carrier goes past the carry limit. The table allows it or doesn't.</p>
      <button type="button" className="btn dispensation" onClick={() => setAsking(true)}>Carry it<small>Requires special dispensation</small></button>
      {asking ? <CarryPrompt carrier={carrier} onCarry={onCarry} onClose={() => setAsking(false)} /> : null}
    </div>
  )
}

export type LubecCarrierDetailProps = Opens & {
  gear: LubecGear
  carrier: LubecCarrier
  owner: string
  onBack: () => void
  onCarry: LubecGearCarry
  /** True for a shared carrier, which the whole group can get into. */
  shared?: boolean
  /** True for a hidden carrier. */
  hidden?: boolean
  /** What the carrier's owner may do to it, under its facts. */
  manage?: ReactNode
}

/** B's carrier detail: its name and how full it is, each pocket's things, small stuff, and the red box. */
export function LubecCarrierDetail({ gear, carrier, owner, onBack, onCarry, shared = false, hidden = false, manage = null, ...opens }: LubecCarrierDetailProps) {
  return (
    <>
      <button className="btn line back" type="button" onClick={onBack}>← All carriers</button>
      <div className="detail-head">
        <div className="eyebrow">{lubecCarrierTypeLabel(carrier.type)}</div>
        <h2>{carrier.name}</h2>
        <div className="count"><LubecCarrierUse gear={gear} carrier={carrier} />{lubecDetailCountRest(gear, carrier)}</div>
        <LubecCarrierFacts owner={owner} shared={shared} hidden={hidden} />
        {manage}
      </div>
      {carrier.pockets.map((p, k) => <PocketSection key={k} gear={gear} carrier={carrier} pocket={p} k={k} {...opens} />)}
      <SmallSection gear={gear} carrier={carrier} {...opens} />
      {onCarry ? <div className="carry-area"><CarryArea carrier={carrier} onCarry={onCarry} /></div> : null}
    </>
  )
}
