import type { KeyboardEvent, MouseEvent } from 'react'
import type { Campaign, GroupRecord } from '../../types/app'
import { resolveRuleSet } from '../ruleSets/registry'

/** The line under a campaign card's name: its rule set's short label, then the card's status. */
export const campaignCardLabel = (campaign: Campaign, status: string) =>
  `${resolveRuleSet(campaign.system).shortLabel} · ${status}`

/** Opens a card from the keyboard the way a button opens: on Enter or Space. */
export function activateOnEnterOrSpace(event: KeyboardEvent, activate: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    activate()
  }
}

/** A button on a card does its own job without also opening the card underneath it. */
export const withoutOpeningCard = (action: () => void) => (event: MouseEvent) => {
  event.stopPropagation()
  action()
}

/** Whether deleting the group would also delete campaigns, which the delete warning says. */
export const groupHasCampaigns = (group: GroupRecord) =>
  Boolean(group.activeCampaign) || group.drafts.length > 0 || group.inactiveCampaigns.length > 0
