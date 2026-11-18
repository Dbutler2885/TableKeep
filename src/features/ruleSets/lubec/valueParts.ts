import type { LubecCharacterSheet } from './characterRecord'
import { lubecCheckTarget, lubecRollSkills, type LubecCheckRoll } from './checkRoll'
import type { LubecLastRoll } from './lastRoll'
import { lubecClass } from './classes'
import { lubecCurrentValue, lubecFinalValue, lubecFloorHolds } from './derivations'
import { lubecFactorWords, lubecStepFractions, lubecStepSetTo, type LubecEffect } from './effects'
import { isLubecGearLossOff, lubecGearModifiers, lubecSheetModifiers } from './modifiers'
import { lubecTaskModifiers, type LubecRollAction } from './rollModes'
import type { LubecValueName } from './sheet'

// How a value a roll is made under is reached, each change named by where it
// comes from: the base, the class, every active card, gear's Speed losses and
// the floor. The roller shows these beside the dice so a player sees why the
// number is what it is, not just the number.

/** One line of a target: what changed it and by how much ("Forearm injury", "-20"). */
export type LubecTargetPart = { label: string; value: string }

const signed = (amount: number): string => (amount < 0 ? `${amount}` : `+${amount}`)

/** A wound's card by its wound and part ("Deep gash (Forearm)"); a hand-made effect by its name. */
const effectLabel = (effect: LubecEffect): string =>
  (typeof effect.part === 'string' && effect.part && effect.part !== effect.name ? `${effect.name} (${effect.part})` : effect.name)

/** Everything one card's current step does to the value: fractions first, then flat amounts and narrow-action amounts, then "drops to". */
function effectParts(effect: LubecEffect, name: LubecValueName, actions: readonly LubecRollAction[]): LubecTargetPart[] {
  const step = effect.steps[0]
  if (!step) return []
  const label = effectLabel(effect)
  const flat = [...step.modifiers, ...lubecTaskModifiers([effect], { actions })].filter((modifier) => modifier.target === name && modifier.amount !== 0)
  return [
    ...lubecStepFractions(step).filter((fraction) => fraction.target === name).map((fraction) => ({ label, value: lubecFactorWords(fraction.factor) })),
    ...flat.map((modifier) => ({ label, value: signed(modifier.amount) })),
    ...lubecStepSetTo(step).filter((setTo) => setTo.target === name).map((setTo) => ({ label, value: `drops to ${setTo.value}` })),
  ]
}

const gearParts = (sheet: LubecCharacterSheet, name: LubecValueName): LubecTargetPart[] =>
  lubecGearModifiers(sheet.gear)
    .filter((loss) => loss.target === name && !isLubecGearLossOff(sheet.gear, loss))
    .map((loss) => ({ label: loss.reason, value: signed(loss.amount) }))

function classParts(sheet: LubecCharacterSheet, base: number, final: number): LubecTargetPart[] {
  const definition = lubecClass(sheet.class.key)
  return final === base || !definition ? [] : [{ label: definition.name, value: signed(final - base) }]
}

function floorParts(sheet: LubecCharacterSheet, name: LubecValueName, actions: readonly LubecRollAction[]): LubecTargetPart[] {
  const modifiers = [...lubecSheetModifiers(sheet), ...lubecTaskModifiers(sheet.effects, { actions })]
  return lubecFloorHolds(sheet, name, modifiers) ? [{ label: 'Floor', value: `no lower than ${lubecCurrentValue(sheet, name, modifiers)}` }] : []
}

/**
 * The value's parts in the order the wound terms apply them, or null for a hole. Pass the effects a roll reads
 * on the sheet (combat leaves out this fight's cards that are not effective yet), and the narrow action a Core roll names.
 */
export function lubecValueParts(sheet: LubecCharacterSheet, name: LubecValueName, actions: readonly LubecRollAction[] = []): LubecTargetPart[] | null {
  const base = sheet.base[name]
  const final = lubecFinalValue(sheet, name)
  if (base === null || final === null) return null
  return [
    { label: 'Base', value: String(base) },
    ...classParts(sheet, base, final),
    ...sheet.effects.flatMap((effect) => effectParts(effect, name, actions)),
    ...gearParts(sheet, name),
    ...floorParts(sheet, name, actions),
  ]
}

/** A skill added to the roll, as a part of its own. */
export const lubecSkillPart = (skill: string, bonus: number): LubecTargetPart => ({ label: skill, value: signed(bonus) })

/**
 * A Core Stat Check or Save's target as parts: the value's parts and any skill added. Null when the sheet has
 * changed since the roll so the parts no longer reach the target the roll was made under; the roll itself still shows.
 */
export function lubecCheckParts(sheet: LubecCharacterSheet, roll: LubecCheckRoll): LubecTargetPart[] | null {
  const actions = roll.actions ?? []
  const parts = lubecValueParts(sheet, roll.against, actions)
  const value = lubecCheckTarget(sheet, roll.against, null, actions)
  const bonus = skillBonus(sheet, roll.skill)
  if (!parts || value === null || value + bonus !== roll.target) return null
  return [...parts, ...skillParts(roll.skill, bonus)]
}

/** The armed skill's bonus as the sheet has it now; 0 without one. */
const skillBonus = (sheet: LubecCharacterSheet, skill: string | null): number =>
  lubecRollSkills(sheet).find((entry) => entry.name === skill)?.bonus ?? 0

const skillParts = (skill: string | null, bonus: number): LubecTargetPart[] => (skill && bonus ? [lubecSkillPart(skill, bonus)] : [])

/** The last roll's target as parts: a Stat Check or Save's; a Panic Check or Recovery Save shows its dice alone. */
export const lubecLastRollParts = (sheet: LubecCharacterSheet, roll: LubecLastRoll): LubecTargetPart[] | null =>
  (roll.kind === 'panic' || roll.kind === 'recovery' ? null : lubecCheckParts(sheet, roll))
