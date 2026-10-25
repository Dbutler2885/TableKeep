import type { LubecCharacterSheet, LubecStoredEntry } from './characterRecord'
import { lubecClass } from './classes'
import { lubecCurrentValue } from './derivations'
import { rollLubecDie, type LubecDice } from './dice'
import { isLubecValueName, lubecActiveModifiers } from './effects'
import { isLubecStat, type LubecSheet, type LubecValueName } from './sheet'
import { isFightingOrShootingSkill, lubecSkillBonus } from './skills'

// The core roller's Stat Checks and Saves: a d100 at or under the target,
// which is the current value plus an armed skill's bonus. Advantage rolls twice
// and keeps the lower roll, Disadvantage the higher. A failure adds Stress by
// itself, and the roll is recorded on the character as its last roll.

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

/** The current value plus the armed skill's bonus; a hole when the value is. */
export function lubecCheckTarget(sheet: LubecCharacterSheet, name: LubecValueName, skill: string | null): number | null {
  const current = lubecCurrentValue(sheet, name, lubecActiveModifiers(sheet.effects))
  return current === null ? null : current + (armedSkill(sheet, skill)?.bonus ?? 0)
}

const keptRoll = (dice: readonly number[], advantage: LubecAdvantage): number =>
  advantage === 'disadvantage' ? Math.max(...dice) : Math.min(...dice)

// 1 for a failed Save; a failed Stat Check adds the class's own amount, 2 for an Overachiever.
const failureStress = (sheet: LubecSheet, kind: LubecCheckKind): number =>
  kind === 'stat-check' ? lubecClass(sheet.class.key)?.failedStatCheckStress ?? 1 : 1

export type LubecCheckRequest = { name: LubecValueName; advantage: LubecAdvantage; skill: string | null }

// One d100, or two under Advantage or Disadvantage.
const rollD100s = (advantage: LubecAdvantage, dice: LubecDice): number[] =>
  Array.from({ length: advantage === 'normal' ? 1 : 2 }, () => rollLubecDie(100, dice))

type LubecCheckOutcome = Pick<LubecCheckRoll, 'kind' | 'outcome' | 'stressAdded'>

function checkOutcome(sheet: LubecSheet, name: LubecValueName, target: number, result: number): LubecCheckOutcome {
  const kind: LubecCheckKind = isLubecStat(name) ? 'stat-check' : 'save'
  if (result <= target) return { kind, outcome: 'success', stressAdded: 0 }
  return { kind, outcome: 'failure', stressAdded: failureStress(sheet, kind) }
}

/** A Stat Check or Save rolled with the dice; null when the value it needs is a hole. */
export function rollLubecCheck(sheet: LubecCharacterSheet, request: LubecCheckRequest, dice: LubecDice): LubecCheckRoll | null {
  const target = lubecCheckTarget(sheet, request.name, request.skill)
  if (target === null) return null
  const rolled = rollD100s(request.advantage, dice)
  const result = keptRoll(rolled, request.advantage)
  return {
    against: request.name,
    target,
    dice: rolled,
    result,
    advantage: request.advantage,
    skill: armedSkill(sheet, request.skill)?.name ?? null,
    ...checkOutcome(sheet, request.name, target, result),
  }
}

/** The sheet with the roll as its last roll and the Stress the roll added. */
export function withLubecCheckRoll(sheet: LubecCharacterSheet, roll: LubecCheckRoll): LubecCharacterSheet {
  const counters = { ...sheet.counters, stress: sheet.counters.stress + roll.stressAdded }
  return { ...sheet, counters, lastRoll: roll }
}

const isOneOf = <Option extends string>(options: readonly Option[]) => (value: unknown): value is Option =>
  (options as readonly unknown[]).includes(value)

const isCount = (value: unknown): boolean => Number.isInteger(value) && (value as number) >= 0

const isD100 = (value: unknown): boolean => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 100

const CHECK_ROLL_FIELDS: Readonly<Record<keyof LubecCheckRoll, (value: unknown) => boolean>> = {
  kind: isOneOf(LUBEC_CHECK_KINDS),
  against: isLubecValueName,
  target: isCount,
  dice: (value) => Array.isArray(value) && value.length > 0 && value.every(isD100),
  result: isD100,
  advantage: isOneOf(LUBEC_ADVANTAGE_MODES),
  skill: (value) => value === null || typeof value === 'string',
  outcome: isOneOf(['success', 'failure']),
  stressAdded: isCount,
}

/** A stored last roll as a Stat Check or Save, or null when it does not read as one. */
export function readLubecCheckRoll(entry: LubecStoredEntry | null): LubecCheckRoll | null {
  if (entry === null) return null
  const reads = Object.entries(CHECK_ROLL_FIELDS).every(([field, check]) => check(entry[field]))
  return reads ? entry as LubecCheckRoll : null
}

/** A double (11, 22 ... 99) is a critical; it changes nothing else. */
export const isLubecCritical = (roll: LubecCheckRoll): boolean => roll.result % 11 === 0

const KIND_NAMES: Readonly<Record<LubecCheckKind, string>> = { 'stat-check': 'check', save: 'save' }

const ADVANTAGE_NAMES: Readonly<Record<LubecAdvantage, string>> =
  { advantage: 'Advantage', normal: 'Normal', disadvantage: 'Disadvantage' }

export const lubecAdvantageName = (mode: LubecAdvantage): string => ADVANTAGE_NAMES[mode]

/** "Strength check with Boatwork". */
export const describeLubecCheckRoll = (roll: LubecCheckRoll): string =>
  `${roll.against} ${KIND_NAMES[roll.kind]}${roll.skill === null ? '' : ` with ${roll.skill}`}`

/** "Rolled 23 vs 39", or "Advantage: 23 and 71, kept 23 vs 39". */
export function describeLubecCheckDice(roll: LubecCheckRoll): string {
  const dice = roll.dice.length > 1
    ? `${lubecAdvantageName(roll.advantage)}: ${roll.dice.join(' and ')}, kept ${roll.result}`
    : `Rolled ${roll.result}`
  return `${dice} vs ${roll.target}`
}

/** "Success", "Critical failure, +1 Stress". */
export function describeLubecCheckOutcome(roll: LubecCheckRoll): string {
  const outcome = isLubecCritical(roll) ? `Critical ${roll.outcome}` : roll.outcome
  const stress = roll.stressAdded > 0 ? `, +${roll.stressAdded} Stress` : ''
  return `${outcome.charAt(0).toUpperCase()}${outcome.slice(1)}${stress}`
}
