import { Dice1, Dice2, Dice3, Dice4, Dice5, Dice6 } from 'lucide-react'
import { ENCOUNTER_CHECK_DISTANCE_FEET } from '../lib/constants'

export function DistanceTrackerBadge({ distanceTrackerFeet, distanceTrackerMode, distanceTrackerRoll, onResetDistanceTracker }: {
  distanceTrackerFeet: number
  distanceTrackerMode: 'count' | 'roll' | 'first'
  distanceTrackerRoll: number | null
  onResetDistanceTracker: () => void
}) {
  const icons = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6]
  const DistanceRollIcon = distanceTrackerMode === 'roll' && distanceTrackerRoll
    ? icons[distanceTrackerRoll - 1] ?? null
    : null
  const label = distanceTrackerMode === 'first' ? '1st' : `${Math.max(0, Math.round(distanceTrackerFeet))}'`
  const active = distanceTrackerMode === 'roll' || distanceTrackerMode === 'first'
  const tooltip = distanceTrackerMode === 'roll'
    ? `d6: ${distanceTrackerRoll ?? '-'}`
    : distanceTrackerMode === 'first'
      ? `1st turn/${ENCOUNTER_CHECK_DISTANCE_FEET}'`
      : `${Math.max(0, Math.round(distanceTrackerFeet))}'/${ENCOUNTER_CHECK_DISTANCE_FEET}'`
  return <button type="button" className={active ? 'map-icon-btn map-distance-tracker-btn fast-tooltip fast-tooltip-right active' : 'map-icon-btn map-distance-tracker-btn fast-tooltip fast-tooltip-right'} onClick={onResetDistanceTracker} aria-label="Reset movement distance tracker" data-tooltip={tooltip}>
    {DistanceRollIcon ? <DistanceRollIcon size={16} /> : <span className="map-distance-tracker-value">{label}</span>}
  </button>
}
