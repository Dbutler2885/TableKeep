import { useState } from 'react'
import type { LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecOfferQty } from '../../ruleSets/lubec/gear/offer'
import type { LubecCardGive } from './useLubecCardGive'

export const LUBEC_GIVE_PANEL = 'lubec-give-panel'

type PanelProps = { item: LubecItem; give: LubecCardGive }

// Part of a stack can be given, one to all of it, and it opens on one, as OSE's does.
function HowMany({ item, value, onChange }: { item: LubecItem; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span className="label">How many (of {item.qty})</span>
      <input type="number" min={1} max={item.qty} step={1} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

/**
 * The card's Give panel (B's `#give-panel`): the picker of other people's
 * finalized characters and the button that offers it, with how many for a
 * stack. It opens on the first one listed.
 */
export function LubecGivePanel({ item, give }: PanelProps) {
  const [toId, setToId] = useState('')
  const [qty, setQty] = useState('1')
  const target = give.targets.find((t) => t.id === toId) ?? give.targets[0]
  if (!target) return <p className="cost" id={LUBEC_GIVE_PANEL}>No other player has a finalized character yet.</p>
  return (
    <div className="stack" id={LUBEC_GIVE_PANEL}>
      {give.note ? <p className="note">{give.note}</p> : null}
      <div className="split">
        <label className="field">
          <span className="label">Give to</span>
          <select value={target.id} onChange={(e) => setToId(e.target.value)}>
            {give.targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <button className="btn" type="button" disabled={give.busy} onClick={() => give.onOffer(target, lubecOfferQty(item, qty))}>{give.busy ? 'Offering...' : 'Give it'}</button>
      </div>
      {item.qty > 1 ? <HowMany item={item} value={qty} onChange={setQty} /> : null}
    </div>
  )
}

/** The offer that is out on this thing: who to, and the way to call it off. */
export function LubecOfferedRow({ give }: { give: LubecCardGive }) {
  const { offered } = give
  if (!offered) return null
  return (
    <div className="offered">
      <p>Offered to {offered.toName}</p>
      <button className="btn line small" type="button" disabled={give.busy} onClick={() => give.onCancel(offered.id)}>Cancel offer</button>
    </div>
  )
}

/** What Give shows above the card's buttons: the offer that is out, or the panel while it is open. */
export function LubecGiveFoot({ item, give }: PanelProps) {
  if (give.offered) return <LubecOfferedRow give={give} />
  return give.open ? <LubecGivePanel key={item.id} item={item} give={give} /> : null
}
