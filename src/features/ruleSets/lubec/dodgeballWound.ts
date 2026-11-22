import {
  LUBEC_DODGEBALL_TABLE,
  type LubecDodgeballEffectTemplate, type LubecDodgeballGroup, type LubecDodgeballImpact,
  type LubecDodgeballOutcome, type LubecDodgeballResolution, type LubecDodgeballRow,
} from './dodgeballTable'

const LOCATION_GROUPS: Readonly<Partial<Record<string, LubecDodgeballGroup>>> = {
  head: 'head-neck', neck: 'head-neck',
  torso: 'torso-waist', waist: 'torso-waist',
  groin: 'groin',
  upperarm: 'arms', 'upperarm-L': 'arms', 'upperarm-R': 'arms',
  forearm: 'arms', 'forearm-L': 'arms', 'forearm-R': 'arms',
  hand: 'hand', 'hand-L': 'hand', 'hand-R': 'hand',
  thigh: 'legs', 'thigh-L': 'legs', 'thigh-R': 'legs',
  shin: 'legs', 'shin-L': 'legs', 'shin-R': 'legs',
  feet: 'legs', 'feet-L': 'legs', 'feet-R': 'legs',
}

export type LubecDodgeballSource = {
  table: 'dodgeball'
  group: LubecDodgeballGroup
  impact: LubecDodgeballImpact
  name: string
  text: string
}

/** Ready for a later wound writer to give an id/cause and combat-origin metadata. */
export type LubecDodgeballEffect = LubecDodgeballEffectTemplate & {
  struckLocation: string
  source: LubecDodgeballSource
}

export type LubecLocatedDodgeballRow = LubecDodgeballRow<LubecDodgeballEffect> & {
  location: string
  group: LubecDodgeballGroup
}

function locatedOutcome(outcome: LubecDodgeballOutcome, struckLocation: string, source: LubecDodgeballSource): LubecDodgeballOutcome<LubecDodgeballEffect> {
  return {
    ...outcome,
    // Labels are editable. A caller must never mutate the table or another lookup.
    effects: outcome.effects.map((effect) => ({ ...structuredClone(effect), struckLocation, source: { ...source } })),
  }
}

function locatedResolution(resolution: LubecDodgeballResolution, location: string, source: LubecDodgeballSource): LubecDodgeballResolution<LubecDodgeballEffect> {
  if (resolution.kind === 'automatic') {
    return { kind: 'automatic', outcome: locatedOutcome(resolution.outcome, location, source) }
  }
  return {
    kind: 'check', check: { ...resolution.check },
    success: locatedOutcome(resolution.success, location, source),
    failure: locatedOutcome(resolution.failure, location, source),
  }
}

/** The public location/Impact lookup: positive whole Impact clamps at 6+, everything else has no row. */
export function lubecDodgeballRow(location: string, impact: number): LubecLocatedDodgeballRow | null {
  const group = Object.hasOwn(LOCATION_GROUPS, location) ? LOCATION_GROUPS[location] : null
  if (!group || !Number.isInteger(impact) || impact < 1) return null
  const entry = LUBEC_DODGEBALL_TABLE[group][Math.min(impact, 6) - 1]
  const source: LubecDodgeballSource = { table: 'dodgeball', group, impact: entry.impact, name: entry.name, text: entry.text }
  return { ...entry, location, group, resolution: locatedResolution(entry.resolution, location, source) }
}
