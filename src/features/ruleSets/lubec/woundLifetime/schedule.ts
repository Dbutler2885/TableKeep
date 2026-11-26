import type { EndRoundInput, EndRoundPlan } from './types'

/**
 * The end of a round, once: every combatant still watched through this round gets one tick of it, even when nothing
 * of theirs ends yet; watches and countdowns that are over are dropped; countdowns due at exactly this round are
 * announced. An announcement is the fight's schedule, not proof the sheet still carries the card.
 */
export function endWoundRound({ round, combatants, roundWatch, countdowns }: EndRoundInput): EndRoundPlan {
  const watched = Object.entries(roundWatch ?? {}).filter(([, through]) => through >= round)
  const nameOf = (key: string) => combatants.find((entry) => entry.key === key)?.name
  return {
    tickKeys: watched.map(([key]) => key).filter((key) => combatants.some((entry) => entry.key === key)),
    roundWatch: Object.fromEntries(watched.filter(([, through]) => through > round)),
    countdowns: (countdowns ?? []).filter((countdown) => countdown.dueRound > round),
    due: (countdowns ?? []).filter((countdown) => countdown.dueRound === round)
      .map(({ key, wound, kind }) => ({ key, name: nameOf(key) ?? 'Someone', wound, kind })),
  }
}
