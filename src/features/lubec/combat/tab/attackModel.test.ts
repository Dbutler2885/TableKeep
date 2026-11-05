/**
 * The attack window's words and numbers, read from a fight as the engine
 * leaves it: defaults, the split, the sum, the range bands and who controls
 * an attacker.
 */
import { describe, expect, it } from 'vitest'
import { parseLubecGear } from '../../../ruleSets/lubec/gear/gearRecord'
import { lubecCharacterSheet } from '../../../ruleSets/lubec/sheetFixtures'
import { makeLubecDirectEntryCharacter } from '../../../ruleSets/lubec/directEntry'
import { LUBEC_FISTICUFFS_ID } from '../../fight/lubecFightRequest'
import type { CombatAttack, Combatant, CombatFrozenAim, CombatState } from '../engine/types'
import { attackSegments, attackSum, barPercent, completeAim, defaultAttack, defaultWeapon, initialDraft, labelPlace, outcomeClass, rollText, sameAim, segmentMiddle, withDefense, withWeapon } from './attackDraft'
import { attackWindowModel, heldAim, rollReady, windowReading } from './attackWindowModel'
import { attackLine, attackVerdict, bandLabel, combatantName, controlsAttacker, isThrow, missWords, pressedBand, resultFoot, waitsOnGm } from './attackWords'
import { combatFightCombatant, NO_ROSTER } from './combatFightCombatants'

const inHand = (id: string, slot: number, extra: Record<string, unknown> = {}) =>
  ({ id, kind: 'weapon', carrier: 'hands', slot, name: id, size: 1, qty: 1, weight: 'normal', note: '', ...extra })
const knife = inHand('Knife', 0, { mode: 'melee', wounds: ['cut', 'pierce'] })
const ball = inHand('Dodgeball', 0, { mode: 'thrown', wounds: ['blunt'] })
const radio = (slot: number) => inHand(`Radio ${slot}`, slot, { kind: 'thing' })
const sheetWith = (...items: Record<string, unknown>[]) => lubecCharacterSheet({ gear: parseLubecGear({ items }) })
const person = (key: string, name: string, kind: Combatant['kind'] = 'npc', ownerUserId = 'gm'): Combatant =>
  ({ key, kind, sheetId: key.split(':')[1], name, ownerUserId, portraitPath: '', speed: 40, armor: [], interactionSequence: 0, outReason: null })
const wayne = person('character:wayne', 'Wayne', 'character', 'wayne-uid')
const roy = person('npc:roy', 'Roy')
const state = (attack: CombatAttack | null = null): CombatState =>
  ({ round: 0, phase: 'before-initiative', stageInstanceId: 's', combatants: [wayne, roy], floor: [], attack, woundOutbox: [], woundAcknowledgements: [] })
const frozen = (extra: Partial<CombatFrozenAim> = {}): CombatFrozenAim => ({
  choice: { id: 'throw', name: 'Throw', start: 'thrown', wound: 'thrown', armor: 'blunt', str: true, skill: 'throwing', ranged: true, impact: 0 },
  weaponName: 'Dodgeball', ranges: [{ band: 'short', modifier: 10, distance: 'across the gym' }], handle: 46, skill: null, total: 46, attack: 26, sourceRevision: 0, ...extra,
})
const aim = { targetKey: 'npc:roy', weaponItemId: 'Dodgeball', attackId: 'throw', defense: { against: 'npc:roy', amount: 20 } }
const attack = (extra: Partial<CombatAttack> = {}): CombatAttack =>
  ({ id: 'a', grantId: 'g', attackerKey: 'character:wayne', step: 'aim', detached: [], closed: false, aim, frozen: frozen(), range: null, roll: null, repair: null, ...extra })

describe('the draft', () => {
  it('starts on the first held weapon and its only use, Fisticuffs with a free hand, or nothing', () => {
    expect(defaultWeapon(sheetWith(ball))).toBe('Dodgeball')
    expect(defaultWeapon(sheetWith(radio(0)))).toBe(LUBEC_FISTICUFFS_ID)
    expect(defaultWeapon(sheetWith(radio(0), radio(1)))).toBeNull()
    expect(defaultAttack(sheetWith(ball), 'Dodgeball')).toBe('throw')
    expect(defaultAttack(sheetWith(knife), 'Knife')).toBeNull()
  })

  it('opens on the persisted aim, else on a guess, with nothing to guess from without a sheet', () => {
    expect(initialDraft(attack(), null, [])).toBe(aim)
    expect(initialDraft(attack({ aim: null }), sheetWith(ball), ['npc:roy'])).toEqual({ targetKey: 'npc:roy', weaponItemId: 'Dodgeball', attackId: 'throw', defense: null })
    expect(initialDraft(attack({ aim: null }), null, [])).toEqual({ targetKey: null, weaponItemId: null, attackId: null, defense: null })
  })

  it('is an aim only once complete, and compares aims whatever their key order', () => {
    expect(completeAim({ ...aim, attackId: null })).toBeNull()
    expect(completeAim(aim)).toBe(aim)
    expect(sameAim({ defense: aim.defense, attackId: 'throw', weaponItemId: 'Dodgeball', targetKey: 'npc:roy' }, aim)).toBe(true)
    expect(sameAim(null, aim)).toBe(false)
  })

  it('takes a new weapon\'s only use and moves the Defense line in tens, never over the whole pool', () => {
    expect(withWeapon({ ...aim, attackId: 'slash' }, sheetWith(ball), 'Dodgeball').attackId).toBe('throw')
    expect(withDefense({ ...aim, defense: null }, 34, 56, 'npc:roy').defense).toEqual({ against: 'npc:roy', amount: 30 })
    expect(withDefense(aim, 90, 56, 'npc:other').defense).toEqual({ against: 'npc:roy', amount: 50 })
    expect(withDefense(aim, 4, 56, 'npc:roy').defense).toBeNull()
  })
})

describe('the bar', () => {
  it('puts Defense first, moves only the attack\'s end with range, and keeps an attack at or below 0', () => {
    expect(attackSegments(56, 20, null)).toEqual({ defense: 20, attackFrom: 20, attackWidth: 36, edge: 56, attackNumber: 36 })
    expect(attackSegments(56, 20, { band: 'long', modifier: -20 })).toMatchObject({ attackWidth: 16, attackNumber: 16 })
    expect(attackSegments(56, 20, { band: 'extreme', modifier: -50 })).toMatchObject({ attackWidth: 0, edge: 20, attackNumber: -14 })
    expect(attackSegments(95, 0, { band: 'short', modifier: 20 })).toMatchObject({ edge: 100, attackNumber: 115 })
  })

  it('places buttons and labels inside the bar, and reads a pointer as a percentage', () => {
    expect([segmentMiddle(0, 4), segmentMiddle(20, 36), segmentMiddle(98, 2)]).toEqual([8, 38, 92])
    expect([labelPlace(0, 4), labelPlace(20, 36), labelPlace(96, 4)]).toEqual([{ left: 0, edge: 'at-start' }, { left: 38, edge: '' }, { left: 100, edge: 'at-end' }])
    expect(barPercent({ left: 100, width: 200 }, 160)).toBe(30)
  })

  it('colours the rolled attack and writes rolls in two digits', () => {
    expect(outcomeClass(null)).toBe('')
    expect(outcomeClass({ roll: 22, attackNumber: 36, hit: true, critical: true, quality: 3 })).toBe('double success')
    expect(outcomeClass({ roll: 90, attackNumber: 36, hit: false, critical: false, quality: null })).toBe('failure')
    expect(rollText(7)).toBe('07')
  })

  it('sums the pool as the mock-up does', () => {
    expect(attackSum({ handle: 46, skill: { name: 'Throwing Arm', bonus: 10 }, total: 56 }, { band: 'long', modifier: -20 })).toBe('Handle 46 + Throwing Arm 10 − Range 20 =')
    expect(attackSum({ handle: 46, skill: null, total: 46 }, { band: 'short', modifier: 10 })).toBe('Handle 46 + Range 10 =')
    expect(attackSum({ handle: 46, skill: null, total: 46 }, null)).toBe('Handle 46 =')
  })
})

describe('the window model', () => {
  const record = () => {
    const character = makeLubecDirectEntryCharacter('wayne', { userId: 'wayne-uid', username: 'waynegd' })
    character.lubec = sheetWith(ball)
    return character
  }
  const input = (current: CombatAttack, draft = aim) => ({ state: state(current), fightId: 'f', attack: current, attacker: wayne, roster: { characters: [record()], npcs: [] }, sheet: record().lubec, draft })

  it('uses the frozen numbers for the aim the table holds and the sheet for a new one', () => {
    expect(heldAim(attack(), aim)).toBe(true)
    expect(heldAim(attack({ frozen: null }), aim)).toBe(false)
    expect(windowReading(attack(), aim, record().lubec, { fightId: 'f', round: 0 })).toEqual({ handle: 46, skill: null, total: 46, ranged: true })
    expect(windowReading(attack(), null, record().lubec, { fightId: 'f', round: 0 })).toBeNull()
    expect(windowReading(attack(), { ...aim, weaponItemId: 'gone' }, record().lubec, { fightId: 'f', round: 0 })).toBeNull()
  })

  it('makes a throw rollable only once the GM ranged the held aim; a blow up close at once', () => {
    const reading = { handle: 46, skill: null, total: 46, ranged: true }
    expect(rollReady(attack(), aim, null)).toBe(false)
    expect(rollReady(attack(), aim, reading)).toBe(false)
    expect(rollReady(attack({ range: { band: 'short', modifier: 10 } }), aim, reading)).toBe(true)
    expect(rollReady(attack(), aim, { ...reading, ranged: false })).toBe(true)
  })

  it('names targets from public summaries and the range only for the held aim', () => {
    const model = attackWindowModel(input(attack({ range: { band: 'short', modifier: 10 } })))
    expect(model).toMatchObject({ held: true, range: { band: 'short' }, ready: true, split: { segments: { attackNumber: 36 } } })
    expect(model.targets.map((entry) => entry.kind)).toEqual(['npc'])
    expect(model.target).not.toBeNull()
    const fresh = attackWindowModel(input(attack({ range: { band: 'short', modifier: 10 } }), { ...aim, targetKey: 'npc:nobody', defense: null }))
    expect(fresh).toMatchObject({ held: false, range: null, target: null })
    expect(attackWindowModel(input(attack(), { ...aim, attackId: null as unknown as string }))).toMatchObject({ aim: null, reading: null, split: null })
  })
})

describe('the words', () => {
  it('names the attack the table holds, and who it waits on', () => {
    const current = state(attack({ range: { band: 'long', modifier: -20 } }))
    expect(attackLine(current, current.attack!)).toBe('Throw with Dodgeball at Roy. ATK 6; Defense 20 against Roy.')
    expect(attackLine(current, attack({ aim: { ...aim, defense: null } }))).toBe('Throw with Dodgeball at Roy. ATK 26.')
    expect(attackLine(current, attack({ aim: null }))).toBe('Choosing a target and a weapon.')
    expect(combatantName(current, 'npc:nobody')).toBe('')
    expect([waitsOnGm(attack()), waitsOnGm(attack({ range: { band: 'short', modifier: 10 } }))]).toEqual([true, false])
  })

  it('gives the controls to the owner, the GM for an NPC, and the GM only when acting for an absent player', () => {
    const player = { role: 'player' as const, userId: 'wayne-uid', actingFor: null }
    const gm = { role: 'gm' as const, userId: 'gm', actingFor: null }
    expect([controlsAttacker(wayne, player), controlsAttacker(roy, player)]).toEqual([true, false])
    expect([controlsAttacker(wayne, gm), controlsAttacker(roy, gm), controlsAttacker(wayne, { ...gm, actingFor: wayne.key })]).toEqual([false, true, true])
  })

  it('labels range bands from the weapon\'s own numbers and offers the last band again', () => {
    const ranges = frozen().ranges
    expect([bandLabel(ranges, 'short'), bandLabel(ranges, 'long')]).toEqual(['Short +10', 'Long'])
    expect(pressedBand(attack(), 'medium')).toBe('medium')
    expect(pressedBand(attack({ range: { band: 'long', modifier: -20 } }), 'medium')).toBe('long')
  })

  it('tells a throw from a blow or a shot, and says what a result means', () => {
    const gun = frozen({ choice: { ...frozen().choice, id: 'shoot', name: 'Shoot', firearm: true }, weaponName: 'Revolver' })
    const punch = frozen({ choice: { ...frozen().choice, id: 'punch', name: 'Punch', ranged: undefined }, weaponName: 'Punch' })
    expect([isThrow(frozen()), isThrow(gun), isThrow(punch)]).toEqual([true, false, false])
    expect(attackVerdict({ roll: 22, attackNumber: 36, hit: true, critical: true, quality: 3 })).toBe('A hit, a critical. Attack Quality 3.')
    expect(attackVerdict({ roll: 7, attackNumber: 36, hit: true, critical: false, quality: 0 })).toBe('A hit. Attack Quality 0.')
    expect(attackVerdict({ roll: 90, attackNumber: 36, hit: false, critical: false, quality: null })).toBe('A miss: 90 is not under 36.')
    expect(missWords('Wayne', punch)).toBe("Wayne's attack misses.")
    expect(missWords('Wayne', frozen())).toBe("Wayne's throw goes wide. The dodgeball left the hand at the Roll and lands on the Floor.")
    expect([resultFoot(attack({ closed: true })), resultFoot(attack())]).toEqual(['The GM may grant another Sneak Attack, or roll initiative.', 'Every roll lands on every screen as a card, then settles into the ticker.'])
  })
})

describe('combatants as the fight modal reads them', () => {
  it('reads an NPC from its sheet for the GM, or its public summary, and a character only from a readable sheet', () => {
    const sheet = makeLubecDirectEntryCharacter('roy', { userId: 'gm', username: 'gmuser1' })
    const npc = { id: 'roy', name: 'Roy Carver', portraitUrl: null, portraitFocusX: 50, portraitFocusY: 50, tokenIcon: { icon: 'pawn' as const, color: '#000000', size: 34 } }
    expect(combatFightCombatant(roy, { characters: [], npcs: [{ npc, sheet }] })).toMatchObject({ kind: 'npc', npc: { name: 'Roy Carver' }, sheet })
    expect(combatFightCombatant(roy, NO_ROSTER)).toMatchObject({ kind: 'npc', npc: { id: 'roy', name: 'Roy' }, sheet: null, summary: { armor: [], woundLevel: null } })
    expect(combatFightCombatant(wayne, NO_ROSTER)).toBeNull()
  })
})

describe('result sequence words', () => {
  it('names a wound table it does not know by its key', async () => {
    const { tableName } = await import('./resultSequence')
    expect([tableName('dodgeball'), tableName('mystery')]).toEqual(['Dodgeball', 'mystery'])
  })
})
