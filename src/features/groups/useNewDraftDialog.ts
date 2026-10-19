import { useState } from 'react'
import type { BusyAction } from './useBusyAction'

export function useNewDraftDialog({ busy, setError, run }: BusyAction, create: (name: string, system: string) => Promise<void>) {
  const [open, setOpen] = useState(false)

  return {
    open,
    // Opening leaves any error another dialog left behind.
    show: () => setOpen(true),
    cancel: () => {
      if (busy) return
      setOpen(false)
      setError(null)
    },
    create: (name: string, system: string) =>
      run(() => create(name, system), { fallback: 'Unable to create campaign.', onSuccess: () => setOpen(false) }),
  }
}

export type NewDraft = ReturnType<typeof useNewDraftDialog>
