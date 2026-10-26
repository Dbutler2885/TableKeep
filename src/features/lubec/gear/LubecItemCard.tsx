import type { LubecGear, LubecItem, LubecSupply } from '../../ruleSets/lubec/gear/gearRecord'
import type { LubecWielder } from '../../ruleSets/lubec/gear/minStrength'
import { LubecMissing } from '../LubecMissing'
import { cardEyebrow, cardTitle, lubecCardFacts, type LubecCardFact } from './cardFacts'
import { LubecCardPicture } from './LubecGearArt'
import { LubecMovePanel, LUBEC_MOVE_PANEL } from './LubecMovePanel'
import { LubecSheetHead } from './LubecSheetHead'
import { lubecAttackButtons } from './weaponFacts'

/** What the card's buttons do: step a count, use one, attack, set the table's penalty, open the edit form, open the Move panel, move, drop, or close. */
export type LubecCardActions = {
  onStep: (field: 'qty' | 'loaded', d: number) => void
  onUseOne: () => void
  onAttack: () => void
  /** The table's own minimum Strength penalty; null clears it. */
  onTableSays: (penalty: number | null) => void
  onEdit: () => void
  onToggleMove: () => void
  onMove: (value: string) => void
  onDrop: () => void
  onClose: () => void
}

type CardProps = {
  gear: LubecGear
  item: LubecItem
  supplies: readonly LubecSupply[]
  /** The character's Strength and Handle, for a weapon's minimum Strength. */
  wielder: LubecWielder
  error: string | null
  /** True while the Move panel is open. */
  moveOpen: boolean
  /** True while a move is being saved. */
  busy: boolean
  actions: LubecCardActions
}

function Stepper({ f, onStep }: { f: LubecCardFact; onStep: LubecCardActions['onStep'] }) {
  const field = f.step as 'qty' | 'loaded'
  return (
    <span className="stepper">
      <button type="button" aria-label="One fewer" onClick={() => onStep(field, -1)}>−</button>
      <b>{f.text}</b>
      <button type="button" aria-label="One more" onClick={() => onStep(field, 1)}>+</button>
    </span>
  )
}

// The box is empty while the table says nothing; a number typed with a minus sign is the same penalty.
const penaltyOf = (raw: string): number | null => (raw.trim() === '' ? null : Math.abs(Math.round(Number(raw) || 0)))

/** The table's own minimum Strength penalty: what it says replaces the worked-out one (spec 5.4). */
function TableSays({ value, onTableSays }: { value: number | null; onTableSays: LubecCardActions['onTableSays'] }) {
  return (
    <label className="field table-says">
      <span className="label">Table says</span>
      <input type="number" min="0" max="999" inputMode="numeric" value={value ?? ''} onChange={(e) => onTableSays(penaltyOf(e.target.value))} />
    </label>
  )
}

type FactActions = Pick<LubecCardActions, 'onStep' | 'onTableSays'>

function FactValue({ f, actions }: { f: LubecCardFact; actions: FactActions }) {
  if (f.step) return <Stepper f={f} onStep={actions.onStep} />
  return (
    <>
      {f.text}{f.missing ? <>{f.text ? ' ' : null}<LubecMissing /></> : null}
      {f.tableSays === undefined ? null : <TableSays value={f.tableSays} onTableSays={actions.onTableSays} />}
    </>
  )
}

function Facts({ facts, actions }: { facts: LubecCardFact[]; actions: FactActions }) {
  return (
    <dl className="facts item-facts">
      {facts.map((f) => [
        <dt key={`${f.term}-t`}>{f.term}</dt>,
        <dd key={`${f.term}-d`} className={f.tone}><FactValue f={f} actions={actions} /></dd>,
      ])}
    </dl>
  )
}

// Rule L10: a consumable that isn't a loose supply has "Use one"; a loose supply's count changes with − and +.
const canUseOne = (i: LubecItem) => i.kind === 'consumable' && i.qty > 0 && !i.fits

/** The kind's own buttons: a weapon's attacks (B 2787-2793), and "Use one". */
function KindActions({ item, actions }: { item: LubecItem; actions: LubecCardActions }) {
  const attacks = lubecAttackButtons(item)
  if (!attacks.length && !canUseOne(item)) return null
  return (
    <div className="kind-actions">
      {attacks.map((b) => <button key={b.label} type="button" className="btn" disabled={b.disabled} onClick={actions.onAttack}>{b.label}</button>)}
      {canUseOne(item) ? <button type="button" className="btn" onClick={actions.onUseOne}>Use one</button> : null}
    </div>
  )
}

function StockRow({ item }: { item: LubecItem }) {
  return <div className="stock-row"><p>{item.stock ? <>From stock: <b>{item.stock}</b>.</> : 'Made by hand.'}</p></div>
}

// Dropping from a hand is free, so its button says so (Rule M4).
const dropLabel = (i: LubecItem, busy: boolean) => {
  if (busy) return 'Moving...'
  return i.carrier === 'hands' ? 'Drop / free' : 'Drop'
}

type FootProps = Omit<CardProps, 'supplies' | 'wielder'>

// Give is the transfer's button (G28), so the row is Edit, Move and Drop for now.
function CardFoot({ gear, item, error, moveOpen, busy, actions }: FootProps) {
  return (
    <div className="sheet-foot">
      {moveOpen ? <LubecMovePanel key={item.id} gear={gear} item={item} busy={busy} onMove={actions.onMove} /> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="actions three">
        <button className="btn line" type="button" onClick={actions.onEdit}>Edit</button>
        <button className="btn line" type="button" aria-expanded={moveOpen} aria-controls={LUBEC_MOVE_PANEL} onClick={actions.onToggleMove}>Move</button>
        <button className="btn line" type="button" disabled={busy} onClick={actions.onDrop}>{dropLabel(item, busy)}</button>
      </div>
    </div>
  )
}

/** The item card: its picture beside its description, its facts, and Edit, Move and Drop (B's card mode of the item sheet). */
export function LubecItemCard({ supplies, wielder, ...props }: CardProps) {
  const { gear, item, actions } = props
  return (
    <div className="sheet-form">
      <LubecSheetHead eyebrow={cardEyebrow(item)} title={cardTitle(item)} onClose={actions.onClose} />
      <div className="card-top">
        <LubecCardPicture item={item} name={item.name} />
        <p className={`item-note${item.note ? '' : ' empty'}`}>{item.note || 'No description yet. Tap Edit to add one.'}</p>
      </div>
      <Facts facts={lubecCardFacts(gear, item, supplies, wielder)} actions={actions} />
      <StockRow item={item} />
      <KindActions item={item} actions={actions} />
      <CardFoot {...props} />
    </div>
  )
}
