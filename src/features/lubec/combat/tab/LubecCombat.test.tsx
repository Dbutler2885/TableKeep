// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { User } from 'firebase/auth'
import type { Campaign, NpcRecord, Role } from '../../../../types/app'
import { lubecCharacterSheet } from '../../../ruleSets/lubec/sheetFixtures'
import { parseLubecGmItem, type LubecGmItem } from '../../../ruleSets/lubec/gear/gmItem'
import { takeOpenRequest } from '../../../navigation/openRequest'
import { LubecCombatContext, type LubecCombatWatch } from '../combatWatch'
import { planCombatCommand } from '../engine/lifecycle'
import type { CombatCommand, CombatOutcome, CombatSheet } from '../engine/types'

const mocks = vi.hoisted(() => ({
  sent: [] as CombatCommand[],
  outcome: { ok: true, fightId: 'fight', generatedIds: [], rolls: [] } as CombatOutcome,
  data: null as unknown,
}))

vi.mock('../useLubecCombatSend', () => ({
  useLubecCombatSend: () => async (_key: string, make: () => CombatCommand) => {
    mocks.sent.push(make())
    return mocks.outcome
  },
}))
vi.mock('./useCombatGmData', () => ({ useCombatGmData: () => mocks.data }))
vi.mock('./useCombatPlayerRoster', () => ({ useCombatPlayerRoster: () => ({ characters: [], npcs: [] }) }))

const { LubecCombat } = await import('./LubecCombat')

const campaign: Campaign = { id: 'gym', name: 'Gym', status: 'active', groupId: 'school', gmUserId: 'gm' }
const sheet = (kind: 'character' | 'npc', sheetId: string, name: string, ownerUserId: string, base = {}): CombatSheet =>
  ({ kind, sheetId, name, ownerUserId, portraitPath: '', sheet: lubecCharacterSheet({ base: { ...lubecCharacterSheet().base, ...base } }) })
const wayne = sheet('character', 'wayne', 'Wayne Gardner', 'wayne-uid')
const joseph = sheet('character', 'joseph', 'Joseph Pelkey', 'wayne-uid', { Body: null })
const roy = sheet('npc', 'roy', 'Roy Carver', 'gm')
const npc = (id: string, name: string, title: string) => ({ id, name, title }) as NpcRecord
const item = (id: string, fields: Record<string, unknown>): LubecGmItem =>
  parseLubecGmItem({ name: 'Dodgeball', kind: 'weapon', mode: 'thrown', table: 'dodgeball', size: 1, qty: 1, catchChance: 50, catchPutsThrowerOut: true, ...fields }, id)
const items = [item('library-ball', { status: 'library' }), item('lost-balls', { status: 'dropped', qty: 3 }), item('rock', { name: 'Fist-sized rock', table: 'thrown', catchChance: 10, catchPutsThrowerOut: false, status: 'library' })]

function liveFight(floor = [{ itemId: 'library-ball', status: 'library', qty: 1 }, { itemId: 'lost-balls', status: 'dropped', qty: 2 }]) {
  const command: CombatCommand = {
    envelope: { id: 'start', groupId: 'school', campaignId: 'gym', fightId: 'fight', round: 0, phase: 'setup', stageInstanceId: 'setup', actorKey: null, interactionSequence: 0 },
    seed: 'seed', payload: { type: 'start', combatants: [{ kind: 'character', sheetId: 'wayne' }, { kind: 'npc', sheetId: 'roy' }], floor, dodgeball: true },
  }
  const plan = planCombatCommand(command, { activeFightId: null, fight: null, sheets: [wayne, roy], items: new Map(items.map((entry) => [entry.id, entry])) }, { userId: 'gm', isGm: true })
  return { id: 'fight', fight: plan.fight }
}

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>
}

const tree = (role: Role, userId: string, watch: LubecCombatWatch, setError: (message: string) => void = () => undefined) => (
  <MemoryRouter initialEntries={['/groups/school/campaigns/gym/combat']}>
    <LubecCombatContext value={watch}>
      <Routes><Route path="*" element={<><LubecCombat campaign={campaign} role={role} user={{ uid: userId } as User} username="someone" setError={setError} characterTabProps={null} /><Where /></>} /></Routes>
    </LubecCombatContext>
  </MemoryRouter>
)

const show = (role: Role, userId: string, watch: LubecCombatWatch, setError?: (message: string) => void) => render(tree(role, userId, watch, setError))

const idle: LubecCombatWatch = { enabled: true, ready: true, live: null }
const live = (fight = liveFight()): LubecCombatWatch => ({ enabled: true, ready: true, live: fight })

beforeEach(() => {
  mocks.sent = []
  mocks.outcome = { ok: true, fightId: 'fight', generatedIds: [], rolls: [] }
  mocks.data = { characters: [wayne, joseph], npcs: [{ npc: npc('roy', 'Roy Carver', 'Linebacker'), sheet: roy }, { npc: npc('coach', 'Coach Ballard', 'Referee'), sheet: null }], items, roster: { characters: [], npcs: [] } }
  window.sessionStorage.clear()
})
afterEach(cleanup)

const button = (name: string) => screen.getByRole('button', { name })
const chooseItem = (label: string, scope: HTMLElement = document.body) => {
  const select = within(scope).getByRole('combobox', { name: 'Your Items' }) as HTMLSelectElement
  const option = [...select.options].find((entry) => entry.textContent === label)!
  fireEvent.change(select, { target: { value: option.value } })
}

describe('GM setup, moment 1', () => {
  it('keeps selections local until Start, then sends one Start with library counts as whole-stack copies', async () => {
    show('gm', 'gm', idle)
    expect((button('Start Combat') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(button('Wayne Gardner fights'))
    fireEvent.click(button('Roy Carver fights'))
    chooseItem('Dodgeball (catch 50%)')
    fireEvent.click(button('Place on Floor'))
    fireEvent.click(button('More Dodgeball'))
    chooseItem('Dodgeball (catch 50%) · dropped ×3')
    fireEvent.click(button('Place on Floor'))
    expect(screen.getByText('2 in the fight · 3 dodgeballs on the Floor')).toBeTruthy()
    expect(mocks.sent).toEqual([])
    fireEvent.click(button('Start Combat'))
    await waitFor(() => expect(mocks.sent).toHaveLength(1))
    expect(mocks.sent[0].envelope).toMatchObject({ groupId: 'school', campaignId: 'gym', round: 0, phase: 'setup', actorKey: null })
    expect(mocks.sent[0].payload).toEqual({
      type: 'start', dodgeball: true,
      combatants: [{ kind: 'character', sheetId: 'wayne' }, { kind: 'npc', sheetId: 'roy' }],
      floor: [{ itemId: 'library-ball', status: 'library', qty: 1 }, { itemId: 'library-ball', status: 'library', qty: 1 }, { itemId: 'lost-balls', status: 'dropped', qty: 1 }],
    })
  })

  it('caps a dropped pick at its record and lets the count fall back to nothing', () => {
    show('gm', 'gm', idle)
    chooseItem('Dodgeball (catch 50%) · dropped ×3')
    fireEvent.click(button('Place on Floor'))
    for (let press = 0; press < 5; press++) fireEvent.click(button('More Dodgeball'))
    expect(screen.getByText('0 in the fight · 3 dodgeballs on the Floor')).toBeTruthy()
    for (let press = 0; press < 3; press++) fireEvent.click(button('Fewer Dodgeball'))
    expect(screen.getByText('Nothing on the Floor yet.')).toBeTruthy()
  })

  it('names each missing input and repairs it from a link to that sheet', () => {
    show('gm', 'gm', idle)
    fireEvent.click(button('Joseph Pelkey fights'))
    expect(screen.getByRole('alert').textContent).toContain('Joseph Pelkey: missing Dodgeball Body; repair Body.')
    expect((button('Start Combat') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(button('Repair Joseph Pelkey'))
    expect(screen.getByTestId('where').textContent).toBe('/groups/school/campaigns/gym/character')
    expect(takeOpenRequest('character')).toBe('joseph')
  })

  it('lists NPCs with their titles, and an NPC without a sheet cannot be picked', () => {
    show('gm', 'gm', idle)
    expect(button('Roy Carver fights').closest('li')?.textContent).toBe('Roy CarverLinebacker, not fighting')
    expect(button('Wayne Gardner fights').closest('li')?.textContent).toBe('Wayne GardnerNot in this fight')
    fireEvent.click(button('Roy Carver fights'))
    expect(button('Roy Carver fights').closest('li')?.textContent).toBe('✓Roy CarverLinebacker · Speed 56')
    expect(screen.getByText('No sheet to fight with')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Coach Ballard fights' })).toBeNull()
  })

  it('shows a refused Start and keeps the setup', async () => {
    mocks.outcome = { ok: false, reason: 'A fight is already active.' }
    show('gm', 'gm', idle)
    fireEvent.click(button('Wayne Gardner fights'))
    fireEvent.click(button('Start Combat'))
    expect((await screen.findByRole('alert')).textContent).toBe('Combat did not start. A fight is already active.')
    expect(button('Wayne Gardner fights').getAttribute('aria-pressed')).toBe('true')
  })
})

describe('the live fight, moment 2', () => {
  it('gives the GM every combatant beside Grant Sneak Attack, initiative ready to begin, and the grouped Floor', () => {
    show('gm', 'gm', live())
    expect(screen.getByText("Grant a Sneak Attack and that person's attack runs at once.")).toBeTruthy()
    const grants = screen.getAllByRole('button', { name: 'Grant Sneak Attack' })
    expect(grants).toHaveLength(2)
    expect(grants.every((grant) => !(grant as HTMLButtonElement).disabled)).toBe(true)
    expect((button('Begin Combat - Roll Initiative') as HTMLButtonElement).disabled).toBe(false)
    const floor = screen.getByText('Floor').closest('.panel') as HTMLElement
    expect(floor.textContent).toContain('3 items')
    expect(floor.textContent).toContain('Dodgeball')
    expect(floor.textContent).toContain('×3')
  })

  it('places more on the Floor from the GM tools with a count', async () => {
    show('gm', 'gm', live())
    fireEvent.click(button('+ Place an item'))
    const tools = document.querySelector('.gmtools') as HTMLElement
    chooseItem('Fist-sized rock (catch 10%)', tools)
    fireEvent.click(within(tools).getByRole('button', { name: 'More' }))
    fireEvent.click(within(tools).getByRole('button', { name: 'Place on Floor' }))
    await waitFor(() => expect(mocks.sent).toHaveLength(1))
    expect(mocks.sent[0].envelope).toMatchObject({ fightId: 'fight', round: 0, phase: 'before-initiative', actorKey: null })
    expect(mocks.sent[0].payload).toEqual({ type: 'place', floor: [{ itemId: 'rock', status: 'library', qty: 1 }, { itemId: 'rock', status: 'library', qty: 1 }] })
  })

  it('shows a player in the fight who the fight waits on, with no controls', () => {
    show('player', 'wayne-uid', live())
    expect(screen.getByText('The fight is waiting on the GM')).toBeTruthy()
    expect(screen.getByText('You · Speed 56')).toBeTruthy()
    expect(screen.getAllByRole('button')).toEqual([screen.getByRole('button', { name: /Table.*All 0/ })])
    expect(screen.queryByText('Grant Sneak Attack')).toBeNull()
  })

  it('shows a spectator the same read-only rails and wait', () => {
    show('player', 'marcy-uid', live())
    expect(screen.getByText('The fight is waiting on the GM')).toBeTruthy()
    expect(screen.getByText('Player · Speed 56')).toBeTruthy()
    expect(screen.getAllByRole('button')).toEqual([screen.getByRole('button', { name: /Table.*All 0/ })])
  })

  it('shows a player nothing without a live fight', () => {
    show('player', 'wayne-uid', idle)
    expect(document.querySelector('.lubec-combat')?.textContent).toBe('')
  })
})

describe('ending a fight, moment 12', () => {
  it('confirms who is Out and what is left, ends, and reports where the Floor went', async () => {
    const view = show('gm', 'gm', live())
    const tools = screen.getByRole('combobox', { name: 'GM tools' })
    fireEvent.change(tools, { target: { value: 'end' } })
    fireEvent.click(button('End combat'))
    expect(screen.getByText('End combat?')).toBeTruthy()
    expect(screen.getByText('Nobody')).toBeTruthy()
    expect(screen.getByText('They go to your Items as dropped.')).toBeTruthy()
    fireEvent.click(within(document.querySelector('.step-foot') as HTMLElement).getByRole('button', { name: 'End combat' }))
    await waitFor(() => expect(screen.getByText('Combat ended')).toBeTruthy())
    expect(mocks.sent.map((command) => command.payload)).toEqual([{ type: 'end' }])
    view.rerender(tree('gm', 'gm', idle))
    expect(screen.getByText('Combat ended')).toBeTruthy()
    expect(document.querySelector('.outcome p')?.textContent).toBe('Players were returned to their sheets. 3 dodgeballs from the Floor are now in your Items as dropped.')
  })

  it('keeps the fight running and says why when End is refused, and can go back to placing', async () => {
    mocks.outcome = { ok: false, reason: 'Wounds must be delivered before combat can end.' }
    show('gm', 'gm', live())
    fireEvent.change(screen.getByRole('combobox', { name: 'GM tools' }), { target: { value: 'end' } })
    fireEvent.click(button('End combat'))
    fireEvent.click(within(document.querySelector('.step-foot') as HTMLElement).getByRole('button', { name: 'End combat' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Combat is still running. Wounds must be delivered before combat can end.')
    fireEvent.click(button('+ Place an item'))
    expect(screen.getByText("Grant a Sneak Attack and that person's attack runs at once.")).toBeTruthy()
  })
})

describe('less common states', () => {
  const bat = item('bat', { name: 'Baseball bat', mode: 'melee', table: 'blunt', catchChance: 0, catchPutsThrowerOut: false, status: 'library' })

  it('marks someone Out in the rail and at End, and writes one item in the singular', () => {
    const fight = liveFight([{ itemId: 'library-ball', status: 'library', qty: 1 }])
    fight.fight.state.combatants[1].outReason = 'wound'
    show('gm', 'gm', live(fight))
    expect(document.querySelector('.turns li.out')?.textContent).toBe('·Roy CarverNPC · Speed 56 · Out: woundedOut')
    expect(screen.getByText('Floor').closest('.panel')?.textContent).toContain('1 item')
    fireEvent.change(screen.getByRole('combobox', { name: 'GM tools' }), { target: { value: 'end' } })
    fireEvent.click(button('End combat'))
    expect(screen.getByText('Who is Out').nextElementSibling?.textContent).toBe('Roy CarverOut')
  })

  it('says nothing was left when End empties no Floor', async () => {
    show('gm', 'gm', live(liveFight([])))
    expect(screen.getByText('Nothing on the Floor.')).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: 'GM tools' }), { target: { value: 'end' } })
    fireEvent.click(button('End combat'))
    expect(screen.getByText('Left on the Floor').nextElementSibling?.textContent).toBe('Nothing')
    fireEvent.click(within(document.querySelector('.step-foot') as HTMLElement).getByRole('button', { name: 'End combat' }))
    await waitFor(() => expect(document.querySelector('.outcome p')?.textContent).toBe('Players were returned to their sheets. Nothing was left on the Floor.'))
  })

  it('says one dropped item "is" in Items', async () => {
    show('gm', 'gm', live(liveFight([{ itemId: 'rock', status: 'library', qty: 1 }])))
    fireEvent.change(screen.getByRole('combobox', { name: 'GM tools' }), { target: { value: 'end' } })
    fireEvent.click(button('End combat'))
    fireEvent.click(within(document.querySelector('.step-foot') as HTMLElement).getByRole('button', { name: 'End combat' }))
    await waitFor(() => expect(document.querySelector('.outcome p')?.textContent).toBe('Players were returned to their sheets. 1 fist-sized rock from the Floor is now in your Items as dropped.'))
  })

  it('reports a refused placement, and keeps the tools open', async () => {
    mocks.outcome = { ok: false, reason: 'Floor selection rock is stale; nothing was consumed.' }
    const setError = vi.fn()
    show('gm', 'gm', live(), setError)
    fireEvent.change(screen.getByRole('combobox', { name: 'GM tools' }), { target: { value: 'place' } })
    const tools = document.querySelector('.gmtools') as HTMLElement
    chooseItem('Fist-sized rock (catch 10%)', tools)
    fireEvent.click(within(tools).getByRole('button', { name: 'More' }))
    fireEvent.click(within(tools).getByRole('button', { name: 'Fewer' }))
    fireEvent.click(within(tools).getByRole('button', { name: 'Place on Floor' }))
    await waitFor(() => expect(setError).toHaveBeenCalledWith('Floor selection rock is stale; nothing was consumed.'))
    expect(mocks.sent[0].payload).toEqual({ type: 'place', floor: [{ itemId: 'rock', status: 'library', qty: 1 }] })
    expect(document.querySelector('.gmtools .item-pick')).not.toBeNull()
  })

  it('lists an uncatchable item on the Floor rail with no catch words', () => {
    const rope = parseLubecGmItem({ name: 'Rope', kind: 'thing', status: 'library' }, 'rope')
    mocks.data = { ...(mocks.data as object), items: [...items, rope] }
    const command: CombatCommand = {
      envelope: { id: 'start', groupId: 'school', campaignId: 'gym', fightId: 'fight', round: 0, phase: 'setup', stageInstanceId: 'setup', actorKey: null, interactionSequence: 0 },
      seed: 'seed', payload: { type: 'start', combatants: [{ kind: 'character', sheetId: 'wayne' }], floor: [{ itemId: 'rope', status: 'library', qty: 1 }], dodgeball: true },
    }
    const plan = planCombatCommand(command, { activeFightId: null, fight: null, sheets: [wayne], items: new Map([['rope', rope]]) }, { userId: 'gm', isGm: true })
    show('player', 'wayne-uid', live({ id: 'fight', fight: plan.fight }))
    const row = document.querySelector('.floor li') as HTMLElement
    expect(row.textContent).toBe('Rope×1')
  })

  it('marks a non-throwable item by its kind, with no catch words', () => {
    mocks.data = { ...(mocks.data as object), items: [...items, bat] }
    show('gm', 'gm', idle)
    chooseItem('Baseball bat')
    fireEvent.click(button('Place on Floor'))
    const row = [...document.querySelectorAll('.roster li')].find((entry) => entry.textContent?.startsWith('Baseball bat')) as HTMLElement
    expect(row.querySelector('.ball svg[stroke="currentColor"]')).not.toBeNull()
    expect(row.querySelector('small')).toBeNull()
  })

  it('repairs an NPC on the NPCs tab, says a missing Speed is missing, and lists empty rosters', () => {
    mocks.data = { characters: [], npcs: [{ npc: npc('dale', 'Dale Ricker', ''), sheet: sheet('npc', 'dale', 'Dale Ricker', 'gm', { Speed: null }) }], items: [] }
    show('gm', 'gm', idle)
    expect(screen.getByText('No characters in play.')).toBeTruthy()
    fireEvent.click(button('Dale Ricker fights'))
    expect(button('Dale Ricker fights').closest('li')?.textContent).toBe('✓Dale RickerSpeed missing')
    fireEvent.click(screen.getAllByRole('button', { name: 'Repair Dale Ricker' })[0])
    expect(screen.getByTestId('where').textContent).toBe('/groups/school/campaigns/gym/npcs')
    expect(takeOpenRequest('npc')).toBe('dale')
  })

  it('says when there are no NPCs', () => {
    mocks.data = { characters: [wayne], npcs: [], items: [] }
    show('gm', 'gm', idle)
    expect(screen.getByText('No NPCs yet.')).toBeTruthy()
  })
})

