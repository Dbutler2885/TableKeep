import type { TokenIconConfig } from '../../types/app'
import { makeId } from './characterFactories'
import { emptyFreebieDots } from './vtmCreation'
import { VTM_ABILITIES, VTM_ATTRIBUTES, VTM_VIRTUES } from './vtmRuleset'
import type { VtmCharacterRecord, VtmCharacterSheet, VtmDotMap } from './vtmTypes'

export const defaultVtmTokenIcon: TokenIconConfig = {
  icon: 'pawn',
  color: '#7a1a1f',
  size: 34,
}

const dotMap = (names: readonly string[], value: number): VtmDotMap =>
  Object.fromEntries(names.map((name) => [name, value]))

export const defaultVtmSheet = (): VtmCharacterSheet => ({
  chronicle: '',
  concept: '',
  sire: '',
  nature: '',
  demeanor: '',
  clan: '',
  generation: '13th',
  weakness: '',
  attributes: {
    physical: dotMap(VTM_ATTRIBUTES.physical, 1),
    social: dotMap(VTM_ATTRIBUTES.social, 1),
    mental: dotMap(VTM_ATTRIBUTES.mental, 1),
  },
  abilities: {
    talents: dotMap(VTM_ABILITIES.talents, 0),
    skills: dotMap(VTM_ABILITIES.skills, 0),
    knowledges: dotMap(VTM_ABILITIES.knowledges, 0),
  },
  attributePriority: {
    physical: 'primary',
    social: 'secondary',
    mental: 'tertiary',
  },
  abilityPriority: {
    talents: 'primary',
    skills: 'secondary',
    knowledges: 'tertiary',
  },
  disciplines: [],
  backgrounds: [],
  virtues: dotMap(VTM_VIRTUES, 1),
  humanity: 2,
  willpowerPermanent: 1,
  willpowerTemporary: 1,
  bloodPoolCurrent: 0,
  health: {
    Bruised: false,
    Hurt: false,
    Injured: false,
    Wounded: false,
    Mauled: false,
    Crippled: false,
    Incapacitated: false,
  },
  otherTraits: [],
  rituals: [],
  derangements: '',
  bloodBonds: [],
  expandedBackground: {
    Allies: '',
    Mentor: '',
    Contacts: '',
    Resources: '',
    Fame: '',
    Retainers: '',
    Herd: '',
    Status: '',
    Influence: '',
    Other: '',
  },
  possessions: {
    Gear: '',
    Equipment: '',
    'Feeding Grounds': '',
    Vehicles: '',
  },
  havens: [],
  history: '',
  appearance: {
    Age: '',
    'Apparent Age': '',
    DoB: '',
    RIP: '',
    Hair: '',
    Eyes: '',
    Race: '',
    Nationality: '',
    Height: '',
    Weight: '',
    Sex: '',
  },
  combatWeapons: [],
  armor: [],
  xpLedger: [],
  freebiePointsSpent: 0,
  freebieDots: emptyFreebieDots(),
})

export const makeVtmCharacter = (
  ownerUserId: string,
  ownerUsername: string,
  creationMode: 'new' | 'established' = 'new',
): VtmCharacterRecord => ({
  id: makeId(),
  system: 'vtm',
  name: 'New Vampire',
  ownerUserId,
  ownerUsername,
  creationMode,
  creationModeExplicit: true,
  creationStatus: creationMode === 'new' ? 'draft' : 'established_draft',
  xp: 0,
  portraitPath: '',
  portraitUrl: null,
  portraitFocusX: 50,
  portraitFocusY: 50,
  tokenIcon: defaultVtmTokenIcon,
  vtm: defaultVtmSheet(),
})
