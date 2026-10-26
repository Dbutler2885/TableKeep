import { useState } from 'react'
import { inventoryFull } from '../../ruleSets/lubec/gear/placement'
import type { LubecGear } from '../../ruleSets/lubec/gear/gearRecord'
import type { LubecStockItem } from '../../ruleSets/lubec/gear/stock'
import { lubecSupplies } from '../../ruleSets/lubec/gear/supplies'
import { supplyNameIn } from './gearLabels'
import { lubecAddSheet, lubecCardSheet, type LubecItemSheetState } from './itemSheet'
import { LubecGearHandsBody } from './LubecGearHandsBody'
import { LubecGearPack, type LubecGearAdd, type LubecGearOpen } from './LubecGearPack'
import { LubecItemSheet } from './LubecItemSheet'
import { useLubecToast } from './useLubecToast'
import './lubecGear.css'
import './lubecGearSheet.css'

/** Saves the character's next gear; null for a viewer who may only look. */
export type LubecGearChange = ((gear: LubecGear) => void) | null

type LubecGearView = 'on-you' | 'carriers'

type GearPageProps = {
  gear: LubecGear
  onGearChange: LubecGearChange
  /** The campaign's own list for the stock picker's "This campaign"; empty, and so hidden, until the GM Items tab fills it. */
  campaignStock?: readonly LubecStockItem[]
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

type OnYouProps = { gear: LubecGear; onAdd: LubecGearAdd; onOpen: LubecGearOpen }

// On you: the backpack, the hands and the body, on one screen.
function OnYou({ gear, onAdd, onOpen }: OnYouProps) {
  const supplyName = supplyNameIn(lubecSupplies(gear))
  return (
    <section id="lubec-gear-view-on-you" role="tabpanel" aria-labelledby="lubec-gear-tab-on-you">
      <div className="on-you">
        <LubecGearPack gear={gear} supplyName={supplyName} onAdd={onAdd} onOpen={onOpen} />
        <div className="side">
          <LubecGearHandsBody gear={gear} supplyName={supplyName} onAdd={onAdd} onOpen={onOpen} />
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
    onOpen: { item: (id) => setSheet(lubecCardSheet(id)), small: () => setSheet({ mode: 'small' }) },
  }
}

/** The Lubec sheet's Gear page: the Gear bar, B's On you view of the backpack, the hands and the body, and the item sheet over it. */
export function LubecGearPage({ gear, onGearChange, campaignStock = NO_CAMPAIGN_STOCK }: GearPageProps) {
  const [view, setView] = useState<LubecGearView>('on-you')
  const [sheet, setSheet] = useState<LubecItemSheetState | null>(null)
  const toast = useLubecToast()
  const { onAdd, onOpen } = sheetOpeners(onGearChange !== null, setSheet)
  return (
    <div className="lubec-page lubec-gear">
      <GearBar view={view} onView={setView} full={inventoryFull(gear)} onAdd={onAdd && (() => onAdd('backpack#0'))} />
      {view === 'on-you' ? <OnYou gear={gear} onAdd={onAdd} onOpen={onOpen} /> : <Carriers />}
      {onGearChange && sheet ? (
        <LubecItemSheet sheet={sheet} gear={gear} onGearChange={onGearChange} onSheet={setSheet} toast={toast.show} campaignStock={campaignStock} />
      ) : null}
      <div className={`toast${toast.shown ? ' show' : ''}`} role="status" aria-live="polite">{toast.text}</div>
    </div>
  )
}
