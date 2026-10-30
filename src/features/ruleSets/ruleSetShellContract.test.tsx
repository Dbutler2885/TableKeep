// @vitest-environment jsdom
/**
 * The rule-set contract, shell half: which sheet the character tab shows,
 * whether Maps embeds it, which skin the shell wears and who sees the Monsters
 * tab. The shell rows for OSE and VtM were recorded from the shell as it
 * stood before the registry declared any of them, so any change to them is a
 * visible change for a player or GM, not a refactor.
 */
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { User } from 'firebase/auth'
import type { Campaign, NpcRecord, Role } from '../../types/app'
import type { CharacterTabProps } from '../shell/characterTabProps'

const mocks = vi.hoisted(() => ({ props: {} as Record<string, Record<string, unknown>> }))

function stub(name: string) {
  return function Stub(props: Record<string, unknown>) {
    mocks.props[name] = props
    return createElement('div', { 'data-testid': name })
  }
}

vi.mock('../character/CharacterTab', () => ({ CharacterTab: stub('CharacterTab') }))
vi.mock('../character/VtmCharacterTab', () => ({ VtmCharacterTab: stub('VtmCharacterTab') }))
vi.mock('../lubec/LubecCharacterTab', () => ({ LubecCharacterTab: stub('LubecCharacterTab') }))
vi.mock('../lubec/fight/LubecMapFightHost', () => ({ LubecMapFightHost: ({ children }: { children: ReactNode }) => children }))
vi.mock('../lubec/LubecNpcSheetTab', () => ({ LubecNpcSheetTab: stub('LubecNpcSheetTab') }))
vi.mock('../common/RulesTab', () => ({ RulesTab: stub('RulesTab') }))
vi.mock('../maps/MapsTab', () => ({ MapsTab: stub('MapsTab') }))
vi.mock('../maps/components/MapNpcSheetOverlay', () => ({
  MapNpcSheetProvider: (props: { children: ReactNode }) => {
    mocks.props.MapNpcSheetProvider = props
    return props.children
  },
}))
vi.mock('../monsters/MonstersTab', () => ({ MonstersTab: stub('MonstersTab') }))
vi.mock('../items/ItemsTab', () => ({ ItemsTab: stub('ItemsTab') }))
vi.mock('../lubec/items/LubecItemsTab', () => ({ LubecItemsTab: stub('LubecItemsTab') }))
vi.mock('../npcs/NpcsTab', () => ({ NpcsTab: stub('NpcsTab') }))
vi.mock('../tables/TablesTab', () => ({ TablesTab: stub('TablesTab') }))
vi.mock('../notes/NotesTab', () => ({ NotesTab: stub('NotesTab') }))
vi.mock('../notes/CalendarTab', () => ({ CalendarTab: stub('CalendarTab') }))

const { CampaignTabContent } = await import('../shell/CampaignTabContent')
const { campaignSystem, shellTheme } = await import('../shell/shellSelection')
const { ruleSets } = await import('./registry')
const { LubecNpcSheet, LubecSheet, OseSheet, VtmSheet } = await import('./RuleSetSheets')
const { ruleSetNpcSheets, ruleSetSheets } = await import('./sheetComponents')
const { oseMonsterRuleset } = await import('../monsters/rulesets')

const setError = () => undefined

// A campaign stores its rule set as a raw `system` string; the shell resolves
// it before choosing anything.
const campaignOf = (stored: string): Campaign =>
  ({ id: 'c1', name: 'Wyrm', status: 'active', groupId: 'g1', gmUserId: 'gm-1', system: stored })

// The shell builds the OSE character state for every open campaign, whatever
// its rule set, so each row gets it and the rule set decides what uses it.
const characterTabProps = { campaignId: 'c1', characters: [] } as unknown as CharacterTabProps

const renderTab = (stored: string, activeTab: 'character' | 'maps' | 'monsters' | 'npcs', role: Role | null = 'gm') => {
  const campaign = campaignOf(stored)
  return render(
    <CampaignTabContent
      activeTab={activeTab}
      campaign={campaign}
      role={role}
      gameSystem={campaignSystem(campaign)}
      user={{ uid: 'user-1' } as User}
      username="handle1"
      setError={setError}
      characters={[]}
      characterTabProps={characterTabProps}
    />,
  )
}

const rendered = (container: HTMLElement) => [...container.querySelectorAll('[data-testid]')].map((node) => node.getAttribute('data-testid'))

afterEach(() => {
  cleanup()
  mocks.props = {}
})

describe('declarations', () => {
  it.each([
    ['ose', OseSheet, true, null, 'default'],
    ['vtm', VtmSheet, false, null, 'vtm'],
    ['lubec', LubecSheet, false, LubecNpcSheet, 'lubec'],
  ] as const)('%s declares its sheet, whether Maps embeds it, its NPC sheet and its skin', (id, component, embeddable, npcSheet, theme) => {
    expect(ruleSetSheets[id]).toBe(component)
    expect(ruleSetNpcSheets[id]).toBe(npcSheet)
    expect(ruleSets[id].sheet).toEqual({ embeddable, npcSheet: npcSheet !== null })
    expect(ruleSets[id].skin.theme).toBe(theme)
  })

  it.each(['ose', 'vtm'] as const)('%s declares the OSE monster statline', (id) => {
    expect(ruleSets[id].monsters).toBe(oseMonsterRuleset)
  })

  it('Lubec declares no monsters', () => {
    expect(ruleSets.lubec.monsters).toBeNull()
  })
})

describe('sheet', () => {
  it('OSE shows its character sheet with the shared character state', () => {
    const { container } = renderTab('ose', 'character')

    expect(rendered(container)).toEqual(['CharacterTab'])
    expect(mocks.props.CharacterTab).toEqual(characterTabProps)
  })

  it('VtM shows its own sheet, wired to the campaign and the viewer', () => {
    const { container } = renderTab('vtm', 'character', 'player')

    expect(rendered(container)).toEqual(['VtmCharacterTab'])
    expect(mocks.props.VtmCharacterTab).toEqual({
      campaignId: 'c1',
      groupId: 'g1',
      role: 'player',
      currentUserId: 'user-1',
      currentUsername: 'handle1',
      gmUserId: 'gm-1',
      setError,
    })
  })

  it('Lubec shows its own sheet, wired to the campaign and the viewer', () => {
    const { container } = renderTab('lubec', 'character', 'player')

    expect(rendered(container)).toEqual(['LubecCharacterTab'])
    expect(mocks.props.LubecCharacterTab).toEqual({
      campaignId: 'c1',
      groupId: 'g1',
      role: 'player',
      currentUserId: 'user-1',
      currentUsername: 'handle1',
      gmUserId: 'gm-1',
      setError,
    })
  })

  it.each([
    ['vtm', 'VtmCharacterTab'],
    ['lubec', 'LubecCharacterTab'],
  ] as const)('%s gives its sheet no GM when the campaign has none', (stored, sheet) => {
    const campaign: Campaign = { ...campaignOf(stored), gmUserId: undefined }
    render(
      <CampaignTabContent
        activeTab="character"
        campaign={campaign}
        role="player"
        gameSystem={stored}
        user={{ uid: 'user-1' } as User}
        username="handle1"
        setError={setError}
        characters={[]}
        characterTabProps={characterTabProps}
      />,
    )

    expect(mocks.props[sheet]).toMatchObject({ gmUserId: null })
  })
})

describe('sheet embedded in Maps', () => {
  it.each([
    ['ose', characterTabProps],
    ['vtm', undefined],
  ] as const)('%s maps get %j as the embedded sheet', (stored, embedded) => {
    renderTab(stored, 'maps')

    expect(mocks.props.MapsTab).toEqual({
      campaignId: 'c1',
      groupId: 'g1',
      role: 'gm',
      gmUserId: 'gm-1',
      characterTabProps: embedded,
    })
  })
})

describe('skin', () => {
  it.each([
    ['ose', 'default'],
    ['vtm', 'vtm'],
    ['lubec', 'lubec'],
    ['', 'default'],
    ['pathfinder', 'default'],
  ] as const)('an open campaign storing %j wears the %s skin', (stored, theme) => {
    const campaign = campaignOf(stored)
    expect(shellTheme(campaign, campaign.id, campaignSystem(campaign))).toBe(theme)
  })

  it.each(['ose', 'vtm', 'lubec'] as const)('the group home stays default when its active campaign is %s', (stored) => {
    const campaign = campaignOf(stored)
    expect(shellTheme(campaign, null, campaignSystem(campaign))).toBe('default')
    expect(shellTheme(null, campaign.id, campaignSystem(campaign))).toBe('default')
  })
})

describe('Monsters tab', () => {
  it.each([
    ['ose', 'gm', true],
    ['ose', 'player', false],
    ['ose', null, false],
    ['vtm', 'gm', true],
    ['vtm', 'player', true],
    ['vtm', null, true],
    ['lubec', 'gm', false],
    ['lubec', 'player', false],
  ] as const)('%s, viewed as %s: shown %s', (stored, role, shown) => {
    const { container } = renderTab(stored, 'monsters', role)

    expect(rendered(container)).toEqual(shown ? ['MonstersTab'] : [])
    if (shown) expect(mocks.props.MonstersTab).toEqual({ campaignId: 'c1', groupId: 'g1', role })
  })
})

describe('NPC character sheet', () => {
  const npc = { id: 'npc-1', name: 'Rene Dube' } as NpcRecord

  it('hands the Lubec GM\'s NPC tab a Character sheet tab that opens the NPC\'s sheet, wired to the campaign and the viewer', () => {
    renderTab('lubec', 'npcs', 'gm')
    const sheetTab = mocks.props.NpcsTab.sheetTab as (npc: NpcRecord) => ReturnType<typeof createElement>

    const { container } = render(sheetTab(npc))

    expect(rendered(container)).toEqual(['LubecNpcSheetTab'])
    expect(mocks.props.LubecNpcSheetTab).toEqual({
      npc,
      campaignId: 'c1',
      groupId: 'g1',
      role: 'gm',
      currentUserId: 'user-1',
      currentUsername: 'handle1',
      gmUserId: 'gm-1',
      setError,
    })
  })

  it.each([
    ['lubec', 'player'],
    ['lubec', null],
    ['ose', 'gm'],
    ['vtm', 'gm'],
  ] as const)('%s, viewed as %s: no Character sheet tab', (stored, role) => {
    renderTab(stored, 'npcs', role)

    expect(mocks.props.NpcsTab).toEqual({ campaignId: 'c1', groupId: 'g1', role, sheetTab: undefined })
  })

  it('lets the Lubec GM open an NPC\'s sheet over the map, wired as the NPC tab\'s is', () => {
    renderTab('lubec', 'maps', 'gm')
    const { scope, sheetFor } = mocks.props.MapNpcSheetProvider as { scope: unknown; sheetFor: (npc: NpcRecord) => ReturnType<typeof createElement> }

    const { container } = render(sheetFor(npc))

    expect(scope).toEqual({ campaignId: 'c1', groupId: 'g1' })
    expect(rendered(container)).toEqual(['LubecNpcSheetTab'])
    expect(mocks.props.LubecNpcSheetTab).toMatchObject({ npc, campaignId: 'c1', groupId: 'g1', role: 'gm', gmUserId: 'gm-1' })
  })

  it.each([
    ['lubec', 'player'],
    ['lubec', null],
    ['ose', 'gm'],
    ['vtm', 'gm'],
  ] as const)('%s map, viewed as %s: no NPC sheet to open from a token', (stored, role) => {
    renderTab(stored, 'maps', role)

    expect(mocks.props.MapNpcSheetProvider.sheetFor).toBeUndefined()
  })
})
