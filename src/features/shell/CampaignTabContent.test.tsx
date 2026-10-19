// @vitest-environment jsdom
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { User } from 'firebase/auth'
import type { Campaign } from '../../types/app'

const mocks = vi.hoisted(() => ({
  props: {} as Record<string, Record<string, unknown>>,
  mapRuleSet: null as unknown,
}))

function stub(name: string) {
  return function Stub(props: Record<string, unknown>) {
    mocks.props[name] = props
    return createElement('div', { 'data-testid': name })
  }
}

vi.mock('../character/CharacterTab', () => ({ CharacterTab: stub('CharacterTab') }))
vi.mock('../character/VtmCharacterTab', () => ({ VtmCharacterTab: stub('VtmCharacterTab') }))
vi.mock('../common/RulesTab', () => ({ RulesTab: stub('RulesTab') }))
vi.mock('../maps/MapsTab', async () => {
  const { useMapRuleSet } = await import('../maps/mapRuleSet')
  const MapsTab = stub('MapsTab')
  return {
    MapsTab: (props: Record<string, unknown>) => {
      mocks.mapRuleSet = useMapRuleSet()
      return MapsTab(props)
    },
  }
})
vi.mock('../monsters/MonstersTab', () => ({ MonstersTab: stub('MonstersTab') }))
vi.mock('../items/ItemsTab', () => ({ ItemsTab: stub('ItemsTab') }))
vi.mock('../npcs/NpcsTab', () => ({ NpcsTab: stub('NpcsTab') }))
vi.mock('../tables/TablesTab', () => ({ TablesTab: stub('TablesTab') }))
vi.mock('../notes/NotesTab', () => ({ NotesTab: stub('NotesTab') }))
vi.mock('../notes/CalendarTab', () => ({ CalendarTab: stub('CalendarTab') }))

const { CampaignTabContent } = await import('./CampaignTabContent')
const { ruleSets } = await import('../ruleSets/registry')

const campaign: Campaign = { id: 'c1', name: 'Wyrm', status: 'active', groupId: 'g1', gmUserId: 'gm-1' }

const context = {
  campaign,
  role: 'gm' as const,
  gameSystem: 'ose' as const,
  user: { uid: 'gm-1' } as User,
  username: 'gmhandle',
  setError: () => undefined,
  characters: [],
  characterTabProps: null,
}

afterEach(() => {
  cleanup()
  mocks.props = {}
  mocks.mapRuleSet = null
})

describe('CampaignTabContent', () => {
  it('renders no OSE character tab without the shared character state', () => {
    const { container } = render(<CampaignTabContent activeTab="character" {...context} />)

    expect(container.childElementCount).toBe(0)
  })

  it('gives the OSE maps tab no character state when there is none', () => {
    render(<CampaignTabContent activeTab="maps" {...context} />)

    expect(mocks.props.MapsTab).toMatchObject({ characterTabProps: undefined })
  })

  it.each(['ose', 'vtm'] as const)('gives everything inside the %s maps tab its rule set', (gameSystem) => {
    render(<CampaignTabContent activeTab="maps" {...context} gameSystem={gameSystem} />)

    expect(mocks.mapRuleSet).toBe(ruleSets[gameSystem])
  })
})
