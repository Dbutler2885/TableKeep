import type { LubecDetachedItem } from '../../../ruleSets/lubec/gear/detachedItems'
import { combatCatchLine, combatFloorRows, type CombatFloorRow } from './combatFloorRows'
import { CombatFloorIcon, CombatPanel } from './CombatParts'


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
