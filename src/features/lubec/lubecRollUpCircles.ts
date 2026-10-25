import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
import { lubecClass } from '../ruleSets/lubec/classes'
import {
  lubecRolledDice,
  lubecRollUpStage,
  lubecSwapSources,
  lubecSwapTargets,
  readLubecRollUp,
  type LubecRollUp,
  type LubecValueDice,
} from '../ruleSets/lubec/guidedRollUp'
import { LUBEC_SAVE_FLAT } from '../ruleSets/lubec/rollUp'
import { isLubecStat, LUBEC_STATS, type LubecStat, type LubecValueName } from '../ruleSets/lubec/sheet'

// A guided draft's roll-up on the Core page's roll circles, as the combined
// prototype draws it: "Roll" in an empty circle, a spin, the number it lands
// on, then the lowest-Stat decision on the same circles.

type Scores = Pick<LubecCharacterSheet, 'base'>

/**
 * The Swap as the player is making it, as the prototype's `swap`: the lowest
 * Stat picked, then the Stat it trades with, shown traded for review. Nothing
 * is stored until it is confirmed.
 */
export type LubecSwapDraft =
  | { stage: 'select'; source: LubecStat | null }
  | { stage: 'review'; source: LubecStat; target: LubecStat }

/** A number shown while a value's dice spin, before they land. */
export type LubecGenerateSpin = { name: LubecValueName; preview: number; step: number }

/** What the roll-up circles show: the sheet, the Swap being made, a spin, the circle just landed, and whether the viewer may roll. */
export type LubecRollUpState = {
  sheet: LubecCharacterSheet
  swap: LubecSwapDraft | null
  spin: LubecGenerateSpin | null
  landed: LubecValueName | null
  canAct: boolean
}

/** One roll-up circle: its state classes, number, label, the note under it, and whether a tap does something. */
export type LubecRollUpCircle = {
  classes: readonly string[]
  number: string
  label: string
  tappable: boolean
  note: string
  swapNote: boolean
}

/** Whether a guided draft still shows its roll-up: its dice or decision are open, or no class is chosen yet. */
export function lubecRollUpActive(sheet: LubecCharacterSheet): boolean {
  return lubecRollUpStage(readLubecRollUp(sheet.rollUp)) !== 'settled' || lubecClass(sheet.class.key) === null
}

/** The prototype's spinning digits: only for show, as the real dice are rolled on the tap. */
export function lubecGeneratePreview(name: LubecValueName, random: () => number = Math.random): number {
  const die = (sides: number) => Math.floor(random() * sides) + 1
  return isLubecStat(name) ? (1 + die(4)) * 10 + die(10) : LUBEC_SAVE_FLAT + die(10) + die(10)
}

/** The Swap begun: a lone lowest Stat is picked already, a tie waits for a tap. */
export function lubecStartSwap(sheet: Scores): LubecSwapDraft {
  const lows = lubecSwapSources(sheet)
  return { stage: 'select', source: lows.length === 1 ? lows[0] : null }
}

/** Whether the lowest Stat has anything to trade with. */
export const lubecCanSwap = (sheet: Scores): boolean =>
  lubecSwapSources(sheet).some((stat) => lubecSwapTargets(sheet, stat).length > 0)

/** The Stats at the highest score, which the Swap never moves. */
export function lubecHighestStats(sheet: Scores): LubecStat[] {
  const top = Math.max(...LUBEC_STATS.map((name) => sheet.base[name] ?? -Infinity))
  return LUBEC_STATS.filter((name) => sheet.base[name] === top)
}

type SwapMark = { mark: 'swap-source' | 'swap-target' | 'swap-locked' | 'swap-moved'; note: string | null; tappable: boolean }

// The prototype's renderSwapState while the lowest is picked and traded:
// the lowest glows rust, the best is locked, eligible Stats invite a tap.
function selectMark(sheet: Scores, source: LubecStat | null, name: LubecStat): SwapMark | null {
  if (name === source) return { mark: 'swap-source', note: 'Lowest', tappable: false }
  if (!source && lubecSwapSources(sheet).includes(name)) return { mark: 'swap-source', note: 'Pick one', tappable: true }
  if (lubecHighestStats(sheet).includes(name)) return { mark: 'swap-locked', note: 'Locked', tappable: false }
  if (source && lubecSwapTargets(sheet, source).includes(name)) return { mark: 'swap-target', note: null, tappable: true }
  return null
}

function swapMark(sheet: Scores, swap: LubecSwapDraft | null, name: LubecValueName): SwapMark | null {
  if (!swap || !isLubecStat(name)) return null
  if (swap.stage === 'select') return selectMark(sheet, swap.source, name)
  return name === swap.source || name === swap.target ? { mark: 'swap-moved', note: 'Swapped', tappable: false } : null
}

/** The Swap after a tap on a circle: the lowest picked, or the trade made for review; unchanged where a tap does nothing. */
export function lubecSwapTapped(sheet: Scores, swap: LubecSwapDraft, name: LubecValueName): LubecSwapDraft {
  const mark = swapMark(sheet, swap, name)
  if (!mark?.tappable || !isLubecStat(name)) return swap
  if (mark.mark === 'swap-source' || swap.source === null) return { stage: 'select', source: name }
  return { stage: 'review', source: swap.source, target: name }
}

/** The base values with a Swap under review shown traded. */
export function lubecSwapPreview(sheet: Scores, swap: LubecSwapDraft | null): Scores['base'] {
  if (swap?.stage !== 'review') return sheet.base
  return { ...sheet.base, [swap.source]: sheet.base[swap.target], [swap.target]: sheet.base[swap.source] }
}

/** The tray's hint while the Swap is made. */
export function lubecSwapHint(swap: LubecSwapDraft): string {
  if (swap.stage === 'review') return `${swap.source} and ${swap.target} traded`
  return swap.source ? 'Tap a Stat to trade with your lowest' : 'Tied for lowest: tap the one that moves'
}

/** The dice a value landed on, under its circle: "40 + 7" or "10 + 3 + 4". */
export const lubecDiceNote = (dice: LubecValueDice): string =>
  ('tens' in dice ? `${dice.tens} + ${dice.d10}` : `${LUBEC_SAVE_FLAT} + ${dice[0]} + ${dice[1]}`)

// A Stat a confirmed Swap moved no longer carries the dice it was rolled with.
const storedSwapMoved = (rollUp: LubecRollUp, name: LubecValueName): boolean =>
  rollUp.swap !== null && (rollUp.swap.lowest === name || rollUp.swap.other === name)

function rolledNote(state: LubecRollUpState, name: LubecValueName, dice: LubecValueDice, mark: SwapMark | null) {
  if (mark?.note) return { note: mark.note, swapNote: true }
  if (storedSwapMoved(readLubecRollUp(state.sheet.rollUp), name)) return { note: 'Swapped', swapNote: true }
  return { note: lubecDiceNote(dice), swapNote: false }
}

function rolledLabel(state: LubecRollUpState, name: LubecValueName, mark: SwapMark | null): string {
  const base = lubecSwapPreview(state.sheet, state.swap)
  if (mark?.mark === 'swap-target' && state.swap) return `Swap ${state.swap.source} ${base[state.swap.source as LubecStat]} with ${name} ${base[name]}`
  return `${name} score ${base[name]}`
}

function rolledCircle(state: LubecRollUpState, name: LubecValueName, dice: LubecValueDice): LubecRollUpCircle {
  const mark = swapMark(state.sheet, state.swap, name)
  return {
    classes: ['has-value', 'awaiting-class', ...(state.landed === name ? ['landed'] : []), ...(mark ? [mark.mark] : [])],
    number: String(lubecSwapPreview(state.sheet, state.swap)[name] ?? ''),
    label: rolledLabel(state, name, mark),
    tappable: state.canAct && mark?.tappable === true,
    ...rolledNote(state, name, dice, mark),
  }
}

const unrolledCircle = (state: LubecRollUpState, name: LubecValueName): LubecRollUpCircle => ({
  classes: [],
  number: 'Roll',
  label: state.canAct ? `Generate ${name}` : `${name} not rolled yet`,
  tappable: state.canAct && state.spin === null,
  note: '',
  swapNote: false,
})

/** One value's circle on the roll-up: spinning, waiting to be rolled, or rolled with its dice or its Swap state under it. */
export function lubecRollUpCircle(state: LubecRollUpState, name: LubecValueName): LubecRollUpCircle {
  if (state.spin?.name === name) {
    return { classes: ['rolling'], number: String(state.spin.preview), label: `Rolling ${name}`, tappable: false, note: '', swapNote: false }
  }
  const dice = lubecRolledDice(readLubecRollUp(state.sheet.rollUp), name)
  return dice ? rolledCircle(state, name, dice) : unrolledCircle(state, name)
}

function swapStatus(sheet: Scores, swap: LubecSwapDraft): string {
  if (swap.stage === 'review') {
    const base = lubecSwapPreview(sheet, swap)
    return `${swap.source} is now ${base[swap.source]}; ${swap.target} is now ${base[swap.target]}. Confirm or undo.`
  }
  if (!swap.source) return 'Two Stats tie for lowest. Tap the one you want to move.'
  return `${swap.source} is your lowest. Tap a Stat to trade places with it. Your best Stat is locked.`
}

function settledStatus(rollUp: LubecRollUp): string {
  return rollUp.swap ? `${rollUp.swap.lowest} and ${rollUp.swap.other} swapped. Now choose a class.` : 'Scores settled. Now choose a class.'
}

type StatusRequest = { sheet: LubecCharacterSheet; swap: LubecSwapDraft | null; spin: LubecGenerateSpin | null; generated: LubecValueName | null }

/** The status line under the roll-up circles, in the prototype's words for each step. */
export function lubecRollUpStatus({ sheet, swap, spin, generated }: StatusRequest): string {
  if (spin) return `Rolling ${spin.name}...`
  const rollUp = readLubecRollUp(sheet.rollUp)
  const stage = lubecRollUpStage(rollUp)
  if (stage === 'settled') return settledStatus(rollUp)
  if (stage === 'deciding') return swap ? swapStatus(sheet, swap) : 'Keep these scores or swap your lowest Stat.'
  return generated && lubecRolledDice(rollUp, generated) ? `${generated} generated at ${sheet.base[generated]}.` : 'Roll each Stat and Save to begin.'
}
