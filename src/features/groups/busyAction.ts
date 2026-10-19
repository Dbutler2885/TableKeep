export type BusySetters = {
  setBusy: (busy: boolean) => void
  setError: (error: string | null) => void
}

type BusyActionOptions = {
  fallback: string
  onSuccess?: () => void
  /** Leave the screen busy after success, because the action takes the user away from it. */
  staysBusy?: boolean
}

export const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

/**
 * Runs one of the group home's actions: busy and no error while it runs, then
 * busy cleared and `onSuccess` on success, or the error shown on failure.
 */
export async function runBusyAction(
  { setBusy, setError }: BusySetters,
  action: () => Promise<void>,
  { fallback, onSuccess, staysBusy = false }: BusyActionOptions,
) {
  setBusy(true)
  setError(null)
  try {
    await action()
    if (staysBusy) return
    setBusy(false)
    onSuccess?.()
  } catch (err) {
    setError(errorMessage(err, fallback))
    setBusy(false)
  }
}
