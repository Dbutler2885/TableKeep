// Transcribed from the standalone Lubec sheet
// (combined-character-sheet-prototype.html); Table Keep owns this copy.
// Only names are stored on a character: tier and bonus are always read here.

export type LubecSkillTier = 'Trained' | 'Expert'

export type LubecSkill = {
  name: string
  tier: LubecSkillTier
  /** An Expert needs any one of these among the character's skills. */
  prerequisites: readonly string[]
}

export const LUBEC_TRAINED_SKILLS: readonly string[] = [
  'Local Lore', 'Campcraft', 'Hunting', 'Boatwork', 'Tides & Flats', 'Swimming', 'Jury-Rigging',
  'Electronics & Radio', 'Science', 'History & Geography', 'Art', 'Music', 'Religion', 'Home Ec',
  'First Aid', 'Bike Riding', 'Athletics', 'Light on Your Feet', 'Scrapping', 'Tough Talk',
  'Animal Friend', 'Fibbing', "Teacher's Pet", 'Woodworking & Metalwork', 'Scrounging',
  'Sleight of Hand', 'Class Clown',
]

export const LUBEC_EXPERT_PREREQUISITES: Readonly<Record<string, readonly string[]>> = {
  'Wilderness Survival': ['Campcraft'],
  'Foraging': ['Campcraft', 'Tides & Flats'],
  'Trapping': ['Campcraft', 'Hunting'],
  'Tracking': ['Hunting', 'Animal Friend'],
  'Firearms': ['Hunting'],
  'Slingshot / Archery': ['Campcraft', 'Hunting'],
  'Throwing Arm': ['Athletics'],
  'Spelunking': ['Athletics', 'Campcraft', 'Light on Your Feet'],
  'Diving': ['Swimming', 'Tides & Flats'],
  'Driving': ['Bike Riding', 'Boatwork'],
  'Daredevil': ['Athletics', 'Bike Riding', 'Light on Your Feet'],
  'Mechanical Repair': ['Jury-Rigging', 'Boatwork', 'Woodworking & Metalwork'],
  'Treasure Hunting': ['Local Lore', 'Electronics & Radio', 'Tides & Flats', 'Scrounging'],
  'Breaking & Entering': ['Light on Your Feet', 'Tough Talk', 'Sleight of Hand'],
  'Five-Finger Discount': ['Sleight of Hand', 'Fibbing'],
  'Forgery': ['Art', 'Fibbing'],
  'Old-Timers': ['Local Lore', "Teacher's Pet"],
  'Library Rat': ['History & Geography', 'Local Lore'],
  'Gadgets': ['Electronics & Radio', 'Jury-Rigging', 'Woodworking & Metalwork', 'Scrounging'],
  'A/V Club': ['Electronics & Radio'],
  'Pyrotechnics': ['Science', 'Jury-Rigging'],
  'Photography': ['Art', 'Science'],
  'Into Weird Shit': ['History & Geography', 'Religion'],
  'Field Medicine': ['First Aid'],
  'Boxing': ['Scrapping', 'Athletics'],
  'Politician': ["Teacher's Pet", 'Fibbing', 'Tough Talk', 'Class Clown'],
  'Science Fair Champ': ['Science', 'Electronics & Radio'],
}

export const LUBEC_SKILL_BONUS: Readonly<Record<LubecSkillTier, number>> = { Trained: 10, Expert: 15 }

/**
 * The skills the core roller will not arm: they count only in the combat
 * roller. Scrapping is the Trained fighting skill and Boxing the Expert one.
 * Hunting and Throwing Arm mix shooting or throwing with other uses and are
 * not marked until the captain decides.
 */
export const LUBEC_FIGHTING_OR_SHOOTING_SKILLS: ReadonlySet<string> = new Set([
  'Scrapping', 'Boxing', 'Firearms', 'Slingshot / Archery',
])

/** The Skills page's tree: one row per [Trained, Expert], placed so prerequisites sit near what they unlock. */
export const LUBEC_SKILL_TREE_ROWS: readonly (readonly [string | null, string | null])[] = [
  ['Campcraft', 'Wilderness Survival'],
  ['Tides & Flats', 'Foraging'],
  ['Swimming', 'Diving'],
  ['Hunting', 'Trapping'],
  [null, 'Slingshot / Archery'],
  [null, 'Firearms'],
  ['Animal Friend', 'Tracking'],
  ['Athletics', 'Throwing Arm'],
  ['Scrapping', 'Boxing'],
  ['Light on Your Feet', 'Spelunking'],
  ['Bike Riding', 'Daredevil'],
  ['Boatwork', 'Driving'],
  ['Woodworking & Metalwork', 'Mechanical Repair'],
  ['Jury-Rigging', 'Gadgets'],
  ['Scrounging', null],
  ['Electronics & Radio', 'A/V Club'],
  ['Science', 'Science Fair Champ'],
  [null, 'Pyrotechnics'],
  ['Art', 'Photography'],
  ['Fibbing', 'Forgery'],
  ['Sleight of Hand', 'Five-Finger Discount'],
  [null, 'Breaking & Entering'],
  ['Tough Talk', 'Politician'],
  ['Class Clown', null],
  ["Teacher's Pet", 'Old-Timers'],
  ['Local Lore', 'Treasure Hunting'],
  ['History & Geography', 'Library Rat'],
  ['Religion', 'Into Weird Shit'],
  ['First Aid', 'Field Medicine'],
  ['Music', null],
  ['Home Ec', null],
]

const SKILLS: ReadonlyMap<string, LubecSkill> = new Map([
  ...LUBEC_TRAINED_SKILLS.map((name): [string, LubecSkill] => [name, { name, tier: 'Trained', prerequisites: [] }]),
  ...Object.entries(LUBEC_EXPERT_PREREQUISITES).map(([name, prerequisites]): [string, LubecSkill] =>
    [name, { name, tier: 'Expert', prerequisites }]),
])

/** The skill a stored name names, or null when the skill data does not know it. */
export function lubecSkill(name: string | null): LubecSkill | null {
  return name === null ? null : SKILLS.get(name) ?? null
}

export function lubecSkillTier(name: string | null): LubecSkillTier | null {
  return lubecSkill(name)?.tier ?? null
}

/** +10 for a Trained skill, +15 for an Expert, null for a name the data does not know. */
export function lubecSkillBonus(name: string | null): number | null {
  const tier = lubecSkillTier(name)
  return tier === null ? null : LUBEC_SKILL_BONUS[tier]
}

export function isFightingOrShootingSkill(name: string): boolean {
  return LUBEC_FIGHTING_OR_SHOOTING_SKILLS.has(name)
}
