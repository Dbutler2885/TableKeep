import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { db } from '../../../firebase'
import type { CampaignScope } from '../../campaign/firestorePaths'
import { EMPTY_COMBAT_LOG, type CombatLogView } from './CombatLogContext'
import { subscribeCombatLog, type CombatLogUpdate } from './combatLog'

type SeenLog = CombatLogView & { scopeKey: string; fightId: string }

function nextLog(previous: SeenLog | null, scopeKey: string, fightId: string, update: CombatLogUpdate): SeenLog {
  const oldCards = previous?.fightId === fightId && previous.scopeKey === scopeKey ? previous.cards : []
  return { scopeKey, fightId, entries: update.entries, cards: [...oldCards, ...update.arriving].slice(-3) }
}

function visibleLog(seen: SeenLog | null, scopeKey: string, fightId: string | null): CombatLogView {
  if (seen?.scopeKey !== scopeKey) return EMPTY_COMBAT_LOG
  if (fightId && fightId !== seen.fightId) return EMPTY_COMBAT_LOG
  return seen
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
  return visibleLog(seen, scopeKey, fightId)
}
