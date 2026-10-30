import { lubecCarrierTypeLabel } from '../../ruleSets/lubec/gear/carriers'
import { lubecCarrierGear } from '../../ruleSets/lubec/gear/containers'
import { LUBEC_BACKPACK_POCKETS, lubecItemsNeedingAPlace, type LubecCarrier, type LubecGear } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecCarrierUse, lubecMeterCells, lubecPocketsText, type LubecCarrierShown } from './carrierLabels'
import { LubecCarrierRow } from './LubecCarrierRow'
import type { LubecSharedSeat } from './lubecSharedSeat'
import { LUBEC_SHARED_ACCESS } from './sharedCarrierLabels'

/** The built-in backpack's card, which opens On you. */
const BACKPACK: LubecCarrierShown & { name: string } = { id: 'backpack', name: 'Backpack', pockets: LUBEC_BACKPACK_POCKETS }

const METER_CLASS = { off: '', on: 'on', heavy: 'on heavy', gap: 'gap' } as const

/** B's `meter`: a box for each slot, filled for what is in it, or "plenty of room" over 24 slots (Rule C4). */
export function LubecCarrierMeter({ gear, carrier }: { gear: LubecGear; carrier: LubecCarrierShown }) {
  const cells = lubecMeterCells(gear, carrier)
  if (!cells) return <div className="vast">Plenty of room. Big things are settled at the table.</div>
  return <div className="meter" aria-hidden="true">{cells.map((cell, k) => <i key={k} className={METER_CLASS[cell] || undefined} />)}</div>
}

/** How much is used: "<b>3</b> of 8 used". */
export function LubecCarrierUse({ gear, carrier }: { gear: LubecGear; carrier: LubecCarrierShown }) {
  const u = lubecCarrierUse(gear, carrier)
  return <><b>{u.used}</b> of {u.capacity} used</>
}

type FactsProps = { owner: string; pockets?: string; shared?: boolean }

/** A carrier's owner, who can get into it and who knows of it (B's facts): the character, and everyone. A shared carrier's access is the whole group. */
export function LubecCarrierFacts({ owner, pockets, shared = false }: FactsProps) {
  return (
    <dl className="facts">
      {pockets === undefined ? null : <><dt>Pockets</dt><dd>{pockets}</dd></>}
      <dt>Owner</dt><dd className={shared ? 'owner-line' : undefined}>{owner}</dd>
      <dt>Access</dt><dd>{shared ? LUBEC_SHARED_ACCESS : owner}</dd>
      <dt>Known</dt><dd>Known to all</dd>
    </dl>
  )
}

type CardProps = { gear: LubecGear; carrier: LubecCarrierShown & { name: string; carried?: boolean }; type: string; owner: string; onOpen: () => void; shared?: boolean }

// One card of the list (B's `renderCarriers`); B's `personal` class is the built-in backpack's heavier border.
function CarrierCard({ gear, carrier, type, owner, onOpen, shared = false }: CardProps) {
  return (
    <button type="button" className={`carrier-card${carrier.id === BACKPACK.id ? ' personal' : ''}`} onClick={onOpen}>
      <div className="card-head">
        <div><h3>{carrier.name}</h3><div className="type label">{type}</div></div>
        <span className="tags">{carrier.carried ? <span className="tag red">Carried</span> : null}{shared ? <span className="tag blue">Shared</span> : null}<span className="tag ghost">Known to all</span></span>
      </div>
      <div className="count"><LubecCarrierUse gear={gear} carrier={carrier} /></div>
      <LubecCarrierMeter gear={gear} carrier={carrier} />
      <LubecCarrierFacts owner={owner} pockets={lubecPocketsText(carrier.pockets)} shared={shared} />
    </button>
  )
}

const thingsWord = (n: number) => `${n} thing${n === 1 ? '' : 's'}`

/** Things whose place cannot be read (spec 4.9): listed here, never dropped and never placed for the player. */
function NeedsAPlace({ gear, onOpenItem }: { gear: LubecGear; onOpenItem: ((itemId: string) => void) | null }) {
  const lost = lubecItemsNeedingAPlace(gear)
  if (!lost.length) return null
  return (
    <div className="pocket-section needs-place">
      <div className="section-head"><h3>Needs a place</h3><span className="count">{thingsWord(lost.length)}</span></div>
      <p className="note">The sheet can't tell where these are, so they count for nothing. Open one and move it somewhere.</p>
      <div className="row-list">{lost.map((i) => <LubecCarrierRow key={i.id} item={i} onOpen={onOpenItem} />)}</div>
    </div>
  )
}

export type LubecCarriersListProps = {
  gear: LubecGear
  /** The character, who owns every personal carrier. */
  owner: string
  onOnYou: () => void
  onOpenCarrier: (id: string) => void
  /** Opens the add-carrier dialog; null for a viewer who may only look. */
  onNewCarrier: (() => void) | null
  onOpenItem: ((itemId: string) => void) | null
  /** The campaign's shared carriers; null on a sheet that has none. */
  shared: LubecSharedSeat | null
}

/** B's Carriers list: the backpack's card first, then each personal carrier, each shared carrier, and anything that needs a place. */
export function LubecCarriersList({ gear, owner, onOnYou, onOpenCarrier, onNewCarrier, onOpenItem, shared }: LubecCarriersListProps) {
  return (
    <>
      <div className="carriers-top">
        <div><h2>Carriers</h2><div className="count">They hold things. They never slow you down.</div></div>
        {onNewCarrier ? <button className="btn" type="button" onClick={onNewCarrier}>+ New carrier</button> : null}
      </div>
      <div className="carrier-list">
        <CarrierCard gear={gear} carrier={BACKPACK} type="Everyone has one" owner={owner} onOpen={onOnYou} />
        {gear.carriers.map((c: LubecCarrier) => (
          <CarrierCard key={c.id} gear={gear} carrier={c} type={lubecCarrierTypeLabel(c.type)} owner={owner} onOpen={() => onOpenCarrier(c.id)} />
        ))}
        {shared?.carriers.map((c) => (
          <CarrierCard key={c.id} gear={lubecCarrierGear(c)} carrier={c} type={lubecCarrierTypeLabel(c.type)} owner={shared.ownerOf(c)} onOpen={() => onOpenCarrier(c.id)} shared />
        ))}
      </div>
      <NeedsAPlace gear={gear} onOpenItem={onOpenItem} />
    </>
  )
}
