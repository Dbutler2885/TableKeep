// @vitest-environment jsdom
/**
 * Dodgeball rows and initiative as each seat sees them: the row's wound box,
 * the target's own Check or Save and how the attack ends; then Begin Combat,
 * the initiative rolls and the turn order filling in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { User } from 'firebase/auth'
import type { Campaign, NpcRecord, Role } from '../../../../types/app'
import { makeLubecDirectEntryCharacter } from '../../../ruleSets/lubec/directEntry'
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
const royRecord = () => kid('roy', 'Roy Carver', 'gm', [])
const sheetOf = (record: ReturnType<typeof kid>, kind: 'character' | 'npc'): CombatSheet =>
  ({ kind, sheetId: record.id, name: record.name, ownerUserId: record.ownerUserId, portraitPath: '', sheet: record.lubec, revision: 1 })
const royNpc = { id: 'roy', name: 'Roy Carver', portraitUrl: null, portraitFocusX: 50, portraitFocusY: 50, tokenIcon: { icon: 'pawn', color: '#555555', size: 34 } } as NpcRecord

type Step = { type: string; actor?: string | null; dice?: Record<string, number>; [key: string]: unknown }

/** A fight played through the engine with each purpose's die scripted. */
function fightAfter(...steps: Step[]): LubecLiveFight {
  const sheets = [sheetOf(wayne(), 'character'), sheetOf(royRecord(), 'npc')]
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
  })
  return { id: 'fight', fight: records.fight! }
}

const WAYNE = 'character:wayne'
const ROY = 'npc:roy'
const throwAt = { targetKey: ROY, weaponItemId: 'ball', attackId: 'throw', defense: null }
/** Wayne throws (61 to hit) and rolls `die`; a thrown attack waits on the GM's range first. */
const hit = (die: number, aim = throwAt): Step[] => [
  { type: 'grant', combatantKey: WAYNE }, { type: 'aim', actor: WAYNE, aim },
  ...(aim === throwAt ? [{ type: 'range', band: 'medium', modifier: 0 }] : []),
  { type: 'roll', actor: WAYNE, aim, dice: { attack: die } },
]
const defended = (die: number, split: object, dice: Record<string, number>, aim = throwAt) =>
  [...hit(die, aim), { type: 'defend', actor: ROY, split, dice }]

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
  mocks.roster = { characters: [wayne()], npcs: [{ npc: royNpc, sheet: royRecord() }] }
})
afterEach(cleanup)

/** Wayne's throw lands undefended where a thrown-object d100 of `landing` reaches, Impact = tens(die) + Strength's tens. */
const rowAt = (die: number, landing: number, side: number, strength: number): Step[] => [
  ...defended(die, { amount: 0 }, { landing, side }),
  { type: 'land', actor: WAYNE, part: landing < 12 ? 'head' : landing < 45 ? 'waist' : `hand-${side % 2 ? 'L' : 'R'}` },
  { type: 'strength', actor: WAYNE, dice: { strength } },
]

describe('a Dodgeball row\'s Check or Save', () => {
  it('asks the GM to roll Roy\'s Body Save on Bell rung, with the row in view, and sends it', async () => {
    show('gm', 'gm', fightAfter(...rowAt(60, 5, 4, 99)))
    expect(screen.getByText('Dodgeball · Head and neck · Impact 6')).toBeTruthy()
    expect(screen.getByText('Serious')).toBeTruthy()
    expect(screen.getByText('Trauma +1')).toBeTruthy()
    expect(screen.getByText(/rolls a Body Save/).closest('p')!.textContent).toBe('Roy Carver rolls a Body Save: at or under Body.')
    fireEvent.click(button('Roll Save'))
    await waitFor(() => expect(sentOf('check')[0]).toMatchObject({ envelope: { actorKey: ROY, step: 'check' } }))
    expect(screen.getByText('Still to come: the result')).toBeTruthy()
  })

  it('makes the thrower wait on the GM\'s Save, and shows its result and Roy Out once rolled', () => {
    show('player', 'wayne-uid', fightAfter(...rowAt(60, 5, 4, 99)))
    expect(screen.getByText("Waiting for the GM to roll Roy Carver's Save")).toBeTruthy()
    cleanup()
    show('player', 'wayne-uid', fightAfter(...rowAt(60, 5, 4, 99), { type: 'check', actor: ROY, dice: { check: 99 } }))
    expect(screen.getByText(/^Failure\. 99 is over/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Roy Carver is Out' }).nextSibling!.textContent).toBe('Bell rung: Minor Concussion, which is Dazed and -10 Handle until a Long Rest. The dodgeball lands on the Floor.')
    expect(screen.getAllByText('Out', { selector: '.badge' })).toHaveLength(1)
  })

  it('shows a spectator who cannot read Roy\'s sheet only who the Save waits on', () => {
    mocks.roster = { characters: [], npcs: [] }
    show('player', 'marcy-uid', fightAfter(...rowAt(60, 5, 4, 99)))
    expect(screen.getByText("Waiting for the GM to roll Roy Carver's Save")).toBeTruthy()
    expect(document.querySelector('.st.active .allocation-bar')).toBeNull()
  })

  it('catches the ball on Trapped against the chest: Wayne is Out instead', () => {
    show('player', 'marcy-uid', fightAfter(...rowAt(10, 30, 4, 99), { type: 'check', actor: ROY, dice: { check: 1 } }))
    expect(screen.getByText(/^Success\. 01 is at or under/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Caught it: Wayne Gardner is Out' }).nextSibling!.textContent).toBe('Trapped against the chest: Roy Carver holds on and stays in, and Wayne Gardner is Out instead.')
  })

  it('says which die Disadvantage kept on Fumbled catch', () => {
    const live = fightAfter(...rowAt(20, 62, 1, 99))
    expect(live.fight.state.attack!.row!.name).toBe('Fumbled catch')
    cleanup()
    show('player', 'marcy-uid', fightAfter(...rowAt(20, 62, 1, 99), { type: 'check', actor: ROY, dice: { check: 5 } }))
    expect(screen.getByText(/rolls a Handle Check at Disadvantage/)).toBeTruthy()
    expect(screen.getByText(/Disadvantage kept 05 of 05 and 05\./)).toBeTruthy()
  })

  it('shows the GM Roy\'s Body on the Save\'s bar, and his Handle on a Handle Check\'s', () => {
    show('gm', 'gm', fightAfter(...rowAt(60, 5, 4, 99)))
    expect(document.querySelector('.st.active .allocation-label small')!.textContent).toBe('BODY')
    cleanup()
    show('gm', 'gm', fightAfter(...rowAt(10, 30, 4, 99)))
    expect(document.querySelector('.st.active .allocation-label small')!.textContent).toBe('HANDLE')
  })

  it('heads an Impact above 6 as the 6+ row', () => {
    show('player', 'marcy-uid', fightAfter(...rowAt(60, 70, 2, 31).map((step) => (step.type === 'land' ? { ...step, part: 'thigh-R' } : step))))
    expect(screen.getByText(/Dodgeball · Legs · Impact/).textContent).toBe('Dodgeball · Legs · Impact 6+')
  })

  it('puts both out on a Headshot, and shows a Minor row with no Trauma', () => {
    show('player', 'marcy-uid', fightAfter(...rowAt(30, 5, 4, 99)))
    expect(screen.getByRole('heading', { name: 'Roy Carver and Wayne Gardner are Out' })).toBeTruthy()
    expect(screen.getByText('Minor')).toBeTruthy()
    expect(screen.getByText('Trauma 0')).toBeTruthy()
  })
})

describe('Begin Combat - Roll Initiative', () => {
  it('is the GM\'s once the grants are done, and sends begin', async () => {
    show('gm', 'gm', fightAfter())
    fireEvent.click(button('Begin Combat - Roll Initiative'))
    await waitFor(() => expect(sentOf('begin')).toHaveLength(1))
  })

  it('waits on a wound still on its way to the sheet', () => {
    const live = fightAfter(...rowAt(60, 62, 1, 99))
    show('gm', 'gm', live)
    expect(button('Begin Combat - Roll Initiative').getAttribute('title')).toBe('Wounds must reach the sheet first.')
    expect((button('Begin Combat - Roll Initiative') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('rolling initiative', () => {
  const begun = (...more: Step[]) => fightAfter({ type: 'begin' }, ...more)

  it('gives a player their own Roll on their Speed bar, and the verdict once rolled', async () => {
    show('player', 'wayne-uid', begun())
    expect(screen.getByText('Roll initiative: d100 under your Speed.')).toBeTruthy()
    fireEvent.click(button('Roll'))
    await waitFor(() => expect(sentOf('initiative')[0]).toMatchObject({ envelope: { actorKey: WAYNE, phase: 'initiative' } }))
    cleanup()
    show('player', 'wayne-uid', begun({ type: 'initiative', actor: WAYNE, dice: { initiative: 38 } }))
    expect(screen.getByText(/38 is under \d+: a success\./)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Roll' })).toBeNull()
  })

  it('names each of a player\'s combatants when they have more than one, and shows a failure', () => {
    const live = begun({ type: 'initiative', actor: WAYNE, dice: { initiative: 99 } })
    live.fight.state.combatants = live.fight.state.combatants.map((entry) => ({ ...entry, kind: 'character' as const, ownerUserId: 'both-uid' }))
    show('player', 'both-uid', live)
    expect(screen.getByText('Roy Carver: roll initiative, d100 under Speed.')).toBeTruthy()
    expect(screen.getByText(/99 is not under \d+: a failure\./)).toBeTruthy()
  })

  it('lets the GM roll every NPC with one button, or roll for an absent player', async () => {
    show('gm', 'gm', begun())
    expect(screen.getByText('Not rolled')).toBeTruthy()
    expect(screen.getByText('Rolling on their screen')).toBeTruthy()
    fireEvent.click(button('Roll for NPCs'))
    await waitFor(() => expect(sentOf('npcInitiative')).toHaveLength(1))
    fireEvent.click(button('Away: roll for Wayne Gardner'))
    await waitFor(() => expect(sentOf('initiative')[0]).toMatchObject({ envelope: { actorKey: WAYNE } }))
    cleanup()
    show('gm', 'gm', begun({ type: 'initiative', actor: WAYNE, dice: { initiative: 38 } }))
    expect(screen.queryByRole('button', { name: 'Away: roll for Wayne Gardner' })).toBeNull()
    cleanup()
    show('gm', 'gm', begun({ type: 'npcInitiative', dice: { initiative: 12 } }))
    expect(screen.getByText('Rolled 12')).toBeTruthy()
    expect((button('Roll for NPCs') as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows a refused roll', async () => {
    mocks.outcome = { ok: false, reason: 'Waiting for wounds to reach the sheet' }
    show('gm', 'gm', begun())
    fireEvent.click(button('Roll for NPCs'))
    expect(await screen.findByText('Waiting for wounds to reach the sheet')).toBeTruthy()
  })

  it('tells a spectator who is still to roll, and builds the order as people roll', () => {
    show('player', 'marcy-uid', begun({ type: 'npcInitiative', dice: { initiative: 12 } }))
    expect(screen.getByText('Still to roll: Wayne Gardner.')).toBeTruthy()
    const rail = screen.getByText('Turn order').closest('.panel') as HTMLElement
    expect(within(rail).getByText('as they roll')).toBeTruthy()
    expect([...rail.querySelectorAll('.turns li')].map((row) => row.querySelector('.n')!.textContent)).toEqual(['1', '·'])
    expect(within(rail).getByText(/NPC · Speed \d+ · rolled 12 under/)).toBeTruthy()
  })

  it('sets the order fastest first and moves to round 1 Movement when the last roll is in', () => {
    show('player', 'wayne-uid', begun({ type: 'npcInitiative', dice: { initiative: 12 } }, { type: 'initiative', actor: WAYNE, dice: { initiative: 99 } }))
    expect(screen.getByText('Round 1')).toBeTruthy()
    expect(screen.getByText('Stage 1 · Movement')).toBeTruthy()
    expect(document.querySelector('.pips li.now')!.textContent).toBe('1Movement')
    const rail = screen.getByText('Turn order').closest('.panel') as HTMLElement
    expect(within(rail).getByText('fastest first')).toBeTruthy()
    expect([...rail.querySelectorAll('.nm')].map((name) => name.textContent)).toEqual(['Roy Carver', 'Wayne Gardner'])
    expect(within(rail).getByText('Successes go before failures: higher successes first, lower failures first.')).toBeTruthy()
  })
})
