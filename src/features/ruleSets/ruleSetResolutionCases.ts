import type { RuleSetId } from './registry'

// What a campaign's stored `system` resolves to. The registry, the migration
// script's table and the Cloud Functions' table each resolve it with their own
// copy, and every copy runs over these cases, so they cannot drift: a
// registered id gives itself, and anything else, including a missing or empty
// value, gives OSE.
export const ruleSetResolutionCases: ReadonlyArray<readonly [system: unknown, ruleSet: RuleSetId]> = [
  ['ose', 'ose'],
  ['vtm', 'vtm'],
  ['lubec', 'lubec'],
  [undefined, 'ose'],
  [null, 'ose'],
  ['', 'ose'],
  ['pathfinder', 'ose'],
  ['OSE', 'ose'],
  ['LUBEC', 'ose'],
  ['toString', 'ose'],
  [7, 'ose'],
]
