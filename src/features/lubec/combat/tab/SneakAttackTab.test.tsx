// @vitest-environment jsdom
/**
 * Before initiative's Sneak Attack as each seat sees it: the GM granting and
 * declaring range, the owner picking, splitting and rolling, and everyone else
 * watching the same persisted attack and result.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { User } from 'firebase/auth'
import type { Campaign, NpcRecord, Role } from '../../../../types/app'
import { makeLubecDirectEntryCharacter } from '../../../ruleSets/lubec/directEntry'
import type { LubecItem } from '../../../ruleSets/lubec/gear/gearRecord'
import { takeOpenRequest } from '../../../navigation/openRequest'
import { LubecCombatContext, type LubecLiveFight } from '../combatWatch'
import { planCombatCommand } from '../engine/lifecycle'
import type { CombatCommand, CombatOutcome, CombatRecords, CombatSheet } from '../engine/types'

const mocks = vi.hoisted(() => ({
  sent: [] as CombatCommand[],
  outcome: { ok: true, fightId: 'fight', generatedIds: [], rolls: [] } as CombatOutcome,
  roster: { characters: [] as unknown[], npcs: [] as unknown[] },
}))

vi.mock('../useLubecCombatSend', () => ({
  useLubecCombatSend: () => async (_key: string, make: () => CombatCommand) => {
    mocks.sent.push(make())
    return mocks.outcome
  },
}))
vi.mock('./useCombatGmData', () => ({ useCombatGmData: () => ({ characters: [], npcs: [], items: [], roster: mocks.roster }) }))
vi.mock('./useCombatPlayerRoster', () => ({ useCombatPlayerRoster: () => mocks.roster }))

const { LubecCombat } = await import('./LubecCombat')

const campaign: Campaign = { id: 'gym', name: 'Gym', status: 'active', groupId: 'school', gmUserId: 'gm' }
const ball: LubecItem = { id: 'ball', kind: 'weapon', mode: 'thrown', name: 'Dodgeball', carrier: 'hands', slot: 0, size: 1, qty: 1, weight: 'normal', note: '', impact: 0, wounds: ['blunt'], table: 'dodgeball', catchChance: 50, catchPutsThrowerOut: true, ranges: [{ band: 'short', modifier: 10, distance: 'across the gym' }] }

/** Wayne as his sheet reads: Handle 46, Throwing Arm, a dodgeball in his left hand. */
function wayneRecord() {
  const character = makeLubecDirectEntryCharacter('wayne', { userId: 'wayne-uid', username: 'waynegd' })
  character.name = 'Wayne Gardner'
  // A Working Kid's class adds 5 Handle: a base of 41 reads as 46.
  character.lubec.class = { key: 'working', choices: {} }
  character.lubec.base = { Strength: 55, Speed: 52, Intellect: 40, Handle: 41, Charm: 40, Sanity: 30, Fear: 30, Body: 30 }
  character.lubec.skills = { free: 'Athletics', picked: ['Throwing Arm'] }
  character.lubec.gear.items = [ball]
  return character
}
const wayneSheet = (): CombatSheet => ({ kind: 'character', sheetId: 'wayne', name: 'Wayne Gardner', ownerUserId: 'wayne-uid', portraitPath: '', sheet: wayneRecord().lubec, revision: 1 })
const roySheet = (): CombatSheet => ({ ...wayneSheet(), kind: 'npc', sheetId: 'roy', name: 'Roy Carver', ownerUserId: 'gm', sheet: { ...wayneRecord().lubec, gear: { ...wayneRecord().lubec.gear, items: [] } } })
const throwAtRoy = { targetKey: 'npc:roy', weaponItemId: 'ball', attackId: 'throw', defense: null }

/** A fight played through the engine up to the step under test. */
function fightAfter(...steps: { type: string; actor?: string | null; [key: string]: unknown }[]): LubecLiveFight {
  const sheets = [wayneSheet(), roySheet()]
  let records: CombatRecords = { activeFightId: null, fight: null, sheets, items: new Map() }
  const all = [{ type: 'start', combatants: [{ kind: 'character', sheetId: 'wayne' }, { kind: 'npc', sheetId: 'roy' }], floor: [], dodgeball: true }, ...steps]
  all.forEach(({ actor = null, ...payload }, index) => {
    const state = records.fight?.state
    const command: CombatCommand = {
      envelope: { id: `step-${index}`, groupId: 'school', campaignId: 'gym', fightId: 'fight', round: state?.round ?? 0, phase: state?.phase ?? 'setup', stageInstanceId: state?.stageInstanceId ?? 'setup', actorKey: actor, interactionSequence: 0 },
      seed: 'seed', payload: payload as CombatCommand['payload'],
    }
    records = { ...records, activeFightId: 'fight', fight: planCombatCommand(command, records, { userId: 'gm', isGm: true }).fight }
  })
  return { id: 'fight', fight: records.fight! }
}
const granted = () => fightAfter({ type: 'grant', combatantKey: 'character:wayne' })
const aimed = () => fightAfter({ type: 'grant', combatantKey: 'character:wayne' }, { type: 'aim', actor: 'character:wayne', aim: throwAtRoy })
const ranged = () => fightAfter({ type: 'grant', combatantKey: 'character:wayne' }, { type: 'aim', actor: 'character:wayne', aim: throwAtRoy }, { type: 'range', band: 'long', modifier: -20 })

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>
}

const page = (role: Role, userId: string, live: LubecLiveFight) => (
  <MemoryRouter initialEntries={['/groups/school/campaigns/gym/combat']}>
    <LubecCombatContext value={{ enabled: true, ready: true, live }}>
      <Routes><Route path="*" element={<><LubecCombat campaign={campaign} role={role} user={{ uid: userId } as User} username="someone" setError={() => undefined} characterTabProps={null} /><Where /></>} /></Routes>
    </LubecCombatContext>
  </MemoryRouter>
)
const show = (role: Role, userId: string, live: LubecLiveFight) => render(page(role, userId, live))
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const sentOf = (type: string) => mocks.sent.filter((command) => command.payload.type === type)

beforeEach(() => {
  mocks.sent = []
  mocks.outcome = { ok: true, fightId: 'fight', generatedIds: [], rolls: [] }
  mocks.roster = { characters: [wayneRecord()], npcs: [{ npc: { id: 'roy', name: 'Roy Carver', portraitUrl: null, portraitFocusX: 50, portraitFocusY: 50, tokenIcon: { icon: 'pawn', color: '#555555', size: 34 } } as NpcRecord, sheet: null }] }
  window.sessionStorage.clear()
})
afterEach(cleanup)

describe('moment 2: the GM grants a Sneak Attack', () => {
  it('sends one grant for the chosen person', async () => {
    show('gm', 'gm', fightAfter())
    fireEvent.click(within(screen.getByText('Wayne Gardner', { selector: '.row-line' }).closest('li')!).getByRole('button', { name: 'Grant Sneak Attack' }))
    await waitFor(() => expect(sentOf('grant')).toHaveLength(1))
    expect(sentOf('grant')[0]).toMatchObject({ envelope: { actorKey: null, phase: 'before-initiative', round: 0 }, payload: { combatantKey: 'character:wayne' } })
  })

  it('shows a refused grant', async () => {
    mocks.outcome = { ok: false, reason: 'Finish the granted attack first.' }
    show('gm', 'gm', fightAfter())
    fireEvent.click(screen.getAllByRole('button', { name: 'Grant Sneak Attack' })[0])
    expect((await screen.findByRole('alert')).textContent).toBe('Finish the granted attack first.')
  })
})

describe('moment 6: the GM while a player aims', () => {
  it('waits on the player with no grant offered, and offers to act for them', () => {
    show('gm', 'gm', granted())
    expect(screen.getByText(/Waiting on Wayne Gardner to roll/)).toBeTruthy()
    expect(screen.getByText('Choosing a target and a weapon.')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Grant Sneak Attack' }).every((entry) => (entry as HTMLButtonElement).disabled)).toBe(true)
    expect(within(screen.getByText('Wayne Gardner', { selector: '.row-line' }).closest('li')!).getByText('Attack running on their screen')).toBeTruthy()
    fireEvent.click(button('Away from the table? Roll for Wayne Gardner'))
    expect(screen.getByText('Wayne Gardner has a Sneak Attack.')).toBeTruthy()
    expect(screen.getByRole('radiogroup', { name: 'Target' })).toBeTruthy()
  })

  it('declares the range for a throw: a band with no number asks for one, with 0 filled in', async () => {
    show('gm', 'gm', aimed())
    expect(screen.getByText(/Declare the range/)).toBeTruthy()
    expect(screen.getByText('Throw with Dodgeball at Roy Carver. ATK 61.')).toBeTruthy()
    const row = document.querySelector('.range-row') as HTMLElement
    expect(within(row).getAllByRole('button').map((entry) => entry.textContent)).toEqual(['Short +10', 'Medium', 'Long', 'Extreme'])
    fireEvent.click(within(row).getByRole('button', { name: 'Medium' }))
    expect((screen.getByRole('spinbutton', { name: 'Medium Handle modifier' }) as HTMLInputElement).value).toBe('0')
    fireEvent.click(within(row).getByRole('button', { name: 'Declare' }))
    await waitFor(() => expect(sentOf('range')).toHaveLength(1))
    expect(sentOf('range')[0].payload).toEqual({ type: 'range', band: 'medium', modifier: 0 })
  })

  it('declares a band the weapon numbers at once, with its own number', async () => {
    show('gm', 'gm', aimed())
    fireEvent.click(within(document.querySelector('.range-row') as HTMLElement).getByRole('button', { name: 'Short +10' }))
    await waitFor(() => expect(sentOf('range')).toHaveLength(1))
    expect(sentOf('range')[0].payload).toEqual({ type: 'range', band: 'short' })
  })

  it('shows the last band still selected after it was declared, and the attack it gives', () => {
    show('gm', 'gm', ranged())
    expect(within(document.querySelector('.range-row') as HTMLElement).getByRole('button', { name: 'Long' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Throw with Dodgeball at Roy Carver. ATK 41.')).toBeTruthy()
  })
})

describe('moments 5 and 7: the owner picks, splits and rolls in one window', () => {
  it('opens the granted window with the thrower\'s choices and persists the first complete aim', async () => {
    show('player', 'wayne-uid', granted())
    expect(screen.getByText('The GM granted you a Sneak Attack.')).toBeTruthy()
    expect(within(screen.getByRole('radiogroup', { name: 'Target' })).getByText(/^NPC · Speed \d+$/)).toBeTruthy()
    expect(screen.getByText('Roll to hit Roy Carver.')).toBeTruthy()
    expect(screen.getByText(/Handle 46 \+ Throwing Arm 15 =/).textContent).toBe('Handle 46 + Throwing Arm 15 = 61')
    await waitFor(() => expect(sentOf('aim')).toHaveLength(1))
    expect(sentOf('aim')[0]).toMatchObject({ envelope: { actorKey: 'character:wayne', step: 'aim' }, payload: { aim: throwAtRoy } })
  })

  it('waits on the GM for a throw\'s range, with Roll not live', () => {
    show('player', 'wayne-uid', aimed())
    expect(screen.getByText('Waiting for the GM to declare the range')).toBeTruthy()
    expect((button('Roll') as HTMLButtonElement).disabled).toBe(true)
    expect(within(document.querySelector('.range-row') as HTMLElement).getAllByRole('button').every((entry) => (entry as HTMLButtonElement).disabled)).toBe(true)
  })

  it('rolls once the range is declared, with the range in the sum and the split it froze', async () => {
    show('player', 'wayne-uid', ranged())
    expect(screen.getByText(/Handle 46/).textContent).toBe('Handle 46 + Throwing Arm 15 − Range 20 = 41')
    fireEvent.click(button('Roll'))
    await waitFor(() => expect(sentOf('roll')).toHaveLength(1))
    expect(sentOf('roll')[0]).toMatchObject({ envelope: { actorKey: 'character:wayne', step: 'aim' }, payload: { aim: throwAtRoy } })
    expect(sentOf('aim')).toEqual([])
  })

  it('adds one named Defense line and moves it in tens with the keyboard', async () => {
    show('player', 'wayne-uid', ranged())
    fireEvent.click(button('Add a Defense line'))
    expect((screen.getByRole('combobox', { name: 'Defense against' }) as HTMLSelectElement).value).toBe('npc:roy')
    fireEvent.keyDown(button('Defense line at 20'), { key: 'ArrowRight' })
    await waitFor(() => expect(sentOf('aim').at(-1)?.payload.aim).toEqual({ ...throwAtRoy, defense: { against: 'npc:roy', amount: 30 } }))
    expect(screen.queryByText('Add a second Defense line')).toBeNull()
    fireEvent.keyDown(button('Defense line at 30'), { key: 'ArrowLeft' })
    fireEvent.keyDown(button('Defense line at 20'), { key: 'ArrowLeft' })
    fireEvent.keyDown(button('Defense line at 10'), { key: 'ArrowLeft' })
    expect(screen.queryByRole('button', { name: /Defense line at/ })).toBeNull()
  })

  it('drags the Defense line along the bar, snapping to tens', async () => {
    show('player', 'wayne-uid', ranged())
    fireEvent.click(button('Add a Defense line'))
    const bar = document.querySelector('.allocation-bar') as HTMLElement
    bar.getBoundingClientRect = () => ({ left: 100, width: 200 }) as DOMRect
    fireEvent.pointerDown(button('Defense line at 20'))
    act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 181 })) })
    act(() => { window.dispatchEvent(new MouseEvent('pointerup')) })
    act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 120 })) })
    expect(button('Defense line at 40')).toBeTruthy()
    await waitFor(() => expect(sentOf('aim').at(-1)?.payload.aim).toMatchObject({ defense: { amount: 40 } }))
  })

  it('leaves Enter and other keys to the divider\'s button', () => {
    show('player', 'wayne-uid', ranged())
    fireEvent.click(button('Add a Defense line'))
    fireEvent.keyDown(button('Defense line at 20'), { key: 'Enter' })
    expect(button('Defense line at 20')).toBeTruthy()
  })

  it('names who a Defense line guards against', async () => {
    show('player', 'wayne-uid', ranged())
    fireEvent.click(button('Add a Defense line'))
    fireEvent.change(screen.getByRole('combobox', { name: 'Defense against' }), { target: { value: 'npc:roy' } })
    await waitFor(() => expect(sentOf('aim').at(-1)?.payload.aim).toMatchObject({ defense: { against: 'npc:roy', amount: 20 } }))
  })

  it('shows a refused Roll and a named repair without hiding the window', async () => {
    const live = ranged()
    live.fight.state.attack!.repair = 'Wayne Gardner: missing Strength; repair Strength.'
    mocks.outcome = { ok: false, reason: 'That weapon is no longer in hand. Choose again.' }
    show('player', 'wayne-uid', live)
    expect(screen.getByText(/Waiting for a repair\./).closest('.notice')!.textContent).toContain('missing Strength')
    fireEvent.click(button('Roll'))
    expect((await screen.findByText('That weapon is no longer in hand. Choose again.'))).toBeTruthy()
  })

  it('opens the sheet for a tapped hand', () => {
    show('player', 'wayne-uid', ranged())
    fireEvent.click(button(/Left hand.*Dodgeball/))
    expect(screen.getByTestId('where').textContent).toBe('/groups/school/campaigns/gym/character')
    expect(takeOpenRequest('character')).toBe('wayne')
  })
})

describe('moment 6 for everyone else, and moment 8 for everyone', () => {
  it('tells a spectator who the fight waits on, with no controls', () => {
    show('player', 'marcy-uid', granted())
    expect(screen.getByText(/The fight is waiting on Wayne Gardner/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Roll' })).toBeNull()
  })

  it('waits on the GM while a throw has no range', () => {
    show('player', 'marcy-uid', aimed())
    expect(screen.getByText(/The fight is waiting on the GM/)).toBeTruthy()
  })

  it('shows a miss to every seat, and returns the GM to Before initiative', () => {
    // Seed 'seed' rolls 40 or more here: a miss against 36.
    const missed = fightAfter({ type: 'grant', combatantKey: 'character:wayne' }, { type: 'aim', actor: 'character:wayne', aim: throwAtRoy }, { type: 'range', band: 'extreme', modifier: -55 }, { type: 'roll', actor: 'character:wayne', aim: throwAtRoy })
    expect(missed.fight.state.attack!.roll!.hit).toBe(false)
    show('gm', 'gm', missed)
    expect(screen.getByRole('heading', { name: 'A miss' })).toBeTruthy()
    expect(screen.getByText(/left the hand at the Roll and lands on the Floor/)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Grant Sneak Attack' }).every((entry) => !(entry as HTMLButtonElement).disabled)).toBe(true)
    cleanup()
    show('player', 'marcy-uid', missed)
    expect(screen.getByRole('heading', { name: 'A miss' })).toBeTruthy()
  })

  it('locks the split it rolled with in the result', () => {
    const split = { ...throwAtRoy, defense: { against: 'npc:roy', amount: 20 } }
    const missed = fightAfter({ type: 'grant', combatantKey: 'character:wayne' }, { type: 'aim', actor: 'character:wayne', aim: split }, { type: 'range', band: 'extreme', modifier: -40 }, { type: 'roll', actor: 'character:wayne', aim: split })
    show('player', 'marcy-uid', missed)
    expect((button('Defense line at 20') as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows a hit and what comes next, with no control for anyone yet', () => {
    const hit = fightAfter({ type: 'grant', combatantKey: 'character:wayne' }, { type: 'aim', actor: 'character:wayne', aim: throwAtRoy }, { type: 'range', band: 'short', modifier: 40 }, { type: 'roll', actor: 'character:wayne', aim: throwAtRoy })
    expect(hit.fight.state.attack!.roll!.hit).toBe(true)
    show('player', 'wayne-uid', hit)
    expect(screen.getByText(/^A hit/)).toBeTruthy()
    expect(screen.getByText('Still to come: the result')).toBeTruthy()
    expect(screen.getByText("Waiting for the GM to roll Roy Carver's defense")).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Roll' })).toBeNull()
    cleanup()
    show('gm', 'gm', hit)
    expect(screen.queryByRole('button', { name: 'Grant Sneak Attack' })).toBeNull()
  })
})

describe('less common states', () => {
  it('acts for an absent player for that one attack only', () => {
    const first = granted()
    const view = show('gm', 'gm', first)
    fireEvent.click(button('Away from the table? Roll for Wayne Gardner'))
    expect(screen.getByText('Wayne Gardner has a Sneak Attack.')).toBeTruthy()
    const next = granted()
    next.fight.state.attack = { ...next.fight.state.attack!, id: 'another-attack' }
    view.rerender(page('gm', 'gm', next))
    expect(screen.getByText(/Waiting on Wayne Gardner to roll/)).toBeTruthy()
  })

  it('lets the GM declare the range inside a window they work for an absent player', async () => {
    show('gm', 'gm', aimed())
    fireEvent.click(button('Away from the table? Roll for Wayne Gardner'))
    const rows = document.querySelectorAll('.range-row')
    expect(rows).toHaveLength(1)
    fireEvent.click(within(rows[0] as HTMLElement).getByRole('button', { name: 'Short +10' }))
    await waitFor(() => expect(sentOf('range')).toHaveLength(1))
  })

  it("works an NPC's grant for the GM: players as targets, and the NPC's sheet for its hands", async () => {
    mocks.roster = { ...mocks.roster, characters: [wayneRecord()], npcs: [{ npc: { id: 'roy', name: 'Roy Carver', portraitUrl: null, portraitFocusX: 50, portraitFocusY: 50, tokenIcon: { icon: 'pawn', color: '#555555', size: 34 } } as NpcRecord, sheet: { ...wayneRecord(), id: 'roy', name: 'Roy Carver' } }] }
    show('gm', 'gm', fightAfter({ type: 'grant', combatantKey: 'npc:roy' }))
    expect(screen.getByText('Roy Carver has a Sneak Attack.')).toBeTruthy()
    expect(within(screen.getByRole('radiogroup', { name: 'Target' })).getByText(/^Player · Speed \d+$/)).toBeTruthy()
    await waitFor(() => expect(sentOf('aim')).toHaveLength(1))
    expect(sentOf('aim')[0].envelope.actorKey).toBe('npc:roy')
    fireEvent.click(button(/Left hand.*Dodgeball/))
    expect(screen.getByTestId('where').textContent).toBe('/groups/school/campaigns/gym/npcs')
    expect(takeOpenRequest('npc')).toBe('roy')
  })

  it('persists a changed aim before rolling a blow up close', async () => {
    show('player', 'wayne-uid', aimed())
    fireEvent.click(button(/^Fisticuffs/))
    fireEvent.click(screen.getByRole('radio', { name: /Punch/ }))
    mocks.sent = []
    fireEvent.click(button('Roll'))
    await waitFor(() => expect(mocks.sent.map((command) => command.payload.type)).toEqual(expect.arrayContaining(['aim', 'roll'])))
    expect(sentOf('roll')[0].payload.aim).toEqual({ ...throwAtRoy, weaponItemId: 'fisticuffs', attackId: 'punch' })
  })

  it('stops a refused aim from rolling', async () => {
    mocks.outcome = { ok: false, reason: 'That weapon cannot make that attack now. Choose again.' }
    show('player', 'wayne-uid', aimed())
    fireEvent.click(button(/^Fisticuffs/))
    fireEvent.click(screen.getByRole('radio', { name: /Punch/ }))
    fireEvent.click(button('Roll'))
    expect(await screen.findByText('That weapon cannot make that attack now. Choose again.')).toBeTruthy()
    expect(sentOf('roll')).toEqual([])
  })

  it('offers no Defense line when the attack has 20 or less to give', () => {
    show('player', 'wayne-uid', fightAfter({ type: 'grant', combatantKey: 'character:wayne' }, { type: 'aim', actor: 'character:wayne', aim: throwAtRoy }, { type: 'range', band: 'long', modifier: -45 }))
    expect(screen.queryByRole('button', { name: 'Add a Defense line' })).toBeNull()
  })

  it('shows no split until there is something to attack with', () => {
    const empty = wayneRecord()
    empty.lubec.gear.items = [{ ...ball, id: 'radio', kind: 'thing', name: 'Radio', slot: 0 }, { ...ball, id: 'radio2', kind: 'thing', name: 'Radio', slot: 1 }]
    mocks.roster = { characters: [empty], npcs: [] }
    show('player', 'wayne-uid', granted())
    expect(screen.queryByRole('button', { name: 'Roll' })).toBeNull()
    expect(sentOf('aim')).toEqual([])
  })

  it('waits for a sheet the viewer has not read yet', () => {
    mocks.roster = { characters: [], npcs: [] }
    show('player', 'wayne-uid', granted())
    expect(screen.getByText("Reading Wayne Gardner's sheet...")).toBeTruthy()
  })

  it('tells the GM what a grant waits on for a repair, and refuses a typed modifier that is not a whole number', () => {
    const live = aimed()
    live.fight.state.attack!.repair = 'Wayne Gardner: missing Strength; repair Strength.'
    show('gm', 'gm', live)
    expect(screen.getByText(/missing Strength/).closest('p')!.textContent).toContain('Waiting for a repair.')
    fireEvent.click(within(document.querySelector('.range-row') as HTMLElement).getByRole('button', { name: 'Long' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Long Handle modifier' }), { target: { value: '1.5' } })
    expect((button('Declare') as HTMLButtonElement).disabled).toBe(true)
  })

  it('names a blow up close as an attack, and shows no result for an attack closed without a roll', () => {
    const punched = fightAfter({ type: 'grant', combatantKey: 'character:wayne' }, { type: 'aim', actor: 'character:wayne', aim: { ...throwAtRoy, weaponItemId: 'fisticuffs', attackId: 'punch' } }, { type: 'roll', actor: 'character:wayne', aim: { ...throwAtRoy, weaponItemId: 'fisticuffs', attackId: 'punch' } })
    show('player', 'marcy-uid', punched)
    expect(screen.getByText('Attacker', { selector: 'small' })).toBeTruthy()
    cleanup()
    const interrupted = granted()
    interrupted.fight.state.attack = { ...interrupted.fight.state.attack!, closed: true }
    show('gm', 'gm', interrupted)
    expect(screen.queryByText('Result')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Grant Sneak Attack' }).length).toBeGreaterThan(0)
  })
})
