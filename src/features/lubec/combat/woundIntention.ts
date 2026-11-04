import { readSheetRevision } from '../../character/characterStore/sheetIntention'
import type { SheetIntention, SheetValue } from '../../character/characterStore/sheetIntentionTypes'
import type { CombatWound, CombatWoundOrigin } from './woundTypes'

/** Fight-local wound ids also remain distinct across fights on the same sheet. */
export async function combatWoundOperationId(fightId: string, woundId: string): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([fightId, woundId]))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return `wound_${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function requireWoundRound(wound: CombatWound) {
  if (!Number.isSafeInteger(wound.originatingRound) || wound.originatingRound < 0) throw new Error('Invalid wound round.')
  if (wound.effectiveRound !== wound.originatingRound + 1) throw new Error('Invalid wound effective round.')
}

function requireWound(wound: CombatWound) {
  if (!wound.id || !wound.effect.id) throw new Error('Wound identity is missing.')
  requireWoundRound(wound)
  if (![wound.traumaDelta, wound.stressDelta].every(Number.isSafeInteger)) throw new Error('Invalid wound counter delta.')
}

/** Deltas and a stable effect insertion rebase through the ordinary sheet protocol. */
export function combatWoundIntention(raw: Record<string, unknown>, wound: CombatWound, fightId: string, operationId: string): SheetIntention {
  requireWound(wound)
  const origin: CombatWoundOrigin = { fightId, woundId: wound.id, originatingRound: wound.originatingRound, effectiveRound: wound.effectiveRound }
  const effect = { ...wound.effect, id: operationId, cause: `Fight ${fightId}: ${wound.effect.cause}`, combatOrigin: origin }
  return {
    operationId, baseRevision: readSheetRevision(raw),
    edits: [
      { kind: 'delta', path: ['lubec', 'counters', 'trauma'], base: 0, amount: wound.traumaDelta },
      { kind: 'delta', path: ['lubec', 'counters', 'stress'], base: 0, amount: wound.stressDelta },
      { kind: 'insert', path: ['lubec', 'effects'], record: effect as unknown as { id: string; [key: string]: SheetValue } },
    ],
  }
}
