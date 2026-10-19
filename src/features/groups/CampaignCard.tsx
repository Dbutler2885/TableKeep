import type { ReactNode } from 'react'
import type { Campaign } from '../../types/app'
import { activateOnEnterOrSpace, campaignCardLabel } from './groupHomeCampaigns'

type CampaignCardProps = {
  campaign: Campaign
  status: string
  onOpen: () => void
  children: ReactNode
}

/** One campaign on the group home: opens on a click, Enter or Space, with its action buttons underneath. */
export function CampaignCard({ campaign, status, onOpen, children }: CampaignCardProps) {
  return (
    <div
      className="group-home-card group-home-card-interactive"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => activateOnEnterOrSpace(event, onOpen)}
    >
      <strong>{campaign.name}</strong>
      <p>{campaignCardLabel(campaign, status)}</p>
      <div className="group-actions group-card-actions">{children}</div>
    </div>
  )
}
