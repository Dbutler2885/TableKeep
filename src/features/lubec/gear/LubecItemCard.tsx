import type { LubecGear, LubecItem, LubecSupply } from '../../ruleSets/lubec/gear/gearRecord'
import { cardEyebrow, cardTitle, lubecCardFacts, type LubecCardFact } from './cardFacts'
import { LubecCardPicture } from './LubecGearArt'
import { LubecSheetHead } from './LubecSheetHead'

/** What the card's buttons do: step a count, use one, open the edit form, or close. */
export type LubecCardActions = {
  onStep: (field: 'qty' | 'loaded', d: number) => void
  onUseOne: () => void
  onEdit: () => void
  onClose: () => void
}

type CardProps = { gear: LubecGear; item: LubecItem; supplies: readonly LubecSupply[]; error: string | null; actions: LubecCardActions }

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

/** The item card: its picture beside its description, its facts, and Edit (B's card mode of the item sheet). */
export function LubecItemCard({ gear, item, supplies, error, actions }: CardProps) {
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
      <div className="sheet-foot">
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="actions"><button className="btn line" type="button" onClick={actions.onEdit}>Edit</button></div>
      </div>
    </div>
  )
}
