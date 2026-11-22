import type { PreparedSheetIntention } from '../../character/characterStore/sheetIntentionTransaction'

/**
 * A client transaction reads the fight and the target sheet one after the other, without a snapshot between them.
 * A second GM's drain can commit in that gap: the fight read still queues the wound while the sheet already holds its receipt.
 * Firestore retries a transaction only for its own errors, so the delivery says so with this error and reads both again.
 */
export class StaleWoundRead extends Error {
  constructor() {
    super('Wound delivery read the fight before another delivery of this wound committed.')
  }
}

/** Only a receipt already on the sheet plans a wound without a write: replayed as it was, or refused as reused. */
const heldByReceipt = ({ outcome, mutation }: PreparedSheetIntention): boolean =>
  (outcome.status === 'committed' ? !mutation : outcome.code === 'operation-id-reused')

/** The commit that wrote this wound's receipt also took it off the queue, so a fight read that still queues it is older than the sheet. */
export function requireFreshWoundRead(prepared: PreparedSheetIntention) {
  if (heldByReceipt(prepared)) throw new StaleWoundRead()
}

const STALE_READ_ATTEMPTS = 5

/** Runs the delivery again while its reads were torn by a concurrent delivery; any other error stands. */
export async function retryStaleWoundRead<T>(run: () => Promise<T>, attempts = STALE_READ_ATTEMPTS): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (!(error instanceof StaleWoundRead) || attempts <= 1) throw error
    return retryStaleWoundRead(run, attempts - 1)
  }
}
