import { createContext, use, useCallback, useState } from 'react'
import type { Campaign } from '../../../types/app'

type CombatErrors = { message: string | null; report: (message: string) => void; dismiss: () => void }

export const CombatErrorContext = createContext<CombatErrors>({ message: null, report: () => undefined, dismiss: () => undefined })
export const useCombatErrors = () => use(CombatErrorContext)

/** Fight failures belong to this campaign's Combat tab, independently of campaign access. */
export function useCampaignCombatErrors(campaign: Pick<Campaign, 'groupId' | 'id'> | null): CombatErrors {
  const campaignKey = campaign ? `${campaign.groupId}/${campaign.id}` : ''
  const [error, setError] = useState<{ key: string; message: string } | null>(null)
  const report = useCallback((message: string) => setError({ key: campaignKey, message }), [campaignKey])
  const dismiss = useCallback(() => setError(null), [])
  return { message: error?.key === campaignKey ? error.message : null, report, dismiss }
}
