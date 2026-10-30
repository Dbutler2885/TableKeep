// The add-carrier dialog's state, copied from the inventory prototype (B's
// `applyType`, `pocketRow`, `readPockets` and `pocketNote`). B read the form
// back from its inputs; here what the player typed is kept as typed, and read
// as a carrier only when it is added.

import { LUBEC_CARRIER_TYPES, LUBEC_LIST_MODE_OVER, type LubecCarrierDraft, type LubecCarrierKind } from '../../ruleSets/lubec/gear/carriers'
import type { LubecCarrier, LubecPocket } from '../../ruleSets/lubec/gear/gearRecord'
import { LUBEC_HIDDEN_NOTE } from './carrierLabels'

/** A pocket row as typed: its name, its slots as written, and the largest thing it takes. */
export type LubecPocketRow = { name: string; slots: string; max: number }

export type LubecCarrierForm = { type: string; name: string; pockets: LubecPocketRow[]; kind: LubecCarrierKind; error: string | null }

/** What the dialog calls each kind of carrier. */
export const LUBEC_CARRIER_KIND_LABELS: Record<LubecCarrierKind, string> = { personal: 'Just this character', shared: 'Shared with the table', hidden: 'Hidden' }

/** The line under each kind's tile. */
export const LUBEC_CARRIER_KIND_NOTES: Record<LubecCarrierKind, string> = { personal: 'Kept on this sheet', shared: 'Every player can put things in', hidden: LUBEC_HIDDEN_NOTE }

/** The sizes "Up to" offers. */
export const LUBEC_POCKET_MAX_SIZES = [1, 2, 4, 8] as const

const rowOf = ([name, slots, max]: readonly [string, number, number]): LubecPocketRow => ({ name, slots: String(slots), max })

/** The form with preset `type` applied: its name, pockets and kind (B's `applyType`). The first preset when `type` is unknown. */
export function lubecCarrierFormOf(type: string): LubecCarrierForm {
  const t = LUBEC_CARRIER_TYPES.find((x) => x.id === type) ?? LUBEC_CARRIER_TYPES[0]
  return { type: t.id, name: t.name, pockets: t.pockets.map(rowOf), kind: t.kind ?? 'personal', error: null }
}

/** The kind the form stands on: the one its preset chose, or the first offered where that one is not. */
export const lubecOfferedKind = (form: LubecCarrierForm, kinds: readonly LubecCarrierKind[]): LubecCarrierKind =>
  (kinds.includes(form.kind) ? form.kind : kinds[0])

/** The form for a carrier that exists: what it is called and its pockets as they stand. */
export const lubecCarrierFormOfRecord = (c: Pick<LubecCarrier, 'type' | 'name' | 'pockets'>): LubecCarrierForm =>
  ({ type: c.type, name: c.name, pockets: c.pockets.map((p) => rowOf([p.name, p.slots, p.max])), kind: 'personal', error: null })

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
