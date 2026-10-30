import { useState, type RefObject } from 'react'
import { LUBEC_CARRIER_KINDS, type LubecCarrierKind } from '../../ruleSets/lubec/gear/carriers'
import { inventoryFull } from '../../ruleSets/lubec/gear/placement'
import type { LubecGear } from '../../ruleSets/lubec/gear/gearRecord'
import type { LubecHiddenCarrier } from '../../ruleSets/lubec/gear/hiddenCarrier'
import type { LubecWielder } from '../../ruleSets/lubec/gear/minStrength'
import type { LubecSharedCarrier } from '../../ruleSets/lubec/gear/sharedCarrier'
import type { LubecStockItem } from '../../ruleSets/lubec/gear/stock'
import { lubecSupplies } from '../../ruleSets/lubec/gear/supplies'
import { supplyNameIn } from './gearLabels'
import { lubecAddSheet, lubecCardSheet, type LubecItemSheetState } from './itemSheet'
import { LubecDragLayer } from './LubecDragLayer'
import { LubecDragContext } from './lubecDragMarks'
import type { LubecGearDrop } from './lubecGearDrop'
import type { LubecGearGive } from './lubecGive'
import { lubecHiddenAdder, type LubecGearHidden } from './lubecHiddenCarrierWrites'
import { LubecGearArmor } from './LubecGearArmor'
import { LubecGearHandsBody } from './LubecGearHandsBody'
import { LubecGearPack, type LubecGearAdd, type LubecGearOpen } from './LubecGearPack'
import { LubecItemSheet } from './LubecItemSheet'
import { LubecStrengthPrompt } from './LubecStrengthPrompt'
import { lubecAskedThing, type LubecStrengthAsk } from './strengthAsk'
import { useLubecGearMoves, type LubecDropIt } from './useLubecGearMoves'
import type { LubecGearCarry } from './LubecCarrierDetail'
import { LubecCarrierDialogOver, LubecCarriersView, LubecCarrying } from './LubecGearCarriers'
import { lubecGearWork, lubecOpenHidden, lubecOpenShared, type LubecGearWork } from './lubecGearWork'
import type { LubecSharedSeat } from './lubecSharedSeat'
import { useLubecCarrierActs, useLubecGearView, type LubecGearView } from './useLubecCarriers'
import { useLubecHiddenCarriers } from './useLubecHiddenCarriers'
import { lubecAnswerStrength, useLubecStrengthAsk, type LubecGearStrength } from './useLubecStrengthAsk'
import { useLubecToast } from './useLubecToast'
import './lubecGear.css'
import './lubecGearSheet.css'
import './lubecGearArmor.css'
import './lubecGearWeapons.css'
import './lubecGearLoading.css'
import './lubecPackPicker.css'
import './lubecGearCarriers.css'

/** Saves the character's next gear; null for a viewer who may only look. */
export type LubecGearChange = ((gear: LubecGear) => void) | null

type GearPageProps = {
  gear: LubecGear
  /** The character's name, who owns the personal carriers. */
  owner: string
  /** The character's Strength and Handle, which a weapon's card reads. */
  wielder: LubecWielder
  onGearChange: LubecGearChange
  /** Drops a thing to the GM's Items tab; null for a viewer who may only look. */
  onDrop?: LubecGearDrop
  /** The GM Items tab's campaign items, for the stock picker's "This campaign"; while there are none it is hidden. */
  campaignStock?: readonly LubecStockItem[]
  /** The sheet the Strength check rolls on, for the character's owner; null where nobody is asked. */
  strength?: LubecGearStrength
  /** The kinds of carrier the add-carrier dialog offers; every kind unless said otherwise. */
  kinds?: readonly LubecCarrierKind[]
  /** Gives things to other people's characters; null for a viewer who may not. */
  give?: LubecGearGive | null
  /** The viewer's seat at the campaign's shared carriers; null on a sheet that has none. */
  shared?: LubecSharedSeat | null
  /** The character's hidden carriers, for its owner and the GM; anyone else's page never asks for them. */
  hidden?: LubecGearHidden | null
}

const NO_CAMPAIGN_STOCK: readonly LubecStockItem[] = []

// "+ Add an item" adds to the shared or hidden carrier that is open, or else the backpack.
const addPlaceOf = (open: Pick<LubecSharedCarrier, 'id'> | null) => (open ? `${open.id}#0` : 'backpack#0')

type GearTab = 'on-you' | 'carriers'

// A carrier's detail is under the Carriers tab, as in B.
const tabOf = (view: LubecGearView): GearTab => (view.name === 'on-you' ? 'on-you' : 'carriers')

function GearTabs({ view, onView }: { view: LubecGearView; onView: (tab: GearTab) => void }) {
  const tab = (id: GearTab, label: string) => (
    <button type="button" role="tab" id={`lubec-gear-tab-${id}`} aria-selected={tabOf(view) === id} aria-controls={`lubec-gear-view-${id}`} onClick={() => onView(id)}>
      {label}
    </button>
  )
  return <nav className="tabs" role="tablist" aria-label="Gear views">{tab('on-you', 'On you')}{tab('carriers', 'Carriers')}</nav>
}

type GearBarProps = { view: LubecGearView; onView: (tab: GearTab) => void; full: boolean; onAdd: (() => void) | null }

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

type OnYouProps = {
  gear: LubecGear
  onAdd: LubecGearAdd
  onOpen: LubecGearOpen
  onGearChange: LubecGearChange
  sectionRef: RefObject<HTMLElement | null>
  onOpenCarrier: (id: string) => void
  onCarry: LubecGearCarry
}

// On you: the backpack, the hands, the body, the armor worn and any carrier carried, on one screen. Things on it are dragged to move them (Rule M7).
function OnYou({ gear, onAdd, onOpen, onGearChange, sectionRef, onOpenCarrier, onCarry }: OnYouProps) {
  const supplyName = supplyNameIn(lubecSupplies(gear))
  return (
    <section ref={sectionRef} id="lubec-gear-view-on-you" role="tabpanel" aria-labelledby="lubec-gear-tab-on-you">
      <div className="on-you">
        <LubecGearPack gear={gear} supplyName={supplyName} onAdd={onAdd} onOpen={onOpen} onGearChange={onGearChange} />
        <div className="side">
          <LubecGearHandsBody gear={gear} supplyName={supplyName} onAdd={onAdd} onOpen={onOpen} />
          <LubecGearArmor gear={gear} onAdd={onAdd} onOpen={onOpen} />
          <LubecCarrying gear={gear} onOpenCarrier={onOpenCarrier} onCarry={onCarry} />
        </div>
      </div>
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

type ViewsProps = Omit<OnYouProps, 'onGearChange' | 'sectionRef'> & {
  hidden: readonly LubecHiddenCarrier[]
  owner: string
  nav: ReturnType<typeof useLubecGearView>
  moves: ReturnType<typeof useLubecGearMoves>
  onNewCarrier: (() => void) | null
  shared: LubecSharedSeat | null
  toast: (text: string) => void
}

// The view the tabs show: On you, or the Carriers list and a carrier's detail.
function GearViews({ nav, moves, hidden, owner, onNewCarrier, shared, toast, ...props }: ViewsProps) {
  if (nav.view.name === 'on-you') return <OnYou {...props} onGearChange={moves.change} sectionRef={moves.onYou} />
  const { gear, onAdd, onOpen, onCarry } = props
  return (
    <LubecCarriersView
      gear={gear} hidden={hidden} owner={owner} view={nav.view} show={nav.show} openCarrier={nav.openCarrier}
      onNewCarrier={onNewCarrier} onAdd={onAdd} onOpenItem={onOpen && onOpen.item} onCarry={onCarry} shared={shared} toast={toast}
    />
  )
}

type SheetOverProps = {
  work: LubecGearWork
  sheet: LubecItemSheetState | null
  setSheet: (sheet: LubecItemSheetState | null) => void
  toast: (text: string) => void
  campaignStock: readonly LubecStockItem[]
  busy: boolean
  onAsk: ReturnType<typeof useLubecStrengthAsk>['onAsk']
  wielder: LubecWielder
  give: LubecGearGive | null
}

// A card stays open only while its thing is in the record: another player can take it out of a shared carrier.
const isGone = (sheet: LubecItemSheetState, gear: LubecGear) => sheet.mode === 'view' && !gear.items.some((i) => i.id === sheet.itemId)

// The item sheet over the page, working on what `work` says, for a viewer who may change it.
function ItemSheetOver({ work, sheet, setSheet, toast, onAsk, give, ...ctx }: SheetOverProps) {
  if (!work.change || !sheet || isGone(sheet, work.gear)) return null
  // Nobody is asked to roll for a thing in a shared carrier, and it is given from a sheet, once it has been taken out (spec 4.7).
  const sheetOnly = work.inCarrier ? { onAsk: null, give: null } : { onAsk, give }
  return (
    <LubecItemSheet
      sheet={sheet} gear={work.gear} onGearChange={work.change} onSheet={setSheet} toast={toast} onDrop={work.drop}
      across={work.across} inCarrier={work.inCarrier} {...sheetOnly} {...ctx}
    />
  )
}

/** The Lubec sheet's Gear page: the Gear bar, B's On you view of the backpack, the hands, the body and the armor, the Carriers view, and the item sheet over them. */
export function LubecGearPage({ gear, owner, wielder, onGearChange, onDrop = null, campaignStock = NO_CAMPAIGN_STOCK, strength = null, kinds = LUBEC_CARRIER_KINDS, give = null, shared = null, hidden = null }: GearPageProps) {
  const nav = useLubecGearView()
  const [sheet, setSheet] = useState<LubecItemSheetState | null>(null)
  const toast = useLubecToast()
  const asking = useLubecStrengthAsk(gear, strength)
  const moves = useLubecGearMoves({ gear, onGearChange, onDrop, toast, setSheet, onAsk: asking.onAsk })
  const { onAdd, onOpen } = sheetOpeners(moves.change !== null, setSheet)
  const carriers = useLubecCarrierActs({ gear, change: moves.change, toast: toast.show })
  const stashes = useLubecHiddenCarriers(hidden)
  const open = lubecOpenShared(nav.view, shared)
  const stash = lubecOpenHidden(nav.view, stashes)
  const work = lubecGearWork({ gear, shared, open, hidden, stashes, stash, moves, onAsk: asking.onAsk, toast: toast.show })
  return (
    <div className="lubec-page lubec-gear" aria-busy={moves.busy}>
      <GearBar view={nav.view} onView={nav.show} full={inventoryFull(gear)} onAdd={onAdd && (() => onAdd(addPlaceOf(open ?? stash)))} />
      <LubecDragContext value={moves.drag.view}>
        <GearViews
          gear={gear} hidden={stashes} owner={owner} nav={nav} moves={moves} onAdd={onAdd} onOpen={onOpen}
          onOpenCarrier={nav.openCarrier} onCarry={carriers.onCarry} onNewCarrier={carriers.onNewCarrier} shared={shared} toast={toast.show}
        />
      </LubecDragContext>
      <LubecCarrierDialogOver gear={gear} change={moves.change} toast={toast.show} acts={carriers} kinds={kinds} shared={shared} onHide={lubecHiddenAdder(hidden, toast.show)} />
      <ItemSheetOver work={work} sheet={sheet} setSheet={setSheet} toast={toast.show} campaignStock={campaignStock} busy={moves.busy} onAsk={asking.onAsk} wielder={wielder} give={give} />
      <StrengthAskOver gear={gear} asking={asking} strength={strength} change={moves.change} setSheet={setSheet} toast={toast.show} drop={moves.drop} />
      <LubecDragLayer view={moves.drag.view} item={gear.items.find((x) => x.id === moves.drag.view?.itemId)} ghost={moves.drag.ghost} dropZone={moves.drag.dropZone} />
      <Toast text={toast.text} shown={toast.shown} busy={moves.busy} />
    </div>
  )
}
