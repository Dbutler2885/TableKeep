// @vitest-environment jsdom
/**
 * The result sequence after a granted hit, as each seat sees it: the
 * defender's split and Defense roll, the catch, the doll, Strength, Impact
 * and each way an attack ends. Only a step's owner has its controls.
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
const slashAt = { targetKey: ROY, weaponItemId: 'knife', attackId: 'slash', defense: null }
/** Wayne throws (61 to hit) and rolls `die`; a thrown attack waits on the GM's range first. */
const hit = (die: number, aim = throwAt): Step[] => [
  { type: 'grant', combatantKey: WAYNE }, { type: 'aim', actor: WAYNE, aim },
  ...(aim === throwAt ? [{ type: 'range', band: 'medium', modifier: 0 }] : []),
  { type: 'roll', actor: WAYNE, aim, dice: { attack: die } },
]
const defended = (die: number, split: object, dice: Record<string, number>, aim = throwAt) =>
  [...hit(die, aim), { type: 'defend', actor: ROY, split, dice }]
const landed = (aim = throwAt): Step[] => defended(27, { amount: 0 }, { landing: 30 }, aim)

const show = (role: Role, userId: string, live: LubecLiveFight) => render(
  <MemoryRouter initialEntries={['/groups/school/campaigns/gym/combat']}>
    <LubecCombatContext value={{ enabled: true, ready: true, live }}>
      <Routes><Route path="*" element={<LubecCombat campaign={campaign} role={role} user={{ uid: userId } as User} username="someone" setError={() => undefined} characterTabProps={null} />} /></Routes>
    </LubecCombatContext>
  </MemoryRouter>,
)
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const sentOf = (type: string) => mocks.sent.filter((command) => command.payload.type === type)
const card = (name: string) => screen.getByText(name, { selector: '.sh span span + *, .sh > span' }).closest('.st') as HTMLElement

beforeEach(() => {
  mocks.sent = []
  mocks.outcome = { ok: true, fightId: 'fight', generatedIds: [], rolls: [] }
  mocks.roster = { characters: [wayne()], npcs: [{ npc: royNpc, sheet: royRecord() }] }
})
afterEach(cleanup)

describe('Defense after a hit', () => {
  it('asks the GM for Roy\'s grant-local split and sends it, with Full Defense\'s +10 only on the bar', async () => {
    show('gm', 'gm', fightAfter(...hit(27)))
    expect(screen.getByText(/Split your Handle for Defense against/).textContent).toContain('Wayne Gardner')
    expect(document.querySelector('.st.active .allocation-label strong')!.textContent).toBe('40')
    fireEvent.keyDown(button('Defense line at 40'), { key: 'ArrowLeft' })
    fireEvent.click(button('Roll Defense'))
    await waitFor(() => expect(sentOf('defend')).toHaveLength(1))
    expect(sentOf('defend')[0]).toMatchObject({ envelope: { actorKey: ROY, step: 'defense' }, payload: { split: { amount: 30, full: false } } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Full Defense/ }))
    expect(document.querySelector('.st.active .fd10')!.textContent).toBe('+10')
    expect(screen.queryByRole('button', { name: /Defense line at/ })).toBeNull()
    fireEvent.click(button('Roll Defense'))
    await waitFor(() => expect(sentOf('defend').at(-1)!.payload).toEqual({ type: 'defend', split: { amount: 46, full: true } }))
  })

  it('offers No Defense at 0, and shows a refusal', async () => {
    mocks.outcome = { ok: false, reason: 'Keep Defense in tens, within your Handle.' }
    show('gm', 'gm', fightAfter(...hit(27)))
    for (let step = 0; step < 4; step++) fireEvent.keyDown(screen.getByRole('button', { name: /Defense line at/ }), { key: 'ArrowLeft' })
    fireEvent.click(button('No Defense'))
    expect(await screen.findByText('Keep Defense in tens, within your Handle.')).toBeTruthy()
  })

  it('makes the attacker and spectators wait on the GM, and reads the defender\'s sheet first', () => {
    show('player', 'wayne-uid', fightAfter(...hit(27)))
    expect(screen.getByText("Waiting for the GM to roll Roy Carver's defense")).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Roll Defense' })).toBeNull()
    cleanup()
    mocks.roster = { characters: [], npcs: [] }
    show('gm', 'gm', fightAfter(...hit(27)))
    expect(screen.getByText("Reading Roy Carver's sheet...")).toBeTruthy()
  })

  it('shows a failed Defense taking off nothing, and a Defense of 0 as none', () => {
    show('player', 'marcy-uid', fightAfter(...defended(27, { amount: 20 }, { defense: 61, landing: 30 })))
    expect(screen.getByText(/kept 20 for Defense against/)).toBeTruthy()
    expect(screen.getByText('Defense fails. It takes off nothing.')).toBeTruthy()
    expect(screen.getByText('Left').nextSibling!.textContent).toBe('2')
    cleanup()
    show('player', 'marcy-uid', fightAfter(...landed()))
    expect(screen.getByText(/kept no Defense against/)).toBeTruthy()
  })
})

describe('the catch', () => {
  const stopped = () => fightAfter(...defended(14, { amount: 20 }, { defense: 15 }))

  it('shows the GM why Roy may catch, the chance built from its parts, and sends the roll', async () => {
    show('gm', 'gm', stopped())
    expect(screen.getByText('Defense holds. It takes off 1 + 1 = 2.')).toBeTruthy()
    expect(screen.getByText(/Below 0\./).closest('p')!.textContent).toContain('That is 1 below 0.')
    expect(within(document.querySelector('.st.active')!).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['It hit', 'Defense took it to -1 (below 0)', 'A free hand', 'A catchable item: dodgeball, 50%'])
    expect(screen.getByText('Catch chance').nextSibling!.textContent).toBe('60%')
    fireEvent.click(button('Roll catch'))
    await waitFor(() => expect(sentOf('catch')).toEqual([expect.objectContaining({ envelope: expect.objectContaining({ actorKey: ROY, step: 'catch' }) })]))
  })

  it('shows a stop at exactly 0, and a Full Defense by name', () => {
    show('gm', 'gm', fightAfter(...defended(14, { amount: 20 }, { defense: 5 })))
    expect(screen.getByText('Defense took it to 0')).toBeTruthy()
    expect(screen.getByText(/Down to 0\./).closest('p')!.textContent).toBe('Down to 0. The throw is dodged.')
    cleanup()
    show('gm', 'gm', fightAfter(...defended(27, { full: true }, { defense: 90, landing: 30 })))
    expect(screen.getByText(/kept 46 for Full Defense against/)).toBeTruthy()
  })

  it('makes the thrower wait on the GM\'s catch', () => {
    show('player', 'wayne-uid', stopped())
    expect(screen.getByText("Waiting for the GM to roll Roy Carver's catch")).toBeTruthy()
  })

  it('ends with the catch: Wayne Out, or still a dodge', () => {
    show('player', 'wayne-uid', fightAfter(...defended(14, { amount: 20 }, { defense: 15 }), { type: 'catch', actor: ROY, dice: { catch: 44 } }))
    expect(screen.getByRole('heading', { name: 'Caught: Wayne Gardner is Out' })).toBeTruthy()
    expect(screen.getByText('Caught. 44 is under 60.')).toBeTruthy()
    cleanup()
    show('player', 'wayne-uid', fightAfter(...defended(14, { amount: 20 }, { defense: 15 }), { type: 'catch', actor: ROY, dice: { catch: 71 } }))
    expect(screen.getByRole('heading', { name: 'Dodged' }).nextSibling!.textContent).toContain('could not hold it')
    expect(screen.getByText('Dropped. 71 is not under 60: still a dodge.')).toBeTruthy()
  })

  it('shows no banner for an attack interrupted before it ended', () => {
    const live = stopped()
    live.fight.state.attack = { ...live.fight.state.attack!, closed: true, detached: [] }
    show('player', 'marcy-uid', live)
    expect(document.querySelector('.outcome')).toBeNull()
  })

  it('ends a stop with no catch possible as a dodge', () => {
    show('player', 'marcy-uid', fightAfter(...defended(14, { amount: 20 }, { defense: 5 }, slashAt)))
    expect(screen.getByRole('heading', { name: 'Dodged' }).nextSibling!.textContent).toBe('Roy Carver stops it. Wayne Gardner is not Out.')
  })
})

describe('the doll, Strength and the wound', () => {
  it('lets Wayne keep or move the hit within reach and sends where it hits', async () => {
    show('player', 'wayne-uid', fightAfter(...landed()))
    expect(screen.getByText("It lands on Roy Carver's waist.")).toBeTruthy()
    const doll = screen.getByRole('radiogroup', { name: 'Where it lands' })
    expect(within(doll).getByRole('radio', { name: 'Head: out of reach' }).getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(within(doll).getByRole('radio', { name: 'Left thigh: quality 1' }))
    expect(button('Hit the left thigh')).toBeTruthy()
    fireEvent.click(button('Keep it on the waist'))
    fireEvent.keyDown(within(doll).getByRole('radio', { name: 'Torso: quality 1' }), { key: 'Enter' })
    fireEvent.keyDown(within(doll).getByRole('radio', { name: 'Waist: quality 2' }), { key: 'x' })
    fireEvent.click(button('Hit the torso'))
    await waitFor(() => expect(sentOf('land')[0]).toMatchObject({ envelope: { actorKey: WAYNE, step: 'location' }, payload: { part: 'torso' } }))
  })

  it('makes the GM wait on Wayne for the hit, with the way to act for him', () => {
    show('gm', 'gm', fightAfter(...landed()))
    expect(screen.getByText('Waiting for Wayne Gardner to roll')).toBeTruthy()
    fireEvent.click(button('Away from the table? Roll for Wayne Gardner'))
    expect(button('Hit the waist')).toBeTruthy()
  })

  it('offers Wayne the Strength roll on its own bar, then shows Impact built from its parts and the pending Dodgeball row', async () => {
    const placed = [...landed(), { type: 'land', actor: WAYNE, part: 'waist' }]
    show('player', 'wayne-uid', fightAfter(...placed))
    expect(screen.getByText('Hits Roy Carver\'s waist.')).toBeTruthy()
    fireEvent.click(button('Roll Strength'))
    await waitFor(() => expect(sentOf('strength')).toHaveLength(1))
    cleanup()
    show('player', 'marcy-uid', fightAfter(...placed, { type: 'strength', actor: WAYNE, dice: { strength: 31 } }))
    expect(screen.getByText('Strength roll: adds +3 to Impact')).toBeTruthy()
    expect([...document.querySelectorAll('.impact:not(.roll-chips) .chip dt')].map((term) => term.textContent)).toEqual(['Quality', 'Base', 'Strength 31', 'Moved', 'Impact'])
    expect(screen.getByText('The wound is read on the Dodgeball table next.')).toBeTruthy()
  })

  it('shows a failed Strength roll, armor as its own chip, and Impact of 0 or less as no wound', () => {
    const live = fightAfter(...landed())
    live.fight.state.combatants = live.fight.state.combatants.map((entry) => (entry.key === ROY ? { ...entry, armor: [{ locs: ['waist'], armor: { blunt: 9, cut: 0, pierce: 0, gun: 0 } }] } : entry))
    const records = live.fight
    const after = (steps: Step[]) => {
      let fight = records
      steps.forEach(({ actor = null, dice = {}, ...payload }, index) => {
        const command: CombatCommand = { envelope: { id: `more-${index}`, groupId: 'school', campaignId: 'gym', fightId: 'fight', round: 0, phase: fight.state.phase, stageInstanceId: fight.state.stageInstanceId, actorKey: actor, interactionSequence: fight.state.combatants.find((entry) => entry.key === actor)!.interactionSequence }, seed: 's', payload: payload as CombatCommand['payload'] }
        const entropy = combatEntropy(command)
        fight = planCombatCommand(command, { activeFightId: 'fight', fight, sheets: [sheetOf(wayne(), 'character'), sheetOf(royRecord(), 'npc')], items: new Map() }, { userId: 'gm', isGm: true }, undefined, { ...entropy, die: (purpose) => dice[purpose] }).fight
      })
      return { id: 'fight', fight }
    }
    show('player', 'marcy-uid', after([{ type: 'land', actor: WAYNE, part: 'waist' }, { type: 'strength', actor: WAYNE, dice: { strength: 99 } }]))
    expect(screen.getByText('Strength roll: adds nothing')).toBeTruthy()
    expect(screen.getByText('Armor').nextSibling!.textContent).toBe('9')
    expect(screen.getByRole('heading', { name: 'No effect' })).toBeTruthy()
    expect(screen.getByText('Impact -7: a hit with no effect.')).toBeTruthy()
  })

  it('leaves a table not wired yet for the GM to record', () => {
    show('gm', 'gm', fightAfter(...landed(slashAt), { type: 'land', actor: WAYNE, part: 'torso' }, { type: 'strength', actor: WAYNE, dice: { strength: 10 } }))
    expect(screen.getByRole('heading', { name: 'The GM records this wound' }).nextSibling!.textContent).toBe('Cutting table, torso, Impact 4.')
    expect(screen.getByText(/The GM records this wound on Roy Carver's sheet\./)).toBeTruthy()
  })

  it('marks a small part\'s landing with the small crosshair', () => {
    show('player', 'wayne-uid', fightAfter(...defended(27, { amount: 0 }, { landing: 60, side: 2 })))
    expect(screen.getByText("It lands on Roy Carver's right hand.")).toBeTruthy()
    expect(document.querySelector('.cross circle')!.getAttribute('r')).toBe('22')
  })

  it('shows a spectator the Strength wait with no bar when they cannot read the attacker\'s sheet', () => {
    mocks.roster = { characters: [], npcs: [] }
    show('player', 'marcy-uid', fightAfter(...landed(), { type: 'land', actor: WAYNE, part: 'waist' }))
    expect(screen.getByText('Waiting for Wayne Gardner to roll')).toBeTruthy()
    expect(screen.getByText('It adds a Strength roll.', { exact: false })).toBeTruthy()
  })

  it('takes a firearm\'s hit straight to Impact, with no Strength roll', () => {
    const gun: LubecItem = { id: 'gun', kind: 'weapon', mode: 'firearm', name: 'Revolver', carrier: 'hands', slot: 1, size: 1, qty: 1, weight: 'normal', note: '', impact: 2, capacity: 6, loaded: 1 }
    mocks.roster = { characters: [kid('wayne', 'Wayne Gardner', 'wayne-uid', [ball, gun])], npcs: [] }
    const shoot = { targetKey: ROY, weaponItemId: 'gun', attackId: 'shoot', defense: null }
    const sheets = [sheetOf(kid('wayne', 'Wayne Gardner', 'wayne-uid', [ball, gun]), 'character'), sheetOf(royRecord(), 'npc')]
    let records: CombatRecords = { activeFightId: null, fight: null, sheets, items: new Map() }
    const steps: Step[] = [{ type: 'start', combatants: [{ kind: 'character', sheetId: 'wayne' }, { kind: 'npc', sheetId: 'roy' }], floor: [], dodgeball: true }, { type: 'grant', combatantKey: WAYNE }, { type: 'aim', actor: WAYNE, aim: shoot }, { type: 'range', band: 'short', modifier: 0 }, { type: 'roll', actor: WAYNE, aim: shoot, dice: { attack: 27, landing: 30 } }, { type: 'land', actor: WAYNE, part: 'waist' }]
    steps.forEach(({ actor = null, dice = {}, ...payload }, index) => {
      const state = records.fight?.state
      const command: CombatCommand = { envelope: { id: `gun-${index}`, groupId: 'school', campaignId: 'gym', fightId: 'fight', round: 0, phase: state?.phase ?? 'setup', stageInstanceId: state?.stageInstanceId ?? 'setup', actorKey: actor, interactionSequence: state?.combatants.find((entry) => entry.key === actor)?.interactionSequence ?? 0 }, seed: 's', payload: payload as CombatCommand['payload'] }
      const entropy = combatEntropy(command)
      records = { ...records, activeFightId: 'fight', fight: planCombatCommand(command, records, { userId: 'gm', isGm: true }, undefined, { ...entropy, die: (purpose, sides) => dice[purpose] ?? entropy.die(purpose, sides) }).fight }
    })
    show('player', 'wayne-uid', { id: 'fight', fight: records.fight! })
    expect(screen.queryByText(/Strength roll/)).toBeNull()
    expect([...document.querySelectorAll('.impact:not(.roll-chips) .chip dt')].map((term) => term.textContent)).toEqual(['Quality', 'Base', 'Moved', 'Impact'])
    expect(screen.getByRole('heading', { name: 'The GM records this wound' }).nextSibling!.textContent).toBe('Gunshot table, waist, Impact 3.')
  })

  it('waits on the GM for an NPC attacker\'s Strength, and on a sheet the viewer has not read', () => {
    show('gm', 'gm', fightAfter(...landed(), { type: 'land', actor: WAYNE, part: 'waist' }))
    expect(screen.getByText('Waiting for Wayne Gardner to roll')).toBeTruthy()
    expect(card('The wound')).toBeTruthy()
  })
})
