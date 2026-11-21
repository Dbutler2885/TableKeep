import type { LubecAdvantage } from './checkRoll'
import type { LubecModifier } from './derivations'
import { lubecStepRolls, lubecStepTaskModifiers, type LubecEffect, type LubecRollRule, type LubecRollScope, type LubecRollTask } from './effects'
import type { LubecValueName } from './sheet'

// What mode a roll has, and which cards say so. One reader serves the Core
// roller and every combat roll. It reads each card's current step only, never
// a later step and never a step's words. Sources of one sign do not stack, an
// Advantage and a Disadvantage cancel to normal, and duration, branch and
// rolled-amount dice never ask it.

/** What kind of roll is being made. Every kind but `save` is a Check; attacks and Defense are Physical Checks. */
export type LubecRollKind = 'check' | 'save' | 'attack' | 'defense' | 'strength-impact' | 'retention' | 'stand' | 'initiative' | 'evasion'

/** A narrow kind of action the roll is, which a task-scoped mode or penalty reads. */
export const LUBEC_ROLL_ACTIONS = ['precise-work', 'visually-precise', 'ranged', 'grapple-climb', 'punch', 'throw'] as const
export type LubecRollAction = typeof LUBEC_ROLL_ACTIONS[number]

export type LubecRollRequest = { kind: LubecRollKind; stat: LubecValueName; actions?: readonly LubecRollAction[] }

/** A card that sets a roll's mode: its id, its name as the sheet shows it, and the mode it sets. */
export type LubecModeSource = { id: string; name: string; mode: 'advantage' | 'disadvantage' }
export type LubecResolvedMode = { mode: LubecAdvantage; sources: LubecModeSource[] }

const PHYSICAL: readonly LubecValueName[] = ['Strength', 'Speed', 'Handle']

/** The actions each task scope covers. */
const TASK_ACTIONS: Readonly<Record<LubecRollTask, readonly LubecRollAction[]>> = {
  'precise-work': ['precise-work'],
  'visually-precise': ['visually-precise'],
  'ranged-visual': ['ranged', 'visually-precise'],
  'grapple-climb': ['grapple-climb'],
  punch: ['punch'],
  'punch-throw': ['punch', 'throw'],
}

const isCheck = (request: LubecRollRequest) => request.kind !== 'save'

const physicalRoll = (request: LubecRollRequest) =>
  isCheck(request) && (PHYSICAL.includes(request.stat) || request.kind === 'attack' || request.kind === 'defense')

const statCheck = (stat: LubecValueName) => (request: LubecRollRequest) => isCheck(request) && request.stat === stat

const SCOPE_COVERS: Record<Extract<LubecRollScope, string>, (request: LubecRollRequest) => boolean> = {
  rolls: () => true,
  checks: isCheck,
  saves: (request) => request.kind === 'save',
  physical: physicalRoll,
  strength: statCheck('Strength'),
  speed: statCheck('Speed'),
  handle: statCheck('Handle'),
  attacks: (request) => request.kind === 'attack',
  defense: (request) => request.kind === 'defense',
}

/** Whether a scope covers this roll. */
export function lubecScopeCovers(scope: LubecRollScope, request: LubecRollRequest): boolean {
  if (typeof scope !== 'string') return TASK_ACTIONS[scope.task].some((action) => request.actions?.includes(action))
  return SCOPE_COVERS[scope](request)
}

/** A card goes by its wound's name from the table, or a hand-made effect's own name. */
const sourceName = (effect: LubecEffect) => effect.name

/** The mode the active cards set for this roll, and every card that sets one. */
export function lubecRollMode(effects: readonly LubecEffect[], request: LubecRollRequest, fixed: readonly LubecModeSource[] = []): LubecResolvedMode {
  const sources: LubecModeSource[] = [...fixed]
  for (const effect of effects) {
    const step = effect.steps[0]
    if (!step) continue
    const covering = lubecStepRolls(step).filter((rule: LubecRollRule) => lubecScopeCovers(rule.scope, request))
    for (const mode of new Set(covering.map((rule) => rule.mode))) sources.push({ id: effect.id, name: sourceName(effect), mode })
  }
  const advantage = sources.some((source) => source.mode === 'advantage')
  const disadvantage = sources.some((source) => source.mode === 'disadvantage')
  const mode: LubecAdvantage = advantage === disadvantage ? 'normal' : advantage ? 'advantage' : 'disadvantage'
  return { mode, sources }
}

/** "Disadvantage from Broken rib(s) (Ribs)", or null when nothing sets the mode; a cancelled pair says so. */
export function lubecModeReason(resolved: LubecResolvedMode): string | null {
  if (!resolved.sources.length) return null
  const names = (mode: string) => resolved.sources.filter((source) => source.mode === mode).map((source) => source.name).join(', ')
  if (resolved.mode === 'normal') return `Advantage from ${names('advantage')} cancels Disadvantage from ${names('disadvantage')}`
  return `${resolved.mode === 'advantage' ? 'Advantage' : 'Disadvantage'} from ${names(resolved.mode)}`
}

/** The task-only penalties that count for this roll ("-20 Handle on ranged and visually precise actions"). */
export function lubecTaskModifiers(effects: readonly LubecEffect[], request: Pick<LubecRollRequest, 'actions'>): LubecModifier[] {
  return effects.flatMap((effect) => (effect.steps[0] ? lubecStepTaskModifiers(effect.steps[0]) : []))
    .filter((modifier) => TASK_ACTIONS[modifier.task].some((action) => request.actions?.includes(action)))
    .map(({ target, amount }) => ({ target, amount }))
}

const ACTION_WORDS: Readonly<Record<LubecRollAction, string>> = {
  'precise-work': 'Precise work', 'visually-precise': 'Visually precise', ranged: 'Ranged', 'grapple-climb': 'Grappling or climbing', punch: 'Punch', throw: 'Throw',
}

export const lubecRollActionName = (action: LubecRollAction): string => ACTION_WORDS[action]

/** Whether any active card reads the kind of action a roll is, so the roller should ask. */
export const lubecReadsActions = (effects: readonly LubecEffect[]): boolean =>
  effects.some((effect) => effect.steps[0] && (lubecStepTaskModifiers(effect.steps[0]).length > 0 || lubecStepRolls(effect.steps[0]).some((rule) => typeof rule.scope !== 'string')))
