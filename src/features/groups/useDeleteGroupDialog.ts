import { useState } from 'react'
import type { BusyAction } from './useBusyAction'

/** The two-step group delete: the first step asks, the second deletes. */
export function useDeleteGroupDialog({ busy, setError, run }: BusyAction, deleteGroup: () => Promise<void>) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)

  return {
    open,
    confirming,
    show: () => {
      setConfirming(false)
      setError(null)
      setOpen(true)
    },
    cancel: () => {
      if (busy) return
      setOpen(false)
      setError(null)
    },
    advance: () => {
      setError(null)
      setConfirming(true)
    },
    back: () => {
      if (busy) return
      setConfirming(false)
      setError(null)
    },
    // The group home is leaving once the group is gone, so it stays busy.
    confirm: () => run(deleteGroup, { fallback: 'Unable to delete group.', staysBusy: true }),
  }
}
