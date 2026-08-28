import { describe, expect, it } from 'vitest'
import type { CampaignPlayerOption, GrantTemplateEntry } from './characterTabTypes'

describe('character tab domain types', () => {
  it('retains the grant and assignment data contracts', () => {
    const grant: GrantTemplateEntry = { key: 'rope', name: 'Rope', costGp: 1, qty: 1, kind: 'general' }
    const player: CampaignPlayerOption = { userId: 'u1', username: null }
    expect({ grant, player }).toEqual({ grant, player })
  })
})
