// The words of loading, copied from the inventory prototype (B's loadButtons,
// holderButtons, reloadText, landText, emptyPrompt and loadPicker, and the
// toasts after each): the card's buttons for a gun, a holder and its supply,
// with the cost or the reason under each, word for word.

import { HOLD, holdWay, isBox, RELOAD_FROM } from '../../ruleSets/lubec/gear/gearRules'
import type { LubecAttackRefusal } from '../../ruleSets/lubec/gear/attack'
import type { LubecGear, LubecItem, LubecSupply } from '../../ruleSets/lubec/gear/gearRecord'
import {
  lubecBoxFillPlan,
  lubecLandPlan,
  lubecLoadInto,
  lubecReloadPlan,
  type LubecLandPlan,
  type LubecReloadPlan,
  type LubecReloadRefusal,
} from '../../ruleSets/lubec/gear/loading'
import { lubecCostWord } from '../../ruleSets/lubec/gear/moveCost'
import { lubecSupplyIn } from '../../ruleSets/lubec/gear/supplies'
import { whereText, type LubecSupplyName } from './gearLabels'
import { cap1, theName } from './moveLabels'

/** What a loading button does: load the thing itself, load another thing from this supply, ask which, unload, use one, fill up, open "Take some out", or put loose ones in. */
export type LubecLoadAct =
  | { type: 'reload' }
  | { type: 'load-into'; into: LubecItem }
  | { type: 'load-pick' }
  | { type: 'unload' }
  | { type: 'sip' }
  | { type: 'fill' }
  | { type: 'takeout' }
  | { type: 'boxfill' }

/** One of the card's loading buttons: its label, the line under it, whether it is outlined or greyed out, and what it does. */
export type LubecLoadButton = { label: string; sub?: string; line: boolean; disabled: boolean; act: LubecLoadAct }

/** What the words read: the gear, and a supply's name from its id. */
export type LubecLoadWords = { gear: LubecGear; supplyName: LubecSupplyName }

const actionsWord = (n: number): string => `${n} action${n > 1 ? 's' : ''}`

/** "3 actions, .38 rounds in the backpack". */
export const lubecReloadText = (w: LubecItem, p: Extract<LubecReloadPlan, { ok: true }>, supplyName: LubecSupplyName): string =>
  `${actionsWord(p.n)}, ${supplyName(w.takes)} ${RELOAD_FROM[p.from]}`

type Refusal = LubecReloadRefusal | { why: LubecAttackRefusal }

/** Why `w` can't be loaded, in B's words; a thing that can't fire is told to be taken in hand. */
export function lubecReloadRefusalText(w: LubecItem, r: Refusal, supplyName: LubecSupplyName): string {
  if (r.why === 'full') return `${cap1(theName(w))} is full: ${w.loaded ?? 0} of ${w.capacity ?? 0} loaded.`
  if (r.why === 'busy-hand') return `Your other hand holds ${r.holds.name}. It needs to hold the ${supplyName(w.takes)}, or be empty to fetch them.`
  if (r.why === 'none-on-you') return `No ${supplyName(w.takes)} on you. A carrier doesn't count.`
  return `Take ${theName(w)} in hand first.`
}

/** The plan's cost under a button, or the reason it can't be loaded. */
const planText = (w: LubecItem, p: LubecReloadPlan, supplyName: LubecSupplyName): string =>
  (p.ok ? lubecReloadText(w, p, supplyName) : lubecReloadRefusalText(w, p, supplyName))

// Where a landing goes: "into the D batteries", or the new stack's place, "right hand".
function landWhere(p: Extract<LubecLandPlan, { pour: false }>): string {
  if ('into' in p) return `into ${theName(p.into)}`
  return whereText({ ...p.draft, id: '', carrier: p.placed.carrier, pocket: p.placed.pocket, slot: p.placed.slot } as LubecItem).toLowerCase()
}

/** Where unloading lands and what it costs: "right hand, free", "Pour it out", or no room on you. */
export function lubecLandText(src: LubecItem, p: LubecLandPlan, supplyName: LubecSupplyName): string {
  if (!p.ok) return `No room on you for ${p.n} loose ${supplyName(src.takes)}. Make room, or put them in a box.`
  if (p.pour) return 'Pour it out'
  return `${landWhere(p)}, ${p.cost ? actionsWord(p.cost) : 'free'}`
}

const button = (label: string, act: LubecLoadAct, more: Partial<LubecLoadButton> = {}): LubecLoadButton =>
  ({ label, line: false, disabled: false, act, ...more })

const greyed = (label: string, sub: string, line = true): LubecLoadButton => button(label, { type: 'reload' }, { sub, line, disabled: true })

// More than one thing takes it: one button that asks which, saying how many are ready.
function pickButton({ gear, supplyName }: LubecLoadWords, src: LubecItem, into: readonly LubecItem[]): LubecLoadButton {
  const ready = into.filter((x) => lubecReloadPlan(gear, x, src.id).ok).length
  return button('Load', { type: 'load-pick' }, { sub: `${into.length} things on you take ${supplyName(lubecSupplyIn(src))}${ready < into.length ? `, ${ready} ready` : ''}` })
}

/**
 * Rule L5: ammo, loose or boxed, has one Load button that finds what on you it can load. Greyed out, it says why.
 * With one thing to load it loads straight away; with more it asks which, so the card never grows.
 */
export function lubecSupplyButtons(words: LubecLoadWords, src: LubecItem): LubecLoadButton[] {
  const into = lubecLoadInto(words.gear, src)
  if (!into.length) return [greyed('Load', `Nothing on you takes ${words.supplyName(lubecSupplyIn(src))}`)]
  if (into.length > 1) return [pickButton(words, src, into)]
  const [x] = into
  const p = lubecReloadPlan(words.gear, x, src.id)
  return [p.ok ? button('Load', { type: 'load-into', into: x }, { sub: `${x.name}: ${lubecReloadText(x, p, words.supplyName)}` }) : greyed('Load', planText(x, p, words.supplyName))]
}

const isFull = (i: LubecItem) => (i.loaded ?? 0) >= (i.capacity ?? 0)

// A loaded holder: Load from what is on you, or why not; Unload, saying where they land.
function loadWayButtons({ gear, supplyName }: LubecLoadWords, i: LubecItem, supplies: readonly LubecSupply[]): LubecLoadButton[] {
  const h = HOLD.load, b: LubecLoadButton[] = []
  if (!isFull(i)) {
    const p = lubecReloadPlan(gear, i)
    b.push(p.ok ? button(h.put, { type: 'reload' }, { sub: lubecReloadText(i, p, supplyName) }) : greyed(h.put, planText(i, p, supplyName), false))
  }
  if (i.loaded) b.push(button(h.out, { type: 'unload' }, { sub: lubecLandText(i, lubecLandPlan(gear, i, i.loaded, supplies), supplyName), line: true }))
  return b
}

// A filled holder: Use one, Fill up at the table, and Empty, which pours it out (Rule L8).
function fillWayButtons(i: LubecItem): LubecLoadButton[] {
  const h = HOLD.fill
  return [
    ...(i.loaded ? [button('Use one', { type: 'sip' })] : []),
    ...(isFull(i) ? [] : [button(h.put, { type: 'fill' }, { sub: 'At the table', line: true })]),
    ...(i.loaded ? [button(h.out, { type: 'unload' }, { sub: 'Pour it out', line: true })] : []),
  ]
}

// A box: Take some out, which opens its panel, and Put loose ones in at what moving them there costs (Rule L7).
function boxWayButtons({ gear, supplyName }: LubecLoadWords, i: LubecItem): LubecLoadButton[] {
  const h = HOLD.box, b: LubecLoadButton[] = []
  if (i.loaded) b.push(button(h.out, { type: 'takeout' }, { line: true }))
  if (!isFull(i)) {
    const p = lubecBoxFillPlan(gear, i)
    b.push(p.ok ? button(h.put, { type: 'boxfill' }, { sub: (p.cost && lubecCostWord(p.cost)) || 'Not counted', line: true }) : greyed(h.put, `No loose ${supplyName(i.takes)} on you`))
  }
  return b
}

/** Rule K5: a holder's own buttons, by how it holds. */
export function lubecHolderButtons(words: LubecLoadWords, i: LubecItem, supplies: readonly LubecSupply[]): LubecLoadButton[] {
  const way = holdWay(i)
  if (way === 'load') return loadWayButtons(words, i, supplies)
  return way === 'fill' ? fillWayButtons(i) : boxWayButtons(words, i)
}

/** A firearm's Reload while it isn't full, and Unload while it has rounds in it. */
export const lubecFirearmButtons = (w: LubecItem): LubecLoadButton[] => [
  ...(isFull(w) ? [] : [button('Reload', { type: 'reload' }, { line: true })]),
  ...(w.loaded ? [button('Unload', { type: 'unload' }, { line: true })] : []),
]

const isLooseSupply = (i: LubecItem) => i.kind === 'consumable' && Boolean(i.fits)

/** The card's loading buttons, in B's order: a firearm's, a supply's Load, then a holder's own. */
export function lubecLoadButtons(words: LubecLoadWords, i: LubecItem, supplies: readonly LubecSupply[]): LubecLoadButton[] {
  return [
    ...(i.kind === 'weapon' && i.mode === 'firearm' ? lubecFirearmButtons(i) : []),
    ...(isLooseSupply(i) || isBox(i) ? lubecSupplyButtons(words, i) : []),
    ...(i.kind === 'holder' ? lubecHolderButtons(words, i, supplies) : []),
  ]
}

/** The empty-weapon prompt's text: what reloading takes, or why it can't. */
export function lubecEmptyText(gear: LubecGear, w: LubecItem, supplyName: LubecSupplyName): string {
  const p = lubecReloadPlan(gear, w)
  return p.ok ? `Reloading takes ${lubecReloadText(w, p, supplyName)}.` : lubecReloadRefusalText(w, p, supplyName)
}

/** The empty-weapon prompt's title. */
export const lubecEmptyTitle = (w: LubecItem): string => `${w.name} isn't loaded`

/** The load picker's text: how many take it, and that loading draws from this first. */
export const lubecPickText = ({ gear, supplyName }: LubecLoadWords, src: LubecItem): string =>
  `${lubecLoadInto(gear, src).length} things on you take ${supplyName(lubecSupplyIn(src))}. Loading draws from ${theName(src)} first.`

/** A load picker row: how loaded it is now and what loading costs, or greyed out with why it can't be loaded. */
export function lubecPickRow({ gear, supplyName }: LubecLoadWords, src: LubecItem, x: LubecItem): { sub: string; disabled: boolean } {
  const p = lubecReloadPlan(gear, x, src.id)
  if (!p.ok) return { sub: lubecReloadRefusalText(x, p, supplyName), disabled: true }
  return { sub: `${x.loaded ?? 0} of ${x.capacity ?? 0} now / ${lubecReloadText(x, p, supplyName)}`, disabled: false }
}

/** The toast after loading `x` from a supply: "Loaded Grandpa's revolver: 6 of 6." */
export const lubecLoadedToast = (x: LubecItem): string => `Loaded ${x.name}: ${x.loaded ?? 0} of ${x.capacity ?? 0}.`

/** The toast after a card's own Load or Reload. */
export const lubecReloadedToast = (w: LubecItem): string => (w.kind === 'weapon' ? 'Reloaded.' : 'Loaded.')

/** The toast after Unload or Empty. */
export const lubecUnloadedToast = (i: LubecItem): string => `${i.name}: ${holdWay(i) === 'fill' ? 'emptied' : 'unloaded'}.`

/** "Take some out" asks for 1 to everything in the box. */
export const lubecTakeOutRange = (i: LubecItem): string => `Take out 1 to ${i.loaded ?? 0}.`

/** The take-out panel's line: where that many would land and what it costs, or the range it takes. */
export function lubecTakeOutCost(gear: LubecGear, box: LubecItem, n: number, supplies: readonly LubecSupply[], supplyName: LubecSupplyName): string {
  if (!(n >= 1 && n <= (box.loaded ?? 0))) return lubecTakeOutRange(box)
  return `${cap1(lubecLandText(box, lubecLandPlan(gear, box, n, supplies), supplyName))}.`
}

/** The toast after making a supply. It is stored on the maker's sheet, so it is a supply there, not for the whole game. */
export const lubecSupplyMadeToast = (name: string): string => `${name} is now a supply on this sheet.`

/** The add form's line when "Make it" has no name. */
export const LUBEC_SUPPLY_UNNAMED = 'Name the supply, like ".45 rounds" or "lamp oil".'
