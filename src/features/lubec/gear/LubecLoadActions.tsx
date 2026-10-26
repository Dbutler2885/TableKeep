import { useState } from 'react'
import type { LubecLoadAct, LubecLoadButton } from './loadLabels'

/** The id of a box's "Take some out" panel, which its button opens. */
export const LUBEC_TAKEOUT_PANEL = 'lubec-gear-takeout-panel'

type ButtonsProps = { buttons: readonly LubecLoadButton[]; takeoutOpen: boolean; onLoad: (act: LubecLoadAct) => void }

/** The card's loading buttons (B's loadButtons and holderButtons): each with its cost, or greyed out with the reason, under it. */
export function LubecLoadButtons({ buttons, takeoutOpen, onLoad }: ButtonsProps) {
  return buttons.map((b) => {
    const panel = b.act.type === 'takeout' ? { 'aria-expanded': takeoutOpen, 'aria-controls': LUBEC_TAKEOUT_PANEL } : {}
    return (
      <button key={`${b.act.type}-${b.label}`} type="button" className={`btn${b.line ? ' line' : ''}`} disabled={b.disabled} onClick={() => onLoad(b.act)} {...panel}>
        {b.label}{b.sub ? <small>{b.sub}</small> : null}
      </button>
    )
  })
}

type TakeOutProps = {
  /** Everything in the box: the most that can be taken out. */
  loaded: number
  /** Where that many would land and what it costs, or the range it takes. */
  costOf: (n: number) => string
  onTakeOut: (n: number) => void
}

/** "Take some out" of a box (Rule L6): how many, Take them out, and where they land. */
export function LubecTakeOutPanel({ loaded, costOf, onTakeOut }: TakeOutProps) {
  const [count, setCount] = useState(String(Math.min(loaded, 6)))
  const n = Math.round(Number(count))
  return (
    <div className="split takeout" id={LUBEC_TAKEOUT_PANEL}>
      <label className="field"><span className="label">How many</span>
        <input type="number" min="1" max={loaded} inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
      </label>
      <button type="button" className="btn" onClick={() => onTakeOut(n)}>Take them out</button>
      <p className="cost">{costOf(n)}</p>
    </div>
  )
}
