// Compile-time checks on the registry's shape, enforced by `npm run typecheck`.
// Nothing imports this file. Each `@ts-expect-error` fails the typecheck if
// the line below it ever stops being an error.
import { ruleSets, type RuleSetRegistry } from './registry'

// @ts-expect-error a registry without an entry for every rule set
export const missingEntry: RuleSetRegistry = { ose: ruleSets.ose }

export const missingDeclaration: RuleSetRegistry = {
  ...ruleSets,
  // @ts-expect-error an entry without its tabs
  vtm: { id: 'vtm', label: ruleSets.vtm.label, shortLabel: ruleSets.vtm.shortLabel },
}

export const entryUnderAnotherId: RuleSetRegistry = {
  ...ruleSets,
  // @ts-expect-error OSE's entry filed under VtM's id
  vtm: ruleSets.ose,
}
