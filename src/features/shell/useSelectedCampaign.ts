import { useMemo } from 'react'
import type { GroupRecord } from '../../types/app'
import { findCampaign, findGroup } from './shellSelection'

export function useSelectedCampaign(groups: GroupRecord[], selectedGroupId: string | null, selectedCampaignId: string | null) {
  const selectedGroup = useMemo(() => findGroup(groups, selectedGroupId), [groups, selectedGroupId])
  const campaign = useMemo(() => findCampaign(selectedGroup, selectedCampaignId), [selectedCampaignId, selectedGroup])
  return { selectedGroup, campaign }
}
