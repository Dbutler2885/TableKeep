import { describe, expect, it, vi } from 'vitest'
import type { DocumentSnapshot } from 'firebase/firestore'
import { lubecCharacterSheet } from '../../ruleSets/lubec/sheetFixtures'
import { lubecCurrentValue, lubecEffectiveHandle } from '../../ruleSets/lubec/derivations'
import { planSheetIntention } from '../../character/characterStore/sheetIntention'
import { combatInputModifiers, confirmedCombatRevision, requireCombatWoundBarrier } from './woundBarrier'
import { combatWoundIntention, combatWoundOperationId } from './woundIntention'
import { combatWoundDrainService } from './woundDrainService'
import { WOUND_WAIT, type CombatWound, type CombatWoundAcknowledgement } from './woundTypes'
import type { CombatFight, CombatState } from './engine/types'

const target = { kind: 'character' as const, sheetId: 'hero' }
const wound = (overrides: Partial<CombatWound> = {}): CombatWound => ({
  id: 'wound', target, originatingRound: 1, effectiveRound: 2, traumaDelta: 1, stressDelta: 2,
  effect: { id: 'injury', name: 'Bell rung', cause: 'Bell rung row', steps: [{ modifiers: [{ target: 'Handle', amount: -20 }, { target: 'Strength', amount: -10 }, { target: 'Speed', amount: -10 }], labels: ['Dazed'] }] },
  ...overrides,
})
const state = (overrides: Partial<CombatState> = {}): CombatState => ({ round: 1, phase: 'attack', stageInstanceId: 'stage', combatants: [], floor: [], attack: null, woundOutbox: [], woundAcknowledgements: [], ...overrides })
const ack = (overrides: Partial<CombatWoundAcknowledgement> = {}): CombatWoundAcknowledgement => ({ id: 'wound', target, originatingRound: 1, effectiveRound: 2, targetRevision: 5, operationId: 'op', ...overrides })
const live = (id = 'fight', wounds = [wound()]) => ({ id, fight: { status: 'live', participantUserIds: ['player'], state: state({ woundOutbox: wounds }) } as CombatFight })
const snapshot = (exists = true, hasPendingWrites = false, fromCache = false, sheetRevision?: number) => ({ exists: () => exists, data: () => ({ sheetRevision }), metadata: { hasPendingWrites, fromCache } }) as unknown as DocumentSnapshot

it('accepts only confirmed snapshots and reads legacy zero revisions', () => {
  expect(confirmedCombatRevision(snapshot())).toBe(0)
  expect(confirmedCombatRevision(snapshot(true, false, false, 9))).toBe(9)
  expect(confirmedCombatRevision(snapshot(false))).toBeNull()
  expect(confirmedCombatRevision(snapshot(true, true))).toBeNull()
  expect(confirmedCombatRevision(snapshot(true, false, true))).toBeNull()
})

it('holds only the due actor at a round boundary, requiring both acknowledged snapshots and canonical revisions', () => {
  const waiting = state({ woundOutbox: [wound()] })
  expect(() => requireCombatWoundBarrier(waiting, target, 1, 0, 0)).not.toThrow()
  expect(() => requireCombatWoundBarrier(waiting, { kind: 'npc', sheetId: 'hero' }, 2, 0, 0)).not.toThrow()
  expect(() => requireCombatWoundBarrier(waiting, target, 2, 9, 9)).toThrow(WOUND_WAIT)
  const delivered = state({ woundAcknowledgements: [ack(), ack({ id: 'newer', targetRevision: 7 }), ack({ id: 'later', effectiveRound: 3, targetRevision: 9 })] })
  expect(() => requireCombatWoundBarrier(delivered, target, 2, null, 7)).toThrow(WOUND_WAIT)
  expect(() => requireCombatWoundBarrier(delivered, target, 2, 6, 7)).toThrow(WOUND_WAIT)
  expect(() => requireCombatWoundBarrier(delivered, target, 2, 7, 6)).toThrow(WOUND_WAIT)
  expect(() => requireCombatWoundBarrier(delivered, target, 2, 7, 9)).toThrow(WOUND_WAIT)
  expect(() => requireCombatWoundBarrier(delivered, target, 2, 9, 9)).not.toThrow()
  expect(() => requireCombatWoundBarrier(delivered, target, 3, 7, 9)).toThrow(WOUND_WAIT)
})

it('persists immediate counters and labels, defers this fight numeric modifiers, and restores ordinary effects after End', async () => {
  const sheet = lubecCharacterSheet({ effects: [{ id: 'ordinary', name: 'Old', cause: 'old', steps: [{ modifiers: [{ target: 'Handle', amount: -5 }], labels: [] }] }] })
  const operationId = await combatWoundOperationId('fight', 'wound')
  expect(await combatWoundOperationId('fight', 'wound')).toBe(operationId)
  expect(await combatWoundOperationId('other', 'wound')).not.toBe(operationId)
  expect(operationId).toMatch(/^wound_[a-f0-9]{64}$/)
  const intention = combatWoundIntention({ sheetRevision: 4 }, wound(), 'fight', operationId)
  const planned = planSheetIntention({ lubec: sheet, sheetRevision: 4, futureField: 'retained' }, intention)
  expect(planned.outcome).toMatchObject({ status: 'committed', revision: 5 })
  const changed = planned.mutation!.sheet.lubec as typeof sheet
  expect(planned.mutation!.sheet.futureField).toBe('retained')
  expect(changed.counters).toMatchObject({ trauma: 1, stress: 4 })
  expect(changed.effects[1]).toMatchObject({ id: operationId, cause: 'Fight fight: Bell rung row', combatOrigin: { fightId: 'fight', woundId: 'wound', originatingRound: 1, effectiveRound: 2 }, steps: [{ labels: ['Dazed'] }] })
  expect(lubecEffectiveHandle(changed, combatInputModifiers(changed, { fightId: 'fight', round: 1 }))).toBe(50)
  expect(lubecCurrentValue(changed, 'Strength', combatInputModifiers(changed, { fightId: 'fight', round: 1 }))).toBe(29)
  expect(lubecEffectiveHandle(changed, combatInputModifiers(changed, { fightId: 'fight', round: 2 }))).toBe(30)
  expect(lubecEffectiveHandle(changed, combatInputModifiers(changed, { fightId: 'different', round: 1 }))).toBe(30)
  expect(lubecEffectiveHandle(changed, combatInputModifiers(changed, null))).toBe(30)
  expect(changed.effects[1].steps[0].modifiers).toHaveLength(3)
})

it('keeps a pre-initiative penalty out of the grant and includes it in round one', () => {
  const intention = combatWoundIntention({}, wound({ originatingRound: 0, effectiveRound: 1 }), 'fight', 'op')
  const changed = planSheetIntention({ lubec: lubecCharacterSheet() }, intention).mutation!.sheet.lubec as ReturnType<typeof lubecCharacterSheet>
  expect(lubecCurrentValue(changed, 'Speed', combatInputModifiers(changed, { fightId: 'fight', round: 0 }))).toBe(56)
  expect(lubecCurrentValue(changed, 'Speed', combatInputModifiers(changed, { fightId: 'fight', round: 1 }))).toBe(46)
})

it.each([
  [{ id: '' }, 'identity'], [{ effect: { ...wound().effect, id: '' } }, 'identity'],
  [{ originatingRound: -1 }, 'round'], [{ originatingRound: 1.5 }, 'round'],
  [{ effectiveRound: 1 }, 'effective round'], [{ stressDelta: NaN }, 'counter'], [{ traumaDelta: 0.5 }, 'counter'],
] as const)('refuses invalid wound data atomically: %j', (changes, message) => {
  expect(() => combatWoundIntention({}, wound(changes), 'fight', 'op')).toThrow(message)
})

it('keeps the complete editable wrist label and struck hand without inventing a global Handle modifier', () => {
  const wrist = wound({ effect: { id: 'wrist', name: 'Sprained wrist', cause: 'Sprained wrist row', struckHand: 'left', steps: [{ modifiers: [], labels: ['-20 Handle on actions with this hand if dominant; -10 if other', 'Until healed'] }] } })
  const result = planSheetIntention({ lubec: lubecCharacterSheet() }, combatWoundIntention({}, wrist, 'fight', 'op'))
  const sheet = result.mutation!.sheet.lubec as ReturnType<typeof lubecCharacterSheet>
  expect(sheet.effects[0]).toMatchObject({ struckHand: 'left', steps: wrist.effect.steps })
  expect(lubecEffectiveHandle(sheet, combatInputModifiers(sheet, null))).toBe(55)
})

describe('workspace drain service', () => {
  it('does not lose a newly observed wound while a no-fight reconnect pass is finishing', async () => {
    const drain = vi.fn().mockResolvedValue(undefined)
    const report = vi.fn()
    const service = combatWoundDrainService(drain, report)
    const reconnect = service.reconnect()
    service.observe(live())
    await reconnect
    await vi.waitFor(() => expect(report).toHaveBeenLastCalledWith({ fightId: 'fight', pending: false, reason: null }))
    expect(drain).toHaveBeenCalledOnce()
    service.stop()
  })

  it('clears a delivery failure when another GM empties the observed outbox', async () => {
    const report = vi.fn()
    const service = combatWoundDrainService(vi.fn().mockRejectedValue(new Error('offline')), report)
    service.observe(live())
    await vi.waitFor(() => expect(report).toHaveBeenLastCalledWith({ fightId: 'fight', pending: true, reason: expect.stringContaining('offline') }))
    service.observe(live('fight', []))
    expect(report).toHaveBeenLastCalledWith({ fightId: 'fight', pending: false, reason: null })
    service.stop()
  })

  it('observes wounds without a Combat tab, exposes failures and retries on reconnect', async () => {
    const drain = vi.fn().mockRejectedValueOnce(new Error('permission denied')).mockResolvedValue(undefined)
    const report = vi.fn()
    const service = combatWoundDrainService(drain, report)
    service.observe(live())
    await vi.waitFor(() => expect(report).toHaveBeenLastCalledWith({ fightId: 'fight', pending: true, reason: `${WOUND_WAIT}: Error: permission denied` }))
    await service.reconnect()
    expect(drain).toHaveBeenCalledTimes(2)
    expect(report).toHaveBeenLastCalledWith({ fightId: 'fight', pending: false, reason: null })
    service.observe(null)
    expect(report).toHaveBeenLastCalledWith({ fightId: null, pending: false, reason: null })
    await service.reconnect()
    expect(drain).toHaveBeenCalledTimes(2)
    service.stop()
  })

  it('coalesces in-flight snapshots, follows replacement fights and suppresses stale completions', async () => {
    let finish!: () => void
    const drain = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve })).mockResolvedValue(undefined)
    const report = vi.fn()
    const service = combatWoundDrainService(drain, report)
    service.observe(live())
    service.observe(live('next'))
    service.observe(live('next'))
    const completion = service.reconnect()
    expect(drain).toHaveBeenCalledTimes(1)
    finish()
    await completion
    expect(drain.mock.calls).toEqual([['fight'], ['next']])
    expect(report.mock.calls.map(([status]) => [status.fightId, status.pending])).toEqual([['fight', true], ['next', true], ['next', false]])
    const ended = live('next')
    ended.fight.status = 'ended'
    service.observe(ended)
    expect(report).toHaveBeenLastCalledWith({ fightId: null, pending: false, reason: null })
    service.stop()
  })

  it('ignores stale failure notifications and stops safely while delivery is in flight', async () => {
    let fail!: (error: Error) => void
    const report = vi.fn()
    const drain = vi.fn(() => new Promise<void>((_resolve, reject) => { fail = reject }))
    const service = combatWoundDrainService(drain, report)
    service.observe(live('empty', []))
    expect(drain).not.toHaveBeenCalled()
    service.observe(live())
    const completion = service.reconnect()
    service.stop()
    fail(new Error('offline'))
    await completion
    service.observe(null)
    await service.reconnect()
    expect(report).toHaveBeenCalledTimes(2)
    expect(drain).toHaveBeenCalledTimes(1)
  })
})
