import type { LubecCharacterSheet, LubecStoredEntry } from './characterRecord'
import { lubecClass } from './classes'
import { lubecCurrentValue } from './derivations'
import { rollLubecDie, type LubecDice } from './dice'
import { isLubecValueName } from './effects'
import { lubecSheetModifiers } from './modifiers'
import { areFaces, isCount, isFace, isOneOf, readLubecRollFields, type LubecRollFieldChecks } from './rollFields'
import { isLubecStat, type LubecSheet, type LubecValueName } from './sheet'
import { isFightingOrShootingSkill, lubecSkillBonus } from './skills'
import { lubecModeReason, lubecRollMode, lubecTaskModifiers, type LubecRollAction } from './rollModes'

// The core roller's Stat Checks and Saves: a d100 at or under the target,
// which is the current value plus an armed skill's bonus. Advantage rolls twice
// and keeps the lower roll, Disadvantage the higher. A failure adds Stress by
// itself, and the roll is recorded on the character as its last roll
// (`lastRoll.ts`). The Panic Check and the Recovery Save share the Advantage
// switch and the dice helpers here.

export const LUBEC_ADVANTAGE_MODES = ['advantage', 'normal', 'disadvantage'] as const
export type LubecAdvantage = typeof LUBEC_ADVANTAGE_MODES[number]

const LUBEC_CHECK_KINDS = ['stat-check', 'save'] as const
export type LubecCheckKind = typeof LUBEC_CHECK_KINDS[number]

export type LubecCheckRoll = {
  kind: LubecCheckKind
  against: LubecValueName
  target: number
  /** Every d100 rolled: one, or two under Advantage or Disadvantage. */
  dice: number[]
  /** The d100 kept. */
  result: number
  advantage: LubecAdvantage
  skill: string | null
  outcome: 'success' | 'failure'
  stressAdded: number
  /** Which cards set the mode, when they did ("Disadvantage from Broken rib(s)"); absent on a roll the player set by hand. */
  because?: string
  /** The kind of action the player said the roll was, when a narrow card reads it. */
  actions?: LubecRollAction[]
}

/** One of the character's own skills, as the roller offers it to arm. */
export type LubecRollSkill = { name: string; bonus: number; armable: boolean }

/**
 * The character's own skills the skill data knows, the free class skill first.
 * Fighting and shooting skills are listed but not armable: they count only in
 * the combat roller.
 */
export function lubecRollSkills(sheet: LubecSheet): LubecRollSkill[] {
  const names = [...new Set([sheet.skills.free, ...sheet.skills.picked])].filter((name): name is string => name !== null)
  return names.flatMap((name) => {
    const bonus = lubecSkillBonus(name)
    return bonus === null ? [] : [{ name, bonus, armable: !isFightingOrShootingSkill(name) }]
  })
}

const armedSkill = (sheet: LubecSheet, name: string | null): LubecRollSkill | null =>
  lubecRollSkills(sheet).find((skill) => skill.armable && skill.name === name) ?? null

/** The current value, with any task-only penalty the roll's action meets, plus the armed skill's bonus; a hole when the value is. */
export function lubecCheckTarget(sheet: LubecCharacterSheet, name: LubecValueName, skill: string | null, actions: readonly LubecRollAction[] = []): number | null {
  const current = lubecCurrentValue(sheet, name, [...lubecSheetModifiers(sheet), ...lubecTaskModifiers(sheet.effects, { actions })])
  return current === null ? null : current + (armedSkill(sheet, skill)?.bonus ?? 0)
}

/** The mode a Core Stat Check or Save takes from the sheet's cards, and why. */
export function lubecCoreRollMode(sheet: LubecCharacterSheet, name: LubecValueName, actions: readonly LubecRollAction[] = []) {
  const resolved = lubecRollMode(sheet.effects, { kind: isLubecStat(name) ? 'check' : 'save', stat: name, actions })
  return { mode: resolved.mode, because: lubecModeReason(resolved) }
}

/**
 * The die kept: the better of two under Advantage, the worse under
 * Disadvantage. The lower die is the better one unless `higherIsBetter`.
 */
export function keptLubecRoll(dice: readonly number[], advantage: LubecAdvantage, higherIsBetter = false): number {
  const keepsHigher = (advantage === 'disadvantage') !== higherIsBetter
  return keepsHigher ? Math.max(...dice) : Math.min(...dice)
}

// 1 for a failed Save; a failed Stat Check adds the class's own amount, 2 for an Overachiever.
const failureStress = (sheet: LubecSheet, kind: LubecCheckKind): number =>
  kind === 'stat-check' ? lubecClass(sheet.class.key)?.failedStatCheckStress ?? 1 : 1

/** The Stress a failed Stat Check adds for this character, as the roller adds it. */
export const lubecFailedCheckStress = (sheet: LubecSheet): number => failureStress(sheet, 'stat-check')

/** A roll to make: its value, the mode (null takes it from the cards), the armed skill, and the action it is, if narrow. */
export type LubecCheckRequest = { name: LubecValueName; advantage: LubecAdvantage | null; skill: string | null; actions?: readonly LubecRollAction[] }

/** One die of this many sides, or two under Advantage or Disadvantage. */
export const rollLubecDice = (sides: number, advantage: LubecAdvantage, dice: LubecDice): number[] =>
  Array.from({ length: advantage === 'normal' ? 1 : 2 }, () => rollLubecDie(sides, dice))

type LubecCheckOutcome = Pick<LubecCheckRoll, 'kind' | 'outcome' | 'stressAdded'>

function checkOutcome(sheet: LubecSheet, name: LubecValueName, target: number, result: number): LubecCheckOutcome {
  const kind: LubecCheckKind = isLubecStat(name) ? 'stat-check' : 'save'
  if (result <= target) return { kind, outcome: 'success', stressAdded: 0 }
  return { kind, outcome: 'failure', stressAdded: failureStress(sheet, kind) }
}

/** A Stat Check or Save rolled with the dice; null when the value it needs is a hole. */
const checkRequestMode = (sheet: LubecCharacterSheet, request: LubecCheckRequest, actions: readonly LubecRollAction[]) =>
  request.advantage === null ? lubecCoreRollMode(sheet, request.name, actions) : { mode: request.advantage, because: null }

const checkContextFields = (because: string | null, actions: readonly LubecRollAction[]) => ({
  ...(because ? { because } : {}), ...(actions.length ? { actions: [...actions] } : {}),
})

export function rollLubecCheck(sheet: LubecCharacterSheet, request: LubecCheckRequest, dice: LubecDice): LubecCheckRoll | null {
  const actions = request.actions ?? []
  const target = lubecCheckTarget(sheet, request.name, request.skill, actions)
  if (target === null) return null
  const resolved = checkRequestMode(sheet, request, actions)
  const advantage = resolved.mode
  const rolled = rollLubecDice(100, advantage, dice)
  const result = keptLubecRoll(rolled, advantage)
  return {
    against: request.name,
    target,
    dice: rolled,
    result,
    advantage,
    skill: armedSkill(sheet, request.skill)?.name ?? null,
    ...checkOutcome(sheet, request.name, target, result),
    ...checkContextFields(resolved.because, actions),
  }
}

const CHECK_ROLL_FIELDS: LubecRollFieldChecks<LubecCheckRoll> = {
  kind: isOneOf(LUBEC_CHECK_KINDS),
  against: isLubecValueName,
  target: isCount,
  dice: areFaces(100),
  result: isFace(100),
  advantage: isOneOf(LUBEC_ADVANTAGE_MODES),
  skill: (value) => value === null || typeof value === 'string',
  outcome: isOneOf(['success', 'failure']),
  stressAdded: isCount,
  because: (value) => value === undefined || typeof value === 'string',
  actions: (value) => value === undefined || (Array.isArray(value) && value.every((action) => typeof action === 'string')),
}

/** A stored last roll as a Stat Check or Save, or null when it does not read as one. */
export const readLubecCheckRoll = (entry: LubecStoredEntry | null): LubecCheckRoll | null =>
  readLubecRollFields(entry, CHECK_ROLL_FIELDS)

/** A double (11, 22 ... 99) is a critical; it changes nothing else. */
export const isLubecCritical = (roll: LubecCheckRoll): boolean => roll.result % 11 === 0

const KIND_NAMES: Readonly<Record<LubecCheckKind, string>> = { 'stat-check': 'check', save: 'save' }

const ADVANTAGE_NAMES: Readonly<Record<LubecAdvantage, string>> =
  { advantage: 'Advantage', normal: 'Normal', disadvantage: 'Disadvantage' }

export const lubecAdvantageName = (mode: LubecAdvantage): string => ADVANTAGE_NAMES[mode]

/** "Strength check with Boatwork". */
export const describeLubecCheckRoll = (roll: LubecCheckRoll): string =>
  `${roll.against} ${KIND_NAMES[roll.kind]}${roll.skill === null ? '' : ` with ${roll.skill}`}`

type LubecRolledDice = { dice: readonly number[]; result: number; advantage: LubecAdvantage }

/** "Rolled 23 vs 39", or "Advantage: 23 and 71, kept 23 vs 39", against what `versus` names. */
export function describeLubecDice(roll: LubecRolledDice, versus: string): string {
  const dice = roll.dice.length > 1
    ? `${lubecAdvantageName(roll.advantage)}: ${roll.dice.join(' and ')}, kept ${roll.result}`
    : `Rolled ${roll.result}`
  return `${dice} vs ${versus}`
}

export const describeLubecCheckDice = (roll: LubecCheckRoll): string => describeLubecDice(roll, `${roll.target}`)

/** "Failure, +1 Stress": the outcome, capitalised, and the Stress it changed by, if any. */
export function describeLubecOutcome(outcome: string, stressChange: number): string {
  const stress = stressChange === 0 ? '' : `, ${stressChange > 0 ? '+' : ''}${stressChange} Stress`
  return `${outcome.charAt(0).toUpperCase()}${outcome.slice(1)}${stress}`
}

/** "Success", "Critical failure, +1 Stress". */
export const describeLubecCheckOutcome = (roll: LubecCheckRoll): string =>
  describeLubecOutcome(isLubecCritical(roll) ? `Critical ${roll.outcome}` : roll.outcome, roll.stressAdded)
