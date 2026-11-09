// @vitest-environment jsdom
/**
 * Declared attacks as each seat sees them: the attacker's locked window with
 * Roll, the GM's range and wait, everyone else's wait, the declared Defense
 * roll, choosing again when the target or weapon has gone, the last result in
 * view, the GM's tools and the outcome when Out stops an attack.
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
const royRecord = () => kid('roy', 'Roy Carver', 'gm', [{ ...ball, id: 'roy-ball' }])
const sheetOf = (record: ReturnType<typeof kid>, kind: 'character' | 'npc'): CombatSheet =>
  ({ kind, sheetId: record.id, name: record.name, ownerUserId: record.ownerUserId, portraitPath: '', sheet: record.lubec, revision: 1 })
const royNpc = { id: 'roy', name: 'Roy Carver', portraitUrl: null, portraitFocusX: 50, portraitFocusY: 50, tokenIcon: { icon: 'pawn', color: '#555555', size: 34 } } as NpcRecord

type Step = { type: string; actor?: string | null; awaitReview?: boolean; dice?: Record<string, number>; [key: string]: unknown }

/** A fight played through the engine with each purpose's die scripted. */
function fightAfter(...steps: Step[]): LubecLiveFight {
  const sheets = [sheetOf(currentWayne(), 'character'), sheetOf(royRecord(), 'npc')]
  let records: CombatRecords = { activeFightId: null, fight: null, sheets, items: new Map() }
  const all: Step[] = [{ type: 'start', combatants: [{ kind: 'character', sheetId: 'wayne' }, { kind: 'npc', sheetId: 'roy' }], floor: [], dodgeball: true }, ...steps]
  all.forEach(({ actor = null, dice = {}, awaitReview = false, ...payload }, index) => {
    const state = records.fight?.state
    const command: CombatCommand = {
      envelope: { id: `step-${index}`, groupId: 'school', campaignId: 'gym', fightId: 'fight', round: state?.round ?? 0, phase: state?.phase ?? 'setup', stageInstanceId: state?.stageInstanceId ?? 'setup', actorKey: actor, interactionSequence: state?.combatants.find((entry) => entry.key === actor)?.interactionSequence ?? 0 },
      seed: 'seed', payload: payload as CombatCommand['payload'],
    }
    const entropy = combatEntropy(command)
    const scripted = { ...entropy, die: (purpose: string, sides: number) => dice[purpose] ?? entropy.die(purpose, sides) }
    records = { ...records, activeFightId: 'fight', fight: planCombatCommand(command, records, { userId: 'gm', isGm: true }, undefined, scripted).fight }
    // Ordinary fixtures include GM approval; review-specific cases stop at submission.
    if (payload.type === 'declare' && !awaitReview) {
      const current = records.fight!.state
      const approval: CombatCommand = { ...command, envelope: { ...command.envelope, id: `approval-${index}`, actorKey: null, interactionSequence: 0, stageInstanceId: current.stageInstanceId }, payload: { type: 'answerDeclaration', combatantKey: actor, approve: true } }
      records = { ...records, fight: planCombatCommand(approval, records, { userId: 'gm', isGm: true }).fight }
    }
    if (index === 0) records.fight!.state.floor = [floorBall()]
  })
  return { id: 'fight', fight: records.fight! }
}

const WAYNE = 'character:wayne'
const ROY = 'npc:roy'
/** Roy rolls 20 and Wayne 10: Roy is faster, so Wayne declares first. */
const rolled: Step[] = [{ type: 'begin' }, { type: 'npcInitiative', dice: { initiative: 20 } }, { type: 'initiative', actor: WAYNE, dice: { initiative: 10 } }]
const stay = { choice: 'stay', pickup: null }
const wayneThrow = { targetKey: ROY, weaponItemId: 'ball', attackId: 'throw', defense: { against: ROY, amount: 20 } }
const royThrow = { targetKey: WAYNE, weaponItemId: 'roy-ball', attackId: 'throw', defense: { against: WAYNE, amount: 20 } }
/** Both declared: Roy (faster) throws at Wayne first, then Wayne throws at Roy. */
const attacking: Step[] = [
  ...rolled, { type: 'move', actor: WAYNE, ...stay }, { type: 'npcMovement', choices: { [ROY]: stay } }, { type: 'settleMovement' },
  { type: 'declare', actor: WAYNE, aim: wayneThrow }, { type: 'declare', actor: ROY, aim: royThrow },
]
const range: Step = { type: 'range', band: 'medium', modifier: 0 }
/** Roy misses: Wayne's turn opens, Roy's miss still in view. */
const wayneTurn: Step[] = [...attacking, range, { type: 'roll', actor: ROY, aim: royThrow, dice: { attack: 99 } }]

const show = (role: Role, userId: string, live: LubecLiveFight) => render(
  <MemoryRouter initialEntries={['/groups/school/campaigns/gym/combat']}>
    <LubecCombatContext value={{ enabled: true, ready: true, live }}>
      <Routes><Route path="*" element={<LubecCombat campaign={campaign} role={role} user={{ uid: userId } as User} username="someone" setError={() => undefined} characterTabProps={null} />} /></Routes>
    </LubecCombatContext>
  </MemoryRouter>,
)
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const sentOf = (type: string) => mocks.sent.filter((command) => command.payload.type === type)

beforeEach(() => {
  mocks.sent = []
  mocks.outcome = { ok: true, fightId: 'fight', generatedIds: [], rolls: [] }
  currentWayne = wayne
  mocks.roster = { characters: [wayne()], npcs: [{ npc: royNpc, sheet: royRecord() }] }
})
afterEach(cleanup)

describe('a declared attack on its turn', () => {
  it('locks the declared split for the attacker, with Roll live once the GM ranges it', async () => {
    show('player', 'wayne-uid', fightAfter(...wayneTurn, range))
    expect(screen.getByText('Stage 3, Attack')).toBeTruthy()
    expect(screen.getByText('Your declared split is locked. Only Roll is left.')).toBeTruthy()
    expect(document.querySelector('.defense-lines b')!.textContent).toBe('Roy Carver')
    expect(screen.queryByRole('button', { name: 'Add a Defense line' })).toBeNull()
    expect((document.querySelector('.divider') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('A miss')).toBeTruthy()
    fireEvent.click(button('Roll'))
    await waitFor(() => expect(sentOf('roll')[0]).toMatchObject({ envelope: { actorKey: WAYNE, phase: 'attack' }, payload: { aim: wayneThrow } }))
    expect(within(document.querySelector('.turns li.now') as HTMLElement).getByText('Now')).toBeTruthy()
  })

  it('shows a declared attack without a Defense line, and the table\'s refusal', async () => {
    const bare = [...rolled, { type: 'move', actor: WAYNE, ...stay }, { type: 'npcMovement', choices: { [ROY]: stay } }, { type: 'settleMovement' },
      { type: 'declare', actor: WAYNE, aim: { ...wayneThrow, defense: null } }, { type: 'declare', actor: ROY, full: true, against: WAYNE }]
    mocks.outcome = { ok: false, reason: 'That attack step is stale.' }
    show('player', 'wayne-uid', fightAfter(...bare, range))
    expect(document.querySelector('.defense-lines')).toBeNull()
    fireEvent.click(button('Roll'))
    expect(await screen.findByText('That attack step is stale.')).toBeTruthy()
  })

  it('rolls a Full Defense line at +10', () => {
    const full = [...rolled, { type: 'move', actor: WAYNE, ...stay }, { type: 'npcMovement', choices: { [ROY]: stay } }, { type: 'settleMovement' },
      { type: 'declare', actor: WAYNE, full: true, against: ROY }, { type: 'declare', actor: ROY, aim: royThrow }, range, { type: 'roll', actor: ROY, aim: royThrow, dice: { attack: 10 } }]
    show('player', 'wayne-uid', fightAfter(...full))
    expect(screen.getByText(/kept 46 for Full Defense against Roy Carver/)).toBeTruthy()
    expect(screen.getByText('+10')).toBeTruthy()
  })

  it('waits for the range before the Roll, and shows the GM the range and the way to roll for an absent player', () => {
    show('player', 'wayne-uid', fightAfter(...wayneTurn))
    expect((button('Roll') as HTMLButtonElement).disabled).toBe(true)
    cleanup()
    show('gm', 'gm', fightAfter(...wayneTurn))
    expect(screen.getByText('Stage 3, Attack, fastest first')).toBeTruthy()
    expect(screen.getByText('Declare the range')).toBeTruthy()
    expect(button('Away from the table? Roll for Wayne Gardner')).toBeTruthy()
  })

  it('tells everyone else who the fight is waiting on, and whether they are next', () => {
    show('player', 'wayne-uid', fightAfter(...attacking, range))
    expect(screen.getByText('The fight is waiting on Roy Carver')).toBeTruthy()
    expect(screen.getByText('Roy Carver is about to throw at Wayne Gardner. You are next.')).toBeTruthy()
    expect(screen.getByText('Your declaration')).toBeTruthy()
    cleanup()
    show('player', 'marcy-uid', fightAfter(...attacking))
    expect(screen.getByText('The fight is waiting on the GM')).toBeTruthy()
    expect(screen.getByText('Roy Carver is about to throw at Wayne Gardner.')).toBeTruthy()
  })

  it('has the defender roll the declared line, with no split to choose', async () => {
    const hit = fightAfter(...attacking, range, { type: 'roll', actor: ROY, aim: royThrow, dice: { attack: 10 } })
    show('player', 'wayne-uid', hit)
    expect(screen.getByText(/kept 20 for Defense against Roy Carver/).textContent).toBe('Wayne Gardner kept 20 for Defense against Roy Carver.')
    expect(screen.queryByRole('checkbox', { name: 'Full Defense' })).toBeNull()
    fireEvent.click(button('Roll Defense'))
    await waitFor(() => expect(sentOf('defend')[0].payload).toEqual({ type: 'defend', split: { amount: 20, full: false } }))
    cleanup()
    show('gm', 'gm', hit)
    expect(screen.getByText('Waiting for Wayne Gardner to roll')).toBeTruthy()
    expect(button('Away from the table? Roll for Wayne Gardner')).toBeTruthy()
  })

  it('reopens the target when it has gone, with Pass for nothing left to choose', async () => {
    show('player', 'wayne-uid', fightAfter(...wayneTurn, { type: 'takeOut', combatantKey: ROY }))
    expect(screen.getByText('Roy Carver is Out.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Roll' })).toBeNull()
    fireEvent.click(button('Pass'))
    await waitFor(() => expect(sentOf('pass')[0]).toMatchObject({ envelope: { actorKey: WAYNE } }))
  })

  it('offers the Floor when the weapon has gone, which uses the action', async () => {
    const unarmed = () => kid('wayne', 'Wayne Gardner', 'wayne-uid', [knife])
    mocks.roster = { characters: [unarmed()], npcs: [{ npc: royNpc, sheet: royRecord() }] }
    show('player', 'wayne-uid', fightAfter(...wayneTurn))
    expect(screen.getByText('The dodgeball is no longer in your hand.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Pick up here: costs the action/ }))
    await waitFor(() => expect(sentOf('floorPickup')[0].payload).toEqual({ type: 'floorPickup', itemId: 'floor-ball' }))
    cleanup()
    const bare = fightAfter(...wayneTurn)
    bare.fight.state.floor = []
    show('player', 'wayne-uid', bare)
    expect(screen.queryByRole('button', { name: /Pick up here/ })).toBeNull()
    expect(button('Pass')).toBeTruthy()
  })

  it('gives the finished result way to the next round, keeping only its outcome in view', () => {
    show('player', 'wayne-uid', fightAfter(...wayneTurn, range, { type: 'roll', actor: WAYNE, aim: wayneThrow, dice: { attack: 99 } }))
    expect(screen.getByText('What do you do this round?')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Result' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'A miss' })).toBeTruthy()
  })

  it('says Out stopped an attack already rolled, and strikes the stopped declaration', () => {
    const hit = [...attacking, range, { type: 'roll', actor: ROY, aim: royThrow, dice: { attack: 10 } }, { type: 'takeOut', combatantKey: ROY }]
    show('player', 'wayne-uid', fightAfter(...hit))
    expect(screen.getByRole('heading', { name: 'Stopped: Roy Carver is Out' })).toBeTruthy()
    expect(screen.getByText('Stopped: Out')).toBeTruthy()
    expect(screen.getByText(/Out: taken out by the GM/)).toBeTruthy()
    cleanup()
    show('player', 'wayne-uid', fightAfter(...hit, { type: 'return', combatantKey: ROY }))
    expect(screen.getByText('Stopped', { selector: '.badge' })).toBeTruthy()
  })
})

describe('the GM\'s tools', () => {
  const tool = (value: string) => fireEvent.change(screen.getByRole('combobox', { name: 'GM tools' }), { target: { value } })

  it('offers exactly the mock-up\'s four tools', () => {
    show('gm', 'gm', fightAfter(...rolled))
    expect([...screen.getByRole('combobox', { name: 'GM tools' }).querySelectorAll('option')].map((option) => option.textContent)).toEqual([
      'GM tools...', 'A player is away from the table: act for them', 'Take someone out of the fight, or return them', 'Place an item on the Floor', 'End combat',
    ])
  })

  it('acts for an away player in their own window', () => {
    show('gm', 'gm', fightAfter(...wayneTurn))
    tool('actfor')
    fireEvent.change(screen.getByRole('combobox', { name: 'Who' }), { target: { value: WAYNE } })
    expect(screen.getByText('Your declared split is locked. Only Roll is left.')).toBeTruthy()
  })

  it('takes someone out of the fight and returns them', async () => {
    show('gm', 'gm', fightAfter(...rolled))
    tool('out')
    fireEvent.change(screen.getByRole('combobox', { name: 'Who' }), { target: { value: ROY } })
    fireEvent.click(button('Take out Roy Carver'))
    await waitFor(() => expect(sentOf('takeOut')[0].payload).toEqual({ type: 'takeOut', combatantKey: ROY }))
    cleanup()
    mocks.outcome = { ok: false, reason: 'Waiting for wounds to reach the sheet' }
    show('gm', 'gm', fightAfter(...rolled, { type: 'takeOut', combatantKey: ROY }))
    tool('out')
    fireEvent.change(screen.getByRole('combobox', { name: 'Who' }), { target: { value: ROY } })
    expect(screen.getByRole('option', { name: 'Roy Carver (Out)' })).toBeTruthy()
    fireEvent.click(button('Return Roy Carver'))
    await waitFor(() => expect(sentOf('return')[0].payload).toEqual({ type: 'return', combatantKey: ROY }))
  })
})
