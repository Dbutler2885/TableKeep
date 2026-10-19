import { useEffect, useMemo } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { campaignTabPath } from '../navigation/tabs'
import type { GameSystem } from '../navigation/tabs'
import type { AppTab, Campaign, Role } from '../../types/app'
import { campaignNavTabs, routableTab } from './shellTabs'

// The side nav's tabs, and the route gate that keeps a campaign on the tabs its
// system has.
export function useCampaignNav(campaign: Campaign | null, gameSystem: GameSystem, role: Role | null, activeTab: AppTab, navigate: NavigateFunction) {
  const visibleTabs = useMemo(
    () => campaignNavTabs(gameSystem, role, campaign?.enabledTabs),
    [role, campaign?.enabledTabs, gameSystem],
  )

  // Hard-gate routes by system: a VtM campaign has no items/tables/rules routes,
  // so redirect direct navigation there back to the character tab.
  useEffect(() => {
    if (!campaign) return
    const target = routableTab(gameSystem, activeTab)
    if (target !== activeTab) {
      void navigate(campaignTabPath(campaign.groupId, campaign.id, target), { replace: true })
    }
  }, [activeTab, campaign, gameSystem, navigate])

  return visibleTabs
}
