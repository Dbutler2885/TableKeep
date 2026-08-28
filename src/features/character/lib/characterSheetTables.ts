import { OSE_CONSUMABLE_CATALOG } from '../consumableCatalog'
import { OSE_GENERAL_CATALOG } from '../generalCatalog'
import type { ThiefSkillCode } from './characterTabTypes'

export const abilityRows = [
  { code: 'STR', note: 'Melee atk./dmg., open doors' },
  { code: 'INT', note: 'Languages, literacy' },
  { code: 'WIS', note: 'Saves vs magic' },
  { code: 'DEX', note: 'Missile atk., AC, initiative' },
  { code: 'CON', note: 'Hit points' },
  { code: 'CHA', note: 'Reactions, retainers, loyalty' },
]

export const saveRows = [
  { code: 'D', note: 'Death, poison' }, { code: 'W', note: 'Magic wands' },
  { code: 'P', note: 'Paralysis, petrification' }, { code: 'B', note: 'Breath attacks' },
  { code: 'S', note: 'Spells, rods, staves' }, { code: '±', note: 'WIS mod to saves vs magic' },
]

export const adventureRows = [
  { code: 'FG', note: 'Forage in the wild' }, { code: 'FT', note: 'Find room trap' },
  { code: 'HT', note: 'Hunt in the wild' }, { code: 'LD', note: 'Listen at door' },
  { code: 'OD', note: 'Open stuck door' }, { code: 'SD', note: 'Find secret door' },
]

export const thiefSkillRows: { code: ThiefSkillCode; note: string }[] = [
  { code: 'CS', note: 'Climb sheer surfaces' }, { code: 'TR', note: 'Find/remove treasure traps' },
  { code: 'HN', note: 'Hear noise' }, { code: 'HS', note: 'Hide in shadows' },
  { code: 'MS', note: 'Move silently' }, { code: 'OL', note: 'Open locks' },
  { code: 'PP', note: 'Pick pockets' }, { code: 'RL', note: 'Read languages' },
]

export const playerAddGearTemplates = [
  ...OSE_GENERAL_CATALOG.map((entry) => ({ ...entry, itemKind: 'general' as const })),
  ...OSE_CONSUMABLE_CATALOG.map((entry) => ({ ...entry, itemKind: 'consumable' as const })),
]
