import { useState } from 'react'
import { makeId } from '../../character/characterFactories'
import { addLubecItem } from '../../ruleSets/lubec/gear/addItem'
import { inventoryFull } from '../../ruleSets/lubec/gear/placement'
import type { LubecGear } from '../../ruleSets/lubec/gear/gearRecord'
import { addedToast, supplyNameIn } from './gearLabels'
import { LubecGearAddForm, type LubecGearAddSubmit } from './LubecGearAddForm'
import { LubecGearHandsBody } from './LubecGearHandsBody'
import { LubecGearPack } from './LubecGearPack'
import { useLubecToast } from './useLubecToast'
import './lubecGear.css'

/** Saves the character's next gear; null for a viewer who may only look. */
export type LubecGearChange = ((gear: LubecGear) => void) | null

type LubecGearView = 'on-you' | 'carriers'

type GearPageProps = { gear: LubecGear; onGearChange: LubecGearChange }

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

type OnYouProps = { gear: LubecGear; onAdd: ((dest: string) => void) | null }

// On you: the backpack, the hands and the body, on one screen.
function OnYou({ gear, onAdd }: OnYouProps) {
  // The game's own list of supplies comes with loading; until then a supply is named from the player's own.
  const supplyName = supplyNameIn(gear.supplies)
  return (
    <section id="lubec-gear-view-on-you" role="tabpanel" aria-labelledby="lubec-gear-tab-on-you">
      <div className="on-you">
        <LubecGearPack gear={gear} supplyName={supplyName} onAdd={onAdd} />
        <div className="side">
          <LubecGearHandsBody gear={gear} supplyName={supplyName} onAdd={onAdd} />
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

// Adds through the rules and saves the next gear in one commit, with B's toast; returns why not, else null.
function addSubmitFor(gear: LubecGear, onGearChange: (gear: LubecGear) => void, done: (toast: string) => void): LubecGearAddSubmit {
  return (dest, draft) => {
    const added = addLubecItem(gear, dest, draft, makeId)
    if (!added.ok) return added.msg
    onGearChange(added.gear)
    done(addedToast(added.first, added.stacks))
    return null
  }
}

/** The Lubec sheet's Gear page: the Gear bar, and B's On you view of the backpack, the hands and the body. */
export function LubecGearPage({ gear, onGearChange }: GearPageProps) {
  const [view, setView] = useState<LubecGearView>('on-you')
  const [adding, setAdding] = useState<string | null>(null)
  const toast = useLubecToast()
  const onAdd = onGearChange ? setAdding : null
  return (
    <div className="lubec-page lubec-gear">
      <GearBar view={view} onView={setView} full={inventoryFull(gear)} onAdd={onAdd && (() => onAdd('backpack#0'))} />
      {view === 'on-you' ? <OnYou gear={gear} onAdd={onAdd} /> : <Carriers />}
      {onGearChange && adding !== null ? (
        <LubecGearAddForm
          dest={adding}
          onSubmit={addSubmitFor(gear, onGearChange, (text) => { setAdding(null); toast.show(text) })}
          onClose={() => setAdding(null)}
        />
      ) : null}
      <div className={`toast${toast.shown ? ' show' : ''}`} role="status" aria-live="polite">{toast.text}</div>
    </div>
  )
}
