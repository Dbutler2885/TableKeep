import { describe, expect, it } from 'vitest'
import { lubecCharacterSheet } from '../../../ruleSets/lubec/sheetFixtures'
import { combatOpponents } from './attackParty'
import { emptyLubecGear } from '../../../ruleSets/lubec/gear/gearRecord'
import { planCombatCommand } from './lifecycle'
import { combatSummariesStale, refreshedCombatant } from './summaries'
import type { CombatAuthority, CombatCommand, CombatRecords, CombatSheet } from './types'

const gm: CombatAuthority = { userId: 'gm', isGm: true }
const player: CombatAuthority = { userId: 'player', isGm: false }
const roy = (overrides: Partial<CombatSheet> = {}): CombatSheet => ({ kind: 'npc', sheetId: 'roy', name: 'Roy', ownerUserId: 'gm', portraitPath: 'art/roy', sheet: lubecCharacterSheet(), ...overrides })
const command = (type: string, phase = 'before-initiative'): CombatCommand => ({
  envelope: { id: type, groupId: 'group', campaignId: 'campaign', fightId: 'fight', round: 0, phase, stageInstanceId: 'start:stage:0', actorKey: null, interactionSequence: 0 },
  seed: 'seed', payload: { type, combatants: [{ kind: 'npc', sheetId: 'roy' }], floor: [], dodgeball: true },
})
function live(): CombatRecords {
  const initial: CombatRecords = { activeFightId: null, fight: null, sheets: [roy()], items: new Map() }
  const started = planCombatCommand({ ...command('start', 'setup'), envelope: { ...command('start').envelope, id: 'start', phase: 'setup' } }, initial, gm)
  return { ...initial, activeFightId: 'fight', fight: started.fight }
}
const helmet = { id: 'helmet', name: 'Helmet', kind: 'armor', carrier: 'worn', size: 1, qty: 1, weight: 'normal', note: '', armor: { cut: 1, pierce: 1, blunt: 2, gun: 0 }, locs: ['head'] }
const armored = () => lubecCharacterSheet({ base: { ...lubecCharacterSheet().base, Speed: 40 }, gear: { ...emptyLubecGear(), items: [helmet] } as never })

describe('refreshing public fight summaries', () => {
  it('republishes a changed name, face, Speed and armor, and nothing private', () => {
    const current = live()
    const changed = { ...current, sheets: [roy({ name: 'Roy the Bull', portraitPath: 'art/roy-2', sheet: armored() })] }
    const plan = planCombatCommand(command('refresh'), changed, gm)
    const [combatant] = plan.fight.state.combatants
    expect(combatant).toMatchObject({ key: 'npc:roy', name: 'Roy the Bull', portraitPath: 'art/roy-2', speed: 45, interactionSequence: 0, outReason: null })
    expect(combatant.armor).toEqual([{ locs: ['head'], armor: { cut: 1, pierce: 1, blunt: 2, gun: 0 } }])
    expect(JSON.stringify(plan.fight)).not.toMatch(/Strength|counters|base/)
    expect(plan.items).toEqual([])
    expect(plan.logs).toEqual([])
  })

  it('refuses when every summary is current, so nothing is written', () => {
    expect(() => planCombatCommand(command('refresh'), live(), gm)).toThrow('Public summaries are current.')
  })

  it('is the GM\'s alone', () => {
    const current = { ...live(), sheets: [roy({ name: 'Changed' })] }
    expect(() => planCombatCommand(command('refresh'), current, player)).toThrow('Only the GM can do that.')
  })

  it('keeps the last published summary for an unreadable sheet', () => {
    const current = { ...live(), sheets: [] }
    expect(combatSummariesStale(current.fight!.state, [])).toBe(false)
  })

  it('updates Speed only before initiative, which later freezes it', () => {
    const [combatant] = live().fight!.state.combatants
    const faster = roy({ sheet: lubecCharacterSheet({ base: { ...lubecCharacterSheet().base, Speed: 70 } }) })
    expect(refreshedCombatant(combatant, [faster], 'before-initiative').speed).toBe(75)
    expect(refreshedCombatant(combatant, [faster], 'movement').speed).toBe(combatant.speed)
    const missing = roy({ sheet: lubecCharacterSheet({ base: { ...lubecCharacterSheet().base, Speed: null } }) })
    expect(refreshedCombatant(combatant, [missing], 'before-initiative').speed).toBe(combatant.speed)
  })
})


it('skips unconscious Movement without Out, remains targetable, and resumes only when the last card is cleared', () => {
  const current = live()
  const state = current.fight!.state
  Object.assign(state, { round: 3, phase: 'movement', order: ['npc:roy'], movementComplete: false })
  const card = (id: string) => ({ id, name: 'Unconscious', cause: '', steps: [{ modifiers: [], labels: ['13 minutes'], restrictions: [{ kind: 'unconscious' as const }] }] })
  current.sheets[0].sheet.effects = [card('one'), card('two')]
  const refresh = { ...command('refresh', 'movement'), envelope: { ...command('refresh', 'movement').envelope, round: 3 } }
  let plan = planCombatCommand(refresh, current, gm)
  expect(plan.fight.state.combatants[0]).toMatchObject({ unconscious: true, outReason: null, movement: { choice: 'stay', unconscious: true } })
  expect(plan.fight.state).toMatchObject({ pendingActions: [], movementComplete: true })
  expect(combatOpponents(plan.fight.state, { ...state.combatants[0], key: 'character:hero', kind: 'character' })).toHaveLength(1)
  current.fight = plan.fight
  current.sheets[0].sheet.effects = [card('two')]
  expect(combatSummariesStale(current.fight.state, current.sheets)).toBe(false)
  current.sheets[0].sheet.effects = []
  plan = planCombatCommand(refresh, current, gm)
  expect(plan.fight.state.combatants[0]).toMatchObject({ unconscious: false, outReason: null, movement: null })
  expect(plan.fight.state.pendingActions).toEqual([{ combatantKey: 'npc:roy', action: 'movement' }])
})

it.each(['comatose', 'dead'] as const)('publishes %s, skips unresolved stages, keeps targeting and restores eligibility on GM clearing', (condition) => {
  const current = live()
  Object.assign(current.fight!.state, { round: 3, phase: 'movement', order: ['npc:roy'], movementComplete: false })
  current.sheets[0].sheet.condition = condition
  const refresh = { ...command('refresh', 'movement'), envelope: { ...command('refresh', 'movement').envelope, round: 3 } }
  let plan = planCombatCommand(refresh, current, gm)
  expect(plan.fight.state.combatants[0]).toMatchObject({ condition, outReason: null, movement: { choice: 'stay', lost: true } })
  expect(plan.fight.state).toMatchObject({ pendingActions: [], movementComplete: true })
  expect(combatOpponents(plan.fight.state, { ...plan.fight.state.combatants[0], key: 'character:hero', kind: 'character' })).toHaveLength(1)
  expect(JSON.stringify(plan.fight)).not.toMatch(/counters|base|effects/)
  current.fight = plan.fight
  delete current.sheets[0].sheet.condition
  plan = planCombatCommand(refresh, current, gm)
  expect(plan.fight.state.combatants[0]).not.toHaveProperty('condition')
  expect(plan.fight.state.combatants[0].movement).toBeNull()
  expect(plan.fight.state.pendingActions).toEqual([{ combatantKey: 'npc:roy', action: 'movement' }])
})

it('keeps completed Movement and an active unconscious card when the GM clears a condition', () => {
  const current = live()
  Object.assign(current.fight!.state, { round: 3, phase: 'movement', order: ['npc:roy'], movementComplete: true })
  const fighter = current.fight!.state.combatants[0]
  fighter.condition = 'dead'
  fighter.movement = { choice: 'stay', pickup: null, leave: null }
  current.sheets[0].sheet.effects = [{ id: 'sleep', name: 'Unconscious', cause: '', steps: [{ modifiers: [], labels: [], restrictions: [{ kind: 'unconscious' }] }] }]
  const refresh = { ...command('refresh', 'movement'), envelope: { ...command('refresh', 'movement').envelope, round: 3 } }
  const plan = planCombatCommand(refresh, current, gm)
  expect(plan.fight.state.combatants[0]).toMatchObject({ unconscious: true, movement: fighter.movement, outReason: null })
})
