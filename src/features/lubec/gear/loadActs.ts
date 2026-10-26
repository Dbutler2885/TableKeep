// What the card's loading buttons and the empty-weapon prompt do, copied from
// the inventory prototype (B's card click handler, loadPicker and
// emptyPrompt): each is one commit of the next gear with B's toast and the
// card to show after it, or B's refusal. Pure: the gear as it is when the
// button is pressed, in; the result, out.

import type { LubecGear, LubecItem, LubecSupply } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecBoxFill, lubecFill, lubecReload, lubecReloadAndFire, lubecUnload } from '../../ruleSets/lubec/gear/loading'
import { stepLubecLoaded } from '../../ruleSets/lubec/gear/counts'
import { lubecSupplies } from '../../ruleSets/lubec/gear/supplies'
import { supplyNameIn, type LubecSupplyName } from './gearLabels'
import {
  lubecLandText,
  lubecLoadedToast,
  lubecReloadedToast,
  lubecReloadRefusalText,
  lubecTakeOutRange,
  lubecUnloadedToast,
  type LubecLoadAct,
} from './loadLabels'

/** What a loading act reads: the gear as it is now, the supplies and their names, and a maker of ids for a new loose stack. */
export type LubecLoadContext = { gear: LubecGear; supplies: readonly LubecSupply[]; supplyName: LubecSupplyName; newId: () => string }

/** The context for the gear as it is now: its supplies, the game's and the player's, and their names. */
export const lubecLoadContext = (gear: LubecGear, newId: () => string): LubecLoadContext => {
  const supplies = lubecSupplies(gear)
  return { gear, supplies, supplyName: supplyNameIn(supplies), newId }
}

/** The next gear, B's toast if any, and the item whose card shows after it; or why not. */
export type LubecLoadResult = { ok: true; gear: LubecGear; toast: string | null; show: string } | { ok: false; msg: string }

const done = (gear: LubecGear, toast: string | null, show: string): LubecLoadResult => ({ ok: true, gear, toast, show })

const refused = (msg: string): LubecLoadResult => ({ ok: false, msg })

const stillHere = (gear: LubecGear, id: string) => gear.items.some((x) => x.id === id)

/** The card's own Load or Reload, from the nearest supply on you. */
export function lubecReloadAct(ctx: LubecLoadContext, w: LubecItem): LubecLoadResult {
  const r = lubecReload(ctx.gear, w)
  return r.ok ? done(r.gear, lubecReloadedToast(w), w.id) : refused(lubecReloadRefusalText(w, r, ctx.supplyName))
}

/** Rule L5: loading `w` from this box or stack first. A loose stack that runs out leaves the sheet, so the card shows the gun. */
export function lubecLoadIntoAct(ctx: LubecLoadContext, src: LubecItem, w: LubecItem): LubecLoadResult {
  const r = lubecReload(ctx.gear, w, src.id)
  if (!r.ok) return refused(lubecReloadRefusalText(w, r, ctx.supplyName))
  return done(r.gear, lubecLoadedToast(r.item), stillHere(r.gear, src.id) ? src.id : w.id)
}

/** Rule L6: unloads `n`, or takes `n` out of a box, with `toast` after it. */
function unloadAct(ctx: LubecLoadContext, i: LubecItem, n: number, toast: string): LubecLoadResult {
  const r = lubecUnload(ctx.gear, i, n, ctx.supplies, ctx.newId)
  return r.ok ? done(r.gear, toast, i.id) : refused(lubecLandText(i, r, ctx.supplyName))
}

/** "Take them out": 1 to everything in the box. */
export function lubecTakeOutAct(ctx: LubecLoadContext, box: LubecItem, n: number): LubecLoadResult {
  if (!(Number.isInteger(n) && n >= 1 && n <= (box.loaded ?? 0))) return refused(lubecTakeOutRange(box))
  return unloadAct(ctx, box, n, `Took ${n} out of ${box.name}.`)
}

function boxFillAct(ctx: LubecLoadContext, box: LubecItem): LubecLoadResult {
  const r = lubecBoxFill(ctx.gear, box)
  return r.ok ? done(r.gear, `${box.name}: ${r.item.loaded ?? 0} of ${r.item.capacity ?? 0}.`, box.id) : refused(`No loose ${ctx.supplyName(box.takes)} on you`)
}

type CardAct = Exclude<LubecLoadAct, { type: 'load-pick' } | { type: 'takeout' }>

const CARD_ACTS: { [K in CardAct['type']]: (ctx: LubecLoadContext, i: LubecItem, act: Extract<CardAct, { type: K }>) => LubecLoadResult } = {
  'reload': (ctx, i) => lubecReloadAct(ctx, i),
  'load-into': (ctx, i, act) => lubecLoadIntoAct(ctx, i, act.into),
  'unload': (ctx, i) => unloadAct(ctx, i, i.loaded ?? 0, lubecUnloadedToast(i)),
  'sip': (ctx, i) => done(stepLubecLoaded(ctx.gear, i, -1), null, i.id),
  'fill': (ctx, i) => done(lubecFill(ctx.gear, i), `${i.name}: full.`, i.id),
  'boxfill': boxFillAct,
}

/** A loading button on the card that commits at once; the picker and "Take some out" only open something. */
export const lubecCardLoadAct = (ctx: LubecLoadContext, i: LubecItem, act: CardAct): LubecLoadResult =>
  (CARD_ACTS[act.type] as (ctx: LubecLoadContext, i: LubecItem, act: CardAct) => LubecLoadResult)(ctx, i, act)

/** Rule L9: the empty-weapon prompt's red Reload and fire loads, fires and uses a round in one action. */
export function lubecReloadAndFireAct(ctx: LubecLoadContext, w: LubecItem): LubecLoadResult {
  const r = lubecReloadAndFire(ctx.gear, w)
  return r.ok ? done(r.gear, 'Reloaded and fired. Roll it at the table.', w.id) : refused(lubecReloadRefusalText(w, r, ctx.supplyName))
}
