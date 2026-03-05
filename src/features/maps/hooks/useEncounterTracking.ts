import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DISTANCE_POST_ROLL_MIN_FEET_TO_SHOW,
  ENCOUNTER_CHECK_DISTANCE_FEET,
  ENCOUNTER_TRIGGER_ROLL_MAX,
} from '../lib/constants'

export function useEncounterTracking() {
  const [distanceTrackerFeet, setDistanceTrackerFeet] = useState(0)
  const [distanceTrackerMode, setDistanceTrackerMode] = useState<'count' | 'first' | 'roll'>('count')
  const [distanceTrackerRoll, setDistanceTrackerRoll] = useState<number | null>(null)
  const [encounterNotice, setEncounterNotice] = useState<{
    checks: number
    hits: number
    rolls: number[]
  } | null>(null)

  // Refs for stable access inside drag callbacks without stale closure issues.
  const distanceTrackerFeetRef = useRef(0)
  const distanceTrackerModeRef = useRef<'count' | 'first' | 'roll'>('count')
  const distanceTrackerRollRef = useRef<number | null>(null)
  const distanceTrackerTurnStageRef = useRef<0 | 1>(0)

  useEffect(() => { distanceTrackerModeRef.current = distanceTrackerMode }, [distanceTrackerMode])
  useEffect(() => { distanceTrackerRollRef.current = distanceTrackerRoll }, [distanceTrackerRoll])

  const resetDistanceTracker = useCallback(() => {
    distanceTrackerFeetRef.current = 0
    distanceTrackerModeRef.current = 'count'
    distanceTrackerRollRef.current = null
    distanceTrackerTurnStageRef.current = 0
    setDistanceTrackerFeet(0)
    setDistanceTrackerMode('count')
    setDistanceTrackerRoll(null)
    setEncounterNotice(null)
  }, [])

  // Called by useTokenDrag on each mousemove tick with the accumulated movement in feet.
  // Handles the turn-based encounter check cycle (first-turn warning → d6 roll per turn).
  const onMovementFeet = useCallback((movedFeet: number) => {
    if (movedFeet <= 0.0001) return

    let cycleFeet = distanceTrackerFeetRef.current
    cycleFeet += movedFeet
    let turnStage = distanceTrackerTurnStageRef.current
    const rolls: number[] = []
    let latestRoll: number | null = null
    let lastEvent: 'first' | 'roll' | null = null

    while (cycleFeet >= ENCOUNTER_CHECK_DISTANCE_FEET) {
      cycleFeet -= ENCOUNTER_CHECK_DISTANCE_FEET
      if (turnStage === 0) {
        turnStage = 1
        lastEvent = 'first'
      } else {
        turnStage = 0
        const roll = 1 + Math.floor(Math.random() * 6)
        rolls.push(roll)
        latestRoll = roll
        lastEvent = 'roll'
      }
    }

    distanceTrackerFeetRef.current = cycleFeet
    distanceTrackerTurnStageRef.current = turnStage

    if (lastEvent === 'roll' && latestRoll !== null) {
      distanceTrackerModeRef.current = 'roll'
      distanceTrackerRollRef.current = latestRoll
      setDistanceTrackerMode('roll')
      setDistanceTrackerRoll(latestRoll)
      setDistanceTrackerFeet(ENCOUNTER_CHECK_DISTANCE_FEET)
      const hits = rolls.filter((roll) => roll <= ENCOUNTER_TRIGGER_ROLL_MAX).length
      if (hits > 0) setEncounterNotice({ checks: rolls.length, hits, rolls })
    } else if (lastEvent === 'first') {
      distanceTrackerModeRef.current = 'first'
      distanceTrackerRollRef.current = null
      setDistanceTrackerMode('first')
      setDistanceTrackerRoll(null)
      setDistanceTrackerFeet(ENCOUNTER_CHECK_DISTANCE_FEET)
    } else {
      const belowPostRollDisplayThreshold =
        (distanceTrackerModeRef.current === 'roll' || distanceTrackerModeRef.current === 'first') &&
        cycleFeet < DISTANCE_POST_ROLL_MIN_FEET_TO_SHOW
      if (belowPostRollDisplayThreshold) {
        setDistanceTrackerFeet(ENCOUNTER_CHECK_DISTANCE_FEET)
      } else {
        if (distanceTrackerModeRef.current !== 'count') {
          distanceTrackerModeRef.current = 'count'
          distanceTrackerRollRef.current = null
          setDistanceTrackerMode('count')
          setDistanceTrackerRoll(null)
        }
        setDistanceTrackerFeet(cycleFeet)
      }
    }
  }, [])

  return {
    distanceTrackerFeet,
    distanceTrackerMode,
    distanceTrackerRoll,
    encounterNotice,
    dismissEncounterNotice: () => setEncounterNotice(null),
    onMovementFeet,
    resetDistanceTracker,
  }
}
