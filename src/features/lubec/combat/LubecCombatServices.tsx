import { useEffect, useMemo, useRef, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { db } from '../../../firebase'
import { campaignDocRef, type CampaignScope } from '../../campaign/firestorePaths'
import type { Campaign, Role } from '../../../types/app'
import { combatantPaths, combatantSheets } from './combatantSheets'
import { gmCommandKey, gmEnvelope } from './combatEnvelopes'
import { useLubecCombat, type LubecLiveFight } from './combatWatch'
import type { CombatState } from './engine/types'
import { createCombatCommand } from './commandJournal'
import { combatSummariesStale } from './engine/summaries'
import { useLubecCombatSend } from './useLubecCombatSend'

type Docs = Map<string, Record<string, unknown> | null>
type Seen = { key: string; docs: Docs }

// One document's latest read, added to what has been read under the same key.
function withDoc(current: Seen | null, key: string, path: string, data: Record<string, unknown> | null): Seen {
  const docs: Docs = new Map(current?.key === key ? current.docs : [])
  return { key, docs: docs.set(path, data) }
}

const complete = (seen: Seen | null, key: string, count: number): Docs | null =>
  (seen?.key === key && seen.docs.size === count ? seen.docs : null)

/** Every listed campaign document, kept current; null until each has been read once. */
function useCampaignDocs(scope: CampaignScope, paths: readonly string[]) {
  const key = JSON.stringify([scope.groupId, scope.campaignId, paths])
  const [seen, setSeen] = useState<Seen | null>(null)
  useEffect(() => {
    const [groupId, campaignId, listed] = JSON.parse(key) as [string, string, string[]]
    const stops = listed.map((path) => onSnapshot(
      campaignDocRef(db, { groupId, campaignId }, path),
      (snap) => setSeen((current) => withDoc(current, key, path, snap.data() ?? null)),
      () => undefined,
    ))
    return () => stops.forEach((stop) => stop())
  }, [key])
  return complete(seen, key, paths.length)
}

/** The refresh to try for these reads: none while reading, while current, or when this exact difference was tried. */
function refreshAttempt(state: CombatState, docs: Docs | null, tried: string | null): string | null {
  if (!docs) return null
  const sheets = combatantSheets(state.combatants, docs)
  const attempt = JSON.stringify([state.combatants, sheets])
  return attempt !== tried && combatSummariesStale(state, sheets) ? attempt : null
}

const CURRENT = 'Public summaries are current.'

type RefresherProps = { scope: CampaignScope; live: LubecLiveFight; userId: string; setError: (message: string) => void }

/** The GM's client republishes a combatant's name, face, Speed and armor when its sheet changes them. */
function SummaryRefresher({ scope, live, userId, setError }: RefresherProps) {
  const { state } = live.fight
  const paths = useMemo(() => state.combatants.flatMap(combatantPaths), [state.combatants])
  const docs = useCampaignDocs(scope, paths)
  const send = useLubecCombatSend(userId)
  const tried = useRef<string | null>(null)
  useEffect(() => {
    const attempt = refreshAttempt(state, docs, tried.current)
    if (!attempt) return
    tried.current = attempt
    const payload = { type: 'refresh' }
    void send(gmCommandKey(live, payload), () => createCombatCommand(gmEnvelope(scope, crypto.randomUUID(), live), payload))
      .then((outcome) => { if (!outcome.ok && outcome.reason !== CURRENT) setError(outcome.reason) })
  }, [docs, state, live, scope, send, setError])
  return null
}

type ServicesProps = { campaign: Campaign | null; role: Role | null; userId: string; setError: (message: string) => void }

/** The fight work the GM's workspace does by itself, on whichever tab is open. */
export function LubecCombatServices({ campaign, role, userId, setError }: ServicesProps) {
  const { live } = useLubecCombat()
  const scope = useMemo(() => (campaign ? { groupId: campaign.groupId, campaignId: campaign.id } : null), [campaign])
  if (!scope || role !== 'gm' || !live) return null
  return <SummaryRefresher scope={scope} live={live} userId={userId} setError={setError} />
}
