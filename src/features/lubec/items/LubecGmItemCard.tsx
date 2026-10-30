import { useState } from 'react'
import { KIND_NAMES } from '../../ruleSets/lubec/gear/gearRules'
import type { LubecGmItem } from '../../ruleSets/lubec/gear/gmItem'
import { cardTitle } from '../gear/cardFacts'
import { LubecCardPicture } from '../gear/LubecGearArt'
import { LUBEC_ITEMS_GROUPS, lubecDroppedLine, lubecGmItemFacts } from './gmItemsList'

/** A character the GM may give an item to. */
export type LubecGiveTarget = { id: string; name: string }

/** What the card's buttons do; Edit and adding a picture are a campaign item's, Keep a dropped item's. */
export type LubecGmItemActions = {
  onEdit: (() => void) | null
  onAddPicture: (() => void) | null
  onGive: (characterId: string) => void
  onKeep: (() => void) | null
  onDelete: () => void
}

type CardProps = {
  item: LubecGmItem
  /** The finalized characters, which are the ones an item can arrive on. */
  targets: readonly LubecGiveTarget[]
  /** True while a write is being saved. */
  busy: boolean
  error: string | null
  actions: LubecGmItemActions
}

type Panel = 'give' | 'delete' | null

export const LUBEC_GIVE_PANEL = 'lubec-give-panel'

// The arrival rule in a line, and what giving does to the item here.
const giveNote = (item: LubecGmItem) =>
  `It lands in their backpack, or in both hands if it is too big for one. ${item.status === 'library' ? 'They get a copy; this one stays here.' : 'It leaves this list.'}`

// Give to...: B's Move panel, picking a character instead of a place.
function GivePanel({ item, targets, busy, onGive }: { item: LubecGmItem; targets: readonly LubecGiveTarget[]; busy: boolean; onGive: (characterId: string) => void }) {
  const [to, setTo] = useState(targets[0]?.id ?? '')
  if (!targets.length) return <p className="note" id={LUBEC_GIVE_PANEL}>No finalized characters yet. An item can only arrive on a character in play.</p>
  return (
    <div className="stack" id={LUBEC_GIVE_PANEL}>
      <div className="split">
        <label className="field">
          <span className="label">Give to</span>
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <button className="btn" type="button" disabled={busy} onClick={() => onGive(to)}>{busy ? 'Giving...' : 'Give it'}</button>
      </div>
      <p className="cost">{giveNote(item)}</p>
    </div>
  )
}

// Deleting is the one way an item leaves the game outright, so it asks first.
function DeletePanel({ item, busy, onDelete, onCancel }: { item: LubecGmItem; busy: boolean; onDelete: () => void; onCancel: () => void }) {
  return (
    <div className="dispensation-box">
      <div className="head">Delete for good</div>
      <p>{`${item.name} leaves the game. Nobody can get it back.`}</p>
      <div className="actions">
        <button className="btn line" type="button" onClick={onCancel}>Keep it</button>
        <button className="btn danger solid" type="button" disabled={busy} onClick={onDelete}>Delete</button>
      </div>
    </div>
  )
}

function Facts({ item }: { item: LubecGmItem }) {
  return (
    <dl className="facts item-facts">
      {lubecGmItemFacts(item).map((f) => [<dt key={`${f.term}-t`}>{f.term}</dt>, <dd key={`${f.term}-d`}>{f.text}</dd>])}
    </dl>
  )
}

// Where it came from: who dropped it and from where, or the stock it was copied from.
function Origin({ item }: { item: LubecGmItem }) {
  if (item.status === 'dropped') return <div className="stock-row"><p><b>{lubecDroppedLine(item)}</b></p></div>
  return <div className="stock-row"><p>{item.stock ? <>From stock: <b>{item.stock}</b>.</> : 'Made by hand.'}</p></div>
}

type FootProps = { item: LubecGmItem; panel: Panel; onPanel: (panel: Panel) => void; actions: LubecGmItemActions }

// A campaign item: Edit, Give to... and Delete. A dropped item: Give to..., Keep as a campaign item and Delete.
function CardButtons({ panel, onPanel, actions }: FootProps) {
  const toggle = (open: Panel) => () => onPanel(panel === open ? null : open)
  return (
    <div className="actions three">
      {actions.onEdit ? <button className="btn line" type="button" onClick={actions.onEdit}>Edit</button> : null}
      <button className="btn line" type="button" aria-expanded={panel === 'give'} aria-controls={LUBEC_GIVE_PANEL} onClick={toggle('give')}>Give to...</button>
      {actions.onKeep ? <button className="btn line" type="button" onClick={actions.onKeep}>Keep as a campaign item</button> : null}
      <button className="btn danger" type="button" aria-expanded={panel === 'delete'} onClick={toggle('delete')}>Delete</button>
    </div>
  )
}

/** The chosen item: B's card, read-only, with who dropped it and the GM's actions. */
export function LubecGmItemCard({ item, targets, busy, error, actions }: CardProps) {
  const [panel, setPanel] = useState<Panel>(null)
  return (
    <article className="item-sheet card gm-item-card" aria-labelledby="lubec-gm-item-title">
      <div className="sheet-form">
        <header><div><div className="eyebrow">{`${KIND_NAMES[item.kind]} / ${LUBEC_ITEMS_GROUPS[item.status]}`}</div><h2 id="lubec-gm-item-title">{cardTitle(item)}</h2></div></header>
        <div className="card-top">
          <LubecCardPicture item={item} name={item.name} onAdd={actions.onAddPicture} />
          <p className={`item-note${item.note ? '' : ' empty'}`}>{item.note || 'No description.'}</p>
        </div>
        <Facts item={item} />
        <Origin item={item} />
        <div className="sheet-foot">
          {panel === 'give' ? <GivePanel key={item.id} item={item} targets={targets} busy={busy} onGive={actions.onGive} /> : null}
          {panel === 'delete' ? <DeletePanel item={item} busy={busy} onDelete={actions.onDelete} onCancel={() => setPanel(null)} /> : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <CardButtons item={item} panel={panel} onPanel={setPanel} actions={actions} />
        </div>
      </div>
    </article>
  )
}
