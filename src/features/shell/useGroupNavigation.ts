import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { campaignTabPath, groupHomePath, groupPickerPath } from '../navigation/tabs'
import type { GroupRecord } from '../../types/app'
import { findGroup } from './shellSelection'

type GroupNavigationOptions = {
  groups: GroupRecord[]
  navigate: NavigateFunction
  selectedGroupId: string | null
  setDrawerOpen: Dispatch<SetStateAction<boolean>>
  createGroup: (name: string) => Promise<string>
  createCampaign: (groupId: string, name: string, system: string) => Promise<unknown>
  deleteGroup: (groupId: string) => Promise<void>
}

// Choosing a group opens its active campaign when it has one, and its home
// otherwise.
export function groupEntryPath(groups: GroupRecord[], groupId: string): string {
  const activeCampaign = findGroup(groups, groupId)?.activeCampaign
  return activeCampaign ? campaignTabPath(groupId, activeCampaign.id, 'character') : groupHomePath(groupId)
}

export function useGroupNavigation({ groups, navigate, selectedGroupId, setDrawerOpen, createGroup, createCampaign, deleteGroup }: GroupNavigationOptions) {
  const handleSelectGroup = useCallback((groupId: string) => {
    void navigate(groupEntryPath(groups, groupId), { replace: true })
    setDrawerOpen(false)
  }, [groups, navigate, setDrawerOpen])

  const handleCreateGroup = useCallback(async (name: string) => {
    const groupId = await createGroup(name)
    void navigate(groupHomePath(groupId), { replace: true })
  }, [createGroup, navigate])

  const handleCreateCampaign = useCallback(async (groupId: string, name: string, system: string) => {
    await createCampaign(groupId, name, system)
    void navigate(groupHomePath(groupId), { replace: true })
  }, [createCampaign, navigate])

  const handleDeleteGroup = useCallback(async (groupId: string) => {
    await deleteGroup(groupId)
    void navigate(groupPickerPath, { replace: true })
  }, [deleteGroup, navigate])

  const handleOpenCampaign = useCallback((campaignId: string) => {
    if (!selectedGroupId) return
    void navigate(campaignTabPath(selectedGroupId, campaignId, 'character'), { replace: true })
  }, [navigate, selectedGroupId])

  const openActiveCampaign = useCallback((group: GroupRecord) => {
    if (group.activeCampaign) {
      void navigate(campaignTabPath(group.id, group.activeCampaign.id, 'character'), { replace: true })
    }
  }, [navigate])

  return { handleSelectGroup, handleCreateGroup, handleCreateCampaign, handleDeleteGroup, handleOpenCampaign, openActiveCampaign }
}
