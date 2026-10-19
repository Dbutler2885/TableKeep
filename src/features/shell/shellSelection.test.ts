import { describe, expect, it } from 'vitest'
import type { Campaign, GroupRecord } from '../../types/app'
import { campaignIds, campaignRole, campaignSystem, findCampaign, findGroup, groupCampaigns, shellTheme } from './shellSelection'

const campaign = (id: string, overrides: Partial<Campaign> = {}): Campaign => ({
  id,
  name: id,
  status: 'active',
  groupId: 'g1',
  gmUserId: 'gm-1',
  ...overrides,
})

const active = campaign('active')
const draft = campaign('draft', { status: 'draft' })
const inactive = campaign('inactive', { status: 'inactive' })

const group = (overrides: Partial<GroupRecord> = {}): GroupRecord => ({
  id: 'g1',
  name: 'Home Boys',
  slug: 'home-boys',
  activeCampaignId: 'active',
  activeCampaign: active,
  drafts: [draft],
  inactiveCampaigns: [inactive],
  memberRole: 'member',
  ...overrides,
})

describe('findGroup', () => {
  it('finds a group by id, or null', () => {
    const groups = [group(), group({ id: 'g2' })]

    expect(findGroup(groups, 'g2')).toBe(groups[1])
    expect(findGroup(groups, 'missing')).toBeNull()
    expect(findGroup(groups, null)).toBeNull()
  })
})

describe('groupCampaigns', () => {
  it('lists the active campaign, then drafts, then inactive campaigns', () => {
    expect(groupCampaigns(group())).toEqual([active, draft, inactive])
  })

  it('leaves out a missing active campaign', () => {
    expect(groupCampaigns(group({ activeCampaign: null }))).toEqual([draft, inactive])
  })
})

describe('findCampaign', () => {
  it('finds no campaign without a group', () => {
    expect(findCampaign(null, 'active')).toBeNull()
  })

  it('finds any campaign of the group by its route id', () => {
    expect(findCampaign(group(), 'active')).toBe(active)
    expect(findCampaign(group(), 'draft')).toBe(draft)
    expect(findCampaign(group(), 'inactive')).toBe(inactive)
    expect(findCampaign(group(), 'missing')).toBeNull()
  })

  it('falls back to the active campaign without a route id', () => {
    expect(findCampaign(group(), null)).toBe(active)
    expect(findCampaign(group({ activeCampaign: null }), null)).toBeNull()
  })
})

describe('campaignRole', () => {
  it('makes the campaign GM the gm and everyone else a player', () => {
    expect(campaignRole(active, 'gm-1')).toBe('gm')
    expect(campaignRole(active, 'player-1')).toBe('player')
    expect(campaignRole(campaign('x', { gmUserId: null }), 'player-1')).toBe('player')
  })

  it('has no role without a campaign', () => {
    expect(campaignRole(null, 'gm-1')).toBeNull()
  })
})

describe('campaignSystem', () => {
  it('reads VtM, and treats anything else as OSE', () => {
    expect(campaignSystem(campaign('x', { system: 'vtm' }))).toBe('vtm')
    expect(campaignSystem(campaign('x', { system: 'ose' }))).toBe('ose')
    expect(campaignSystem(campaign('x'))).toBe('ose')
    expect(campaignSystem(null)).toBe('ose')
  })
})

describe('campaignIds', () => {
  it('reads the ids a subscription needs', () => {
    expect(campaignIds(active)).toEqual({ campaignId: 'active', groupId: 'g1', gmUserId: 'gm-1' })
    expect(campaignIds(campaign('x', { gmUserId: undefined }))).toEqual({ campaignId: 'x', groupId: 'g1', gmUserId: null })
  })

  it('has only nulls without a campaign', () => {
    expect(campaignIds(null)).toEqual({ campaignId: null, groupId: null, gmUserId: null })
  })
})

describe('shellTheme', () => {
  it('themes an open VtM campaign route', () => {
    expect(shellTheme(active, 'active', 'vtm')).toBe('vtm')
    expect(shellTheme(active, 'active', 'ose')).toBe('default')
  })

  it('stays default without an open campaign route', () => {
    expect(shellTheme(active, null, 'vtm')).toBe('default')
    expect(shellTheme(null, 'active', 'vtm')).toBe('default')
  })
})
