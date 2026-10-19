// Owns the campaign character subscription effect.
// Declare this hook before persistence and before the justSeeded clearing effect.

import { useEffect, useMemo, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { db } from '../../../firebase'
import type { Role } from '../../../types/app'
import { campaignCollectionRef } from '../../campaign/firestorePaths'
import { campaignPlayersFrom, readDirectorySnapshot } from '../lib/campaignCharacterDirectory'
import type { CampaignPlayerOption, TransferTargetCharacter } from '../lib/characterTabTypes'

export function useCampaignCharacterDirectory(campaignId: string, groupId: string, gmUserId: string | null, role: Role | null) {
  const [allCampaignCharacters, setAllCampaignCharacters] = useState<TransferTargetCharacter[]>([])

  useEffect(() => {
    if (!campaignId) return
    const unsubscribe = onSnapshot(
      campaignCollectionRef(db, { campaignId, groupId }, 'characters'),
      (snapshot) => setAllCampaignCharacters(readDirectorySnapshot(snapshot.docs, role, gmUserId)),
      () => setAllCampaignCharacters([]),
    )
    return () => {
      unsubscribe()
      setAllCampaignCharacters([])
    }
  }, [campaignId, gmUserId, groupId, role])

  const campaignPlayers = useMemo<CampaignPlayerOption[]>(
    () => campaignPlayersFrom(allCampaignCharacters, gmUserId),
    [allCampaignCharacters, gmUserId],
  )

  return { allCampaignCharacters, campaignPlayers }
}
