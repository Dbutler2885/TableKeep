import { useState } from 'react'
import type { LubecGear, LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecFirstMove, lubecMoveCostLine, lubecMoveGroups, lubecSwapOf, type LubecMoveGroup } from './moveLabels'

export const LUBEC_MOVE_PANEL = 'lubec-move-panel'

type MovePanelProps = {
  gear: LubecGear
  item: LubecItem
  /** True while a move is being saved. */
  busy: boolean
  onMove: (value: string) => void
  /** The Move list; the thing's own record's places unless given. */
  groups?: readonly LubecMoveGroup[]
}

/**
 * The card's Move panel (B's `#move-panel`): where to move the thing, or what
 * to swap it with, the button that does it, and the cost line under them.
 * It opens on the first place the thing can go.
 */
export function LubecMovePanel({ gear, item, busy, onMove, groups = lubecMoveGroups(gear, item) }: MovePanelProps) {
  const [value, setValue] = useState(() => lubecFirstMove(groups))
  return (
    <div className="stack" id={LUBEC_MOVE_PANEL}>
      <div className="split">
        <label className="field">
          <span className="label">Move to</span>
          <select value={value} onChange={(e) => setValue(e.target.value)}>
            {groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <button className="btn" type="button" disabled={busy} onClick={() => onMove(value)}>{lubecSwapOf(gear, value) ? 'Swap' : 'Move it'}</button>
      </div>
      <p className="cost">{lubecMoveCostLine(gear, item, value)}</p>
    </div>
  )
}
