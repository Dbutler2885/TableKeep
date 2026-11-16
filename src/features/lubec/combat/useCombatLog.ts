import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { db } from '../../../firebase'
import type { CampaignScope } from '../../campaign/firestorePaths'
import { EMPTY_COMBAT_LOG, type CombatLogView } from './CombatLogContext'
import { subscribeCombatLog, type CombatLogUpdate } from './combatLog'

type SeenLog = Pick<CombatLogView, 'entries' | 'cards'> & { scopeKey: string; fightId: string }

function nextLog(previous: SeenLog | null, scopeKey: string, fightId: string, update: CombatLogUpdate): SeenLog {
  const oldCards = previous?.fightId === fightId && previous.scopeKey === scopeKey ? previous.cards : []
  const rolls = update.arriving.filter((entry) => entry.roll)
  return { scopeKey, fightId, entries: update.entries, cards: [...oldCards, ...rolls] }
}

function visibleLog(seen: SeenLog | null, scopeKey: string, fightId: string | null): SeenLog | null {
  if (seen?.scopeKey !== scopeKey) return null
  if (fightId && fightId !== seen.fightId) return null
  return seen
}

const sessionOf = (seen: SeenLog): string => JSON.stringify([seen.scopeKey, seen.fightId])

/** A finished card belongs only to the fight whose queue displayed it. */
function withoutCard(seen: SeenLog | null, sessionKey: string, id: string): SeenLog | null {
  if (!seen || sessionOf(seen) !== sessionKey) return seen
  return { ...seen, cards: seen.cards.filter((entry) => entry.id !== id) }
}

type SubscriptionOptions = { scopeKey: string; fightId: string | null; setError: (message: string) => void; setSeen: Dispatch<SetStateAction<SeenLog | null>> }

function useLogSubscription({ scopeKey, fightId, setError, setSeen }: SubscriptionOptions) {
  const stop = useRef<(() => void) | null>(null)
  useEffect(() => () => { stop.current?.(); stop.current = null }, [scopeKey])
  useEffect(() => {
    if (!scopeKey || !fightId) return
    stop.current?.()
    const [groupId, campaignId] = scopeKey.split('/')
    stop.current = subscribeCombatLog(db, { groupId, campaignId }, fightId,
      (update) => setSeen((previous) => nextLog(previous, scopeKey, fightId, update)),
      () => setError('Could not follow the combat log.'))
  }, [scopeKey, fightId, setError, setSeen])
}

/** One workspace listener. Keep following the last fight through its final End log. */
export function useCombatLog(scope: CampaignScope | null, fightId: string | null, setError: (message: string) => void): CombatLogView {
  const scopeKey = scope ? `${scope.groupId}/${scope.campaignId}` : ''
  const [seen, setSeen] = useState<SeenLog | null>(null)
  useLogSubscription({ scopeKey, fightId, setError, setSeen })
  const shown = visibleLog(seen, scopeKey, fightId)
  const sessionKey = shown ? sessionOf(shown) : ''
  const finishCard = useCallback((id: string) => setSeen((current) => withoutCard(current, sessionKey, id)), [sessionKey])
  return shown ? { entries: shown.entries, cards: shown.cards, sessionKey, finishCard } : EMPTY_COMBAT_LOG
}
