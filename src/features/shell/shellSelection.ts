import type { GameSystem } from '../navigation/tabs'
import { resolveRuleSet, ruleSets, type ShellTheme } from '../ruleSets/registry'
import type { Campaign, GroupRecord, Role } from '../../types/app'

export type CampaignIds = {
  campaignId: string | null
  groupId: string | null
  gmUserId: string | null
}

const NO_CAMPAIGN_IDS: CampaignIds = { campaignId: null, groupId: null, gmUserId: null }

export const findGroup = (groups: GroupRecord[], groupId: string | null): GroupRecord | null =>
  groups.find((group) => group.id === groupId) ?? null

// Every campaign a group holds, in the order a route id is looked up in.
export const groupCampaigns = (group: GroupRecord): Campaign[] => [
  ...(group.activeCampaign ? [group.activeCampaign] : []),
  ...group.drafts,
  ...group.inactiveCampaigns,
]

// A route without a campaign id falls back to the group's active campaign, so
// the group home still resolves a campaign (and its role and system).
export function findCampaign(group: GroupRecord | null, campaignId: string | null): Campaign | null {
  if (!group) return null
  if (campaignId) {
    return groupCampaigns(group).find((campaign) => campaign.id === campaignId) ?? null
  }
  return group.activeCampaign ?? null
}

export const campaignRole = (campaign: Campaign | null, userId: string): Role | null =>
  campaign ? (campaign.gmUserId === userId ? 'gm' : 'player') : null

export const campaignSystem = (campaign: Campaign | null): GameSystem => resolveRuleSet(campaign?.system).id

// useGroupAccess always sets a campaign's id and groupId from its document
// path, so only the GM can be missing.
export function campaignIds(campaign: Campaign | null): CampaignIds {
  if (!campaign) return NO_CAMPAIGN_IDS
  return { campaignId: campaign.id, groupId: campaign.groupId, gmUserId: campaign.gmUserId ?? null }
}

// Only an open campaign route takes on its rule set's skin; the group home
// stays default even when its active campaign is VtM.
export const shellTheme = (campaign: Campaign | null, selectedCampaignId: string | null, gameSystem: GameSystem): ShellTheme =>
  campaign && selectedCampaignId ? ruleSets[gameSystem].skin.theme : 'default'
