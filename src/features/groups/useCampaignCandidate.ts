import { useState } from 'react'
import type { Campaign } from '../../types/app'
import type { BusyAction } from './useBusyAction'

/** One campaign confirmation (set active, deactivate, or a delete): the campaign it asks about, and its buttons. */
export function useCampaignCandidate(
  { busy, setError, run }: BusyAction,
  act: (campaignId: string) => Promise<void>,
  fallback: string,
) {
  const [candidate, setCandidate] = useState<Campaign | null>(null)

  return {
    candidate,
    ask: (campaign: Campaign) => {
      setError(null)
      setCandidate(campaign)
    },
    cancel: () => {
      if (busy) return
      setCandidate(null)
      setError(null)
    },
    confirm: async () => {
      if (!candidate) return
      await run(() => act(candidate.id), { fallback, onSuccess: () => setCandidate(null) })
    },
  }
}

export type CampaignCandidate = ReturnType<typeof useCampaignCandidate>
