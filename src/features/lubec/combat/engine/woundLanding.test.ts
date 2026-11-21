import { describe, expect, it } from 'vitest'
import { combatEntropy, type CombatEntropy } from './commandEntropy'
import type { CombatCheckRoll, CombatCommand } from './types'
import { lubecLanded, lubecLandingRolls, lubecRollAmounts } from './woundLanding'
import type { LubecWoundTableRow } from '../../../ruleSets/lubec/woundTables/types'

const command = { envelope: { id: 'c' }, seed: 's', payload: { type: 'check' } } as unknown as CombatCommand
const scripted = (values: Record<string, number>): CombatEntropy => ({ ...combatEntropy(command), die: (purpose: string, sides: number) => values[purpose] ?? sides })
const both: LubecWoundTableRow = { impact: 4, severity: 'Critical', trauma: 2, name: 'Both', text: '', outcome: { cards: [], timers: ['bleed', 'critical'] }, contentVersion: 'x' }
const save = (success: boolean): CombatCheckRoll => ({ purpose: 'prevention', kind: 'save', against: 'Body', advantage: 'normal', target: 30, dice: [success ? 10 : 90], result: success ? 10 : 90, success, stress: success ? 0 : 1 })

describe('one prevention Save for a bleed and a Critical countdown', () => {
  it('asks for one Save only', () => {
    expect(lubecLandingRolls(both, null).map((roll) => roll.purpose)).toEqual(['prevention'])
  })

  it('a failure charges its Stress once and keeps a separate d4 for each countdown', () => {
    const landed = lubecLanded(both, null, [save(false)])
    expect(landed).toMatchObject({ wound: true, stress: 1, prevented: false, outcome: { timers: ['bleed', 'critical'] } })
    if (!landed.wound) throw new Error('no wound')
    const { rolled, dice } = lubecRollAmounts(landed.outcome, scripted({ 'timer-bleed': 2, 'timer-critical': 4 }))
    expect(rolled.timers).toEqual([{ kind: 'bleed', rounds: 2 }, { kind: 'critical', rounds: 4 }])
    expect(dice).toEqual({ 'Bleeding d4': [2], 'Critical d4': [4] })
  })

  it('a success prevents both and rolls no d4', () => {
    const landed = lubecLanded(both, null, [save(true)])
    expect(landed).toMatchObject({ wound: true, stress: 0, prevented: true, outcome: { timers: [] } })
    if (!landed.wound) throw new Error('no wound')
    expect(lubecRollAmounts(landed.outcome, scripted({})).rolled.timers).toBeUndefined()
  })
})
