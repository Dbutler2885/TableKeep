import { useEffect, useRef, useState } from 'react'
import { onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../../../firebase'
import { campaignDocRef, type CampaignScope } from '../../campaign/firestorePaths'
import type { LubecCharacterSheet } from '../../ruleSets/lubec/characterRecord'
import { lubecNpcFightSummary, readLubecNpcFightSummary, type LubecNpcFightSummary } from './lubecNpcFightSummary'

const npcRef = (scope: CampaignScope, npcId: string) => campaignDocRef(db, scope, 'npcs', npcId)

type SeenSummary = { npcId: string; summary: LubecNpcFightSummary | null }

/**
 * The public summary of the NPC a player attacks, for as long as they do. The
 * rules refuse an NPC not shown to players, which reads as having none.
 */
export function useLubecNpcFightSummary({ campaignId, groupId }: CampaignScope, npcId: string | null) {
  const [seen, setSeen] = useState<SeenSummary | null>(null)
  useEffect(() => {
    if (!npcId) return undefined
    const onRead = (summary: LubecNpcFightSummary | null) => setSeen({ npcId, summary })
    return onSnapshot(
      npcRef({ campaignId, groupId }, npcId),
      (snap) => onRead(readLubecNpcFightSummary(snap.data()?.fightSummary)),
      () => onRead(null),
    )
  }, [campaignId, groupId, npcId])
  return seen?.npcId === npcId ? seen.summary : null
}

type KeptSummary = {
  scope: CampaignScope
  npcId: string
  /** The sheet as the GM's session holds it; null without one. */
  sheet: LubecCharacterSheet | null
  loading: boolean
  setError: (message: string) => void
}

/** The GM's client keeps the NPC's public summary when the sheet's gear changes; opening a sheet writes nothing. */
export function useKeepLubecNpcFightSummary({ scope: { campaignId, groupId }, npcId, sheet, loading, setError }: KeptSummary) {
  const summary = JSON.stringify(lubecNpcFightSummary(sheet))
  const kept = useRef<string | null>(null)
  useEffect(() => {
    if (loading) return
    const first = kept.current === null
    const changed = kept.current !== summary
    kept.current = summary
    if (first || !changed) return
    const fightSummary = JSON.parse(summary) as LubecNpcFightSummary
    setDoc(npcRef({ campaignId, groupId }, npcId), { fightSummary }, { merge: true })
      .catch(() => setError('Could not update what players see of this NPC\'s armor.'))
  }, [campaignId, groupId, npcId, summary, loading, setError])
}
