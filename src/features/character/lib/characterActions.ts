import type { CharacterRecord } from '../../../types/app'

/** The updates with the max hit points at least zero and the current between zero and the new or stored max. */
export function clampHitPointUpdates(target: CharacterRecord, updates: Partial<CharacterRecord>): Partial<CharacterRecord> {
  const nextUpdates = { ...updates }
  const nextHpMax = Math.max(0, typeof nextUpdates.hpMax === 'number' ? nextUpdates.hpMax : target.hpMax)
  if (typeof nextUpdates.hpMax === 'number') {
    nextUpdates.hpMax = nextHpMax
  }
  if (typeof nextUpdates.hpCurrent === 'number') {
    nextUpdates.hpCurrent = Math.max(0, Math.min(nextUpdates.hpCurrent, nextHpMax))
  }
  return nextUpdates
}
