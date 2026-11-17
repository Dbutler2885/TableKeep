import { readSheetRevision } from '../../character/characterStore/sheetIntention'
import type { SheetEdit, SheetIntention, SheetValue } from '../../character/characterStore/sheetIntentionTypes'
import type { CombatWound, CombatWoundOrigin } from './woundTypes'
import { lubecDeathReasons, lubecDeathReminder, lubecDeathReminderEdits, lubecStoredDeathThreshold, lubecStoredTrauma } from '../../ruleSets/lubec/deathReminders'

// The end of a round for one combatant, as a sheet change. It reads the sheet
// as it stands in the delivery transaction and ends what this fight's round
// windows say ends with this round: a brief "until the end of the next round"
// step from round R ends with round R+1. Every edit carries the value it read,
// so a concurrent manual edit is never overwritten, and the delivery receipt
// makes a retry return the first outcome instead of ending a step twice.

type Raw = Record<string, unknown>

const isRecord = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value)

const originOf = (effect: Raw): CombatWoundOrigin | null => (isRecord(effect.combatOrigin) ? effect.combatOrigin as unknown as CombatWoundOrigin : null)

/** The round a brief window from round `landed` ends with. */
export const lubecBriefWindowEnd = (landed: number): number => landed + 1

/** Whether this stored card's current step is a round window from this fight that has ended by the end of `round`. */
function windowEnded(effect: Raw, fightId: string, round: number): boolean {
  const origin = originOf(effect)
  const first = Array.isArray(effect.steps) && isRecord(effect.steps[0]) ? effect.steps[0] : null
  return origin?.fightId === fightId && first?.until === 'next-round-end' && lubecBriefWindowEnd(origin.originatingRound) <= round
}

/** The edit that ends a card's current step: the next step begins, or the card goes when it was the last. */
function stepDownEdit(effect: Raw): SheetEdit {
  const id = String(effect.id)
  const steps = effect.steps as SheetValue[]
  if (steps.length > 1) return { kind: 'set', path: ['lubec', 'effects', { recordId: id }, 'steps'], base: { exists: true, value: steps }, value: steps.slice(1) }
  return { kind: 'remove', path: ['lubec', 'effects', { recordId: id }], base: { exists: true, value: effect as SheetValue } }
}

/** A countdown of N rolled in round R is due at the end of round R+N: the landing round never uses one up. */
export const lubecCountdownDue = (landed: number, rounds: number): number => landed + rounds

type Countdown = { kind: 'bleed' | 'critical'; rounds: number; fired?: boolean; firedRound?: number }

const countdownOf = (effect: Raw): Countdown | null => {
  const countdown = effect.countdown
  return isRecord(countdown) && (countdown.kind === 'bleed' || countdown.kind === 'critical') && Number.isInteger(countdown.rounds) ? countdown as unknown as Countdown : null
}

/** Whether this stored card is a countdown from this fight that falls due by the end of `round` and has not fired. */
function countdownDue(effect: Raw, fightId: string, round: number): boolean {
  const origin = originOf(effect)
  const countdown = countdownOf(effect)
  return origin?.fightId === fightId && countdown !== null && !countdown.fired && lubecCountdownDue(origin.originatingRound, countdown.rounds) <= round
}

const FIRED_WORDS = {
  bleed: (round: number) => `Fired at the end of round ${round}: +1 Trauma added. Clear by hand.`,
  critical: (round: number) => `Due at the end of round ${round}: a Death Save, which the GM resolves privately. Clear by hand.`,
} as const

/** A countdown firing: it is marked fired, with the round, and its card says what happened, in the same write. */
function firedEdits(effect: Raw, round: number): SheetEdit[] {
  const id = String(effect.id)
  const countdown = countdownOf(effect)!
  const steps = effect.steps as SheetValue[]
  return [
    { kind: 'set', path: ['lubec', 'effects', { recordId: id }, 'countdown'], base: { exists: true, value: countdown as unknown as SheetValue }, value: { ...countdown, fired: true, firedRound: round } as unknown as SheetValue },
    { kind: 'set', path: ['lubec', 'effects', { recordId: id }, 'steps'], base: { exists: true, value: steps }, value: [{ modifiers: [], labels: [FIRED_WORDS[countdown.kind](round)], until: 'by-hand' }] },
  ]
}

type Lost = { movement: number[]; action: number[] }

const lostOf = (effect: Raw): Lost | null => {
  const lost = effect.lost
  return isRecord(lost) && Array.isArray(lost.movement) && Array.isArray(lost.action) ? lost as unknown as Lost : null
}

/** Whether this stored card's lost stages from this fight have all passed by the end of `round`. */
function stagesPassed(effect: Raw, fightId: string, round: number): boolean {
  const lost = lostOf(effect)
  if (!lost || originOf(effect)?.fightId !== fightId || effect.afterCombat !== undefined) return false
  return Math.max(...lost.movement, ...lost.action) <= round
}

/** What the end of the tick's round does for this combatant: windows that end, stage losses that have all passed, and countdowns that fall due. */
export function roundTickEdits(raw: Raw, tick: CombatWound, fightId: string): SheetEdit[] {
  const lubec = isRecord(raw.lubec) ? raw.lubec : {}
  const effects = (Array.isArray(lubec.effects) ? lubec.effects.filter(isRecord) : []).filter((effect) => typeof effect.id === 'string')
  const round = tick.tickRound!
  const ended = effects.filter((effect) => windowEnded(effect, fightId, round) || stagesPassed(effect, fightId, round)).map(stepDownEdit)
  const due = effects.filter((effect) => countdownDue(effect, fightId, round))
  const bleeds = due.filter((effect) => countdownOf(effect)!.kind === 'bleed').length
  const trauma: SheetEdit[] = bleeds ? [{ kind: 'delta', path: ['lubec', 'counters', 'trauma'], base: 0, amount: bleeds }] : []
  return [...ended, ...due.flatMap((effect) => firedEdits(effect, round)), ...trauma]
}

/**
 * The tick's Death Save reminders: firing bleeds that add Trauma at or past the threshold give one, and each Critical
 * countdown falling due gives its own; each is named by the tick's operation, so a redelivered tick finds its receipt.
 */
function tickDeathEdits(raw: Raw, tick: CombatWound, fightId: string, operationId: string): SheetEdit[] {
  const lubec = isRecord(raw.lubec) ? raw.lubec : {}
  const effects = (Array.isArray(lubec.effects) ? lubec.effects.filter(isRecord) : []).filter((effect) => typeof effect.id === 'string')
  const round = tick.tickRound!
  const due = effects.filter((effect) => countdownDue(effect, fightId, round))
  const bleeds = due.filter((effect) => countdownOf(effect)!.kind === 'bleed')
  const threshold = lubecStoredDeathThreshold(raw.lubec)
  const bleeding = lubecDeathReasons({ threshold, before: lubecStoredTrauma(raw.lubec), added: bleeds.length })
  const named = (effect: Raw) => String(effect.name ?? 'A wound')
  return lubecDeathReminderEdits(raw.lubec, [
    ...lubecDeathReminder(`${operationId}_death`, bleeding, `Bleeding from ${bleeds.map(named).join(', ')} at the end of round ${round}`),
    ...due.filter((effect) => countdownOf(effect)!.kind === 'critical').flatMap((effect) =>
      lubecDeathReminder(`${operationId}_critical_${String(effect.id)}`, ['A Critical countdown ran out: Death Save due'], `${named(effect)} at the end of round ${round}`)),
  ])
}

/** The tick as a revision-checked intention, or null when nothing on the sheet ends with this round. */
export function roundTickIntention(raw: Raw, tick: CombatWound, fightId: string, operationId: string): SheetIntention | null {
  const edits = [...roundTickEdits(raw, tick, fightId), ...tickDeathEdits(raw, tick, fightId, operationId)]
  return edits.length ? { operationId, baseRevision: readSheetRevision(raw), edits } : null
}

// Ending a fight, for one combatant: rest-of-combat steps end, and a round
// window or countdown still running becomes an after-combat card that suggests
// the rounds left as minutes, for the table to resolve by hand. Such a card
// never ticks and no later fight reads it. Long Rest, treatment, minute and
// lasting cards are left alone, and nothing is healed or applied.

const AFTER_WORDS = {
  window: () => 'Then Step down to clear this card.',
  bleed: () => 'Then add +1 Trauma with the Trauma counter, and Step down to clear this card.',
  critical: () => 'Then the GM resolves a Death Save privately, with the Death table; Step down to clear this card.',
} as const

const minutes = (count: number) => `Suggested ${count} minute${count === 1 ? '' : 's'} - resolve by hand`

/** The rounds still to run, the round End is pressed in counting as one, never fewer than one. */
const remaining = (lastRound: number, closeRound: number) => Math.max(1, lastRound - closeRound + 1)

function afterCombatEdits(effect: Raw, count: number, instruction: string, extra: Raw = {}): SheetEdit[] {
  const id = String(effect.id)
  const steps = effect.steps as SheetValue[]
  const afterCombat = { suggestedMinutes: count, instruction }
  return [
    { kind: 'set', path: ['lubec', 'effects', { recordId: id }, 'steps'], base: { exists: true, value: steps }, value: [{ modifiers: [], labels: [minutes(count), instruction], until: 'by-hand' }] },
    { kind: 'set', path: ['lubec', 'effects', { recordId: id }, 'afterCombat'], base: { exists: false }, value: { ...afterCombat, ...extra } as SheetValue },
  ]
}

/** What closing the fight does to one stored card of this fight; nothing for a card it leaves alone. */
function closingEditsOf(effect: Raw, closeRound: number): SheetEdit[] {
  const origin = originOf(effect)!
  const first = Array.isArray(effect.steps) && isRecord(effect.steps[0]) ? effect.steps[0] : null
  if (!first || effect.afterCombat !== undefined) return []
  const countdown = countdownOf(effect)
  if (countdown && !countdown.fired) {
    const count = remaining(lubecCountdownDue(origin.originatingRound, countdown.rounds), closeRound)
    return afterCombatEdits(effect, count, AFTER_WORDS[countdown.kind](), { countdown: countdown.kind })
  }
  const lost = lostOf(effect)
  if (lost) {
    // Dazed suggests the larger of its Movement and Action Stages still to come, one round a minute.
    const count = Math.max(lost.movement.filter((round) => round >= closeRound).length, lost.action.filter((round) => round >= closeRound).length)
    return count ? afterCombatEdits(effect, count, AFTER_WORDS.window()) : [stepDownEdit(effect)]
  }
  if (first.until === 'next-round-end') return afterCombatEdits(effect, remaining(lubecBriefWindowEnd(origin.originatingRound), closeRound), AFTER_WORDS.window())
  if (first.until === 'combat-end') return [stepDownEdit(effect)]
  return []
}

/** Every closing change for one combatant's cards from this fight. */
export function closingEdits(raw: Raw, fightId: string, closeRound: number): SheetEdit[] {
  const lubec = isRecord(raw.lubec) ? raw.lubec : {}
  const effects = (Array.isArray(lubec.effects) ? lubec.effects.filter(isRecord) : []).filter((effect) => typeof effect.id === 'string' && originOf(effect)?.fightId === fightId)
  return effects.flatMap((effect) => closingEditsOf(effect, closeRound))
}

/** The closing as a revision-checked intention, or null when nothing on the sheet changes. */
export function closingIntention(raw: Raw, entry: CombatWound, fightId: string, operationId: string): SheetIntention | null {
  const edits = closingEdits(raw, fightId, entry.tickRound!)
  return edits.length ? { operationId, baseRevision: readSheetRevision(raw), edits } : null
}
