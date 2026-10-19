import {
  DISTANCE_POST_ROLL_MIN_FEET_TO_SHOW,
  ENCOUNTER_CHECK_DISTANCE_FEET,
  ENCOUNTER_TRIGGER_ROLL_MAX,
} from './constants'

// Where the party is in the two-turn check cycle: feet into the current turn,
// and whether that turn ends in the first-turn warning (0) or a roll (1).
export type EncounterCycle = { feet: number; turnStage: 0 | 1 }

export type EncounterTrackerMode = 'count' | 'first' | 'roll'

// What the distance tracker badge shows.
export type EncounterTracker = {
  feet: number
  mode: EncounterTrackerMode
  roll: number | null
}

export type EncounterNotice = {
  checks: number
  hits: number
  rolls: number[]
}

export type EncounterStep = {
  cycle: EncounterCycle
  rolls: number[]
  // The last turn end the movement crossed, if it crossed any.
  lastEvent: 'first' | 'roll' | null
}

export const START_CYCLE: EncounterCycle = { feet: 0, turnStage: 0 }

export const IDLE_TRACKER: EncounterTracker = { feet: 0, mode: 'count', roll: null }

export const rollD6 = () => 1 + Math.floor(Math.random() * 6)

// Walks a movement through every turn end it crosses: the first turn ends in a
// warning, the second in a d6 roll, and then the cycle starts again.
export function advanceEncounterCycle(
  cycle: EncounterCycle,
  movedFeet: number,
  roll: () => number = rollD6,
): EncounterStep {
  let feet = cycle.feet + movedFeet
  let turnStage = cycle.turnStage
  const rolls: number[] = []
  let lastEvent: EncounterStep['lastEvent'] = null
  while (feet >= ENCOUNTER_CHECK_DISTANCE_FEET) {
    feet -= ENCOUNTER_CHECK_DISTANCE_FEET
    if (turnStage === 0) {
      turnStage = 1
      lastEvent = 'first'
    } else {
      turnStage = 0
      rolls.push(roll())
      lastEvent = 'roll'
    }
  }
  return { cycle: { feet, turnStage }, rolls, lastEvent }
}

// A turn end stays on show as a full turn until the party is a few feet past
// it, so the warning or roll does not flicker away at once.
export function trackerAfterStep(step: EncounterStep, shown: EncounterTracker): EncounterTracker {
  if (step.lastEvent === 'roll') {
    return { feet: ENCOUNTER_CHECK_DISTANCE_FEET, mode: 'roll', roll: step.rolls[step.rolls.length - 1] }
  }
  if (step.lastEvent === 'first') {
    return { feet: ENCOUNTER_CHECK_DISTANCE_FEET, mode: 'first', roll: null }
  }
  if (shown.mode !== 'count' && step.cycle.feet < DISTANCE_POST_ROLL_MIN_FEET_TO_SHOW) {
    return { ...shown, feet: ENCOUNTER_CHECK_DISTANCE_FEET }
  }
  return { feet: step.cycle.feet, mode: 'count', roll: null }
}

// The alert a movement raises: only one that ends on a roll, and only when a
// roll in it found an encounter.
export function encounterNoticeFor(step: EncounterStep): EncounterNotice | null {
  if (step.lastEvent !== 'roll') return null
  const hits = step.rolls.filter((roll) => roll <= ENCOUNTER_TRIGGER_ROLL_MAX).length
  return hits > 0 ? { checks: step.rolls.length, hits, rolls: step.rolls } : null
}
