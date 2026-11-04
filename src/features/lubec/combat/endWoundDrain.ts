import type { Firestore } from 'firebase/firestore'
import type { CombatCommand, CombatOutcome } from './engine/types'
import { drainCombatWounds } from './woundDelivery'

/** End stays live when a sheet cannot be repaired/delivered; the caller can retry the same command. */
export async function drainEndWounds(db: Firestore, command: CombatCommand, userId: string, supplied?: (fightId: string) => Promise<void>): Promise<CombatOutcome | null> {
  try {
    const drain = supplied ?? ((fightId: string) => drainCombatWounds(db, { ...command.envelope, fightId }, userId))
    await drain(command.envelope.fightId)
    return null
  } catch (error) {
    return { ok: false, reason: `Wound delivery is pending: ${String(error)}. Combat remains live; retry End.` }
  }
}
