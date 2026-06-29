import { isVtmInClanDiscipline } from './vtmRuleset'
import type { VtmClanId } from './vtmRuleset'
import type { VtmXpLedgerEntry } from './vtmTypes'

export type VtmXpCategory =
  | 'attribute'
  | 'ability'
  | 'virtue'
  | 'willpower'
  | 'humanity'
  | 'thaumaturgyPath'
  | 'discipline'

export type VtmNewTraitCategory = 'ability' | 'thaumaturgyPath' | 'discipline'

export type VtmClanContext = {
  clan: VtmClanId | ''
  discipline?: string
}

const multiplierFor = (category: VtmXpCategory, clanContext?: VtmClanContext): number => {
  if (category === 'willpower') return 1
  if (category === 'humanity' || category === 'virtue' || category === 'ability') return 2
  if (category === 'attribute' || category === 'thaumaturgyPath') return 4
  if (category === 'discipline') {
    if (clanContext?.clan === 'caitiff') return 6
    if (clanContext?.discipline && isVtmInClanDiscipline(clanContext.clan, clanContext.discipline)) return 5
    return 7
  }
  return 0
}

export const xpCostToRaise = (
  category: VtmXpCategory,
  currentRating: number,
  clanContext?: VtmClanContext,
): number => {
  const rating = Math.max(0, Math.floor(currentRating))
  return rating * multiplierFor(category, clanContext)
}

export const xpCostForNewTrait = (category: VtmNewTraitCategory): number => {
  if (category === 'ability') return 3
  if (category === 'thaumaturgyPath') return 7
  return 10
}

// Short, category-level description of the XP cost rule, for the advancement UI.
// XP cost scales with current rating, so a flat per-dot number is not correct;
// these spell out the rule (multiplier and any new-trait flat cost) instead.
export const xpRuleLabel = (category: VtmXpCategory, clanContext?: VtmClanContext): string => {
  switch (category) {
    case 'attribute':
      return 'XP: rating × 4'
    case 'ability':
      return 'XP: rating × 2 · new 3'
    case 'virtue':
      return 'XP: rating × 2'
    case 'willpower':
      return 'XP: rating × 1'
    case 'humanity':
      return 'XP: rating × 2'
    case 'thaumaturgyPath':
      return 'XP: rating × 4 · new 7'
    case 'discipline':
      if (clanContext?.clan === 'caitiff') return 'XP: rating × 6 Caitiff · new 10'
      return 'XP: rating × 5 clan / × 7 other · new 10'
    default:
      return ''
  }
}

export const canAffordVtmXp = (balance: number, cost: number): boolean =>
  Math.max(0, Math.floor(balance)) >= Math.max(0, Math.floor(cost))

export const applyVtmXpSpend = ({
  balance,
  cost,
  note,
  nowMs,
}: {
  balance: number
  cost: number
  note: string
  nowMs: number
}): { ok: true; balance: number; entry: VtmXpLedgerEntry } | { ok: false; reason: 'insufficient_xp' } => {
  if (!canAffordVtmXp(balance, cost)) return { ok: false, reason: 'insufficient_xp' }
  const amount = Math.max(0, Math.floor(cost))
  return {
    ok: true,
    balance: balance - amount,
    entry: {
      id: `xp-${nowMs}`,
      type: 'spend',
      amount,
      note,
      createdAtMs: nowMs,
    },
  }
}
