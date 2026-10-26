import { useState } from 'react'
import { makeId } from '../../character/characterFactories'
import type { LubecCharacterSheet } from '../../ruleSets/lubec/characterRecord'
import type { LubecGear } from '../../ruleSets/lubec/gear/gearRecord'
import type { LubecRolled } from '../useLubecRoller'
import type { LubecItemSheetState } from './itemSheet'
import { lubecPendingAsk, lubecStrengthDone, type LubecStrengthAnswer, type LubecStrengthAsk } from './strengthAsk'
import type { LubecDropIt } from './useLubecGearMoves'

/**
 * The character's sheet and how a roll is recorded on it, for the Strength
 * prompt; null where nobody is asked, which is anyone but the character's
 * owner: a heavy thing the GM gives arrives with no roll, for its owner to make.
 */
export type LubecGearStrength = { sheet: LubecCharacterSheet; onRolled: LubecRolled } | null

/**
 * The Strength prompt's state on the Gear page: the prompt open now, and how
 * to open one, or none where nobody is asked. Opening the page asks the owner
 * about the first heavy thing on them that came with no roll; Cancel leaves it
 * waiting until the page is opened again.
 */
export function useLubecStrengthAsk(gear: LubecGear, strength: LubecGearStrength) {
  const [ask, setAsk] = useState<LubecStrengthAsk | null>(() => (strength ? lubecPendingAsk(gear) : null))
  return { ask: strength ? ask : null, onAsk: strength ? setAsk : null, setAsk }
}

/** What the page does with an answer: commit, show, toast and drop. */
export type LubecAnswerContext = {
  change: (gear: LubecGear) => void
  setSheet: (sheet: LubecItemSheetState | null) => void
  toast: (text: string) => void
  drop: LubecDropIt
  setAsk: (ask: LubecStrengthAsk | null) => void
}

// A drop shows its toast once it has landed; anything else shows it now.
function toastOrDrop(ctx: LubecAnswerContext, a: LubecStrengthAnswer) {
  if (a.drop) return ctx.drop(a.drop, ctx.toast, a.toast)
  if (a.toast) ctx.toast(a.toast)
}

/** Done, after the roll came out `outcome`: one commit from the gear as it is now, then the sheet, the toast and the next ask. */
export function lubecAnswerStrength(ctx: LubecAnswerContext, gear: LubecGear, ask: LubecStrengthAsk, outcome: 'success' | 'failure') {
  const a = lubecStrengthDone(gear, ask, outcome, makeId)
  if (a.gear) ctx.change(a.gear)
  if (a.sheet !== undefined) ctx.setSheet(a.sheet)
  toastOrDrop(ctx, a)
  ctx.setAsk(a.next ?? null)
}
