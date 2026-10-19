import { useCallback } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { groupHomePath } from '../navigation/tabs'

type CampaignAction = (groupId: string, campaignId: string) => Promise<void>

type CampaignLifecycleOptions = {
  navigate: NavigateFunction
  selectedGroupId: string | null
  selectedCampaignId: string | null
  setActiveCampaign: CampaignAction
  deactivateCampaign: CampaignAction
  deleteDraftCampaign: CampaignAction
  deleteInactiveCampaign: CampaignAction
}

const routeShowsCampaign = (selectedGroupId: string | null, selectedCampaignId: string | null, groupId: string, campaignId: string) =>
  selectedGroupId === groupId && selectedCampaignId === campaignId

// Deleting the campaign the route is showing returns to the group home.
export function useCampaignLifecycle({
  navigate,
  selectedGroupId,
  selectedCampaignId,
  setActiveCampaign,
  deactivateCampaign,
  deleteDraftCampaign,
  deleteInactiveCampaign,
}: CampaignLifecycleOptions) {
  const handleSetActiveCampaign = useCallback(async (groupId: string, campaignId: string) => {
    await setActiveCampaign(groupId, campaignId)
  }, [setActiveCampaign])

  const handleDeleteDraftCampaign = useCallback(async (groupId: string, campaignId: string) => {
    await deleteDraftCampaign(groupId, campaignId)
    if (routeShowsCampaign(selectedGroupId, selectedCampaignId, groupId, campaignId)) {
      void navigate(groupHomePath(groupId), { replace: true })
    }
  }, [deleteDraftCampaign, navigate, selectedCampaignId, selectedGroupId])

  const handleDeactivateCampaign = useCallback(async (groupId: string, campaignId: string) => {
    await deactivateCampaign(groupId, campaignId)
  }, [deactivateCampaign])

  const handleDeleteInactiveCampaign = useCallback(async (groupId: string, campaignId: string) => {
    await deleteInactiveCampaign(groupId, campaignId)
    if (routeShowsCampaign(selectedGroupId, selectedCampaignId, groupId, campaignId)) {
      void navigate(groupHomePath(groupId), { replace: true })
    }
  }, [deleteInactiveCampaign, navigate, selectedCampaignId, selectedGroupId])

  return { handleSetActiveCampaign, handleDeleteDraftCampaign, handleDeactivateCampaign, handleDeleteInactiveCampaign }
}
