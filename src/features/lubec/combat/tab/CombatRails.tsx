import type { LubecDetachedItem } from '../../../ruleSets/lubec/gear/detachedItems'
import type { Combatant } from '../engine/types'
import { combatCatchLine, combatFloorRows, type CombatFloorRow } from './combatFloorRows'
import { combatantRole } from './combatPhases'
import { CombatFloorIcon, CombatPanel } from './CombatParts'


function InFightRow({ combatant, userId }: { combatant: Combatant; userId: string }) {
  const out = combatant.outReason !== null
  return (
    <li className={out ? 'out' : ''}>
      <span className="n">·</span>
      <span><span className="nm">{combatant.name}</span><small>{combatantRole(combatant, userId)} · Speed {combatant.speed}</small></span>
      <span>{out ? <span className="badge rust">Out</span> : null}</span>
    </li>
  )
}

/** Before initiative the left rail lists everyone in the fight, in no order yet. */
export function InFightPanel({ combatants, userId }: { combatants: readonly Combatant[]; userId: string }) {
  return (
    <CombatPanel title="In the fight" sub="no order yet">
      <ul className="turns">{combatants.map((combatant) => <InFightRow key={combatant.key} combatant={combatant} userId={userId} />)}</ul>
    </CombatPanel>
  )
}

/** One Floor row: the item's mark, its name and catch words, and how many. */
export function CombatFloorRowView({ row }: { row: Pick<CombatFloorRow, 'item' | 'count'> }) {
  const line = combatCatchLine(row.item)
  return (
    <li>
      <CombatFloorIcon item={row.item} />
      <span>{row.item.name}{line ? <small>{line}</small> : null}</span>
      <span className="cnt">×{row.count}</span>
    </li>
  )
}

const itemCount = (rows: readonly CombatFloorRow[]) => rows.reduce((total, row) => total + row.count, 0)

type FloorPanelProps = { floor: readonly LubecDetachedItem[]; onPlace: (() => void) | null }

/** The right rail's Floor: grouped counts over distinct records, and the GM's way to place more. */
export function CombatFloorPanel({ floor, onPlace }: FloorPanelProps) {
  const rows = combatFloorRows(floor)
  const total = itemCount(rows)
  return (
    <CombatPanel title="Floor" sub={`${total} item${total === 1 ? '' : 's'}`}>
      <ul className="floor">
        {rows.map((row) => <CombatFloorRowView key={row.key} row={row} />)}
        {rows.length ? null : <li>Nothing on the Floor.</li>}
      </ul>
      {onPlace ? <div className="pb"><button className="btn line small" type="button" onClick={onPlace}>+ Place an item</button></div> : null}
    </CombatPanel>
  )
}
