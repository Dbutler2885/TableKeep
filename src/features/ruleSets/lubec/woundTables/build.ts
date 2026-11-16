import type { LubecModifier } from '../derivations'
import type { LubecRestriction, LubecRollRule, LubecRollScope, LubecRollTask, LubecStepUntil } from '../effects'
import type { LubecValueName } from '../sheet'
import type { LubecWoundCardSpec, LubecWoundConcussion, LubecWoundNow, LubecWoundOutcome, LubecWoundStepSpec, LubecWoundTimer } from './outcome'
import type { LubecWoundSeverity, LubecWoundTableRow } from './types'

// Small builders the final tables are written with, so each row reads close to
// its prose. They only shape data.

export const mod = (target: LubecValueName, amount: number): LubecModifier => ({ target, amount })
export const handle = (amount: number): LubecModifier => mod('Handle', amount)

export const dis = (scope: LubecRollScope): LubecRollRule => ({ scope, mode: 'disadvantage' })
export const adv = (scope: LubecRollScope): LubecRollRule => ({ scope, mode: 'advantage' })
export const task = (name: LubecRollTask): LubecRollScope => ({ task: name })

export const NO_RUN: LubecRestriction = { kind: 'no-run' }
export const NO_EVASIVE: LubecRestriction = { kind: 'no-evasive' }
export const CRAWL: LubecRestriction = { kind: 'crawl-only' }
export const NO_TWO_HANDS: LubecRestriction = { kind: 'no-two-handed' }
export const speech = (words: string): LubecRestriction => ({ kind: 'speech', words })

export const step = (until: LubecStepUntil, parts: Omit<LubecWoundStepSpec, 'until'> = {}): LubecWoundStepSpec => ({ until, ...parts })
export const card = (key: string, part: string, ...steps: LubecWoundStepSpec[]): LubecWoundCardSpec => ({ key, part, steps })

/** A step that lasts until the end of the next round. */
export const brief = (parts: Omit<LubecWoundStepSpec, 'until'>) => step('next-round-end', parts)
/** "Until N Long Rests": one step per rest, each recorded by Step down. */
export const rests = (count: number, parts: Omit<LubecWoundStepSpec, 'until'>): LubecWoundStepSpec[] => Array.from({ length: count }, () => step('long-rest', parts))
export const lasting = (parts: Omit<LubecWoundStepSpec, 'until'>) => step('lasting', parts)
/** The situational Charm reminder, which never changes Charm. */
export const charmReminder = (label: string) => lasting({ charmReminder: true, labels: [label] })

export const LOSE_MOVEMENT: LubecWoundNow = { kind: 'lose-movement' }
export const LOSE_ACTION: LubecWoundNow = { kind: 'lose-action' }
export const DAZED: LubecWoundNow = { kind: 'dazed', turns: 1 }
export const DAZED_1D4: LubecWoundNow = { kind: 'dazed', turns: '1d4' }
export const DOWN: LubecWoundNow = { kind: 'knocked-down' }
export const DROP: LubecWoundNow = { kind: 'drop', check: false }
export const DROP_UNLESS: LubecWoundNow = { kind: 'drop', check: true }
export const DEATH_SAVE: LubecWoundNow = { kind: 'immediate-death-save' }
export const OUT_OF_REACH: LubecWoundNow = { kind: 'out-of-reach' }
export const UNCONSCIOUS: LubecWoundNow = { kind: 'unconscious' }

export const outcome = (now: LubecWoundNow[], cards: LubecWoundCardSpec[] = [], extra: Omit<LubecWoundOutcome, 'now' | 'cards'> = {}): LubecWoundOutcome => ({ now, cards, ...extra })
export const timers = (...kinds: LubecWoundTimer[]) => ({ timers: kinds })

type RowExtras = Pick<LubecWoundTableRow, 'concussion' | 'fistCatch' | 'choices'>

/** A final row: its Impact, severity, Trauma, name and the file's exact prose, with what it does. */
export function finalRow(
  contentVersion: string, impact: number, severity: LubecWoundSeverity, trauma: number, name: string, text: string,
  what: LubecWoundOutcome, extras: RowExtras & { orMore?: true } = {},
): LubecWoundTableRow {
  const { orMore, ...rest } = extras
  return { impact, ...(orMore ? { orMore } : {}), severity, trauma, name, text, contentVersion, outcome: what, ...rest }
}

export const MINOR_CONCUSSION: LubecWoundConcussion = { kind: 'minor' }
export const SEVERE_CONCUSSION: LubecWoundConcussion = { kind: 'severe' }
