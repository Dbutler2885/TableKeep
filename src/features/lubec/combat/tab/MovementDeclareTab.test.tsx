// @vitest-environment jsdom
/**
 * Round 1's Movement and Declare as each seat sees them: the private choices,
 * the GM's list with its Leave answers and NPC choices, the settle wait, then
 * the attack window with Declare where Roll sits, Full Defense, the waits and
 * the declarations rail.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { User } from 'firebase/auth'
import type { Campaign, NpcRecord, Role } from '../../../../types/app'
import { makeLubecDirectEntryCharacter } from '../../../ruleSets/lubec/directEntry'
import { lubecDetachedItem } from '../../../ruleSets/lubec/gear/detachedItems'
import type { LubecItem } from '../../../ruleSets/lubec/gear/gearRecord'
import { LubecCombatContext, type LubecLiveFight } from '../combatWatch'
import { combatEntropy } from '../engine/commandEntropy'
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
const ball: LubecItem = { id: 'ball', kind: 'weapon', mode: 'thrown', name: 'Dodgeball', carrier: 'hands', slot: 0, size: 1, qty: 2, weight: 'normal', note: '', impact: 0, wounds: ['blunt'], table: 'dodgeball', catchChance: 50, catchPutsThrowerOut: true }
const knife: LubecItem = { id: 'knife', kind: 'weapon', mode: 'melee', name: 'Knife', carrier: 'hands', slot: 1, size: 1, qty: 1, weight: 'normal', note: '', impact: 1, wounds: ['cut'] }

/** A Working Kid: Handle 41 reads 46, Strength 50 reads 55. */
function kid(id: string, name: string, owner: string, items: LubecItem[]) {
  const character = makeLubecDirectEntryCharacter(id, { userId: owner, username: 'someone' })
  character.name = name
  character.lubec.class = { key: 'working', choices: {} }
  character.lubec.base = { Strength: 50, Speed: 52, Intellect: 40, Handle: 41, Charm: 40, Sanity: 30, Fear: 30, Body: 30 }
  character.lubec.skills = { free: 'Athletics', picked: ['Throwing Arm'] }
  character.lubec.gear.items = items
  return character
}
const wayne = () => kid('wayne', 'Wayne Gardner', 'wayne-uid', [ball, knife])
let currentWayne = wayne
/** One Dodgeball lying on the Floor, as Start would place it. */
const floorBall = () => lubecDetachedItem({ ...ball, id: 'floor-ball', qty: 1 }, [])
const royRecord = () => kid('roy', 'Roy Carver', 'gm', [])
const sheetOf = (record: ReturnType<typeof kid>, kind: 'character' | 'npc'): CombatSheet =>
  ({ kind, sheetId: record.id, name: record.name, ownerUserId: record.ownerUserId, portraitPath: '', sheet: record.lubec, revision: 1 })
const royNpc = { id: 'roy', name: 'Roy Carver', portraitUrl: null, portraitFocusX: 50, portraitFocusY: 50, tokenIcon: { icon: 'pawn', color: '#555555', size: 34 } } as NpcRecord

type Step = { type: string; actor?: string | null; dice?: Record<string, number>; [key: string]: unknown }

/** A fight played through the engine with each purpose's die scripted. */
function fightAfter(...steps: Step[]): LubecLiveFight {
  const sheets = [sheetOf(currentWayne(), 'character'), sheetOf(royRecord(), 'npc')]
  let records: CombatRecords = { activeFightId: null, fight: null, sheets, items: new Map() }
  const all: Step[] = [{ type: 'start', combatants: [{ kind: 'character', sheetId: 'wayne' }, { kind: 'npc', sheetId: 'roy' }], floor: [], dodgeball: true }, ...steps]
  all.forEach(({ actor = null, dice = {}, ...payload }, index) => {
    const state = records.fight?.state
    const command: CombatCommand = {
      envelope: { id: `step-${index}`, groupId: 'school', campaignId: 'gym', fightId: 'fight', round: state?.round ?? 0, phase: state?.phase ?? 'setup', stageInstanceId: state?.stageInstanceId ?? 'setup', actorKey: actor, interactionSequence: state?.combatants.find((entry) => entry.key === actor)?.interactionSequence ?? 0 },
      seed: 'seed', payload: payload as CombatCommand['payload'],
    }
    const entropy = combatEntropy(command)
    const scripted = { ...entropy, die: (purpose: string, sides: number) => dice[purpose] ?? entropy.die(purpose, sides) }
    records = { ...records, activeFightId: 'fight', fight: planCombatCommand(command, records, { userId: 'gm', isGm: true }, undefined, scripted).fight }
    if (index === 0) records.fight!.state.floor = [floorBall()]
  })
  return { id: 'fight', fight: records.fight! }
}

const WAYNE = 'character:wayne'
const ROY = 'npc:roy'
/** Roy rolls 20 and Wayne 10: Roy is faster, so Wayne declares first. */
const rolled: Step[] = [{ type: 'begin' }, { type: 'npcInitiative', dice: { initiative: 20 } }, { type: 'initiative', actor: WAYNE, dice: { initiative: 10 } }]
const stay = { choice: 'stay', pickup: null }
const moved = (wayneChoice: object = stay, royChoice: object = stay): Step[] =>
  [...rolled, { type: 'move', actor: WAYNE, ...wayneChoice }, { type: 'npcMovement', choices: { [ROY]: royChoice } }]
const declaring = (wayneChoice?: object): Step[] => [...moved(wayneChoice), { type: 'settleMovement' }]
const throwAt = { targetKey: ROY, weaponItemId: 'ball', attackId: 'throw', defense: null }

const show = (role: Role, userId: string, live: LubecLiveFight) => render(
  <MemoryRouter initialEntries={['/groups/school/campaigns/gym/combat']}>
    <LubecCombatContext value={{ enabled: true, ready: true, live }}>
      <Routes><Route path="*" element={<LubecCombat campaign={campaign} role={role} user={{ uid: userId } as User} username="someone" setError={() => undefined} characterTabProps={null} />} /></Routes>
    </LubecCombatContext>
  </MemoryRouter>,
)
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const radio = (name: RegExp) => screen.getByRole('radio', { name })
const sentOf = (type: string) => mocks.sent.filter((command) => command.payload.type === type)
const rail = (title: string) => within(screen.getByRole('heading', { name: new RegExp(`^${title}`) }).closest('.panel') as HTMLElement)

beforeEach(() => {
  mocks.sent = []
  mocks.outcome = { ok: true, fightId: 'fight', generatedIds: [], rolls: [] }
  currentWayne = wayne
  mocks.roster = { characters: [wayne()], npcs: [{ npc: royNpc, sheet: royRecord() }] }
})
afterEach(cleanup)

describe('Movement for a player', () => {
  it('offers the four choices with Move or stay already chosen, and confirms Run', async () => {
    show('player', 'wayne-uid', fightAfter(...rolled))
    expect(screen.getByText('What do you do this round?')).toBeTruthy()
    expect(radio(/^Move or stay/).getAttribute('aria-checked')).toBe('true')
    expect(radio(/^Run/).textContent).toBe('RunCosts your attack and your Defense this round.')
    fireEvent.click(radio(/^Run/))
    fireEvent.click(button('Confirm movement'))
    await waitFor(() => expect(sentOf('move')[0]).toMatchObject({ envelope: { actorKey: WAYNE, phase: 'movement' }, payload: { choice: 'run', pickup: null } }))
    expect(rail('Declarations').getByText('Nobody has declared. Slowest declares first; everyone sees every split.')).toBeTruthy()
    expect(document.querySelector('.hand')).toBeNull()
  })

  it('says why Pick up cannot take the ball with both hands full, and waits for a pick before Confirm', () => {
    show('player', 'wayne-uid', fightAfter(...rolled))
    fireEvent.click(radio(/^Pick up/))
    expect(screen.getByText('Choose what to pick up from the Floor.')).toBeTruthy()
    expect((button('Confirm movement') as HTMLButtonElement).disabled).toBe(true)
    const pick = button('Pick up') as HTMLButtonElement
    expect(pick.disabled).toBe(true)
    expect(pick.title).toBe('No free hand for the Dodgeball.')
  })

  it('claims the exact Floor record with a free hand', async () => {
    const oneHand = () => kid('wayne', 'Wayne Gardner', 'wayne-uid', [ball])
    currentWayne = oneHand
    mocks.roster = { characters: [oneHand()], npcs: [] }
    show('player', 'wayne-uid', fightAfter(...rolled))
    fireEvent.click(radio(/^Pick up/))
    fireEvent.click(button('Pick up'))
    expect(button('Picked up')).toBeTruthy()
    expect(screen.getByText(/Dodgeball ×0/)).toBeTruthy()
    fireEvent.click(button('Confirm movement'))
    await waitFor(() => expect(sentOf('move')[0].payload).toEqual({ type: 'move', choice: 'pickup', pickup: { itemId: 'floor-ball', qty: 1 } }))
  })

  it('keeps a confirmed choice locked and says what it waits on', () => {
    show('player', 'wayne-uid', fightAfter(...rolled, { type: 'move', actor: WAYNE, choice: 'leave' }))
    expect(screen.getByText('Movement is set.')).toBeTruthy()
    expect((radio(/^Leave the fight/) as HTMLButtonElement).disabled).toBe(true)
    expect(radio(/^Leave the fight/).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Waiting for the GM to say whether you can get away.')).toBeTruthy()
    cleanup()
    show('player', 'wayne-uid', fightAfter(...rolled, { type: 'move', actor: WAYNE, ...stay }))
    expect(screen.getByText('Waiting for everyone to confirm. Declaring starts by itself when they have.')).toBeTruthy()
  })

  it('shows the table\'s refusal', async () => {
    mocks.outcome = { ok: false, reason: 'That fight stage is stale.' }
    show('player', 'wayne-uid', fightAfter(...rolled))
    fireEvent.click(button('Confirm movement'))
    expect(await screen.findByRole('alert')).toBeTruthy()
  })

  it('lets a player whose sheet is not read yet pick without a hands check', () => {
    mocks.roster = { characters: [], npcs: [] }
    show('player', 'wayne-uid', fightAfter(...rolled))
    fireEvent.click(radio(/^Pick up/))
    expect((button('Pick up') as HTMLButtonElement).disabled).toBe(false)
  })

  it('says when only a Leave holds Movement open', () => {
    show('player', 'marcy-uid', fightAfter(...rolled, { type: 'move', actor: WAYNE, choice: 'leave' }, { type: 'npcMovement', choices: { [ROY]: stay } }))
    expect(screen.getByText('The GM is answering a Leave.')).toBeTruthy()
  })

  it('shows a spectator who is still choosing, never what anyone chose', () => {
    show('player', 'marcy-uid', fightAfter(...rolled, { type: 'npcMovement', choices: { [ROY]: { choice: 'run' } } }))
    expect(screen.getByText('Still choosing: Wayne Gardner.')).toBeTruthy()
    expect(screen.queryByText(/Run/)).toBeNull()
  })

  it('tells everyone the stage waits on the GM once every choice is in', () => {
    show('player', 'wayne-uid', fightAfter(...moved()))
    expect(screen.getByText('Waiting for the GM to settle Movement')).toBeTruthy()
  })
})

describe('Movement for the GM', () => {
  it('lists every choice, sets the NPCs\' choices and confirms them together', async () => {
    show('gm', 'gm', fightAfter(...rolled))
    expect(screen.getByText('Players choose on their own screens. You choose for the NPCs.')).toBeTruthy()
    expect(screen.getByText('Choosing...')).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: 'Roy Carver movement' }), { target: { value: 'pickup:floor-ball' } })
    fireEvent.click(button("Confirm the NPCs' movement"))
    await waitFor(() => expect(sentOf('npcMovement')[0].payload).toEqual({ type: 'npcMovement', choices: { [ROY]: { choice: 'pickup', pickup: { itemId: 'floor-ball', qty: 1 } } } }))
    cleanup()
    show('gm', 'gm', fightAfter(...rolled, { type: 'move', actor: WAYNE, choice: 'run' }))
    expect(screen.getByText('Run', { selector: '.badge' })).toBeTruthy()
  })

  it('confirms an NPC left on Move or stay, and keeps a confirmed NPC\'s choice shown and locked', async () => {
    show('gm', 'gm', fightAfter(...rolled))
    fireEvent.click(button("Confirm the NPCs' movement"))
    await waitFor(() => expect(sentOf('npcMovement')[0].payload).toEqual({ type: 'npcMovement', choices: { [ROY]: stay } }))
    cleanup()
    show('gm', 'gm', fightAfter(...rolled, { type: 'npcMovement', choices: { [ROY]: { choice: 'pickup', pickup: { itemId: 'floor-ball', qty: 1 } } } }))
    const select = screen.getByRole('combobox', { name: 'Roy Carver movement' }) as HTMLSelectElement
    expect(select.disabled).toBe(true)
    expect(select.value).toBe('pickup:floor-ball')
    cleanup()
    show('gm', 'gm', fightAfter(...rolled, { type: 'npcMovement', choices: { [ROY]: { choice: 'run' } } }))
    expect((screen.getByRole('combobox', { name: 'Roy Carver movement' }) as HTMLSelectElement).value).toBe('run')
  })

  it('names each Floor row Roy can pick up when there is more than one, and lists the Floor plainly', () => {
    const live = fightAfter(...rolled)
    live.fight.state.floor = [...live.fight.state.floor, lubecDetachedItem({ ...knife, id: 'floor-knife' }, [])]
    show('gm', 'gm', live)
    const select = screen.getByRole('combobox', { name: 'Roy Carver movement' })
    expect([...select.querySelectorAll('option')].map((option) => option.textContent)).toEqual(['Move or stay', 'Run', 'Pick up: Dodgeball', 'Pick up: Knife', 'Leave the fight'])
    expect(screen.getByText(/^Knife ×1$/)).toBeTruthy()
    cleanup()
    const bare = fightAfter(...rolled)
    bare.fight.state.floor = []
    show('gm', 'gm', bare)
    expect(screen.getByText('Nothing on the Floor.', { selector: '.mid li' })).toBeTruthy()
  })

  it('answers a Leave', async () => {
    show('gm', 'gm', fightAfter(...rolled, { type: 'move', actor: WAYNE, choice: 'leave' }))
    expect(screen.getByText('Leave the fight (needs you)')).toBeTruthy()
    expect(screen.getByText('Wayne Gardner asks to Leave.')).toBeTruthy()
    fireEvent.click(button('Refuse'))
    await waitFor(() => expect(sentOf('answerLeave')[0].payload).toEqual({ type: 'answerLeave', combatantKey: WAYNE, confirm: false }))
    fireEvent.click(button('Confirm'))
    await waitFor(() => expect(sentOf('answerLeave')[1].payload).toMatchObject({ confirm: true }))
  })

  it('chooses for an absent player in their own window', async () => {
    show('gm', 'gm', fightAfter(...rolled))
    fireEvent.click(button('Away: choose for Wayne Gardner'))
    expect(screen.getByText('Wayne Gardner: what do you do this round?')).toBeTruthy()
    fireEvent.click(button('Confirm movement'))
    await waitFor(() => expect(sentOf('move')[0]).toMatchObject({ envelope: { actorKey: WAYNE }, payload: { choice: 'stay' } }))
  })

  it('shows anyone Out as Out', () => {
    const live = fightAfter(...rolled)
    live.fight.state.combatants[1].outReason = 'gm'
    show('gm', 'gm', live)
    expect(screen.queryByRole('combobox', { name: 'Roy Carver movement' })).toBeNull()
    expect((button("Confirm the NPCs' movement") as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('Declare', () => {
  it('opens the attack window with Declare where Roll sits, and sends the split', async () => {
    show('player', 'wayne-uid', fightAfter(...declaring()))
    expect(screen.getByRole('region', { name: 'Declare' })).toBeTruthy()
    expect(screen.getByText('Stage 2, Declare')).toBeTruthy()
    expect(screen.getByText('Split your Handle against Roy Carver.')).toBeTruthy()
    expect(screen.getByText('Once you declare, everyone can see your split. You roll on your turn.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add a Defense line' }))
    fireEvent.click(button('Declare'))
    await waitFor(() => expect(sentOf('declare')[0]).toMatchObject({ envelope: { actorKey: WAYNE, phase: 'declare' }, payload: { full: false, aim: { ...throwAt, defense: { against: ROY, amount: 20 } } } }))
    expect(rail('Turn order').getByText('Now')).toBeTruthy()
  })

  it('declares Full Defense: no attack, the whole pool on one named line with its +10 on the bar', async () => {
    show('player', 'wayne-uid', fightAfter(...declaring()))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Full Defense' }))
    expect(screen.getByText('Full Defense: put all of your Handle on Defense.')).toBeTruthy()
    expect(screen.getByText('+10')).toBeTruthy()
    expect(document.querySelector('.dim')).toBeTruthy()
    fireEvent.click(button('Declare Full Defense'))
    await waitFor(() => expect(sentOf('declare')[0].payload).toEqual({ type: 'declare', full: true, against: ROY, aim: { weaponItemId: 'ball', attackId: 'throw' } }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Full Defense' }))
    expect(button('Declare')).toBeTruthy()
  })

  it('lets the GM declare for an absent player, and for an NPC in the same window', async () => {
    show('gm', 'gm', fightAfter(...declaring()))
    expect(screen.getByText('Waiting on Wayne Gardner')).toBeTruthy()
    expect(screen.getByText('Nobody has declared yet. Wayne Gardner is next, then Roy Carver.')).toBeTruthy()
    fireEvent.click(button('Away from the table? Declare for Wayne Gardner'))
    expect(screen.getByRole('region', { name: 'Declare' })).toBeTruthy()
    cleanup()
    show('gm', 'gm', fightAfter(...declaring(), { type: 'declare', actor: WAYNE, aim: throwAt }))
    expect(screen.getByText(/Wayne Gardner/, { selector: '.notice b' })).toBeTruthy()
    expect(screen.getByText(/has declared a throw at you \(ATK 61\)/)).toBeTruthy()
    expect(screen.getByRole('radio', { name: /^Wayne Gardner/ }).querySelector('.badge')!.textContent).toBe('Throws at you')
  })

  it('shows the waiting declarer their own declaration and everyone every split', () => {
    show('player', 'wayne-uid', fightAfter(...declaring(), { type: 'declare', actor: WAYNE, aim: { ...throwAt, defense: { against: ROY, amount: 20 } } }))
    expect(screen.getByText('The fight is waiting on Roy Carver')).toBeTruthy()
    expect(screen.getByText('Roy Carver is the last to declare. Then the attacks begin, fastest first.')).toBeTruthy()
    expect(screen.getByText('Your declaration')).toBeTruthy()
    expect(screen.getByText('Wayne Gardner: a Dodgeball in the left hand and a Knife in the right hand.')).toBeTruthy()
    const declarations = rail('Declarations')
    expect(declarations.getByText('YOU')).toBeTruthy()
    expect(declarations.getByText('Declaring now...')).toBeTruthy()
    expect(document.querySelector('.decls li.you .txt')!.textContent).toBe('Throw with the Dodgeball at Roy Carver. ATK 41; Defense 20 against Roy Carver.')
  })

  it('marks a declaration aimed at the viewer, a runner and Full Defense in the rail', () => {
    // Roy's Full Defense as it stands in the rail before the round moves on by itself.
    const live = fightAfter(...declaring({ choice: 'run' }))
    live.fight.state.combatants[1].declaration = { ran: false, full: true, aim: null, frozen: null, total: 46, lines: [{ against: WAYNE, amount: 46 }], sourceRevision: 1 }
    live.fight.state.phase = 'attack'
    show('player', 'wayne-uid', live)
    expect(document.querySelector('.decls li.atyou .txt')!.textContent).toBe('Full Defense: no attack. Defense 46 Full against Wayne Gardner.')
    expect(document.querySelector('.decls li.you .txt')!.textContent).toBe('Ran: no attack and no Defense this round.')
    expect(screen.getByText('AT YOU')).toBeTruthy()
  })

  it('picks the weapon, target and use in the window, and guards Full Defense against the person chosen', async () => {
    show('player', 'wayne-uid', fightAfter(...declaring()))
    fireEvent.click(screen.getByRole('button', { name: 'Right hand' }))
    fireEvent.click(screen.getByRole('radio', { name: /^Roy Carver/ }))
    const uses = within(document.querySelector('.win-grid') as HTMLElement).queryAllByRole('radio').filter((entry) => entry.classList.contains('mode'))
    if (uses[0]) fireEvent.click(uses[0])
    fireEvent.click(screen.getByRole('checkbox', { name: 'Full Defense' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Defense against' }), { target: { value: ROY } })
    fireEvent.click(button('Declare Full Defense'))
    await waitFor(() => expect(sentOf('declare')[0].payload).toMatchObject({ full: true, against: ROY, aim: { weaponItemId: 'knife' } }))
  })

  it('declares Full Defense on Handle alone when nothing in hand can attack', async () => {
    const walkie = { ...knife, id: 'walkie', kind: 'thing', name: 'Walkie-talkie', mode: undefined, impact: undefined, wounds: undefined, slot: 0 } as unknown as LubecItem
    const box = { ...walkie, id: 'box', name: 'Box', slot: 1 } as LubecItem
    const holding = () => kid('wayne', 'Wayne Gardner', 'wayne-uid', [walkie, box])
    currentWayne = holding
    mocks.roster = { characters: [holding()], npcs: [{ npc: royNpc, sheet: royRecord() }] }
    show('player', 'wayne-uid', fightAfter(...declaring()))
    expect(screen.queryByRole('button', { name: 'Declare' })).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Full Defense' }))
    expect(screen.getByText('Handle 46 =')).toBeTruthy()
    expect(screen.getByText('Wayne Gardner: a Walkie-talkie in the left hand and a Box in the right hand.')).toBeTruthy()
    fireEvent.click(button('Declare Full Defense'))
    await waitFor(() => expect(sentOf('declare')[0].payload).toEqual({ type: 'declare', full: true, against: ROY, aim: null }))
  })

  it('reads an NPC\'s sheet before the GM declares for it', () => {
    mocks.roster = { characters: [wayne()], npcs: [{ npc: royNpc, sheet: null }] }
    show('gm', 'gm', fightAfter(...declaring(), { type: 'declare', actor: WAYNE, aim: throwAt }))
    expect(screen.getByText("Reading Roy Carver's sheet...")).toBeTruthy()
    cleanup()
    mocks.roster = { characters: [], npcs: [] }
    show('player', 'wayne-uid', fightAfter(...declaring()))
    expect(screen.getByText("Reading Wayne Gardner's sheet...")).toBeTruthy()
    expect(document.querySelector('.hand')).toBeNull()
  })

  it('strikes through a declaration whose maker went Out', () => {
    const live = fightAfter(...declaring(), { type: 'declare', actor: WAYNE, aim: throwAt })
    live.fight.state.combatants[0].outReason = 'gm'
    show('player', 'marcy-uid', live)
    expect(screen.getByText('Stopped: Out')).toBeTruthy()
  })
})
