import type { CombatLogEntry } from './combatLog'
import type { CombatLogView } from './CombatLogContext'
import type { CombatState } from './engine/types'

// A roll card raises the moment; nothing around it may give the result away
// first. The page shows a new fight state only once every roll card has
// finished revealing and every roll that state was rolled in has arrived, and
// the table log stops short of the first card still revealing.

type RevealView = Pick<CombatLogView, 'entries' | 'cards' | 'settled'>

/** The first roll card that has arrived and not yet finished revealing. */
const revealingCard = (view: RevealView): CombatLogEntry | undefined => view.cards.find((card) => !view.settled.has(card.id))

/** The rolls the state was rolled in whose log entries have not arrived yet. */
function missingRolls(view: RevealView, state: CombatState | null): string[] {
  const arrived = new Set(view.entries.map((entry) => entry.id))
  return (state?.revealRolls ?? []).filter((id) => !arrived.has(id))
}

/** What the page waits on before it may show the state, or null for nothing; a new wait is a new key. */
export function combatRevealWait(view: RevealView, state: CombatState | null): string | null {
  const card = revealingCard(view)
  if (card) return `card:${card.id}`
  const missing = missingRolls(view, state)
  return missing.length ? `rolls:${missing.join(',')}` : null
}

/** The table log as far as the cards have revealed it: every entry before the first card still revealing. */
export function revealedEntries(view: RevealView): CombatLogEntry[] {
  const card = revealingCard(view)
  const index = card ? view.entries.findIndex((entry) => entry.id === card.id) : -1
  return index < 0 ? view.entries : view.entries.slice(0, index)
}
