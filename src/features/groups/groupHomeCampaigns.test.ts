import { describe, expect, it, vi } from 'vitest'
import type { KeyboardEvent, MouseEvent } from 'react'
import type { Campaign, GroupRecord } from '../../types/app'
import { activateOnEnterOrSpace, campaignCardLabel, groupHasCampaigns, withoutOpeningCard } from './groupHomeCampaigns'

const campaign = (system: string | undefined) => ({ id: 'c1', name: 'C', status: 'draft', groupId: 'g1', system }) as Campaign

describe('campaignCardLabel', () => {
  it('upper-cases the stored rule-set id before the status', () => {
    expect(campaignCardLabel(campaign('ose'), 'active')).toBe('OSE · active')
    expect(campaignCardLabel(campaign('vtm'), 'private draft')).toBe('VTM · private draft')
  })

  it('leaves the id blank when none is stored', () => {
    expect(campaignCardLabel(campaign(undefined), 'inactive')).toBe(' · inactive')
    expect(campaignCardLabel(campaign(''), 'inactive')).toBe(' · inactive')
  })
})

describe('activateOnEnterOrSpace', () => {
  const press = (key: string) => {
    const event = { key, preventDefault: vi.fn() }
    const activate = vi.fn()
    activateOnEnterOrSpace(event as unknown as KeyboardEvent, activate)
    return { prevented: event.preventDefault.mock.calls.length, activated: activate.mock.calls.length }
  }

  it('activates on Enter and Space instead of the browser default', () => {
    expect(press('Enter')).toEqual({ prevented: 1, activated: 1 })
    expect(press(' ')).toEqual({ prevented: 1, activated: 1 })
  })

  it('leaves every other key alone', () => {
    expect(press('a')).toEqual({ prevented: 0, activated: 0 })
    expect(press('Tab')).toEqual({ prevented: 0, activated: 0 })
  })
})

describe('withoutOpeningCard', () => {
  it('stops the click reaching the card, then runs the action', () => {
    const order: string[] = []
    const event = { stopPropagation: () => order.push('stopped') } as unknown as MouseEvent

    withoutOpeningCard(() => order.push('action'))(event)

    expect(order).toEqual(['stopped', 'action'])
  })
})

describe('groupHasCampaigns', () => {
  const group = (overrides: Partial<GroupRecord>) =>
    ({ activeCampaign: null, drafts: [], inactiveCampaigns: [], ...overrides }) as unknown as GroupRecord

  it('is false for a group with no campaigns at all', () => {
    expect(groupHasCampaigns(group({}))).toBe(false)
  })

  it('counts an active campaign, a draft or an inactive campaign', () => {
    expect(groupHasCampaigns(group({ activeCampaign: campaign('ose') }))).toBe(true)
    expect(groupHasCampaigns(group({ drafts: [campaign('ose')] }))).toBe(true)
    expect(groupHasCampaigns(group({ inactiveCampaigns: [campaign('ose')] }))).toBe(true)
  })
})
