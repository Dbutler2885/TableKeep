import { describe, expect, it } from 'vitest'
import type { CombatAction } from './engine/combatFeedback'
import type { Combatant, CombatState } from './engine/types'
import { combatActionNotice, combatActionText, pendingCombatActions } from './pendingActions'

const actor = (key: string, kind: 'npc' | 'character', ownerUserId: string, outReason: string | null = null): Combatant => ({ key, kind, ownerUserId, outReason, name: key, sheetId: key, speed: 50, armor: [], interactionSequence: 0, portraitPath: '' })
const actors = [actor('Wayne', 'character', 'player'), actor('Joseph', 'character', 'player'), actor('Dottie', 'character', 'other'), actor('Roy', 'npc', 'gm'), actor('Out', 'character', 'player', 'caught')]
const state = (action: CombatAction): CombatState => ({ round: 1, phase: 'attack', stageInstanceId: 'one', combatants: actors, floor: [], attack: null, woundOutbox: [], woundAcknowledgements: [], pendingActions: [...actors.map(({ key }) => ({ combatantKey: key, action })), { combatantKey: 'missing', action }] })
const personal: CombatAction[] = ['initiative', 'movement', 'declare', 'attack', 'defense', 'catch', 'check', 'save', 'location', 'strength']

describe('pending combat action authority', () => {
  it.each(personal)('selects all owned %s requests, never another character, an NPC, Out or a missing actor', (action) => {
    expect(pendingCombatActions(state(action), 'player', 'player').map(({ name }) => name)).toEqual(['Wayne', 'Joseph'])
    expect(pendingCombatActions(state(action), 'gm', 'gm').map(({ name }) => name)).toEqual(['Roy'])
    expect(pendingCombatActions(state(action), 'player', 'spectator')).toEqual([])
    expect(pendingCombatActions(state(action), 'player', 'gm')).toEqual([])
    expect(pendingCombatActions(state(action), null, 'stranger')).toEqual([])
    expect(combatActionText(pendingCombatActions(state(action), 'player', 'player')[0])).toMatch(/^Wayne: .+/)
  })
  it.each(['leave', 'range', 'reviewDeclaration'] as const)('sends %s to the GM even for a player actor', (action) => {
    expect(pendingCombatActions(state(action), 'player', 'player')).toEqual([])
    expect(pendingCombatActions(state(action), 'gm', 'gm').map(({ name }) => name)).toEqual(['Wayne', 'Joseph', 'Dottie', 'Roy'])
  })
  it('gives no requests for states predating phases and no NPC controls to an owner who is not the GM', () => {
    const older = state('attack')
    delete older.pendingActions
    expect(pendingCombatActions(older, 'gm', 'gm')).toEqual([])
    expect(pendingCombatActions(state('attack'), null, 'gm')).toEqual([])
  })
})

describe('turn notice wording', () => {
  it('keeps the single-player Attack wording from the mock-up and names GM actions', () => {
    const a = { combatantKey: 'a', name: 'Roy Carver', action: 'attack' as const }
    expect(combatActionNotice(a, 1, 'player')).toBe('Round 1, Attack: it is your turn.')
    expect(combatActionNotice(a, 2, 'gm')).toBe("It is Roy Carver's turn to attack.")
    expect(combatActionNotice({ ...a, kind: 'npc' }, 2, 'gm')).toBe("It is Roy Carver (NPC)'s turn to attack.")
    expect(combatActionNotice({ ...a, action: 'leave' }, 1, 'gm')).toBe('Roy Carver asks to Leave.')
    expect(combatActionNotice({ ...a, action: 'range' }, 1, 'gm')).toBe('Declare range for Roy Carver.')
    expect(combatActionNotice({ ...a, action: 'reviewDeclaration' }, 1, 'gm')).toBe("Review Roy Carver's declaration.")
  })

  it('names Before initiative rather than a round 0 for a granted Sneak Attack', () => {
    expect(combatActionNotice({ combatantKey: 'a', name: 'Wayne', action: 'attack' }, 0, 'player')).toBe('Before initiative, Attack: it is your turn.')
  })
})
