import { describe, expect, it } from 'vitest'
import { lubecCharacterSheet } from '../../../ruleSets/lubec/sheetFixtures'
import { parseLubecGmItem } from '../../../ruleSets/lubec/gear/gmItem'
import { lubecDetachedItem } from '../../../ruleSets/lubec/gear/detachedItems'
import { planCombatCommand } from './lifecycle'
import { combatEntropy } from './commandEntropy'
import { requireLiveContext } from './context'
import { combatSetupIssues, publicCombatant } from './inputs'
import type { CombatAuthority, CombatCommand, CombatRecords, CombatSheet, CombatState } from './types'

const gm: CombatAuthority = { userId: 'gm', isGm: true }
const sheet = (overrides: Partial<CombatSheet> = {}): CombatSheet => ({ kind: 'character', sheetId: 'hero', name: 'Tommy', ownerUserId: 'player', portraitPath: 'art/hero', sheet: lubecCharacterSheet(), ...overrides })
const ball = (id = 'ball', overrides = {}) => parseLubecGmItem({ name: 'Dodgeball', kind: 'weapon', mode: 'thrown', qty: 6, size: 1, impact: 2, future: { preserved: true }, status: 'dropped', ...overrides }, id)
const command = (type = 'start', payload = {}): CombatCommand => ({
  envelope: { id: 'command', groupId: 'group', campaignId: 'campaign', fightId: 'fight', round: 0, phase: 'before-initiative', stageInstanceId: 'command:stage:0', actorKey: null, interactionSequence: 0 },
  seed: 'fixed-entropy', payload: { type, combatants: [{ kind: 'character', sheetId: 'hero' }], floor: [{ itemId: 'ball', status: 'dropped', qty: 2 }], dodgeball: true, ...payload },
})
const records = (): CombatRecords => ({ activeFightId: null, fight: null, sheets: [sheet()], items: new Map([['ball', ball()]]) })
function live(): CombatRecords {
  const initial = records()
  const started = planCombatCommand(command(), initial, gm)
  return { ...initial, activeFightId: 'fight', fight: started.fight, items: new Map() }
}
const stateOf = (record: CombatRecords): CombatState => record.fight!.state
const rival = () => sheet({ sheetId: 'rival', name: 'Rival', ownerUserId: 'other' })
const npc = () => sheet({ kind: 'npc', sheetId: 'roy', name: 'Roy', ownerUserId: 'gm' })
const crowd = { combatants: [{ kind: 'character', sheetId: 'hero' }, { kind: 'character', sheetId: 'rival' }, { kind: 'npc', sheetId: 'roy' }] }
function liveCrowd(): CombatRecords {
  const initial = { ...records(), sheets: [sheet(), rival(), npc()] }
  return { ...initial, activeFightId: 'fight', fight: planCombatCommand(command('start', crowd), initial, gm).fight, items: new Map() }
}
const act = (type: string, current = live(), payload = {}) => planCombatCommand(command(type, payload), current, gm)

describe('atomic lifecycle intentions', () => {
  it('starts Before initiative at round zero with public summaries and exact dropped remainders', () => {
    const source = records()
    const plan = planCombatCommand(command(), source, gm)
    expect(plan.control).toBe('fight')
    expect(plan.fight).toMatchObject({ status: 'live', participantUserIds: ['player'], state: { round: 0, phase: 'before-initiative', stageInstanceId: 'command:stage:0', attack: null, woundOutbox: [], woundAcknowledgements: [] } })
    expect(plan.fight.state.combatants).toEqual([{ key: 'character:hero', kind: 'character', sheetId: 'hero', name: 'Tommy', ownerUserId: 'player', portraitPath: 'art/hero', speed: 56, armor: [], interactionSequence: 0, outReason: null }])
    expect(plan.items).toEqual([{ id: 'ball', value: { ...ball(), qty: 4 } }])
    expect(plan.fight.state.floor[0].item).toMatchObject({ id: 'item:command:floor%3Aball:0', qty: 2, impact: 2, future: { preserved: true } })
    expect(source.items.get('ball')?.qty).toBe(6)
    expect(plan.logs).toEqual([{ actor: null, event: 'Combat started. Before initiative.' }])
  })

  it('lists only character owners as participants, in selection order', () => {
    const current = { ...records(), sheets: [sheet(), rival(), npc()] }
    const plan = planCombatCommand(command('start', crowd), current, gm)
    expect(plan.fight.participantUserIds).toEqual(['player', 'other'])
    expect(plan.fight.state.combatants.map((actor) => actor.key)).toEqual(['character:hero', 'character:rival', 'npc:roy'])
  })

  it('copies a whole library stack under a new lineage id and keeps the library record unwritten', () => {
    const current = records()
    current.items.set('ball', ball('ball', { status: 'library' }))
    const plan = planCombatCommand(command('start', { floor: [{ itemId: 'ball', status: 'library', qty: 6 }] }), current, gm)
    expect(plan.items).toEqual([])
    expect(plan.fight.state.floor.map((record) => [record.item.id, record.item.qty])).toEqual([['item:command:floor%3Aball:0', 6]])
  })

  it('deletes a whole dropped stack and keeps its original physical id', () => {
    const plan = planCombatCommand(command('start', { floor: [{ itemId: 'ball', status: 'dropped', qty: 6 }] }), records(), gm)
    expect(plan.items).toEqual([{ id: 'ball', value: null }])
    expect(plan.fight.state.floor[0].item).toMatchObject({ id: 'ball', qty: 6 })
  })

  it('copies current library data with separate stable instance ids, even for identical selections', () => {
    const source = records()
    source.items.set('ball', ball('ball', { status: 'library', impact: 9, supplies: [{ id: 'custom', name: 'Pebbles' }], takes: 'custom' }))
    const selection = { itemId: 'ball', status: 'library', qty: 1 }
    const plan = planCombatCommand(command('start', { floor: [selection, selection] }), source, gm)
    expect(plan.items).toEqual([])
    expect(plan.fight.state.floor.map((record) => record.item.id)).toEqual(['item:command:floor%3Aball:0', 'item:command:floor%3Aball:1'])
    expect(plan.fight.state.floor[0]).toMatchObject({ item: { impact: 9, takes: 'custom' }, supplies: [{ id: 'custom', name: 'Pebbles' }] })
    expect(planCombatCommand(command('start', { floor: [selection, selection] }), source, gm)).toEqual(plan)
  })

  it.each([
    ['already active', (r: CombatRecords) => { r.activeFightId = 'other' }, /already active/],
    ['retained fight id', (r: CombatRecords) => { r.fight = live().fight }, /already exists/],
    ['missing item', (r: CombatRecords) => { r.items.clear() }, /stale/],
    ['changed status', (r: CombatRecords) => { r.items.set('ball', ball('ball', { status: 'library' })) }, /stale/],
    ['insufficient quantity', (r: CombatRecords) => { r.items.set('ball', ball('ball', { qty: 1 })) }, /quantity/],
    ['missing sheet', (r: CombatRecords) => { r.sheets = [] }, /character:hero: sheet is missing or unreadable/],
  ])('refuses %s before any item intention', (_, change, reason) => {
    const current = records()
    change(current)
    expect(() => planCombatCommand(command(), current, gm)).toThrow(reason)
  })

  it('refuses an empty or repeated combatant selection and a repeated overdrawn physical selection', () => {
    expect(() => planCombatCommand(command('start', { combatants: [] }), records(), gm)).toThrow('Select at least one')
    expect(() => planCombatCommand(command('start', { combatants: [sheet(), sheet()] }), records(), gm)).toThrow('selected twice')
    const take = { itemId: 'ball', status: 'dropped', qty: 6 }
    expect(() => planCombatCommand(command('start', { floor: [take, take] }), records(), gm)).toThrow('stale')
  })

  it('places repeatedly without coalescing and rejects duplicate ownership', () => {
    const current = live()
    current.items.set('ball', ball('ball', { status: 'library' }))
    const placing = command('place', { floor: [{ itemId: 'ball', status: 'library', qty: 3 }] })
    placing.envelope.id = 'place'
    const first = planCombatCommand(placing, current, gm)
    expect(first.fight.state.floor.map((record) => record.item.qty)).toEqual([2, 3])
    expect(first.logs).toEqual([{ actor: null, event: 'Items placed on Floor.' }])
    expect(() => planCombatCommand(placing, { ...current, fight: first.fight }, gm)).toThrow('already has an owner')
  })

  it.each(['defense', 'catch', 'repair'])('ends at %s without rolling or losing an in-flight object', (step) => {
    const current = live()
    stateOf(current).attack = { id: 'attack', grantId: null, attackerKey: 'character:hero', step, closed: false, detached: [lubecDetachedItem(ball('thrown', { qty: 1 }), [])] }
    const plan = act('end', current)
    expect(plan.control).toBeNull()
    expect(plan.fight.status).toBe('ended')
    expect(plan.fight.state.floor).toEqual([])
    expect(plan.fight.state.attack).toMatchObject({ closed: true, detached: [], step })
    expect(plan.items.map((write) => [write.id, write.value?.qty, write.value?.status])).toEqual([['item:command:floor%3Aball:0', 2, 'dropped'], ['thrown', 1, 'dropped']])
    expect(plan.logs).toEqual([{ actor: null, event: 'Combat ended. Floor returned to GM Items.' }])
  })

  it('ends with no current attack and exports only the Floor', () => {
    const plan = act('end')
    expect(plan.fight.state.attack).toBeNull()
    expect(plan.items.map((write) => [write.id, write.value?.qty])).toEqual([['item:command:floor%3Aball:0', 2]])
  })

  it('keeps committed catches and matching drops, refuses conflicts and duplicate ownership', () => {
    const current = live()
    stateOf(current).attack = { id: 'caught', grantId: 'grant', attackerKey: 'character:hero', step: 'caught', closed: false, detached: [] }
    const exported = act('end', current)
    current.items = new Map(exported.items.map(({ id, value }) => [id, value!]))
    expect(act('end', current).items).toEqual(exported.items)
    current.items.set(exported.items[0].id, ball(exported.items[0].id))
    expect(() => act('end', current)).toThrow('conflicting dropped item')
    stateOf(current).attack!.detached = [stateOf(current).floor[0]]
    expect(() => act('end', current)).toThrow('already has an owner')
  })

  it('refuses End with due wounds and interruption until the attacker is Out', () => {
    const current = live()
    stateOf(current).woundOutbox.push({ id: 'wound', target: { kind: 'character', sheetId: 'hero' }, originatingRound: 0, effectiveRound: 1, traumaDelta: 1, stressDelta: 0, effect: { id: 'injury', name: 'Bruise', cause: 'Bruise row', steps: [] } })
    expect(() => act('end', current)).toThrow('Wounds must be delivered')
    expect(() => act('interrupt', current)).toThrow('has not gone Out')
    stateOf(current).attack = { id: 'attack', grantId: null, attackerKey: 'character:hero', step: 'defense', detached: [lubecDetachedItem(ball('air'), [])], closed: false }
    expect(() => act('interrupt', current)).toThrow('has not gone Out')
    stateOf(current).combatants[0].outReason = 'Left the fight'
    const settled = act('interrupt', current)
    expect(settled.fight.state.floor).toHaveLength(2)
    expect(settled.fight.state.attack).toMatchObject({ closed: true, detached: [] })
    expect(settled.logs).toEqual([{ actor: 'character:hero', event: 'Attack interrupted: attacker Out.' }])
    expect(settled.items).toEqual([])
    expect(act('interrupt', { ...current, fight: settled.fight }).fight).toEqual(settled.fight)
  })

  it('interrupts only for the attacker who is Out, not another Out combatant', () => {
    const current = liveCrowd()
    stateOf(current).attack = { id: 'attack', grantId: null, attackerKey: 'character:rival', step: 'catch', detached: [], closed: false }
    stateOf(current).combatants[0].outReason = 'wound'
    expect(() => act('interrupt', current)).toThrow('has not gone Out')
    stateOf(current).combatants[0].outReason = null
    stateOf(current).combatants[1].outReason = 'caught'
    expect(act('interrupt', current).logs).toEqual([{ actor: 'character:rival', event: 'Attack interrupted: attacker Out.' }])
  })
})

describe('current required inputs', () => {
  it.each(['Speed', 'Handle', 'Strength', 'Body'] as const)('names a missing %s and the repair cause', (name) => {
    const current = records()
    current.sheets[0].sheet.base[name] = null
    const input = name === 'Body' ? 'Dodgeball Body' : name
    expect(() => planCombatCommand(command(), current, gm)).toThrow(new RegExp(`Tommy: missing .*${input}; repair ${name}`))
  })

  it('matches each selection to its own sheet and joins every issue and repair cause', () => {
    const broken = rival()
    broken.sheet.base.Speed = null
    broken.sheet.base.Handle = null
    const current = { ...records(), sheets: [sheet(), broken] }
    const selections = { combatants: [{ kind: 'character', sheetId: 'hero' }, { kind: 'character', sheetId: 'rival' }] }
    expect(() => planCombatCommand(command('start', selections), current, gm)).toThrow(new Error([
      'Rival: missing Speed; repair Speed, Handle.', 'Rival: missing attack/Check Handle; repair Speed, Handle.',
    ].join('\n')))
  })

  it('reports every missing input, class and class-choice causes, while Body is encounter-specific', () => {
    const current = sheet()
    current.sheet.class.key = null
    expect(combatSetupIssues([current], [current], true)).toEqual([
      'Tommy: missing Speed; repair Class.', 'Tommy: missing attack/Check Handle; repair Class.',
      'Tommy: missing Strength; repair Class.', 'Tommy: missing Dodgeball Body; repair Class.',
    ])
    expect(() => publicCombatant(current)).toThrow('Speed is missing')
    current.sheet = lubecCharacterSheet({ base: { ...lubecCharacterSheet().base, Body: null } })
    expect(combatSetupIssues([current], [current], false)).toEqual([])
    expect(planCombatCommand(command('start', { dodgeball: false, floor: [] }), { ...records(), sheets: [current] }, gm).fight.state.floor).toEqual([])
  })
})

describe('actor-local command context', () => {
  it('does not require a global state version and checks ownership and per-actor interactions', () => {
    const current = live()
    const own = command('future')
    own.envelope.actorKey = 'character:hero'
    expect(requireLiveContext(own, current, { userId: 'player', isGm: false })).toBe(current.fight)
    expect(() => requireLiveContext(own, current, { userId: 'other', isGm: false })).toThrow('belongs to someone else')
    expect(requireLiveContext(own, current, gm)).toBe(current.fight)
    own.envelope.interactionSequence = 1
    expect(() => requireLiveContext(own, current, gm)).toThrow('interaction is stale')
    own.envelope.actorKey = 'missing'
    expect(() => requireLiveContext(own, current, gm)).toThrow('interaction is stale')
  })

  it('finds the named actor among several and requires the GM for system commands', () => {
    const current = liveCrowd()
    const rivalCommand = command('future')
    rivalCommand.envelope.actorKey = 'character:rival'
    expect(requireLiveContext(rivalCommand, current, { userId: 'other', isGm: false })).toBe(current.fight)
    expect(() => requireLiveContext(rivalCommand, current, { userId: 'player', isGm: false })).toThrow('belongs to someone else')
    expect(() => requireLiveContext(command('future'), current, { userId: 'player', isGm: false })).toThrow('Only the GM')
  })

  it.each(['end', 'place', 'interrupt'])('refuses a player %s even when it names their own combatant', (type) => {
    const own = command(type, { floor: [] })
    own.envelope.actorKey = 'character:hero'
    expect(() => planCombatCommand(own, live(), { userId: 'player', isGm: false })).toThrow('Only the GM')
  })

  it.each(['round', 'phase', 'stageInstanceId'] as const)('refuses a prior %s', (field) => {
    const stale = command('end')
    Object.assign(stale.envelope, { [field]: field === 'round' ? 1 : 'stale' })
    expect(() => planCombatCommand(stale, live(), gm)).toThrow('stage is stale')
  })

  it('checks fight, control, GM and all pending attack identities', () => {
    expect(() => act('end', records())).toThrow('not live')
    const current = live()
    current.fight!.status = 'ended'
    expect(() => act('end', current)).toThrow('not live')
    current.fight!.status = 'live'
    current.activeFightId = 'other'
    expect(() => act('end', current)).toThrow('control does not match')
    current.activeFightId = 'fight'
    for (const type of ['start', 'end', 'place', 'interrupt']) {
      expect(() => planCombatCommand(command(type), current, { userId: 'player', isGm: false })).toThrow('Only the GM')
    }
    for (const field of ['attackId', 'grantId', 'step']) {
      const stale = command('end')
      Object.assign(stale.envelope, { [field]: 'old' })
      expect(() => planCombatCommand(stale, current, gm)).toThrow('attack step is stale')
    }
    current.fight!.state.attack = { id: 'a', grantId: 'g', attackerKey: 'hero', step: 'catch', closed: false, detached: [] }
    const matching = command('end')
    Object.assign(matching.envelope, { attackId: 'a', grantId: 'g', step: 'catch' })
    expect(planCombatCommand(matching, current, gm).fight.status).toBe('ended')
    expect(() => act('unknown')).toThrow('Unknown combat command')
  })
})

it('binds dice to command, purpose and ordinal, resets on retry and retains generated output identities', () => {
  const original = combatEntropy(command())
  const first = original.die('initiative', 100)
  const second = original.die('initiative', 100)
  expect(original.rolls).toEqual([{ purpose: 'initiative', ordinal: 0, value: first }, { purpose: 'initiative', ordinal: 1, value: second }])
  expect(first).toBeGreaterThanOrEqual(1)
  expect(first).toBeLessThanOrEqual(100)
  const retry = combatEntropy(command())
  expect([retry.die('initiative', 100), retry.die('initiative', 100)]).toEqual([first, second])
  original.die('catch', 100)
  expect(original.rolls[2].ordinal).toBe(0)
  expect(original.id('log /', 1)).toBe('command:log%20%2F:1')
  expect(original.generatedIds).toEqual(['command:log%20%2F:1'])
  const changed = command()
  changed.seed = 'different'
  expect(combatEntropy(changed).die('initiative', 100)).not.toBe(first)
})
