// Owns the campaign character subscription effect.
// Declare this hook before persistence and before the justSeeded clearing effect.

import { useEffect, useMemo, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { db } from '../../../firebase'
import type { CharacterRecord, Role } from '../../../types/app'
import { campaignCollectionRef } from '../../campaign/firestorePaths'
import type { CampaignPlayerOption, TransferTargetCharacter } from '../lib/characterTabTypes'

export function useCampaignCharacterDirectory(campaignId: string, groupId: string, gmUserId: string | null, role: Role | null) {
  const [allCampaignCharacters, setAllCampaignCharacters] = useState<TransferTargetCharacter[]>([])

  useEffect(() => {
    if (!campaignId) return
    const unsubscribe = onSnapshot(
      campaignCollectionRef(db, { campaignId, groupId }, 'characters'),
      (snapshot) => {
        const next = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as { name?: string; ownerUserId?: string; ownerUsername?: string | null; details?: CharacterRecord['details'] }
          return { id: docSnap.id, name: data.name ?? docSnap.id, ownerUserId: data.ownerUserId ?? '', ownerUsername: typeof data.ownerUsername === 'string' ? data.ownerUsername : null, details: data.details ?? null } satisfies TransferTargetCharacter
        }).filter((character) => role === 'gm' || character.ownerUserId !== gmUserId)
        setAllCampaignCharacters(next)
      },
      () => setAllCampaignCharacters([]),
    )
    return () => {
      unsubscribe()
      setAllCampaignCharacters([])
    }
  }, [campaignId, gmUserId, groupId, role])

  const campaignPlayers = useMemo<CampaignPlayerOption[]>(() => {
    const byUser = new Map<string, CampaignPlayerOption>()
    for (const character of allCampaignCharacters) {
      if (!character.ownerUserId || character.ownerUserId === gmUserId) continue
      if (!byUser.has(character.ownerUserId)) byUser.set(character.ownerUserId, { userId: character.ownerUserId, username: character.ownerUsername ?? null })
    }
    return [...byUser.values()].sort((a, b) => (a.username ?? a.userId).localeCompare(b.username ?? b.userId))
  }, [allCampaignCharacters, gmUserId])

  return { allCampaignCharacters, campaignPlayers }
}
