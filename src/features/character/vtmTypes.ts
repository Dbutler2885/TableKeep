import type { TokenIconConfig } from '../../types/app'
import type { VtmAbilityCategory, VtmAttributeCategory, VtmClanId } from './vtmRuleset'

export type VtmDotMap = Record<string, number>

export type VtmRatedRow = {
  id: string
  name: string
  rating: number
}

export type VtmRitualRow = {
  id: string
  name: string
  level: string
  notes: string
}

export type VtmBondRow = {
  id: string
  boundTo: string
  rating: number
  notes: string
}

export type VtmHavenRow = {
  id: string
  location: string
  description: string
}

export type VtmCombatWeaponRow = {
  id: string
  weapon: string
  damage: string
  range: string
  rate: string
  clip: string
  conceal: string
}

export type VtmArmorRow = {
  id: string
  armor: string
  rating: string
  penalty: string
  notes: string
}

export type VtmXpLedgerEntry = {
  id: string
  type: 'award' | 'spend'
  amount: number
  note: string
  createdAtMs: number
}

export type VtmCreationPriority = 'primary' | 'secondary' | 'tertiary'

// Dots funded by freebie points during creation, tracked per pool so the
// creation pool validators can tell freebie-funded dots from base-pool dots.
export type VtmFreebieDots = {
  physical: number
  social: number
  mental: number
  talents: number
  skills: number
  knowledges: number
  disciplines: number
  backgrounds: number
  virtues: number
  willpower: number
  humanity: number
}

export type VtmCharacterSheet = {
  chronicle: string
  concept: string
  sire: string
  nature: string
  demeanor: string
  clan: VtmClanId | ''
  generation: string
  weakness: string
  attributes: Record<VtmAttributeCategory, VtmDotMap>
  abilities: Record<VtmAbilityCategory, VtmDotMap>
  attributePriority: Record<VtmAttributeCategory, VtmCreationPriority>
  abilityPriority: Record<VtmAbilityCategory, VtmCreationPriority>
  disciplines: VtmRatedRow[]
  backgrounds: VtmRatedRow[]
  virtues: VtmDotMap
  humanity: number
  willpowerPermanent: number
  willpowerTemporary: number
  bloodPoolCurrent: number
  health: Record<string, boolean>
  otherTraits: VtmRatedRow[]
  rituals: VtmRitualRow[]
  derangements: string
  bloodBonds: VtmBondRow[]
  expandedBackground: Record<string, string>
  possessions: Record<string, string>
  havens: VtmHavenRow[]
  history: string
  appearance: Record<string, string>
  combatWeapons: VtmCombatWeaponRow[]
  armor: VtmArmorRow[]
  xpLedger: VtmXpLedgerEntry[]
  freebiePointsSpent: number
  freebieDots: VtmFreebieDots
}

export type VtmCharacterRecord = {
  id: string
  system: 'vtm'
  name: string
  ownerUserId: string
  ownerUsername?: string | null
  creationMode: 'new' | 'established'
  creationModeExplicit: boolean
  creationStatus: 'draft' | 'established_draft' | 'active'
  xp: number
  portraitPath?: string
  portraitUrl: string | null
  portraitFocusX: number
  portraitFocusY: number
  tokenIcon: TokenIconConfig
  vtm: VtmCharacterSheet
}
