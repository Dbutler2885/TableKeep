import { readSheetRevision } from '../../character/characterStore/sheetIntention'
import type { SheetIntention, SheetValue } from '../../character/characterStore/sheetIntentionTypes'
import type { LubecEffect } from '../../ruleSets/lubec/effects'
import type { CombatWound, CombatWoundOrigin } from './woundTypes'

/** Fight-local wound ids also remain distinct across fights on the same sheet. */
export async function combatWoundOperationId(fightId: string, woundId: string): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([fightId, woundId]))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return `wound_${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function requireWoundRound(wound: CombatWound) {
  if (!Number.isSafeInteger(wound.originatingRound) || wound.originatingRound < 0) throw new Error('Invalid wound round.')
  // A located wound is effective in the round it lands; Dodgeball, and any wound queued before that, the next round.
  if (wound.effectiveRound !== wound.originatingRound && wound.effectiveRound !== wound.originatingRound + 1) throw new Error('Invalid wound effective round.')
}

const CARD_KEY = /^[A-Za-z0-9_-]{1,40}$/

function requireCards(wound: CombatWound) {
  if (!wound.effects) return
  if (!wound.effects.length) return
  const keys = wound.effects.map((card) => card.cardKey)
  if (!keys.length || !keys.every((key) => typeof key === 'string' && CARD_KEY.test(key)) || new Set(keys).size !== keys.length) {
    throw new Error('Wound cards need distinct keys.')
  }
}

function requireWound(wound: CombatWound) {
  if (!wound.id || (!wound.effects && !wound.effect?.id)) throw new Error('Wound identity is missing.')
  requireWoundRound(wound)
  requireCards(wound)
  if (![wound.traumaDelta, wound.stressDelta, wound.minimumStressDelta ?? 0].every(Number.isSafeInteger)) throw new Error('Invalid wound counter delta.')
}

type Insertable = { id: string; [key: string]: SheetValue }

/**
 * The wound's cards as the sheet stores them. An older text wound is one effect named by the operation; a final
 * row's cards are each named by the operation and their key, and share the operation as their wound's identity,
 * so a retry or a second drain finds the same ids and the receipt, never a second copy.
 */
function storedCards(wound: CombatWound, fightId: string, operationId: string): LubecEffect[] {
  const origin: CombatWoundOrigin = { fightId, woundId: wound.id, originatingRound: wound.originatingRound, effectiveRound: wound.effectiveRound }
  const stamp = (card: LubecEffect, id: string): LubecEffect => ({ ...card, id, cause: `Fight ${fightId}: ${card.cause}`, combatOrigin: origin })
  if (!wound.effects) return [stamp(wound.effect!, operationId)]
  return wound.effects.map((card) => {
    const stamped = stamp(card, `${operationId}_${String(card.cardKey)}`)
    return card.wound && typeof card.wound === 'object' ? { ...stamped, wound: { ...card.wound, groupId: operationId } } : stamped
  })
}

/** Deltas and stable card insertions rebase through the ordinary sheet protocol. */
export function combatWoundIntention(raw: Record<string, unknown>, wound: CombatWound, fightId: string, operationId: string): SheetIntention {
  requireWound(wound)
  const inserts = storedCards(wound, fightId, operationId).map((card) => ({ kind: 'insert' as const, path: ['lubec', 'effects'], record: card as unknown as Insertable }))
  return {
    operationId, baseRevision: readSheetRevision(raw),
    edits: [
      { kind: 'delta', path: ['lubec', 'counters', 'trauma'], base: 0, amount: wound.traumaDelta },
      { kind: 'delta', path: ['lubec', 'counters', 'stress'], base: 0, amount: wound.stressDelta },
      ...(wound.minimumStressDelta ? [{ kind: 'delta' as const, path: ['lubec', 'counters', 'minimumStress'], base: 0, amount: wound.minimumStressDelta }] : []),
      ...inserts,
    ],
  }
}
