import { LUBEC_BLUNT_TABLE } from './blunt'
import { LUBEC_CUTTING_TABLE } from './cutting'
import { LUBEC_FISTICUFFS_TABLE } from './fisticuffs'
import { LUBEC_GUNSHOT_TABLE } from './gunshot'
import { LUBEC_PIERCING_TABLE } from './piercing'
import { LUBEC_THROWN_TABLE } from './thrown'
import type { LubecWoundLocation, LubecWoundTable, LubecWoundTableRow } from './types'

export type { LubecWoundChoice, LubecWoundSave, LubecWoundSeverity, LubecWoundTable, LubecWoundTableRow } from './types'

/** Every located wound table but Dodgeball, which keeps its own module; keyed as weapons name them. */
export const LUBEC_WOUND_TABLES: Readonly<Record<string, LubecWoundTable>> = {
  blunt: LUBEC_BLUNT_TABLE,
  gunshot: LUBEC_GUNSHOT_TABLE,
  piercing: LUBEC_PIERCING_TABLE,
  cutting: LUBEC_CUTTING_TABLE,
  thrown: LUBEC_THROWN_TABLE,
  fisticuffs: LUBEC_FISTICUFFS_TABLE,
}

export const lubecWoundTable = (key: string): LubecWoundTable | null =>
  (Object.hasOwn(LUBEC_WOUND_TABLES, key) ? LUBEC_WOUND_TABLES[key] : null)

/** "hand-L" reads the hand's rows; the side only says which hand. */
const regionOf = (part: string): string => part.replace(/-[LR]$/, '')

export type LubecLocatedWoundRow = { table: LubecWoundTable; location: LubecWoundLocation; row: LubecWoundTableRow }

/**
 * The row a positive whole Impact reads at a struck part. Rows run from Impact 1 without a gap and the last
 * covers everything above it, so Impact past the end reads the last row. Anything else has no row.
 */
export function lubecWoundTableRow(key: string, part: string, impact: number): LubecLocatedWoundRow | null {
  const table = lubecWoundTable(key)
  const location = table?.locations.find((entry) => entry.parts.includes(regionOf(part)))
  if (!table || !location || !Number.isInteger(impact) || impact < 1) return null
  return { table, location, row: location.rows[Math.min(impact, location.rows.length) - 1] }
}
