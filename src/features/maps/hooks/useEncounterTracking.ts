import { useCallback, useRef, useState } from 'react'
import {
  IDLE_TRACKER,
  START_CYCLE,
  advanceEncounterCycle,
  encounterNoticeFor,
  trackerAfterStep,
  type EncounterCycle,
  type EncounterNotice,
  type EncounterTracker,
  type EncounterTrackerMode,
} from '../lib/encounterCycle'
import { useMapRuleSet } from '../mapRuleSet'

export function useEncounterTracking() {
  // A rule set without wandering monsters never tracks, rolls or alerts.
  const { wanderingMonsters } = useMapRuleSet().mapRules
  const [distanceTrackerFeet, setDistanceTrackerFeet] = useState(IDLE_TRACKER.feet)
  const [distanceTrackerMode, setDistanceTrackerMode] = useState<EncounterTrackerMode>(IDLE_TRACKER.mode)
  const [distanceTrackerRoll, setDistanceTrackerRoll] = useState(IDLE_TRACKER.roll)
  const [encounterNotice, setEncounterNotice] = useState<EncounterNotice | null>(null)

  // Refs for stable access inside drag callbacks without stale closure issues.
  const trackerRef = useRef<EncounterTracker>(IDLE_TRACKER)
  const cycleRef = useRef<EncounterCycle>(START_CYCLE)

  const showTracker = useCallback((tracker: EncounterTracker) => {
    trackerRef.current = tracker
    setDistanceTrackerFeet(tracker.feet)
    setDistanceTrackerMode(tracker.mode)
    setDistanceTrackerRoll(tracker.roll)
  }, [])

  const resetDistanceTracker = useCallback(() => {
    cycleRef.current = START_CYCLE
    showTracker(IDLE_TRACKER)
    setEncounterNotice(null)
  }, [showTracker])

  // Called by useTokenDrag on each mousemove tick with the accumulated movement in feet.
  // Handles the turn-based encounter check cycle (first-turn warning → d6 roll per turn).
  const onMovementFeet = useCallback((movedFeet: number) => {
    if (!wanderingMonsters || movedFeet <= 0.0001) return
    const step = advanceEncounterCycle(cycleRef.current, movedFeet)
    cycleRef.current = step.cycle
    showTracker(trackerAfterStep(step, trackerRef.current))
    const notice = encounterNoticeFor(step)
    if (notice) setEncounterNotice(notice)
  }, [showTracker, wanderingMonsters])

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
