import { describe, expect, it, vi } from 'vitest'
import { lubecCharacterSheet } from '../../ruleSets/lubec/sheetFixtures'
import { combatantPaths, combatantSheets } from './combatantSheets'
import { actorEnvelope, attackCommandKey, gmCommandKey, gmEnvelope, startEnvelope } from './combatEnvelopes'
import { resolveLubecCombatEnabled } from './combatGate'
import { combatSheetRecord } from './combatSheetRecord'
import type { LubecLiveFight } from './combatWatch'
import type { CombatCommand, CombatFight } from './engine/types'
import { COMBAT_UNCERTAIN, combatSender } from './useLubecCombatSend'

vi.mock('../../../firebase', () => ({ db: {} }))

const scope = { groupId: 'school', campaignId: 'gym' }
const live = (stage = 'stage-1'): LubecLiveFight => ({ id: 'fight', fight: { status: 'live', participantUserIds: [], state: { round: 0, phase: 'before-initiative', stageInstanceId: stage } } as unknown as CombatFight })

describe('the mapless-combat gate', () => {
  it('is off unless a build says exactly true', () => {
    expect(resolveLubecCombatEnabled({})).toBe(false)
    expect(resolveLubecCombatEnabled({ VITE_LUBEC_MAPLESS_COMBAT: 'false' })).toBe(false)
    expect(resolveLubecCombatEnabled({ VITE_LUBEC_MAPLESS_COMBAT: true })).toBe(false)
    expect(resolveLubecCombatEnabled({ VITE_LUBEC_MAPLESS_COMBAT: ' true ' })).toBe(true)
  })
})

describe('command envelopes', () => {
  it('binds Start to a prospective fight and its own local setup stage', () => {
    expect(startEnvelope(scope, 'cmd', 'new-fight')).toEqual({ ...scope, id: 'cmd', fightId: 'new-fight', round: 0, phase: 'setup', stageInstanceId: 'setup:cmd', actorKey: null, interactionSequence: 0 })
  })

  it('binds a GM command to the live fight\'s round, phase and stage instance', () => {
    expect(gmEnvelope(scope, 'cmd', live())).toEqual({ ...scope, id: 'cmd', fightId: 'fight', round: 0, phase: 'before-initiative', stageInstanceId: 'stage-1', actorKey: null, interactionSequence: 0 })
  })

  it('keys one logical action by fight, stage and payload', () => {
    expect(gmCommandKey(live(), { type: 'end' })).toBe(gmCommandKey(live(), { type: 'end' }))
    expect(gmCommandKey(live('stage-2'), { type: 'end' })).not.toBe(gmCommandKey(live(), { type: 'end' }))
  })

  it('binds a combatant\'s act to its interaction sequence and the open attack\'s id and step', () => {
    const attacking = live()
    Object.assign(attacking.fight.state, { combatants: [{ key: 'character:wayne', interactionSequence: 3 }], attack: { id: 'attack-1', step: 'aim' } })
    expect(actorEnvelope(scope, 'cmd', attacking, 'character:wayne')).toMatchObject({ actorKey: 'character:wayne', interactionSequence: 3, attackId: 'attack-1', step: 'aim' })
    const idle = live()
    Object.assign(idle.fight.state, { combatants: [], attack: null })
    expect(actorEnvelope(scope, 'cmd', idle, 'character:gone')).toEqual({ ...gmEnvelope(scope, 'cmd', idle), actorKey: 'character:gone', interactionSequence: 0 })
  })

  it('keys an attack act by its attack and step, so the next step is a new action', () => {
    const before = live()
    Object.assign(before.fight.state, { attack: { id: 'attack-1', step: 'aim' } })
    const after = live()
    Object.assign(after.fight.state, { attack: { id: 'attack-1', step: 'defense' } })
    expect(attackCommandKey(before, 'character:wayne', { type: 'roll' })).not.toBe(attackCommandKey(after, 'character:wayne', { type: 'roll' }))
    expect(attackCommandKey(live(), null, { type: 'grant' })).toBe(attackCommandKey(live(), null, { type: 'grant' }))
  })
})

describe('the combat sender', () => {
  const command = (id: string) => ({ envelope: { id }, seed: id, payload: { type: 'end' } }) as unknown as CombatCommand

  it('resends the same command after an unanswered send, and a new one once answered', async () => {
    const commit = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: false, reason: 'Refused.' })
    const send = combatSender(commit)
    let made = 0
    const make = () => command(`made-${++made}`)
    expect(await send('end', make)).toEqual({ ok: false, reason: COMBAT_UNCERTAIN })
    expect(await send('end', make)).toEqual({ ok: false, reason: 'Refused.' })
    await send('end', make)
    expect(commit.mock.calls.map(([sent]) => sent.envelope.id)).toEqual(['made-1', 'made-1', 'made-2'])
  })
})

describe('reading a combatant\'s sheet on the client', () => {
  const stored = (fields = {}) => ({ system: 'lubec', schemaVersion: 1, name: 'Roy (sheet)', ownerUserId: 'gm', portraitPath: 'sheet-art', lubec: lubecCharacterSheet(), ...fields })

  it('reads an NPC\'s public face from its NPC record and a character\'s from its sheet', () => {
    expect(combatantPaths({ kind: 'npc', sheetId: 'roy' })).toEqual(['npcSheets/roy', 'npcs/roy'])
    expect(combatantPaths({ kind: 'character', sheetId: 'wayne' })).toEqual(['characters/wayne'])
    expect(combatSheetRecord({ kind: 'npc', sheetId: 'roy' }, 'roy', stored(), { name: 'Roy Carver', portraitPath: 'npc-art' })).toMatchObject({ name: 'Roy Carver', portraitPath: 'npc-art', ownerUserId: 'gm' })
    expect(combatSheetRecord({ kind: 'npc', sheetId: 'roy' }, 'roy', stored())).toMatchObject({ name: 'Roy (sheet)', portraitPath: 'sheet-art' })
    expect(combatSheetRecord({ kind: 'character', sheetId: 'wayne' }, 'wayne', stored({ name: 'Wayne' }), { name: 'ignored' })).toMatchObject({ name: 'Wayne' })
  })

  it('leaves out a missing sheet or one at another schema version, as the transaction does', () => {
    const docs = new Map<string, Record<string, unknown> | null>([
      ['characters/wayne', stored({ name: 'Wayne' })], ['characters/old', stored({ schemaVersion: 0 })], ['characters/gone', null],
      ['npcSheets/roy', stored()], ['npcs/roy', { name: 'Roy Carver' }],
    ])
    const sheets = combatantSheets([{ kind: 'character', sheetId: 'wayne' }, { kind: 'character', sheetId: 'old' }, { kind: 'character', sheetId: 'gone' }, { kind: 'npc', sheetId: 'roy' }], docs)
    expect(sheets.map((sheet) => sheet.name)).toEqual(['Wayne', 'Roy Carver'])
  })
})
