// The add-carrier dialog's state, copied from the inventory prototype (B's
// `applyType`, `pocketRow`, `readPockets` and `pocketNote`). B read the form
// back from its inputs; here what the player typed is kept as typed, and read
// as a carrier only when it is added.

import { LUBEC_CARRIER_TYPES, LUBEC_LIST_MODE_OVER, type LubecCarrierDraft } from '../../ruleSets/lubec/gear/carriers'
import type { LubecPocket } from '../../ruleSets/lubec/gear/gearRecord'

/** A pocket row as typed: its name, its slots as written, and the largest thing it takes. */
export type LubecPocketRow = { name: string; slots: string; max: number }

export type LubecCarrierForm = { type: string; name: string; pockets: LubecPocketRow[]; error: string | null }

/** The sizes "Up to" offers. */
export const LUBEC_POCKET_MAX_SIZES = [1, 2, 4, 8] as const

const rowOf = ([name, slots, max]: readonly [string, number, number]): LubecPocketRow => ({ name, slots: String(slots), max })

/** The form with preset `type` applied: its name and pockets (B's `applyType`). The first preset when `type` is unknown. */
export function lubecCarrierFormOf(type: string): LubecCarrierForm {
  const t = LUBEC_CARRIER_TYPES.find((x) => x.id === type) ?? LUBEC_CARRIER_TYPES[0]
  return { type: t.id, name: t.name, pockets: t.pockets.map(rowOf), error: null }
}

/** The row "+ Add a pocket" adds. */
export const lubecNewPocketRow = (): LubecPocketRow => rowOf(['Pocket', 2, 1])

/** The rows as pockets (B's `readPockets`): a blank name is "Pocket", and the slots are rounded. */
export const lubecReadPockets = (rows: readonly LubecPocketRow[]): LubecPocket[] =>
  rows.map((r) => ({ name: r.name.trim() || 'Pocket', slots: Math.round(Number(r.slots)), max: r.max }))

/** The form as the carrier it adds. */
export const lubecCarrierDraftOf = (form: LubecCarrierForm): LubecCarrierDraft =>
  ({ type: form.type, name: form.name, pockets: lubecReadPockets(form.pockets) })

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The line under the pockets (B's `pocketNote`): how many slots in how many pockets, and Rule C4 over 24. */
export function lubecPocketNote(rows: readonly LubecPocketRow[]): string {
  const total = lubecReadPockets(rows).reduce((n, p) => n + (p.slots || 0), 0)
  const vast = total > LUBEC_LIST_MODE_OVER ? ' Effectively unlimited; big things are settled at the table.' : ''
  return `${plural(total, 'slot')} in ${plural(rows.length, 'pocket')}. A thing has to fit inside one pocket.${vast}`
}

/** The refusal when the last pocket would be removed. */
export const LUBEC_LAST_POCKET = 'A carrier needs at least one pocket.'
