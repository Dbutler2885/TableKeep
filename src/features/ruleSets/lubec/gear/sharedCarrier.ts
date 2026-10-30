// A shared carrier (spec 4.3): a campaign-level record any member of the group
// puts things into and takes things out of, owned by one character. The
// owner's player and the GM change the carrier itself. It is on nobody's body,
// so it never affects Speed (Rule C3). Pure: what is stored in, and what a
// change or a delete comes to out.

import { lubecCarrierProblem, type LubecCarrierDraft } from './carriers'
import { lubecCarrierGear } from './containers'
import { lubecHasPlace, parseLubecCarrierRecord, type LubecCarrierRecord, type LubecGear, type LubecPocket } from './gearRecord'
import { pocketUsed } from './placement'

export type LubecSharedCarrier = LubecCarrierRecord & {
  /** The character that owns it. It follows the character if the character is given to another player. */
  ownerCharacterId: string
}

/** A stored shared carrier as the sheet reads it. Its id is its document id. */
export function parseLubecSharedCarrier(raw: unknown, docId: string): LubecSharedCarrier {
  const record = parseLubecCarrierRecord(raw, docId)
  return { ...record, ownerCharacterId: typeof record.ownerCharacterId === 'string' ? record.ownerCharacterId : '' }
}

export type LubecSharedAdded = { ok: true; carrier: LubecSharedCarrier } | { ok: false; msg: string }

/** A new, empty shared carrier of id `id`, or the submit rule it breaks. */
export function lubecNewSharedCarrier(draft: LubecCarrierDraft, id: string, ownerCharacterId: string): LubecSharedAdded {
  const msg = lubecCarrierProblem(draft)
  if (msg) return { ok: false, msg }
  return { ok: true, carrier: { id, name: draft.name.trim(), type: draft.type, pockets: draft.pockets.map((p) => ({ ...p })), ownerCharacterId, items: [] } }
}

// What is in it now has to stay readable: nothing is ever left without a place by a change of pockets (spec 4.9).
function pocketsProblem(record: LubecCarrierRecord, pockets: readonly LubecPocket[]): string | null {
  const gear = lubecCarrierGear({ ...record, pockets: [...pockets] })
  const lost = record.items.find((i) => !lubecHasPlace(gear, i) || (i.pocket != null && i.size > pockets[i.pocket].max))
  if (lost) return `${lost.name} wouldn't fit. Take it out first.`
  const tight = pockets.find((p, k) => pocketUsed(gear, record.id, k) > p.slots)
  return tight ? `${tight.name} would be too small for what is in it. Take something out first.` : null
}

export type LubecCarrierChange = { ok: true; name: string; pockets: LubecPocket[] } | { ok: false; msg: string }

/** A new name and pockets for `record`, against what is in it, or why not. */
export function lubecChangeCarrier(record: LubecCarrierRecord, draft: LubecCarrierDraft): LubecCarrierChange {
  const msg = lubecCarrierProblem(draft) ?? pocketsProblem(record, draft.pockets)
  return msg ? { ok: false, msg } : { ok: true, name: draft.name.trim(), pockets: draft.pockets.map((p) => ({ ...p })) }
}

/** A carrier record read as gear beside a sheet, whose supplies name what its guns and holders take. */
export const lubecCarrierView = (record: LubecCarrierRecord, supplies: LubecGear['supplies']): LubecGear =>
  ({ ...lubecCarrierGear(record), supplies })
