import type { LubecGmItem } from '../../../ruleSets/lubec/gear/gmItem'
import { combatantKey, combatSetupIssues } from '../engine/inputs'
import type { CombatantSelection, CombatSheet, FloorSelection } from '../engine/types'
import type { CombatFloorRow } from './combatFloorRows'

/** Adds a combatant to the local setup, or takes them out again; nothing is written until Start. */
export function toggleCombatant(selected: readonly CombatantSelection[], selection: CombatantSelection): CombatantSelection[] {
  const key = combatantKey(selection)
  const rest = selected.filter((entry) => combatantKey(entry) !== key)
  return rest.length === selected.length ? [...selected, selection] : rest
}

export const isSelected = (selected: readonly CombatantSelection[], selection: CombatantSelection): boolean =>
  selected.some((entry) => combatantKey(entry) === combatantKey(selection))

/** One missing-input line per selected combatant, with the sheet a repair link opens. */
export type CombatSetupIssue = { selection: CombatantSelection; name: string; text: string }

/** The selected combatants' missing required inputs, each worded as Start would refuse it, including Body Save. */
export function combatSetupProblems(selected: readonly CombatantSelection[], sheets: readonly CombatSheet[]): CombatSetupIssue[] {
  return selected.flatMap((selection) => {
    const name = sheets.find((sheet) => combatantKey(sheet) === combatantKey(selection))?.name ?? combatantKey(selection)
    return combatSetupIssues([selection], [...sheets], true).map((text) => ({ selection, name, text }))
  })
}

/** How many of an item the Floor may take: a dropped record's own quantity, or any number of library copies. */
export const floorPickLimit = (item: LubecGmItem): number => (item.status === 'dropped' ? item.qty : 99)

const clamp = (qty: number, item: LubecGmItem) => Math.min(qty, floorPickLimit(item))

/** Places one more of an item in the local setup. */
export function addFloorPick(picks: readonly FloorSelection[], item: LubecGmItem): FloorSelection[] {
  const existing = picks.find((pick) => pick.itemId === item.id)
  if (!existing) return [...picks, { itemId: item.id, status: item.status, qty: 1 }]
  return adjustFloorPick(picks, item, 1)
}

/** Changes a local pick's quantity within its limit; at 0 the pick is gone. */
export function adjustFloorPick(picks: readonly FloorSelection[], item: LubecGmItem, delta: number): FloorSelection[] {
  return picks
    .map((pick) => (pick.itemId === item.id ? { ...pick, qty: clamp(pick.qty + delta, item) } : pick))
    .filter((pick) => pick.qty > 0)
}

/** The local picks as Floor rows, each backed by its own GM item; a pick whose item has gone is left out. */
export function setupFloorRows(picks: readonly FloorSelection[], items: readonly LubecGmItem[]): (CombatFloorRow & { source: LubecGmItem })[] {
  return picks.flatMap((pick) => {
    const source = items.find((item) => item.id === pick.itemId)
    return source ? [{ key: pick.itemId, item: source, count: pick.qty, recordIds: [pick.itemId], source }] : []
  })
}

// A library copy takes at most the library stack's own quantity, so a larger count is sent as repeated copies.
const librarySelections = (pick: FloorSelection, stack: number): FloorSelection[] =>
  Array.from({ length: Math.ceil(pick.qty / stack) }, (_, index) => ({ ...pick, qty: Math.min(stack, pick.qty - index * stack) }))

/** The selections Start or a live placement sends: a dropped pick as it is, a library count as whole-stack copies. */
export function combatFloorSelections(picks: readonly FloorSelection[], items: readonly LubecGmItem[]): FloorSelection[] {
  return picks.flatMap((pick) => {
    const source = items.find((item) => item.id === pick.itemId)
    return source?.status === 'library' && pick.status === 'library' ? librarySelections(pick, Math.max(1, source.qty)) : [pick]
  })
}

/** A setup row's small line: who they are and their Speed once picked; otherwise that they are not fighting, in the mock-up's words. */
export function pickRowNote(on: boolean, title: string, speed: number | null): string {
  if (!on) return title ? `${title}, not fighting` : 'Not in this fight'
  return `${title ? `${title} · ` : ''}Speed ${speed ?? 'missing'}`
}
