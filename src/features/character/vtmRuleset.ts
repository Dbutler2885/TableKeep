export type VtmClanId =
  | 'brujah'
  | 'gangrel'
  | 'malkavian'
  | 'nosferatu'
  | 'toreador'
  | 'tremere'
  | 'ventrue'
  | 'caitiff'

export type VtmAttributeCategory = 'physical' | 'social' | 'mental'
export type VtmAbilityCategory = 'talents' | 'skills' | 'knowledges'

export type VtmClan = {
  id: VtmClanId
  name: string
  disciplines: string[]
  weakness: string
}

export type VtmGeneration = {
  label: string
  value: string
  bloodPoolMax: number | null
  bloodPerTurn: number | null
  // Highest rating a Trait may reach for this generation (rulebook p.139
  // "Generations Chart", Trait Max Rating column). Applies in play; creation
  // is always capped at 5.
  traitMax: number
}

export const VTM_DISCIPLINES = [
  'Animalism',
  'Auspex',
  'Celerity',
  'Dominate',
  'Fortitude',
  'Obfuscate',
  'Potence',
  'Presence',
  'Protean',
  'Thaumaturgy',
] as const

export const VTM_CLANS: VtmClan[] = [
  {
    id: 'brujah',
    name: 'Brujah',
    disciplines: ['Celerity', 'Potence', 'Presence'],
    weakness: 'Frenzy far more readily; frenzy roll difficulty always +2 (and become hostile/frenzy if accused of it).',
  },
  {
    id: 'gangrel',
    name: 'Gangrel',
    disciplines: ['Animalism', 'Fortitude', 'Protean'],
    weakness: 'Gain an animal feature each frenzy; for every 5 animal features, lower one Social Attribute by 1.',
  },
  {
    id: 'malkavian',
    name: 'Malkavian',
    disciplines: ['Auspex', 'Dominate', 'Obfuscate'],
    weakness: 'Begin with and permanently keep a Derangement (no amount of Willpower removes it).',
  },
  {
    id: 'nosferatu',
    name: 'Nosferatu',
    disciplines: ['Animalism', 'Obfuscate', 'Potence'],
    weakness: 'Appearance 0 (cross off the attribute); auto-fail any action involving Appearance.',
  },
  {
    id: 'toreador',
    name: 'Toreador',
    disciplines: ['Auspex', 'Celerity', 'Presence'],
    weakness: 'Become entranced by beauty; a successful Willpower roll is needed to break the fascination.',
  },
  {
    id: 'tremere',
    name: 'Tremere',
    disciplines: ['Auspex', 'Dominate', 'Thaumaturgy'],
    weakness: 'Drank the blood of the seven clan elders at creation - one step toward being Blood Bound to the clan.',
  },
  {
    id: 'ventrue',
    name: 'Ventrue',
    disciplines: ['Dominate', 'Fortitude', 'Presence'],
    weakness: 'Can only feed on one restricted type of blood (player picks the restriction).',
  },
  {
    id: 'caitiff',
    name: 'Caitiff',
    disciplines: [],
    weakness: 'No clan weakness.',
  },
]

export const VTM_ATTRIBUTES: Record<VtmAttributeCategory, string[]> = {
  physical: ['Strength', 'Dexterity', 'Stamina'],
  social: ['Charisma', 'Manipulation', 'Appearance'],
  mental: ['Perception', 'Intelligence', 'Wits'],
}

export const VTM_ABILITIES: Record<VtmAbilityCategory, string[]> = {
  talents: ['Acting', 'Alertness', 'Athletics', 'Brawl', 'Dodge', 'Empathy', 'Intimidation', 'Leadership', 'Streetwise', 'Subterfuge'],
  skills: ['Animal Ken', 'Drive', 'Etiquette', 'Firearms', 'Melee', 'Music', 'Repair', 'Security', 'Stealth', 'Survival'],
  knowledges: ['Bureaucracy', 'Computer', 'Finance', 'Investigation', 'Law', 'Linguistics', 'Medicine', 'Occult', 'Politics', 'Science'],
}

export const VTM_BACKGROUNDS = [
  'Allies',
  'Contacts',
  'Fame',
  'Generation',
  'Herd',
  'Influence',
  'Mentor',
  'Resources',
  'Retainers',
  'Status',
] as const

export const VTM_VIRTUES = ['Conscience', 'Self-Control', 'Courage'] as const

export const VTM_GENERATIONS: VtmGeneration[] = [
  { label: '13th (and higher #)', value: '13th', bloodPoolMax: 10, bloodPerTurn: 1, traitMax: 5 },
  { label: '12th', value: '12th', bloodPoolMax: 11, bloodPerTurn: 1, traitMax: 5 },
  { label: '11th', value: '11th', bloodPoolMax: 12, bloodPerTurn: 1, traitMax: 5 },
  { label: '10th', value: '10th', bloodPoolMax: 13, bloodPerTurn: 1, traitMax: 5 },
  { label: '9th', value: '9th', bloodPoolMax: 14, bloodPerTurn: 2, traitMax: 5 },
  { label: '8th', value: '8th', bloodPoolMax: 15, bloodPerTurn: 3, traitMax: 5 },
  { label: '7th', value: '7th', bloodPoolMax: 20, bloodPerTurn: 5, traitMax: 6 },
  { label: '6th', value: '6th', bloodPoolMax: 30, bloodPerTurn: 6, traitMax: 7 },
  { label: '5th', value: '5th', bloodPoolMax: 40, bloodPerTurn: 8, traitMax: 8 },
  { label: '4th', value: '4th', bloodPoolMax: 50, bloodPerTurn: 10, traitMax: 9 },
  { label: '3rd', value: '3rd', bloodPoolMax: null, bloodPerTurn: null, traitMax: 10 },
]

export const vtmClanById = (clanId: string | null | undefined): VtmClan | null =>
  VTM_CLANS.find((clan) => clan.id === clanId) ?? null

export const vtmClanDisciplines = (clanId: string | null | undefined): string[] =>
  vtmClanById(clanId)?.disciplines ?? []

export const vtmDisciplinePickerOptions = (): string[] => [...VTM_DISCIPLINES]

export const vtmSuggestedDisciplines = (clanId: string | null | undefined): string[] => {
  const clanDisciplines = vtmClanDisciplines(clanId)
  return clanDisciplines.length > 0 ? clanDisciplines : vtmDisciplinePickerOptions()
}

export const vtmClanWeakness = (clanId: string | null | undefined): string =>
  vtmClanById(clanId)?.weakness ?? ''

export const vtmGenerationByValue = (generation: string | null | undefined): VtmGeneration | null =>
  VTM_GENERATIONS.find((entry) => entry.value === generation) ?? null

export const vtmBloodPoolMax = (generation: string | null | undefined): number | null =>
  vtmGenerationByValue(generation)?.bloodPoolMax ?? null

// Highest rating a Trait (Attribute, Ability, Discipline) may reach for this
// generation. Defaults to 5 for an unknown/blank generation.
export const vtmTraitMax = (generation: string | null | undefined): number =>
  vtmGenerationByValue(generation)?.traitMax ?? 5

export const isVtmInClanDiscipline = (clanId: string | null | undefined, discipline: string): boolean => {
  const clan = vtmClanById(clanId)
  if (!clan || clan.id === 'caitiff') return false
  return clan.disciplines.includes(discipline)
}

export const vtmDisciplineClanCostNote = (clanId: string | null | undefined, discipline: string): string => {
  const clan = vtmClanById(clanId)
  if (!clan) return discipline
  if (clan.id === 'caitiff') return `${discipline} (Caitiff cost)`
  return `${discipline} (${clan.disciplines.includes(discipline) ? `${clan.name} clan` : 'out of clan'})`
}

export const vtmDisciplineContextSummary = (clanId: string | null | undefined): string => {
  const clan = vtmClanById(clanId)
  if (!clan) return 'Choose a clan to see which Disciplines use clan XP costs.'
  if (clan.id === 'caitiff') return 'Caitiff have no clan Disciplines; learned Disciplines use the Caitiff XP cost.'
  return `${clan.name} clan Disciplines: ${clan.disciplines.join(', ')}. Other Disciplines use out-of-clan XP costs.`
}
