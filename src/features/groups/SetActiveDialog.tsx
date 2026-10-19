import type { Campaign } from '../../types/app'
import { ConfirmDialog } from './GroupDialog'

type SetActiveDialogProps = {
  campaign: Campaign
  activeCampaign: Campaign | null
  busy: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}

export function SetActiveDialog({ campaign, activeCampaign, busy, error, onCancel, onConfirm }: SetActiveDialogProps) {
  return (
    <ConfirmDialog
      title="Set active"
      error={error}
      busy={busy}
      onCancel={onCancel}
      confirmLabel="Set active"
      busyLabel="Setting…"
      confirmClassName="primary"
      confirmDisabled={busy}
      onConfirm={onConfirm}
    >
      <p>
        Make <strong>{campaign.name}</strong> the active campaign?
      </p>
      {activeCampaign ? (
        <p><strong>{activeCampaign.name}</strong> will be deactivated.</p>
      ) : null}
    </ConfirmDialog>
  )
}
