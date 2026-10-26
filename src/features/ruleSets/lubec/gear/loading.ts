// Supplies, loading and boxes (Rules K4, K5 and L1 to L9), copied from the
// inventory prototype (B's reloadPlan, reload, landPlan, unload, boxFillPlan
// and boxFill). Each is pure: gear in, the next gear out. A refusal says why
// in a shape the card turns into B's words; costs are shown and never
// enforced, because the table counts the actions.

import { lubecSpendRound, type LubecAttackRefusal } from './attack'
import type { LubecGear, LubecItem, LubecItemSize, LubecSupply } from './gearRecord'
import { holds, isBox, RELOAD_COST, type LubecReloadPlace } from './gearRules'
import { lubecMoveCost, type LubecMoveCost } from './moveCost'
import { carrierOf, itemsIn, onYou, place } from './placement'
import { lubecPlacedAt } from './arrival'
import { isUsedUp, perOf, type LubecItemDraft, type LubecPlacement } from './stacks'
import { lubecAmountIn, lubecLooseOf, lubecSupplyIn } from './supplies'

/** Some of a supply drawn from one box or loose stack. */
export type LubecDraw = readonly [item: LubecItem, n: number]

const RELOAD_PLACES: readonly LubecReloadPlace[] = ['hands', 'body', 'backpack']

const sumOf = (take: readonly LubecDraw[]): number => take.reduce((n, [, t]) => n + t, 0)

const withItems = (gear: LubecGear, items: LubecItem[]): LubecGear => ({ ...gear, items })

// Rule L5: ammo, loose or boxed, finds what on you it can load: a gun or a loaded holder, never another box.
/** Everything on you that `src`'s supply goes into. */
export const lubecLoadInto = (gear: LubecGear, src: LubecItem): LubecItem[] =>
  gear.items.filter((x) => onYou(x) && holds(x) && !isBox(x) && x.takes === lubecSupplyIn(src))

/** Why `w` cannot be loaded: not in hand, already full, the other hand busy with something else, or none of its supply on you. */
export type LubecReloadRefusal =
  | { why: 'not-in-hand' }
  | { why: 'full' }
  | { why: 'busy-hand'; holds: LubecItem }
  | { why: 'none-on-you' }

/** What loading `w` draws, nearest first, and what it costs: the farthest place drawn from sets it. */
export type LubecReloadPlan =
  | { ok: true; take: LubecDraw[]; have: number; put: number; n: number; from: LubecReloadPlace }
  | ({ ok: false } & LubecReloadRefusal)

const fitsInto = (w: LubecItem) => (i: LubecItem): boolean => i.id !== w.id && lubecSupplyIn(i) === w.takes && lubecAmountIn(i) > 0

const isFull = (i: LubecItem): boolean => (i.loaded ?? 0) >= (i.capacity ?? 0)

// Rules L3 and L4: the thing is in hand, and the other hand holds the supply or is empty to fetch it.
function reloadRefusal(gear: LubecGear, w: LubecItem): LubecReloadRefusal | null {
  if (w.carrier !== 'hands') return { why: 'not-in-hand' }
  if (isFull(w)) return { why: 'full' }
  const fits = fitsInto(w)
  const busy = itemsIn(gear, 'hands').find((i) => i.id !== w.id && !fits(i))
  return busy ? { why: 'busy-hand', holds: busy } : null
}

// The supply on you, nearest first; a carrier's doesn't count. `firstId` is the box or stack the player loaded from (Rule L5).
function nearestFirst(gear: LubecGear, w: LubecItem, firstId: string | null): LubecItem[] {
  const fits = fitsInto(w)
  const near = RELOAD_PLACES.flatMap((p) => gear.items.filter((i) => fits(i) && i.carrier === p))
  const first = near.find((i) => i.id === firstId)
  return first ? [first, ...near.filter((i) => i !== first)] : near
}

/** Up to `need` of a supply, from each source in turn. */
function drawFrom(sources: readonly LubecItem[], need: number): LubecDraw[] {
  const take: LubecDraw[] = []
  let left = need
  for (const b of sources) {
    if (!left) break
    const t = Math.min(lubecAmountIn(b), left)
    take.push([b, t])
    left -= t
  }
  return take
}

const farthest = (take: readonly LubecDraw[]): LubecReloadPlace =>
  take.reduce<LubecReloadPlace>((far, [b]) => {
    const at = b.carrier as LubecReloadPlace
    return RELOAD_COST[at] > RELOAD_COST[far] ? at : far
  }, 'hands')

/** Rules L3 and L4: what loading `w` to full would draw and cost, or why it can't be loaded. */
export function lubecReloadPlan(gear: LubecGear, w: LubecItem, firstId: string | null = null): LubecReloadPlan {
  const no = reloadRefusal(gear, w)
  if (no) return { ok: false, ...no }
  const sources = nearestFirst(gear, w, firstId)
  const have = sources.reduce((n, i) => n + lubecAmountIn(i), 0)
  if (!have) return { ok: false, why: 'none-on-you' }
  const take = drawFrom(sources, Math.min((w.capacity ?? 0) - (w.loaded ?? 0), have))
  const from = farthest(take)
  return { ok: true, take, have, put: sumOf(take), n: RELOAD_COST[from], from }
}

const takeFrom = (i: LubecItem, n: number): LubecItem =>
  (i.kind === 'consumable' ? { ...i, qty: i.qty - n } : { ...i, loaded: (i.loaded ?? 0) - n })

type Drawn = { items: LubecItem[]; gone: LubecItem[] }

// Takes each draw from its source. A loose stack at 0 is used up and leaves the sheet (Rule K4); an empty box stays (Rule K5).
function drawn(items: readonly LubecItem[], take: readonly LubecDraw[]): Drawn {
  const from = new Map(take.map(([b, t]) => [b.id, t]))
  const next = items.map((x) => (from.has(x.id) ? takeFrom(x, from.get(x.id) as number) : x))
  const gone = next.filter((x) => from.has(x.id) && isUsedUp(x))
  return { items: next.filter((x) => !gone.includes(x)), gone }
}

/** The gear after loading, the thing loaded as it is now, the plan carried out, and the loose stacks it used up. */
export type LubecReloaded = { ok: true; gear: LubecGear; item: LubecItem; plan: Extract<LubecReloadPlan, { ok: true }>; gone: LubecItem[] }

/** Rules L3 to L5: loads `w` to full from the supply on you, nearest first, or from `firstId` first. */
export function lubecReload(gear: LubecGear, w: LubecItem, firstId: string | null = null): LubecReloaded | Extract<LubecReloadPlan, { ok: false }> {
  const plan = lubecReloadPlan(gear, w, firstId)
  if (!plan.ok) return plan
  const item = { ...w, loaded: (w.loaded ?? 0) + plan.put }
  const { items, gone } = drawn(gear.items.map((x) => (x.id === w.id ? item : x)), plan.take)
  return { ok: true, gear: withItems(gear, items), item, plan, gone }
}

/** Why Reload and fire stopped: loading was refused, or the thing can't fire. */
export type LubecReloadFireRefusal = Extract<LubecReloadPlan, { ok: false }> | { ok: false; why: LubecAttackRefusal }

/**
 * Rule L9: Reload and fire, by special dispensation. It loads, fires and uses a round in one action.
 * There is no popup for the GM to approve, now or ever.
 */
export function lubecReloadAndFire(gear: LubecGear, w: LubecItem): LubecReloaded | LubecReloadFireRefusal {
  const loaded = lubecReload(gear, w)
  if (!loaded.ok) return loaded
  const fired = lubecSpendRound(loaded.gear, w.id)
  return fired.ok ? { ...loaded, gear: fired.gear, item: fired.weapon } : { ok: false, why: fired.why }
}

type Placed = Extract<LubecPlacement, { ok: true }>

/**
 * Where unloading `n` from a thing lands (Rule L6): poured out, into a box or loose stack of the same
 * supply with room, or a new loose stack at the nearest place with room; or no room on you.
 */
export type LubecLandPlan =
  | { ok: true; n: number; pour: true }
  | { ok: true; n: number; pour: false; cost: number; into: LubecItem }
  | { ok: true; n: number; pour: false; cost: number; draft: LubecItemDraft; placed: Placed }
  | { ok: false; n: number; why: 'no-room' }

type LandOption = Extract<LubecLandPlan, { pour: false }>

const roomIn = (x: LubecItem): number => {
  if (isBox(x)) return (x.capacity ?? 0) - (x.loaded ?? 0)
  return x.size === 0 ? Infinity : perOf(x) - x.qty
}

const costFrom = (fromId: string) => (dest: string): number => lubecMoveCost(fromId, dest)?.n ?? 0

// A box or loose stack of the same supply, on you or beside it, that has room.
function intoOptions(gear: LubecGear, src: LubecItem, n: number): LandOption[] {
  const near = (x: LubecItem) => x.id !== src.id && (onYou(x) || x.carrier === src.carrier) && x.carrier !== 'worn'
  const cost = costFrom(src.carrier)
  return gear.items
    .filter((x) => near(x) && lubecSupplyIn(x) === src.takes && roomIn(x) >= n)
    .map((into) => ({ ok: true, n, pour: false, cost: cost(into.carrier), into }))
}

const cap1 = (t: string): string => t[0].toUpperCase() + t.slice(1)

/** A new loose stack of `n` of a supply that can be loose. */
function looseDraft(supplies: readonly LubecSupply[], sid: string, loose: readonly [number, number], n: number): LubecItemDraft {
  const name = supplies.find((a) => a.id === sid)?.name ?? 'no supply'
  return { kind: 'consumable', name: cap1(name), note: '', size: loose[0] as LubecItemSize, per: loose[1], fits: sid, qty: n, weight: 'normal' }
}

// The thing's own carrier first, then the hands, the body and the backpack; small ones go in small stuff.
function newStackPlaces(gear: LubecGear, src: LubecItem, small: boolean): string[] {
  const pack = small ? 'backpack#small' : 'backpack'
  const own = carrierOf(gear, src.carrier)?.pockets.length ? [src.carrier === 'backpack' ? pack : src.carrier] : []
  return [...own, 'hands', 'body', pack]
}

function newStackOptions(gear: LubecGear, src: LubecItem, n: number, draft: LubecItemDraft): LandOption[] {
  if (!(draft.size === 0 || n <= (draft.per ?? 1))) return []
  const cost = costFrom(src.carrier)
  return newStackPlaces(gear, src, draft.size === 0).flatMap((dest) => {
    const placed = place(gear, dest, draft, null)
    return placed.ok ? [{ ok: true as const, n, pour: false as const, cost: cost(dest), draft, placed }] : []
  })
}

/** Rule L6: where `n` unloaded from `src`, or taken out of a box, would land, at what moving them there costs (M). */
export function lubecLandPlan(gear: LubecGear, src: LubecItem, n: number, supplies: readonly LubecSupply[]): LubecLandPlan {
  const loose = lubecLooseOf(supplies, src.takes)
  if (!loose) return { ok: true, n, pour: true }
  const draft = looseDraft(supplies, src.takes as string, loose, n)
  const opts = [...intoOptions(gear, src, n), ...newStackOptions(gear, src, n, draft)]
  if (!opts.length) return { ok: false, n, why: 'no-room' }
  return opts.reduce((a, b) => (b.cost < a.cost ? b : a))
}

const addTo = (x: LubecItem, n: number): LubecItem => (isBox(x) ? { ...x, loaded: (x.loaded ?? 0) + n } : { ...x, qty: x.qty + n })

// The new loose stack, or the box or stack the supply went into.
function landed(gear: LubecGear, plan: Extract<LubecLandPlan, { ok: true }>, newId: () => string): LubecItem[] {
  if (plan.pour) return gear.items
  if ('into' in plan) return gear.items.map((x) => (x.id === plan.into.id ? addTo(x, plan.n) : x))
  return [...gear.items, lubecPlacedAt({ ...plan.draft, id: newId() } as LubecItem, plan.placed)]
}

/** The gear after unloading, and where the supply landed; or no room on you. */
export type LubecUnloaded = { ok: true; gear: LubecGear; plan: Extract<LubecLandPlan, { ok: true }> } | Extract<LubecLandPlan, { ok: false }>

/** Rule L6: unloads `n` from `src`, or takes `n` out of a box. What can't be loose is poured out. */
export function lubecUnload(gear: LubecGear, src: LubecItem, n: number, supplies: readonly LubecSupply[], newId: () => string): LubecUnloaded {
  const plan = lubecLandPlan(gear, src, n, supplies)
  if (!plan.ok) return plan
  const left = { ...src, loaded: (src.loaded ?? 0) - n }
  const items = landed(gear, plan, newId).map((x) => (x.id === src.id ? left : x))
  return { ok: true, gear: withItems(gear, items), plan }
}

/** What putting loose ones into a box would draw and cost; the cost is null when no move is counted. Or none loose on you. */
export type LubecBoxFillPlan = { ok: true; take: LubecDraw[]; put: number; cost: LubecMoveCost | null } | { ok: false; why: 'no-loose' }

const dearest = (costs: readonly (LubecMoveCost | null)[]): LubecMoveCost | null =>
  costs.reduce<LubecMoveCost | null>((a, b) => (b && (!a || b.n > a.n) ? b : a), null)

/** Rule L7: loose ones of the box's supply, on you or beside it, go into it at what moving them there costs (M). */
export function lubecBoxFillPlan(gear: LubecGear, box: LubecItem): LubecBoxFillPlan {
  const loose = gear.items.filter((x) => x.kind === 'consumable' && x.fits === box.takes && x.qty > 0 && (onYou(x) || x.carrier === box.carrier))
  if (!loose.length) return { ok: false, why: 'no-loose' }
  const take = drawFrom(loose, (box.capacity ?? 0) - (box.loaded ?? 0))
  return { ok: true, take, put: sumOf(take), cost: dearest(take.map(([x]) => lubecMoveCost(x.carrier, box.carrier))) }
}

/** The gear after filling the box, the box as it is now, and the loose stacks used up. */
export type LubecBoxFilled = { ok: true; gear: LubecGear; item: LubecItem; plan: Extract<LubecBoxFillPlan, { ok: true }>; gone: LubecItem[] }

/** Rule L7: puts the loose ones into the box; a loose stack that runs out is used up (Rule K4). */
export function lubecBoxFill(gear: LubecGear, box: LubecItem): LubecBoxFilled | Extract<LubecBoxFillPlan, { ok: false }> {
  const plan = lubecBoxFillPlan(gear, box)
  if (!plan.ok) return plan
  const item = addTo(box, plan.put)
  const { items, gone } = drawn(gear.items.map((x) => (x.id === box.id ? item : x)), plan.take)
  return { ok: true, gear: withItems(gear, items), item, plan, gone }
}

/** Rule L8: filling up happens at the table, from a tap or a stream; the sheet records it. */
export const lubecFill = (gear: LubecGear, i: LubecItem): LubecGear =>
  withItems(gear, gear.items.map((x) => (x.id === i.id ? { ...x, loaded: x.capacity ?? 0 } : x)))
