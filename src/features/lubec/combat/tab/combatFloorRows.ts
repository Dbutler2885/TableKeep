import type { LubecItem } from '../../../ruleSets/lubec/gear/gearRecord'
import type { LubecDetachedItem } from '../../../ruleSets/lubec/gear/detachedItems'
import type { LubecGmItem } from '../../../ruleSets/lubec/gear/gmItem'
import { canBeThrown } from '../../gear/throwableFields'
import { sgn } from '../../gear/itemLabels'
import type { CombatState } from '../engine/types'

/** What a Floor row shows of an item: its picture source, name and catch words. */
export type CombatFloorItem = Pick<LubecItem, 'name' | 'kind' | 'mode' | 'canThrow' | 'table' | 'catchChance' | 'catchPutsThrowerOut' | 'stock' | 'art' | 'picturePath' | 'shape'>

/** One display row. Its count is derived from the backing records, which stay distinct. */
export type CombatFloorRow = { key: string; item: CombatFloorItem; count: number; recordIds: string[] }

const catchParts = (item: Partial<LubecItem>): string[] => [
  ...(item.catchChance ? [`Catch ${item.catchChance}%`] : []),
  ...(item.catchPutsThrowerOut ? ['catching it puts the thrower out'] : []),
]

/** "Catch 50% · catching it puts the thrower out", as the mock-up's Floor writes it; empty for an item nobody can catch. */
export const combatCatchLine = (item: Partial<LubecItem>): string => (canBeThrown(item) ? catchParts(item).join(' · ') : '')

// Rows group by name and catch rules for display only; the records behind a row keep their own ids and fields.
const displayKey = (item: Partial<LubecItem>) => JSON.stringify([item.name, item.catchChance ?? 0, Boolean(item.catchPutsThrowerOut)])

/** The Floor as rows: records with the same name and catch rules share a row and add up their quantities. */
export function combatFloorRows(floor: readonly LubecDetachedItem[]): CombatFloorRow[] {
  const rows = new Map<string, CombatFloorRow>()
  for (const { item } of floor) {
    const key = displayKey(item)
    const row = rows.get(key) ?? { key, item, count: 0, recordIds: [] }
    rows.set(key, { ...row, count: row.count + item.qty, recordIds: [...row.recordIds, item.id] })
  }
  return [...rows.values()]
}

const plural = (count: number, name: string) => `${count} ${name.toLowerCase()}${count === 1 ? '' : 's'}`

const countsByName = (rows: readonly Pick<CombatFloorRow, 'item' | 'count'>[]) =>
  rows.reduce((counts, row) => counts.set(row.item.name, (counts.get(row.item.name) ?? 0) + row.count), new Map<string, number>())

/** "6 dodgeballs and 1 fist-sized rock", counting same-named items together; an empty string for no rows. */
export function combatCountWords(rows: readonly Pick<CombatFloorRow, 'item' | 'count'>[]): string {
  const words = [...countsByName(rows)].map(([name, count]) => plural(count, name))
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words.join('')
}

const optionBase = (item: LubecGmItem) => {
  const caught = item.catchChance && canBeThrown(item) ? ` (catch ${item.catchChance}%)` : ''
  const dropped = item.status === 'dropped' ? ` · dropped ×${item.qty}` : ''
  return `${item.name}${caught}${dropped}`
}

/** Each GM item's picker label; items that would read alike also show their Impact, so a pick is never ambiguous. */
export function combatItemOptions(items: readonly LubecGmItem[]): { id: string; label: string }[] {
  const bases = items.map(optionBase)
  const shared = (base: string) => bases.filter((other) => other === base).length > 1
  return items.map((item, index) => ({ id: item.id, label: shared(bases[index]) ? `${bases[index]} · Impact ${sgn(item.impact ?? 0)}` : bases[index] }))
}

/** What End did with the Floor: "6 dodgeballs" and how many that is. */
export function endedFloor(state: Pick<CombatState, 'floor'>): { words: string; total: number } {
  const rows = combatFloorRows(state.floor)
  const words = combatCountWords(rows)
  return { words: `${words.charAt(0).toUpperCase()}${words.slice(1)}`, total: rows.reduce((sum, row) => sum + row.count, 0) }
}
