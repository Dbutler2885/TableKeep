import { useCallback, useState } from 'react'
import { useItemApprovals } from '../character/hooks/useItemApprovals'
import type { ItemApprovalRequest, Role } from '../../types/app'

// The GM's queue of player requests, and a busy flag that holds both buttons
// while one decision is being written.
export function useApprovalQueue(campaignId: string | null, groupId: string | null, role: Role | null, userId: string, enabled: boolean) {
  const { pendingRequests, approveRequest, rejectRequest } = useItemApprovals(campaignId, groupId, role, userId, enabled)
  const [approvalBusy, setApprovalBusy] = useState(false)

  const handleApprove = useCallback(async (request: ItemApprovalRequest) => {
    setApprovalBusy(true)
    try { await approveRequest(request) } catch (e) { console.error('Approve failed', e) }
    setApprovalBusy(false)
  }, [approveRequest])

  const handleReject = useCallback(async (request: ItemApprovalRequest) => {
    setApprovalBusy(true)
    try { await rejectRequest(request) } catch (e) { console.error('Reject failed', e) }
    setApprovalBusy(false)
  }, [rejectRequest])

  return { pendingRequests, approvalBusy, handleApprove, handleReject }
}
