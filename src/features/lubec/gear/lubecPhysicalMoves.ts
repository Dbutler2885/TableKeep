import type { Firestore } from 'firebase/firestore'
import { lubecMoveBetween, type LubecMoveRequest } from './lubecMoveTransaction'

type PhysicalRecordRef = Extract<LubecMoveRequest['from'], { kind: 'character' | 'npc' | 'gm-items' }>

export type LubecPhysicalMoveRequest = Omit<LubecMoveRequest, 'move' | 'from' | 'to'> & {
  from: PhysicalRecordRef
  to: PhysicalRecordRef
  move: Pick<LubecMoveRequest['move'], 'itemId' | 'qty' | 'seen' | 'dest'>
  /** Distinct output roles/ordinals when composing more than one move in a command. */
  role?: string
  ordinal?: number
}

/**
 * Retain request.operationId when retrying an uncertain acknowledgement.
 * GM destinations require GM authority to read and refuse conflicting records.
 */
export function lubecMovePhysicalBetween(db: Firestore, request: LubecPhysicalMoveRequest) {
  request.operationId ??= crypto.randomUUID()
  const physical = { commandId: request.operationId, role: request.role, ordinal: request.ordinal }
  return lubecMoveBetween(db, { ...request, move: { ...request.move, physical } })
}
