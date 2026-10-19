import type { ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import type { Campaign } from '../../types/app'
import { CampaignCard } from './CampaignCard'
import { withoutOpeningCard } from './groupHomeCampaigns'

type CampaignListSectionProps = {
  title: string
  headerAction?: ReactNode
  campaigns: Campaign[]
  status: string
  emptyText: string
  /** Read before the campaign's name on its delete button, as its label and tooltip. */
  deleteLabel: string
  onOpenCampaign: (campaignId: string) => void
  onSetActive: (campaign: Campaign) => void
  onDelete: (campaign: Campaign) => void
}

/** The drafts or the inactive campaigns: each card can be set active or deleted. */
export function CampaignListSection({
  title,
  headerAction,
  campaigns,
  status,
  emptyText,
  deleteLabel,
  onOpenCampaign,
  onSetActive,
  onDelete,
}: CampaignListSectionProps) {
  return (
    <div className="group-home-section">
      <div className="group-section-header">
        <h2>{title}</h2>
        {headerAction}
      </div>
      {campaigns.length > 0 ? (
        <div className="group-card-list">
          {campaigns.map((campaign) => (
            <CampaignCard key={campaign.id} campaign={campaign} status={status} onOpen={() => onOpenCampaign(campaign.id)}>
              <button type="button" onClick={withoutOpeningCard(() => onSetActive(campaign))}>
                Set active
              </button>
              <button
                type="button"
                className="group-icon-button"
                aria-label={`${deleteLabel} ${campaign.name}`}
                title={`${deleteLabel} ${campaign.name}`}
                onClick={withoutOpeningCard(() => onDelete(campaign))}
              >
                <Trash2 size={16} />
              </button>
            </CampaignCard>
          ))}
        </div>
      ) : (
        <div className="group-home-card group-home-card-muted">
          <p>{emptyText}</p>
        </div>
      )}
    </div>
  )
}
