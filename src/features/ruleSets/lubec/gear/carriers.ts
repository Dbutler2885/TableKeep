// Personal carriers (Rules C1, C3 and C4), copied from the inventory
// prototype (B): the presets the add-carrier dialog offers, the dialog's
// submit rules, and carrying one by special dispensation. Each is pure: gear
// in, the next gear out. A carrier's owner, who else can get into it and
// whether it is hidden are not fields here: the record a carrier is stored in
// says that. These are the character's own; a hidden one is `hiddenCarrier.ts`.

import type { LubecCarrier, LubecGear, LubecPocket } from './gearRecord'

/** The three kinds of storage object (spec 4). Which kind a carrier is follows from where it is stored. */
export type LubecCarrierKind = 'personal' | 'shared' | 'hidden'

/** The kinds a character's sheet offers, as each comes to be stored somewhere. */
export const LUBEC_CARRIER_KINDS: readonly LubecCarrierKind[] = ['personal', 'shared', 'hidden']

/** An NPC's sheet is the GM's alone, and an NPC shares no car with the players: only personal carriers (spec 9.6). */
export const LUBEC_NPC_CARRIER_KINDS: readonly LubecCarrierKind[] = ['personal']

/** Rule C4: a carrier bigger than this has "plenty of room" rather than boxes. */
export const LUBEC_LIST_MODE_OVER = 24

/** A preset: its id, the label the dialog lists, the name it starts with, its pockets as [name, slots, largest item], and the kind it offers first. */
export type LubecCarrierType = { id: string; label: string; name: string; pockets: readonly (readonly [name: string, slots: number, max: number])[]; kind?: LubecCarrierKind }

/** The presets, agreed with the captain in round 20 (B 1965-1978). */
export const LUBEC_CARRIER_TYPES: readonly LubecCarrierType[] = [
  { id: 'school-bag', label: 'School bag', name: 'School bag', pockets: [['Main', 4, 4], ['Outside pocket', 1, 1]] },
  { id: 'duffel', label: 'Duffel bag', name: 'Duffel bag', pockets: [['Main', 8, 8]] },
  { id: 'strap', label: 'Strap or sling', name: 'Carrying strap', pockets: [['Strapped on', 8, 8]] },
  { id: 'bike-basket', label: 'Bike basket', name: 'Bike basket', pockets: [['Basket', 2, 2]] },
  { id: 'locker', label: 'School locker', name: 'School locker', pockets: [['Locker', 6, 4], ['Top shelf', 2, 1]] },
  { id: 'chest', label: 'Bedroom chest', name: 'Bedroom chest', pockets: [['Chest', 12, 8]] },
  { id: 'stash', label: 'Hidden stash box', name: 'Stash box', pockets: [['Box', 2, 1]], kind: 'hidden' },
  { id: 'car', label: 'Family car', name: 'Family car', pockets: [['Trunk and back seat', 200, 8], ['Glove box', 2, 1]] },
  { id: 'skiff', label: 'Boat or skiff', name: 'Skiff', pockets: [['Hull', 40, 8]] },
  { id: 'shed', label: 'Shed or garage', name: 'Shed', pockets: [['Shed', 100, 8]] },
  { id: 'other', label: 'Something else', name: '', pockets: [['Main', 6, 4]] },
]

/** A preset's label, for a carrier's card; an unknown preset shows its id. */
export const lubecCarrierTypeLabel = (id: string): string => LUBEC_CARRIER_TYPES.find((t) => t.id === id)?.label ?? id

/** What the add-carrier dialog submits. */
export type LubecCarrierDraft = { type: string; name: string; pockets: LubecPocket[] }

/** B's submit rules, in its order, or null when the carrier can be added. */
export function lubecCarrierProblem(draft: LubecCarrierDraft): string | null {
  if (!draft.name.trim()) return 'Give it a name.'
  if (draft.pockets.some((p) => !(p.slots >= 1))) return 'Every pocket needs at least one slot.'
  if (draft.pockets.some((p) => p.max > p.slots)) return "A pocket's largest thing can't be bigger than the pocket."
  return null
}

export type LubecCarrierAdded = { ok: true; gear: LubecGear; carrier: LubecCarrier } | { ok: false; msg: string }

/** The gear with a new personal carrier of id `id`, or the submit rule it breaks. */
export function lubecAddCarrier(gear: LubecGear, draft: LubecCarrierDraft, id: string): LubecCarrierAdded {
  const msg = lubecCarrierProblem(draft)
  if (msg) return { ok: false, msg }
  const carrier: LubecCarrier = { id, name: draft.name.trim(), type: draft.type, pockets: draft.pockets.map((p) => ({ ...p })) }
  return { ok: true, gear: { ...gear, carriers: [...gear.carriers, carrier] }, carrier }
}

/** Rule C3: the gear with carrier `id` carried by special dispensation, or put down. It takes no hands, and what is in it never slows you. */
export const lubecCarry = (gear: LubecGear, id: string, carried: boolean): LubecGear =>
  ({ ...gear, carriers: gear.carriers.map((c) => (c.id === id ? { ...c, carried } : c)) })

/** The carriers being carried, for On you's Carrying panel. */
export const lubecCarried = (gear: LubecGear): LubecCarrier[] => gear.carriers.filter((c) => c.carried === true)
