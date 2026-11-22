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
  })
})
