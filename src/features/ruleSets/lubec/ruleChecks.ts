import { lubecClass, type LubecClass, type LubecPackageShape } from './classes'
import { isWholeNumber } from './derivations'
import { lubecRollUpRange } from './rollUp'
import { LUBEC_VALUE_NAMES, type LubecSheet } from './sheet'
import { lubecSkill, type LubecSkill } from './skills'

// The rule checks a character in creation is held to. None of them blocks
// anything: each break is a warning the Finalize dialog lists and the table can keep.

export type LubecRuleWarningCode =
  | 'class'
  | 'class-choice'
  | 'base-value'
  | 'base-range'
  | 'free-skill'
  | 'unknown-skill'
  | 'repeated-skill'
  | 'package'
  | 'prerequisite'

export type LubecRuleWarning = { code: LubecRuleWarningCode; message: string }

const warning = (code: LubecRuleWarningCode, message: string): LubecRuleWarning => ({ code, message })

/** Names joined as "A, B or C". */
export const anyOf = (names: readonly string[]): string =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`

function classWarnings(sheet: LubecSheet, definition: LubecClass | null): LubecRuleWarning[] {
  const key = sheet.class.key
  if (key === null) return [warning('class', 'No class is chosen.')]
  if (definition === null) return [warning('class', `"${key}" is not a Lubec class.`)]
  const choice = definition.choice
  if (choice === null || choice.options.some((option) => option === sheet.class.choices[choice.field])) return []
  return [warning('class-choice', `The ${definition.name} needs a ${choice.label}: ${anyOf(choice.options)}.`)]
}

function baseWarnings(sheet: LubecSheet): LubecRuleWarning[] {
  return LUBEC_VALUE_NAMES.flatMap((name) => {
    const value = sheet.base[name]
    if (!isWholeNumber(value)) return [warning('base-value', `${name} has no whole-number base value.`)]
    const { min, max } = lubecRollUpRange(name)
    if (value >= min && value <= max) return []
    return [warning('base-range', `${name} base ${value} is outside what guided roll-up can produce (${min} to ${max}).`)]
  })
}

const takenSkillNames = (sheet: LubecSheet): string[] =>
  [sheet.skills.free, ...sheet.skills.picked].filter((name): name is string => name !== null)

function nameWarnings(names: readonly string[]): LubecRuleWarning[] {
  const unique = [...new Set(names)]
  const unknown = unique.filter((name) => lubecSkill(name) === null)
    .map((name) => warning('unknown-skill', `"${name}" is not a Lubec skill.`))
  const repeated = unique.filter((name) => names.indexOf(name) !== names.lastIndexOf(name))
    .map((name) => warning('repeated-skill', `${name} is taken more than once.`))
  return [...unknown, ...repeated]
}

const knownSkills = (names: readonly string[]): LubecSkill[] =>
  [...new Set(names)].map(lubecSkill).filter((skill): skill is LubecSkill => skill !== null)

function prerequisiteWarnings(names: readonly string[]): LubecRuleWarning[] {
  return knownSkills(names)
    .filter((skill) => skill.tier === 'Expert' && !skill.prerequisites.some((name) => names.includes(name)))
    .map((skill) => warning('prerequisite', `${skill.name} needs ${anyOf(skill.prerequisites)}.`))
}

function freeSkillWarnings(sheet: LubecSheet, definition: LubecClass): LubecRuleWarning[] {
  const free = sheet.skills.free
  if (free === null) return [warning('free-skill', 'No free class skill is chosen.')]
  if (definition.skillPackage.free.includes(free)) return []
  return [warning('free-skill', `${free} is not on the ${definition.name} free list (${anyOf(definition.skillPackage.free)}).`)]
}

const shapeLabel = (shape: LubecPackageShape): string =>
  [shape.trained && `${shape.trained} Trained`, shape.expert && `${shape.expert} Expert`].filter(Boolean).join(' and ')

// The package is what a class picks at least: picks beyond it are the player's
// own and never warned about, so only falling short of every shape is.
function packageWarnings(sheet: LubecSheet, definition: LubecClass): LubecRuleWarning[] {
  const picks = knownSkills(sheet.skills.picked.filter((name) => name !== sheet.skills.free))
  const expert = picks.filter((skill) => skill.tier === 'Expert').length
  const shapes = definition.skillPackage.shapes
  if (shapes.some((shape) => expert >= shape.expert && picks.length - expert >= shape.trained)) return []
  return [warning('package', `The ${definition.name} picks ${shapes.map(shapeLabel).join(' or ')} beside the free class skill.`)]
}

function classSkillWarnings(sheet: LubecSheet, definition: LubecClass | null): LubecRuleWarning[] {
  return definition === null ? [] : [...freeSkillWarnings(sheet, definition), ...packageWarnings(sheet, definition)]
}

/** Every rule warning for a character, worked out from its record each time. */
export function lubecRuleWarnings(sheet: LubecSheet): LubecRuleWarning[] {
  const definition = lubecClass(sheet.class.key)
  const names = takenSkillNames(sheet)
  return [
    ...classWarnings(sheet, definition),
    ...baseWarnings(sheet),
    ...classSkillWarnings(sheet, definition),
    ...nameWarnings(names),
    ...prerequisiteWarnings(names),
  ]
}
