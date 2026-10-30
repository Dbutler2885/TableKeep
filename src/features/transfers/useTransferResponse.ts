import { useState } from 'react'

type TransferAction = (transferId: string) => Promise<void>

// Answering an incoming offer: which offer is being answered, and the last
// failure. Both outlive any one offer, so they belong to the notification.
export function useTransferResponse(acceptTransfer: TransferAction, declineTransfer: TransferAction) {
  const [busyTransferId, setBusyTransferId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const respond = async (transferId: string, action: TransferAction, fallbackMessage: string) => {
    setBusyTransferId(transferId)
    setError(null)
    try {
      await action(transferId)
    } catch (err) {
      setError(err instanceof Error ? err.message : fallbackMessage)
    } finally {
      setBusyTransferId('')
    }
  }

  return {
    busyTransferId,
    error,
    accept: (transferId: string) => respond(transferId, acceptTransfer, 'Failed to accept transfer.'),
    decline: (transferId: string) => respond(transferId, declineTransfer, 'Failed to decline transfer.'),
  }
}
