import { VTM_ABILITIES, VTM_ATTRIBUTES, VTM_VIRTUES, vtmBloodPoolMax, vtmTraitMax } from './vtmRuleset'
import type { VtmAbilityCategory, VtmAttributeCategory } from './vtmRuleset'
import type { VtmCharacterSheet, VtmCreationPriority, VtmDotMap, VtmFreebieDots, VtmRatedRow } from './vtmTypes'

export const VTM_DOT_CAP = 5

// Effective dot ceiling for scaling Traits (Attributes, Abilities, Disciplines).
// At creation it is impossible to exceed 5 (rulebook p.139); in play a Trait may
// rise up to the character's generation Trait Max Rating.
export const dotMaxForPhase = (generation: string | null | undefined, isActive: boolean): number =>
  isActive ? vtmTraitMax(generation) : VTM_DOT_CAP
export const VTM_FREEBIE_TOTAL = 15

export const ATTRIBUTE_POOL_BY_PRIORITY: Record<VtmCreationPriority, number> = {
  primary: 7,
  secondary: 5,
  tertiary: 3,
}

export const ABILITY_POOL_BY_PRIORITY: Record<VtmCreationPriority, number> = {
  primary: 13,
  secondary: 9,
  tertiary: 5,
}

export const ADVANTAGE_POOLS = {
  disciplines: 3,
  backgrounds: 5,
  virtues: 7,
} as const

export const FREEBIE_COSTS = {
  attribute: 5,
  ability: 2,
  discipline: 7,
  background: 1,
  virtue: 2,
  humanity: 1,
  willpower: 2,
} as const

// Freebie cost per dot, keyed by the pool a freebie dot lands in. This is the
// single source of truth that links freebie-funded dots to freebiePointsSpent.
export const FREEBIE_DOT_COST: Record<keyof VtmFreebieDots, number> = {
  physical: FREEBIE_COSTS.attribute,
  social: FREEBIE_COSTS.attribute,
  mental: FREEBIE_COSTS.attribute,
  talents: FREEBIE_COSTS.ability,
  skills: FREEBIE_COSTS.ability,
  knowledges: FREEBIE_COSTS.ability,
  disciplines: FREEBIE_COSTS.discipline,
  backgrounds: FREEBIE_COSTS.background,
  virtues: FREEBIE_COSTS.virtue,
  willpower: FREEBIE_COSTS.willpower,
  humanity: FREEBIE_COSTS.humanity,
}

export const emptyFreebieDots = (): VtmFreebieDots => ({
  physical: 0,
  social: 0,
  mental: 0,
  talents: 0,
  skills: 0,
  knowledges: 0,
  disciplines: 0,
  backgrounds: 0,
  virtues: 0,
  willpower: 0,
  humanity: 0,
})

const freebieDotsOf = (sheet: { freebieDots?: VtmFreebieDots | null }): VtmFreebieDots =>
  sheet.freebieDots ?? emptyFreebieDots()

export const freebiePointsFromDots = (dots: VtmFreebieDots): number =>
  (Object.keys(FREEBIE_DOT_COST) as (keyof VtmFreebieDots)[]).reduce(
    (sum, key) => sum + Math.max(0, Math.floor(dots[key] ?? 0)) * FREEBIE_DOT_COST[key],
    0,
  )

export type PoolStatus = {
  allocated: number
  budget: number
  remaining: number
  over: boolean
}

const clampRating = (value: number): number => Math.max(0, Math.min(VTM_DOT_CAP, Math.floor(value)))

const sumDots = (values: VtmDotMap): number =>
  Object.values(values).reduce((sum, value) => sum + clampRating(value), 0)

const sumRows = (rows: VtmRatedRow[]): number =>
  rows.reduce((sum, row) => sum + clampRating(row.rating), 0)

export const deriveHumanity = (virtues: VtmDotMap): number =>
  clampRating(virtues.Conscience ?? 0) + clampRating(virtues['Self-Control'] ?? 0)

export const deriveWillpower = (virtues: VtmDotMap): number =>
  clampRating(virtues.Courage ?? 0)

export const deriveBloodPoolMax = (generation: string): number | null =>
  vtmBloodPoolMax(generation)

export const attributePoolStatus = (
  sheet: Pick<VtmCharacterSheet, 'attributes' | 'attributePriority' | 'freebieDots'>,
  category: VtmAttributeCategory,
): PoolStatus => {
  const budget = ATTRIBUTE_POOL_BY_PRIORITY[sheet.attributePriority[category]]
  const rawAllocated = VTM_ATTRIBUTES[category].reduce(
    (sum, name) => sum + Math.max(0, clampRating(sheet.attributes[category][name] ?? 1) - 1),
    0,
  )
  const allocated = Math.max(0, rawAllocated - (freebieDotsOf(sheet)[category] ?? 0))
  return { allocated, budget, remaining: budget - allocated, over: allocated > budget }
}

export const abilityPoolStatus = (
  sheet: Pick<VtmCharacterSheet, 'abilities' | 'abilityPriority' | 'freebieDots'>,
  category: VtmAbilityCategory,
): PoolStatus => {
  const budget = ABILITY_POOL_BY_PRIORITY[sheet.abilityPriority[category]]
  const allocated = Math.max(0, sumDots(sheet.abilities[category]) - (freebieDotsOf(sheet)[category] ?? 0))
  return { allocated, budget, remaining: budget - allocated, over: allocated > budget }
}

export const flatPoolStatus = (allocated: number, budget: number): PoolStatus => ({
  allocated,
  budget,
  remaining: budget - allocated,
  over: allocated > budget,
})

export const disciplinePoolStatus = (sheet: Pick<VtmCharacterSheet, 'disciplines' | 'freebieDots'>): PoolStatus =>
  flatPoolStatus(Math.max(0, sumRows(sheet.disciplines) - (freebieDotsOf(sheet).disciplines ?? 0)), ADVANTAGE_POOLS.disciplines)

export const backgroundPoolStatus = (sheet: Pick<VtmCharacterSheet, 'backgrounds' | 'freebieDots'>): PoolStatus =>
  flatPoolStatus(Math.max(0, sumRows(sheet.backgrounds) - (freebieDotsOf(sheet).backgrounds ?? 0)), ADVANTAGE_POOLS.backgrounds)

export const virtuePoolStatus = (sheet: Pick<VtmCharacterSheet, 'virtues' | 'freebieDots'>): PoolStatus => {
  const rawAllocated = VTM_VIRTUES.reduce(
    (sum, name) => sum + Math.max(0, clampRating(sheet.virtues[name] ?? 1) - 1),
    0,
  )
  const allocated = Math.max(0, rawAllocated - (freebieDotsOf(sheet).virtues ?? 0))
  return flatPoolStatus(allocated, ADVANTAGE_POOLS.virtues)
}

export const freebieStatus = (sheet: Pick<VtmCharacterSheet, 'freebiePointsSpent'>): PoolStatus =>
  flatPoolStatus(Math.max(0, Math.floor(sheet.freebiePointsSpent)), VTM_FREEBIE_TOTAL)

export const hasValidDotCaps = (ratings: number[]): boolean =>
  ratings.every((rating) => Number.isFinite(rating) && rating >= 0 && rating <= VTM_DOT_CAP)

export const sheetCreationErrors = (sheet: VtmCharacterSheet): string[] => {
  const statuses: PoolStatus[] = [
    ...Object.keys(VTM_ATTRIBUTES).map((category) => attributePoolStatus(sheet, category as VtmAttributeCategory)),
    ...Object.keys(VTM_ABILITIES).map((category) => abilityPoolStatus(sheet, category as VtmAbilityCategory)),
    disciplinePoolStatus(sheet),
    backgroundPoolStatus(sheet),
    virtuePoolStatus(sheet),
    freebieStatus(sheet),
  ]
  return statuses
    .filter((status) => status.over)
    .map((status) => `Overspent by ${Math.abs(status.remaining)} dot${Math.abs(status.remaining) === 1 ? '' : 's'}.`)
}
