import type { LubecGear, LubecItem, LubecSupply } from '../../ruleSets/lubec/gear/gearRecord'
import { cardEyebrow, cardTitle, lubecCardFacts, type LubecCardFact } from './cardFacts'
import { LubecCardPicture } from './LubecGearArt'
import { LubecMovePanel, LUBEC_MOVE_PANEL } from './LubecMovePanel'
import { LubecSheetHead } from './LubecSheetHead'

/** What the card's buttons do: step a count, use one, open the edit form, open the Move panel, move, drop, or close. */
export type LubecCardActions = {
  onStep: (field: 'qty' | 'loaded', d: number) => void
  onUseOne: () => void
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

function Facts({ facts, onStep }: { facts: LubecCardFact[]; onStep: LubecCardActions['onStep'] }) {
  return (
    <dl className="facts item-facts">
      {facts.map((f) => [
        <dt key={`${f.term}-t`}>{f.term}</dt>,
        <dd key={`${f.term}-d`}>{f.step ? <Stepper f={f} onStep={onStep} /> : f.text}</dd>,
      ])}
    </dl>
  )
}

// Rule L10: a consumable that isn't a loose supply has "Use one"; a loose supply's count changes with − and +.
const canUseOne = (i: LubecItem) => i.kind === 'consumable' && i.qty > 0 && !i.fits

function StockRow({ item }: { item: LubecItem }) {
  return <div className="stock-row"><p>{item.stock ? <>From stock: <b>{item.stock}</b>.</> : 'Made by hand.'}</p></div>
}

// Dropping from a hand is free, so its button says so (Rule M4).
const dropLabel = (i: LubecItem, busy: boolean) => {
  if (busy) return 'Moving...'
  return i.carrier === 'hands' ? 'Drop / free' : 'Drop'
}

type FootProps = Omit<CardProps, 'supplies'>

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
export function LubecItemCard({ supplies, ...props }: CardProps) {
  const { gear, item, actions } = props
  return (
    <div className="sheet-form">
      <LubecSheetHead eyebrow={cardEyebrow(item)} title={cardTitle(item)} onClose={actions.onClose} />
      <div className="card-top">
        <LubecCardPicture item={item} name={item.name} />
        <p className={`item-note${item.note ? '' : ' empty'}`}>{item.note || 'No description yet. Tap Edit to add one.'}</p>
      </div>
      <Facts facts={lubecCardFacts(gear, item, supplies)} onStep={actions.onStep} />
      <StockRow item={item} />
      {canUseOne(item) ? <div className="kind-actions"><button type="button" className="btn" onClick={actions.onUseOne}>Use one</button></div> : null}
      <CardFoot {...props} />
    </div>
  )
}
