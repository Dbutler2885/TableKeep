// Stacks, the add form's submit rules and the used-up rule, copied from the
// inventory prototype (B). Each is pure: gear in, result out. Placing a stack
// is the placement rule's job, so `placeStacks` is handed that rule rather
// than reading a page or a global.

import type { LubecGear, LubecItem } from './gearRecord'

/** An item before it has an id or a place: what the add and edit form makes. */
export type LubecItemDraft = Partial<LubecItem> & Pick<LubecItem, 'kind' | 'name' | 'note' | 'size' | 'weight' | 'qty'>

/** Where the placement rule put a thing, or why it refused. Base rules have no override. */
export type LubecPlacement =
  | { ok: true; carrier: string; pocket?: number | null; slot?: number }
  | { ok: false; msg: string }

/** The placement rule: where `item` would go at `dest` ("carrier", "carrier#pocket" or "hands#slot") among `gear`'s items. */
export type LubecPlaceRule = (gear: LubecGear, dest: string, item: LubecItemDraft) => LubecPlacement

// Rule S3. Anything that comes in numbers says how many fit in one slot (or in one space of its size).
// More than that is not one item: it splits into stacks, and each stack takes its own slot.
// 11 rounds at 2 to a slot are six stacks: five of 2 and one of 1. Small things never split (Rule S4).
export const perOf = (i: Pick<LubecItem, 'per' | 'qty'>): number => i.per || Math.max(1, i.qty)
export function stacksOf(qty: number, per: number, size: number): number[] {
  if (!size || qty <= per) return [qty]
  const n = Math.ceil(qty / per)
  return Array.from({ length: n }, (_, k) => (k < n - 1 ? per : qty - per * (n - 1)))
}
// Rule S3: at most 40 stacks at once.
export const MAX_STACKS = 40
export const slotsText = (n: number): string => `${n} slot${n === 1 ? '' : 's'}`
/** The stacks added together with `i`: every item of its batch, or just itself. */
export const stackMates = (items: readonly LubecItem[], i: LubecItem): LubecItem[] =>
  (i.batch ? items.filter((x) => x.batch === i.batch) : [i])

/** Rule S3: a stack holds only what fits in its slot; past that, it is a new stack. The card's + says this instead of adding one. */
export function stackFull(i: LubecItem): string | null {
  if (!(i.size > 0 && i.per && i.qty >= i.per)) return null
  return `This stack is full: ${i.per} fit in ${i.size === 1 ? 'one slot' : `${i.size} slots`}. Add another stack for more.`
}

/** The form field a submit rule's message points at. */
export type LubecDraftField = 'name' | 'wounds' | 'takes' | 'locs' | 'qty' | 'per'

export type LubecDraftProblem = { msg: string; field: LubecDraftField }

const problem = (msg: string, field: LubecDraftField): LubecDraftProblem => ({ msg, field })

const notCarried = (kind: LubecItemDraft['kind']) => kind === 'armor' || kind === 'holder'

/** The stacks a draft makes: armor and holders are always one, anything else splits by its number to a slot (Rule S3). */
export const draftStacks = (draft: LubecItemDraft): number[] =>
  (notCarried(draft.kind) ? [1] : stacksOf(draft.qty, draft.per || 1, draft.size))

function kindProblem(draft: LubecItemDraft): LubecDraftProblem | null {
  if (draft.kind === 'weapon') {
    if (!draft.wounds?.length) return problem('Pick at least one way it wounds: cut, pierce, blunt or gun.', 'wounds')
    if (draft.mode !== 'melee' && !draft.takes) return problem("Pick the ammo it takes. If it isn't on the list, make a supply.", 'takes')
  }
  if (draft.kind === 'armor' && !draft.locs?.length) return problem('Pick at least one place it covers.', 'locs')
  if (draft.kind === 'holder' && !draft.takes) return problem("Pick what it holds. If it isn't on the list, make a supply.", 'takes')
  return null
}

/** The add form's submit rules, in B's order: the first one a draft breaks, or null when it may be placed. */
export function draftProblem(draft: LubecItemDraft): LubecDraftProblem | null {
  if (!draft.name.trim()) return problem('Give it a name.', 'name')
  const byKind = kindProblem(draft)
  if (byKind) return byKind
  if (draft.qty < 1) return problem(draft.kind === 'consumable' ? 'How many? At least 1. A used-up one leaves the sheet.' : 'How many? At least 1.', 'qty')
  const stacks = draftStacks(draft).length
  if (stacks > MAX_STACKS) return problem(`That makes ${stacks} stacks. Keep it to ${MAX_STACKS} or fewer, or fit more in each slot.`, 'per')
  return null
}

type Placed = Extract<LubecPlacement, { ok: true }>

export type LubecStackPlan = { ok: true; list: Placed[] } | { ok: false; msg: string }

export type LubecStackPlacing = {
  place: LubecPlaceRule
  /** Every destination the form offers, as the place rule reads them. */
  destinations: readonly string[]
  /** The item being edited, which is set aside while its stacks are placed. */
  editingId?: string | null
}

// The first stack goes where it was asked; a later one that doesn't fit there tries the same carrier's other pockets.
function placeOne(gear: LubecGear, place: LubecPlaceRule, tries: readonly string[], one: LubecItemDraft, k: number): LubecPlacement {
  const pl = place(gear, tries[0], one)
  if (pl.ok || k === 0) return pl
  for (const t of tries.slice(1)) {
    const p2 = place(gear, t, one)
    if (p2.ok) return p2
  }
  return pl
}

/**
 * Rule S3: where each stack of a draft goes. The stacks fill the chosen place first, then the same carrier's
 * other pockets; if they don't all fit, nothing is added. Each placed stack counts against the next.
 */
export function placeStacks(gear: LubecGear, dest: string, draft: LubecItemDraft, qtys: readonly number[], placing: LubecStackPlacing): LubecStackPlan {
  const cid = dest.split('#')[0]
  const same = placing.destinations.filter((v) => (v === cid || v.startsWith(`${cid}#`)) && v !== `${cid}#small`)
  const tries = [dest, ...same.filter((v) => v !== dest)]
  let items = gear.items.filter((x) => x.id !== placing.editingId)
  const list: Placed[] = []
  for (let k = 0; k < qtys.length; k++) {
    const one = { ...draft, qty: qtys[k] }
    const pl = placeOne({ ...gear, items }, placing.place, tries, one, k)
    if (!pl.ok) {
      return { ok: false, msg: k === 0 ? pl.msg : `Only ${k} of the ${qtys.length} stacks fit there (${slotsText(k * draft.size)}). Put it somewhere roomier, or fit more in each slot.` }
    }
    list.push(pl)
    items = [...items, { ...one, id: `placing-stack-${k}`, carrier: pl.carrier, pocket: pl.pocket, slot: pl.slot } as LubecItem]
  }
  return { ok: true, list }
}

// Rule K4: a consumable at 0 is used up and leaves the sheet (captain, round 24), and so is a loose
// stack of a supply, which is a consumable too. It is not dropped and not kept. A holder, a box and
// a firearm at 0 stay, because they are not used up (Rules K5, K6).
// Table Keep's OSE sheet does this for only four catalog items (removeOnZeroUse in useInventoryDomain.ts).
export const isUsedUp = (i: LubecItem): boolean => i.kind === 'consumable' && i.qty <= 0
/** Rule K4: the gear without a used-up item. */
export const usedUp = (gear: LubecGear, itemId: string): LubecGear => ({ ...gear, items: gear.items.filter((x) => x.id !== itemId) })
/** Rule K4: the gear without any item that is used up. */
export const clearUsedUp = (gear: LubecGear): LubecGear => ({ ...gear, items: gear.items.filter((x) => !isUsedUp(x)) })
