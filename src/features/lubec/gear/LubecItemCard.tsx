import type { LubecGear, LubecItem, LubecSupply } from '../../ruleSets/lubec/gear/gearRecord'
import type { LubecWielder } from '../../ruleSets/lubec/gear/minStrength'
import { LubecMissing } from '../LubecMissing'
import type { LubecCheck } from '../../ruleSets/lubec/gear/strengthCheck'
import { cardEyebrow, cardTitle, lubecCardFacts, type LubecCardFact } from './cardFacts'
import { LubecCardPicture } from './LubecGearArt'
import { LubecGiveFoot, LUBEC_GIVE_PANEL } from './LubecGivePanel'
import { LubecMovePanel, LUBEC_MOVE_PANEL } from './LubecMovePanel'
import { LubecSheetHead } from './LubecSheetHead'
import type { LubecCardGive } from './useLubecCardGive'
import { useLubecFightStart } from '../fight/lubecFightStart'
import { lubecHeld } from '../../ruleSets/lubec/gear/held'
import { lubecAttackButtons } from './weaponFacts'
import { isBox } from '../../ruleSets/lubec/gear/gearRules'
import type { LubecLoadAct, LubecLoadButton } from './loadLabels'
import { LubecLoadButtons, LubecTakeOutPanel } from './LubecLoadActions'

/** What the card's buttons do: step a count, use one, record the Strength roll, attack, load or unload, take some out of a box, set the table's penalty, open the edit form, open the Move panel, move, drop, or close. */
export type LubecCardActions = {
  onStep: (field: 'qty' | 'loaded', d: number) => void
  onUseOne: () => void
  onAttack: () => void
  onLoad: (act: LubecLoadAct) => void
  onTakeOut: (n: number) => void
  /** The table's own minimum Strength penalty; null clears it. */
  onTableSays: (penalty: number | null) => void
  onCheck: (check: LubecCheck) => void
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
  load: LubecCardLoad
  /** The card's Give; null for a viewer who may not give the thing away. */
  give: LubecCardGive | null
  actions: LubecCardActions
}

/** The card's loading buttons, whether a box's "Take some out" panel is open, and its cost line for a count. */
export type LubecCardLoad = { buttons: readonly LubecLoadButton[]; takeoutOpen: boolean; takeOutCost: (n: number) => string }

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

// The recorded Strength roll, as a switch: the manual override, which never touches Stress.
function CheckSwitch({ check, onCheck }: { check: LubecItem['check']; onCheck: LubecCardActions['onCheck'] }) {
  return (
    <span className="seg" role="group" aria-label="Strength roll, recorded">
      <button type="button" className="pass" aria-pressed={check === 'pass'} onClick={() => onCheck('pass')}>Passed</button>
      <button type="button" className="fail" aria-pressed={check === 'fail'} onClick={() => onCheck('fail')}>Failed</button>
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

type FactActions = Pick<LubecCardActions, 'onStep' | 'onTableSays' | 'onCheck'>

type FactProps = { f: LubecCardFact; check: LubecItem['check']; actions: FactActions }

// The sheet's missing mark after a value worked out from a hole.
function MissingMark({ f }: { f: LubecCardFact }) {
  if (!f.missing) return null
  return <>{f.text ? ' ' : null}<LubecMissing /></>
}

function FactValue({ f, check, actions }: FactProps) {
  if (f.step) return <Stepper f={f} onStep={actions.onStep} />
  return (
    <>
      {f.text}<MissingMark f={f} />
      {f.check ? <CheckSwitch check={check} onCheck={actions.onCheck} /> : null}
      {f.tableSays === undefined ? null : <TableSays value={f.tableSays} onTableSays={actions.onTableSays} />}
    </>
  )
}

function Facts({ facts, check, actions }: { facts: LubecCardFact[]; check: LubecItem['check']; actions: FactActions }) {
  return (
    <dl className="facts item-facts">
      {facts.map((f) => [
        <dt key={`${f.term}-t`}>{f.term}</dt>,
        <dd key={`${f.term}-d`} className={f.tone}><FactValue f={f} check={check} actions={actions} /></dd>,
      ])}
    </dl>
  )
}

// Rule L10: a consumable that isn't a loose supply has "Use one"; a loose supply's count changes with − and +.
const canUseOne = (i: LubecItem) => i.kind === 'consumable' && i.qty > 0 && !i.fits

// The available count also decides whether the box's "Take some out" panel is visible.
const takeOutCount = (item: LubecItem, load: LubecCardLoad) => isBox(item) && load.takeoutOpen ? item.loaded ?? 0 : 0

// A weapon in hand opens the fight modal with it chosen, for a viewer who may fight; the card closes under it.
function FightWithThis({ gear, item, onClose }: { gear: LubecGear; item: LubecItem; onClose: () => void }) {
  const start = useLubecFightStart()
  if (!start || !lubecHeld(gear).some((h) => h.itemId === item.id && h.weapon)) return null
  const fight = () => {
    onClose()
    start(item.id)
  }
  return <button type="button" className="btn" onClick={fight}>Fight with this</button>
}

/** The kind's own buttons: a weapon's attacks (B 2787-2793), "Fight with this", "Use one", and loading (B 2794-2803). */
function KindActions({ gear, item, load, actions }: { gear: LubecGear; item: LubecItem; load: LubecCardLoad; actions: LubecCardActions }) {
  const attacks = lubecAttackButtons(item)
  const takeOut = takeOutCount(item, load)
  if (!attacks.length && !canUseOne(item) && !load.buttons.length) return null
  return (
    <div className="kind-actions">
      {attacks.map((b) => <button key={b.label} type="button" className="btn" disabled={b.disabled} onClick={actions.onAttack}>{b.label}</button>)}
      <FightWithThis gear={gear} item={item} onClose={actions.onClose} />
      {canUseOne(item) ? <button type="button" className="btn" onClick={actions.onUseOne}>Use one</button> : null}
      <LubecLoadButtons buttons={load.buttons} takeoutOpen={load.takeoutOpen} onLoad={actions.onLoad} />
      {takeOut ? <LubecTakeOutPanel key={item.id} loaded={takeOut} costOf={load.takeOutCost} onTakeOut={actions.onTakeOut} /> : null}
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

type FootProps = Omit<CardProps, 'supplies' | 'wielder' | 'load'>

// While an offer is out there is nothing more to give, so the button rests and the row above it says who has been offered it.
function GiveButton({ give }: { give: LubecCardGive }) {
  return <button className="btn line" type="button" aria-expanded={give.open && !give.offered} aria-controls={LUBEC_GIVE_PANEL} disabled={give.offered !== null} onClick={give.onToggle}>Give</button>
}

// Only a viewer who may give the thing away has the fourth button.
function CardFoot({ gear, item, error, moveOpen, busy, give, actions }: FootProps) {
  return (
    <div className="sheet-foot">
      {moveOpen ? <LubecMovePanel key={item.id} gear={gear} item={item} busy={busy} onMove={actions.onMove} /> : null}
      {give ? <LubecGiveFoot item={item} give={give} /> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className={`actions ${give ? 'four' : 'three'}`}>
        <button className="btn line" type="button" onClick={actions.onEdit}>Edit</button>
        <button className="btn line" type="button" aria-expanded={moveOpen} aria-controls={LUBEC_MOVE_PANEL} onClick={actions.onToggleMove}>Move</button>
        {give ? <GiveButton give={give} /> : null}
        <button className="btn line" type="button" disabled={busy} onClick={actions.onDrop}>{dropLabel(item, busy)}</button>
      </div>
    </div>
  )
}

/** The item card: its picture beside its description, its facts, and Edit, Move, Give and Drop (B's card mode of the item sheet). */
export function LubecItemCard({ supplies, wielder, load, ...props }: CardProps) {
  const { gear, item, actions } = props
  return (
    <div className="sheet-form">
      <LubecSheetHead eyebrow={cardEyebrow(item, gear)} title={cardTitle(item)} onClose={actions.onClose} />
      <div className="card-top">
        <LubecCardPicture item={item} name={item.name} />
        <p className={`item-note${item.note ? '' : ' empty'}`}>{item.note || 'No description yet. Tap Edit to add one.'}</p>
      </div>
      <Facts facts={lubecCardFacts(gear, item, supplies, wielder)} check={item.check} actions={actions} />
      <StockRow item={item} />
      <KindActions gear={gear} item={item} load={load} actions={actions} />
      <CardFoot {...props} />
    </div>
  )
}
