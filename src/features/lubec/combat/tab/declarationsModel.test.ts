/**
 * The words and shapes every screen uses for declarations: the mini bar's
 * parts, who a declaration is aimed at, and the Declare waits' sentences.
 */
import { describe, expect, it } from 'vitest'
import type { Combatant, CombatDeclaration, CombatFrozenAim, CombatState } from '../engine/types'
import { aimedText, declaredAt, declaredUse, gmDeclareWords, miniParts, nextDeclarerWords, slowestFirst } from './declarationsModel'

const person = (key: string, name: string, declaration: CombatDeclaration | null = null): Combatant =>
  ({ key, name, kind: 'npc', sheetId: key, ownerUserId: 'gm', portraitPath: '', speed: 50, armor: [], interactionSequence: 0, outReason: null, declaration })
const frozen = (name = 'Throw', weaponName = 'Dodgeball', attack = 36) => ({ choice: { name }, weaponName, attack }) as unknown as CombatFrozenAim
const attack = (target: string, lines: CombatDeclaration['lines'] = [], use = frozen()): CombatDeclaration =>
  ({ ran: false, full: false, aim: { targetKey: target, weaponItemId: 'ball', attackId: 'throw', defense: lines[0] ?? null }, frozen: use, total: 56, lines, sourceRevision: 1 })
const full = (against: string): CombatDeclaration => ({ ran: false, full: true, aim: null, frozen: null, total: 56, lines: [{ against, amount: 56 }], sourceRevision: 1 })
const state = (combatants: Combatant[], order?: string[]) => ({ combatants, order }) as CombatState

describe('miniParts', () => {
  it('puts Defense first, then the attack, then the unused rest', () => {
    expect(miniParts(attack('roy', [{ against: 'roy', amount: 20 }]))).toEqual([{ kind: 'd', width: 20 }, { kind: 'a', width: 36 }, { kind: 'u', width: 44 }])
    expect(miniParts(full('roy'))).toEqual([{ kind: 'f', width: 56 }, { kind: 'u', width: 44 }])
    expect(miniParts({ ...full('roy'), total: 100, lines: [{ against: 'roy', amount: 100 }] })).toEqual([{ kind: 'f', width: 100 }])
  })
})

describe('who a declaration is aimed at', () => {
  it('counts an attack at, or a line against, someone the viewer controls', () => {
    expect(declaredAt(attack('wayne'), ['wayne'])).toBe(true)
    expect(declaredAt(attack('roy', [{ against: 'wayne', amount: 20 }]), ['wayne'])).toBe(true)
    expect(declaredAt(attack('roy'), ['wayne'])).toBe(false)
    expect(declaredAt(full('wayne'), ['wayne'])).toBe(true)
  })

  it('names the use, with its weapon when it has one', () => {
    expect(declaredUse(frozen())).toBe('Throw with the Dodgeball')
    expect(declaredUse(frozen('Punch', 'Punch'))).toBe('Punch')
  })

  it('tells the declarer what was declared at them', () => {
    const table = state([person('roy', 'Roy Carver'), person('dale', 'Dale Ricker')])
    expect(aimedText(table, full('wayne'), 'wayne')).toBe('has declared Full Defense against you.')
    expect(aimedText(table, attack('wayne'), 'wayne')).toBe('has declared a throw at you (ATK 36).')
    expect(aimedText(table, attack('wayne', [{ against: 'wayne', amount: 20 }]), 'wayne')).toBe('has declared a throw at you (ATK 36, Defense 20 against you).')
    expect(aimedText(table, attack('dale', [{ against: 'wayne', amount: 20 }]), 'wayne')).toBe('has declared Defense against you (ATK 36, Defense 20 against you).')
    expect(aimedText(table, attack('wayne', [{ against: 'dale', amount: 10 }]), 'wayne')).toBe('has declared a throw at you (ATK 36, Defense 10 against Dale Ricker).')
  })
})

describe('the Declare waits', () => {
  const wayne = person('wayne', 'Wayne Gardner')
  const dottie = person('dottie', 'Dottie Haskell')

  it('says who declares now and who follows', () => {
    expect(nextDeclarerWords([wayne])).toBe('Wayne Gardner is the last to declare. Then the attacks begin, fastest first.')
    expect(nextDeclarerWords([wayne, dottie])).toBe('Wayne Gardner is declaring now. Then Dottie Haskell.')
  })

  it('tells the GM who has declared and who is next', () => {
    expect(gmDeclareWords(state([wayne, dottie]), [wayne, dottie])).toBe('Nobody has declared yet. Wayne Gardner is next, then Dottie Haskell.')
    const roy = person('roy', 'Roy Carver', attack('wayne'))
    expect(gmDeclareWords(state([roy, wayne]), [wayne])).toBe('Roy Carver has declared. Wayne Gardner is next.')
    const dale = person('dale', 'Dale Ricker', full('wayne'))
    const ran = person('tommy', 'Tommy Lyle', { ...full('wayne'), ran: true })
    expect(gmDeclareWords(state([dale, roy, ran, wayne]), [wayne])).toBe('Dale Ricker and Roy Carver have declared. Wayne Gardner is next.')
  })

  it('has no order before initiative', () => {
    expect(slowestFirst(state([wayne]))).toEqual([])
    expect(slowestFirst(state([wayne, dottie], ['dottie', 'wayne'])).map((entry) => entry.key)).toEqual(['wayne', 'dottie'])
  })
})
