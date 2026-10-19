import type { Campaign } from '../../types/app'
import { CampaignCard } from './CampaignCard'
import { withoutOpeningCard } from './groupHomeCampaigns'

type ActiveCampaignSectionProps = {
  campaign: Campaign | null
  onOpen: () => void
  onDeactivate: (campaign: Campaign) => void
}

export function ActiveCampaignSection({ campaign, onOpen, onDeactivate }: ActiveCampaignSectionProps) {
  return (
    <div className="group-home-section is-active">
      <h2>Active Campaign</h2>
      {campaign ? (
        <CampaignCard campaign={campaign} status="active" onOpen={onOpen}>
          <button type="button" onClick={withoutOpeningCard(() => onDeactivate(campaign))}>
            Deactivate
          </button>
        </CampaignCard>
      ) : (
        <div className="group-home-card group-home-card-muted">
          <p>No active campaign.</p>
        </div>
      )}
    </div>
  )
}
