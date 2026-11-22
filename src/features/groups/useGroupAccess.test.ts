import { describe, expect, it, vi } from 'vitest'

vi.mock('../../firebase', () => ({ db: {} }))

const { normalizeCampaign } = await import('./useGroupAccess')

describe('normalizeCampaign', () => {
  it('keeps every saved tab the app has, Combat, Clocks and Handouts included', () => {
    const saved = ['character', 'combat', 'maps', 'clocks', 'notes', 'handouts', 'calendar']
    expect(normalizeCampaign('c', 'g', { system: 'lubec', enabledTabs: saved }).enabledTabs).toEqual(saved)
  })

  it('drops saved tabs the app does not know, and anything that is not a tab name', () => {
    expect(normalizeCampaign('c', 'g', { enabledTabs: ['notes', 'tavern', 7, null] }).enabledTabs).toEqual(['notes'])
  })

  it('reads a campaign that never saved its tabs as having no list', () => {
    expect(normalizeCampaign('c', 'g', {}).enabledTabs).toBeUndefined()
    expect(normalizeCampaign('c', 'g', { enabledTabs: 'combat' }).enabledTabs).toBeUndefined()
  })

  it('keeps the stored text fields', () => {
    const data = { name: 'Gym', slug: 'gym', status: 'active', system: 'lubec', gmUserId: 'gm', theme: 'lubec' }
    expect(normalizeCampaign('c', 'g', data)).toEqual({ id: 'c', groupId: 'g', ...data, enabledTabs: undefined })
  })

  it('falls back for missing or malformed fields: the id as the name, inactive, and no GM', () => {
    expect(normalizeCampaign('c', 'g', { name: 3, slug: null, status: false, system: 1, gmUserId: {}, theme: [] })).toEqual({
      id: 'c', groupId: 'g', name: 'c', slug: undefined, status: 'inactive', system: undefined, gmUserId: null, enabledTabs: undefined, theme: undefined,
    })
  })
})
