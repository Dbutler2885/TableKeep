import { useCallback, useEffect, useRef, useState } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { db } from '../../../firebase'
import type { CampaignScope } from '../../campaign/firestorePaths'
import { campaignTabPath, type GameSystem } from '../../navigation/tabs'
import type { Campaign, Role } from '../../../types/app'
import { lubecCombatEnabled } from './combatGate'
import { subscribeCombat } from './combatSubscription'
import { arrivingFightId, LUBEC_COMBAT_OFF, liveFightOf, lubecCombatTabAccess, type LubecCombatWatch, type LubecLiveFight } from './combatWatch'

type Seen = { key: string; live: LubecLiveFight | null }

const scopeKey = (scope: CampaignScope | null) => (scope ? `${scope.groupId}/${scope.campaignId}` : null)

/** What the workspace knows of the fight followed under `key`: off, still being read, or read. */
function watchOf(key: string | null, seen: Seen | null): LubecCombatWatch {
  if (!key) return LUBEC_COMBAT_OFF
  if (seen?.key !== key) return { enabled: true, ready: false, live: null }
  return { enabled: true, ready: true, live: liveFightOf(seen.live) }
}

/** One subscription to the campaign's control and the fight it names, for as long as the workspace shows a Lubec campaign. */
export function useLubecCombatWatch(scope: CampaignScope | null, setError: (message: string) => void): LubecCombatWatch {
  const key = scopeKey(scope)
  const [seen, setSeen] = useState<Seen | null>(null)
  useEffect(() => {
    if (!key) return undefined
    // Firestore ids never contain a slash, so the key splits back into the scope it was made from.
    const [groupId, campaignId] = key.split('/')
    return subscribeCombat(db, { groupId, campaignId }, (live) => setSeen({ key, live }), () => setError('Could not follow the fight.'))
  }, [key, setError])
  return watchOf(key, seen)
}

/** A viewer with a combatant in a live fight is taken to it once per fight in this session, and is then free to leave. */
export function useLubecCombatArrival(live: LubecLiveFight | null, userId: string, arrive: () => void) {
  const moved = useRef(new Set<string>())
  useEffect(() => {
    const fightId = arrivingFightId(live, userId, moved.current)
    if (!fightId) return
    moved.current.add(fightId)
    arrive()
  }, [live, userId, arrive])
}

type ShellOptions = {
  campaign: Campaign | null
  gameSystem: GameSystem
  role: Role | null
  userId: string
  navigate: NavigateFunction
  setError: (message: string) => void
}

const followed = (campaign: Campaign | null, gameSystem: GameSystem): CampaignScope | null =>
  (campaign && gameSystem === 'lubec' && lubecCombatEnabled ? { groupId: campaign.groupId, campaignId: campaign.id } : null)

/** The workspace's fight: the shared watch, what the nav offers, and the once-per-fight move to the Combat tab. */
export function useLubecCombatShell({ campaign, gameSystem, role, userId, navigate, setError }: ShellOptions) {
  const watch = useLubecCombatWatch(followed(campaign, gameSystem), setError)
  const groupId = campaign?.groupId ?? ''
  const campaignId = campaign?.id ?? ''
  const arrive = useCallback(() => { void navigate(campaignTabPath(groupId, campaignId, 'combat')) }, [navigate, groupId, campaignId])
  useLubecCombatArrival(watch.live, userId, arrive)
  return { watch, access: lubecCombatTabAccess(watch, role) }
}
