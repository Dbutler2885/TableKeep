import { useState, type RefObject } from 'react'
import { inventoryFull } from '../../ruleSets/lubec/gear/placement'
import type { LubecGear } from '../../ruleSets/lubec/gear/gearRecord'
import type { LubecStockItem } from '../../ruleSets/lubec/gear/stock'
import { lubecSupplies } from '../../ruleSets/lubec/gear/supplies'
import { supplyNameIn } from './gearLabels'
import { lubecAddSheet, lubecCardSheet, type LubecItemSheetState } from './itemSheet'
import { LubecDragLayer } from './LubecDragLayer'
import { LubecDragContext } from './lubecDragMarks'
import type { LubecGearDrop } from './lubecGearDrop'
import { LubecGearArmor } from './LubecGearArmor'
import { LubecGearHandsBody } from './LubecGearHandsBody'
import { LubecGearPack, type LubecGearAdd, type LubecGearOpen } from './LubecGearPack'
import { LubecItemSheet } from './LubecItemSheet'
import { LubecStrengthPrompt } from './LubecStrengthPrompt'
import { lubecAskedThing, type LubecStrengthAsk } from './strengthAsk'
import { useLubecGearMoves, type LubecDropIt } from './useLubecGearMoves'
import { lubecAnswerStrength, useLubecStrengthAsk, type LubecGearStrength } from './useLubecStrengthAsk'
import { useLubecToast } from './useLubecToast'
import './lubecGear.css'
import './lubecGearSheet.css'
import './lubecGearArmor.css'

/** Saves the character's next gear; null for a viewer who may only look. */
export type LubecGearChange = ((gear: LubecGear) => void) | null

type LubecGearView = 'on-you' | 'carriers'

type GearPageProps = {
  gear: LubecGear
  onGearChange: LubecGearChange
  /** Drops a thing to the GM's Items tab; null for a viewer who may only look. */
  onDrop?: LubecGearDrop
  /** The campaign's own list for the stock picker's "This campaign"; empty, and so hidden, until the GM Items tab fills it. */
  campaignStock?: readonly LubecStockItem[]
  /** The sheet the Strength check rolls on, for the character's owner; null where nobody is asked. */
  strength?: LubecGearStrength
}

const NO_CAMPAIGN_STOCK: readonly LubecStockItem[] = []

function GearTabs({ view, onView }: { view: LubecGearView; onView: (view: LubecGearView) => void }) {
  const tab = (id: LubecGearView, label: string) => (
    <button type="button" role="tab" id={`lubec-gear-tab-${id}`} aria-selected={view === id} aria-controls={`lubec-gear-view-${id}`} onClick={() => onView(id)}>
      {label}
    </button>
  )
  return <nav className="tabs" role="tablist" aria-label="Gear views">{tab('on-you', 'On you')}{tab('carriers', 'Carriers')}</nav>
}

type GearBarProps = { view: LubecGearView; onView: (view: LubecGearView) => void; full: boolean; onAdd: (() => void) | null }

// The tab band: On you and Carriers on ink, the full tag and the add button at its end.
function GearBar({ view, onView, full, onAdd }: GearBarProps) {
  return (
    <div className="gear-bar">
      <GearTabs view={view} onView={onView} />
      <span className="bar-end">
        {full ? <span className="tag red">Full inventory / Speed −10</span> : null}
        {/* Items are mostly added by tapping an empty slot; this is for when every slot is full. */}
        {onAdd ? <button className="btn line small add-top" type="button" onClick={onAdd}>+ Add an item</button> : null}
      </span>
    </div>
  )
}

type OnYouProps = { gear: LubecGear; onAdd: LubecGearAdd; onOpen: LubecGearOpen; sectionRef: RefObject<HTMLElement | null> }

// On you: the backpack, the hands, the body and the armor worn, on one screen. Things on it are dragged to move them (Rule M7).
function OnYou({ gear, onAdd, onOpen, sectionRef }: OnYouProps) {
  const supplyName = supplyNameIn(lubecSupplies(gear))
  return (
    <section ref={sectionRef} id="lubec-gear-view-on-you" role="tabpanel" aria-labelledby="lubec-gear-tab-on-you">
      <div className="on-you">
        <LubecGearPack gear={gear} supplyName={supplyName} onAdd={onAdd} onOpen={onOpen} />
        <div className="side">
          <LubecGearHandsBody gear={gear} supplyName={supplyName} onAdd={onAdd} onOpen={onOpen} />
          <LubecGearArmor gear={gear} onAdd={onAdd} onOpen={onOpen} />
        </div>
      </div>
    </section>
  )
}

function Carriers() {
  return (
    <section id="lubec-gear-view-carriers" className="carriers-view" role="tabpanel" aria-labelledby="lubec-gear-tab-carriers">
      <p className="note">Carriers are on the way: a duffel bag, a chest at home, the family car.</p>
    </section>
  )
}

type SheetOpeners = { onAdd: LubecGearAdd; onOpen: LubecGearOpen }

// What opens the item sheet: the add form at a place, an item's card, and small stuff; none for a viewer who may only look.
function sheetOpeners(canEdit: boolean, setSheet: (sheet: LubecItemSheetState) => void): SheetOpeners {
  if (!canEdit) return { onAdd: null, onOpen: null }
  return {
    onAdd: (dest) => setSheet(lubecAddSheet(dest)),
    onOpen: { item: (id) => setSheet(lubecCardSheet(id)), small: () => setSheet({ mode: 'small' }), pieces: (part) => setSheet({ mode: 'pieces', part }) },
  }
}

// The one-line confirmation, which says "Moving..." while a move is being saved.
function Toast({ text, shown, busy }: { text: string; shown: boolean; busy: boolean }) {
  return <div className={`toast${shown || busy ? ' show' : ''}`} role="status" aria-live="polite">{busy ? 'Moving...' : text}</div>
}

type AskProps = {
  gear: LubecGear
  ask: LubecStrengthAsk
  strength: NonNullable<LubecGearStrength>
  change: (gear: LubecGear) => void
  setSheet: (sheet: LubecItemSheetState | null) => void
  toast: (text: string) => void
  drop: LubecDropIt
  setAsk: (ask: LubecStrengthAsk | null) => void
}

// The Strength prompt over the page, for the thing it asks about while that is still on the sheet; Done answers from the gear as it is then.
function StrengthAsk({ gear, ask, strength, setAsk, ...ctx }: AskProps) {
  const thing = lubecAskedThing(gear, ask)
  if (!thing) return null
  return (
    <LubecStrengthPrompt
      sheet={strength.sheet} onRolled={strength.onRolled} thing={thing} onCancel={() => setAsk(null)}
      onDone={(outcome) => lubecAnswerStrength({ ...ctx, setAsk }, gear, ask, outcome)}
    />
  )
}

// One prompt for each thing asked about, so a roll made for one is never shown for the next.
const askKey = (ask: LubecStrengthAsk) => (ask.kind === 'pending' ? `pending:${ask.itemId}` : ask.kind)

type AskOverProps = Omit<AskProps, 'ask' | 'strength' | 'change' | 'setAsk'> & {
  asking: ReturnType<typeof useLubecStrengthAsk>
  strength: LubecGearStrength
  change: ((gear: LubecGear) => void) | null
}

// The prompt, while one is open for an owner who may change the gear.
function StrengthAskOver({ asking, strength, change, ...ctx }: AskOverProps) {
  if (!asking.ask || !strength || !change) return null
  return <StrengthAsk key={askKey(asking.ask)} ask={asking.ask} strength={strength} change={change} setAsk={asking.setAsk} {...ctx} />
}

/** The Lubec sheet's Gear page: the Gear bar, B's On you view of the backpack, the hands, the body and the armor, and the item sheet over it. */
export function LubecGearPage({ gear, onGearChange, onDrop = null, campaignStock = NO_CAMPAIGN_STOCK, strength = null }: GearPageProps) {
  const [view, setView] = useState<LubecGearView>('on-you')
  const [sheet, setSheet] = useState<LubecItemSheetState | null>(null)
  const toast = useLubecToast()
  const asking = useLubecStrengthAsk(gear, strength)
  const moves = useLubecGearMoves({ gear, onGearChange, onDrop, toast, setSheet, onAsk: asking.onAsk })
  const { onAdd, onOpen } = sheetOpeners(moves.change !== null, setSheet)
  return (
    <div className="lubec-page lubec-gear" aria-busy={moves.busy}>
      <GearBar view={view} onView={setView} full={inventoryFull(gear)} onAdd={onAdd && (() => onAdd('backpack#0'))} />
      <LubecDragContext value={moves.drag.view}>
        {view === 'on-you' ? <OnYou gear={gear} onAdd={onAdd} onOpen={onOpen} sectionRef={moves.onYou} /> : <Carriers />}
      </LubecDragContext>
      {moves.change && sheet ? (
        <LubecItemSheet
          sheet={sheet} gear={gear} onGearChange={moves.change} onSheet={setSheet} toast={toast.show} campaignStock={campaignStock}
          onDrop={moves.drop} busy={moves.busy} onAsk={asking.onAsk}
        />
      ) : null}
      <StrengthAskOver gear={gear} asking={asking} strength={strength} change={moves.change} setSheet={setSheet} toast={toast.show} drop={moves.drop} />
      <LubecDragLayer view={moves.drag.view} item={gear.items.find((x) => x.id === moves.drag.view?.itemId)} ghost={moves.drag.ghost} dropZone={moves.drag.dropZone} />
      <Toast text={toast.text} shown={toast.shown} busy={moves.busy} />
    </div>
  )
}
