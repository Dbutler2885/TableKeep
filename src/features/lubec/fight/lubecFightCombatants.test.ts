import { describe, expect, it } from 'vitest'
import type { NpcRecord } from '../../../types/app'
import type { TokenRecord } from '../../maps/lib/types'
import type { LubecCharacterRecord } from '../../ruleSets/lubec/characterRecord'
import { makeLubecDirectEntryCharacter } from '../../ruleSets/lubec/directEntry'
import type { LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecWielder } from '../../ruleSets/lubec/gear/minStrength'
import {
  lubecCanFightFrom, lubecCharacterCombatants, lubecMapFightRequest, lubecNpcCombatants, lubecOwnCharacter, lubecTokenCombatant,
} from './lubecFightCombatants'
import {
  lubecCombatantGear, lubecCombatantKey, lubecCombatantRecord, lubecCombatantWielder, lubecCombatantWorn, lubecCombatantWoundLevel, lubecLiveRequest,
  lubecSummaryNpcId, lubecTargetChoices, lubecWithSummary, type LubecCombatant,
} from './lubecFightRequest'
import type { LubecArmorNumbers } from './lubecNpcFightSummary'

const kid = (id: string, ownerUserId: string, fields: Partial<LubecCharacterRecord> = {}): LubecCharacterRecord => ({
  ...makeLubecDirectEntryCharacter(id, { userId: ownerUserId, username: ownerUserId }),
  name: id,
  creationStatus: 'active',
  ...fields,
})

const npcRecord = (id: string): NpcRecord => ({ id, name: `NPC ${id}`, portraitUrl: null, portraitFocusX: 50, portraitFocusY: 50, tokenIcon: { icon: 'pawn', color: '#000000', size: 34 } }) as NpcRecord

const token = (fields: Partial<TokenRecord>): TokenRecord => ({ id: 't', color: '#123456', size: 28, name: 'Rene', revealName: false, tokenImageUrl: '', ...fields }) as TokenRecord

const player = { role: 'player' as const, userId: 'p1' }
const gm = { role: 'gm' as const, userId: 'gm' }

describe('the people in a store', () => {
  it('offers characters in play only', () => {
    const combatants = lubecCharacterCombatants([kid('a', 'p1'), kid('b', 'p1', { creationStatus: 'draft' })])
    expect(combatants.map(lubecCombatantKey)).toEqual(['character:a'])
  })

  it('pairs each NPC with its sheet, or none', () => {
    const sheet = kid('rene', 'gm')
    const [rene, dube] = lubecNpcCombatants([npcRecord('rene'), npcRecord('dube')], [sheet])
    expect(rene).toMatchObject({ kind: 'npc', sheet })
    expect(dube).toMatchObject({ kind: 'npc', sheet: null })
  })
})

describe('lubecOwnCharacter', () => {
  const roster = [kid('other', 'p2'), kid('draft', 'p1', { creationStatus: 'draft' }), kid('first', 'p1'), kid('chosen', 'p1')]

  it('is the character they chose, or the first of their own in play', () => {
    expect(lubecOwnCharacter(roster, 'chosen', 'p1')?.id).toBe('chosen')
    expect(lubecOwnCharacter(roster, null, 'p1')?.id).toBe('first')
  })

  it('is never someone else\'s, and none without one in play', () => {
    expect(lubecOwnCharacter(roster, 'other', 'p1')?.id).toBe('first')
    expect(lubecOwnCharacter(roster, null, 'p3')).toBeNull()
  })
})

describe('lubecCanFightFrom', () => {
  it('lets the owner and the GM fight from a character in play, and nobody else', () => {
    expect(lubecCanFightFrom(kid('a', 'p1'), player)).toBe(true)
    expect(lubecCanFightFrom(kid('a', 'p2'), gm)).toBe(true)
    expect(lubecCanFightFrom(kid('a', 'p2'), player)).toBe(false)
    expect(lubecCanFightFrom(kid('a', 'p1', { creationStatus: 'draft' }), player)).toBe(false)
    expect(lubecCanFightFrom(null, player)).toBe(false)
  })
})

describe('lubecTokenCombatant', () => {
  const combatants: LubecCombatant[] = [{ kind: 'character', character: kid('a', 'p1') }, { kind: 'npc', npc: npcRecord('rene'), sheet: null }]

  it('reads characterId as a character and npcId as an NPC', () => {
    expect(lubecTokenCombatant(token({ characterId: 'a' }), combatants)).toBe(combatants[0])
    expect(lubecTokenCombatant(token({ npcId: 'rene' }), combatants)).toBe(combatants[1])
  })

  it('is nobody for a monster, or a character out of the roster', () => {
    expect(lubecTokenCombatant(token({}), combatants)).toBeNull()
    expect(lubecTokenCombatant(token({ characterId: 'gone' }), combatants)).toBeNull()
  })

  it('knows an NPC a player cannot read by its token, named only once revealed', () => {
    expect(lubecTokenCombatant(token({ npcId: 'x' }), [])).toMatchObject({ kind: 'npc', sheet: null, npc: { id: 'x', name: 'Someone unknown', tokenIcon: { icon: 'pawn', color: '#123456' } } })
    expect(lubecTokenCombatant(token({ npcId: 'x', revealName: true, tokenImageUrl: 'u' }), [])).toMatchObject({ npc: { name: 'Rene', tokenIcon: { icon: 'custom', customImageUrl: 'u' } } })
  })
})

describe('lubecMapFightRequest', () => {
  const own = kid('mine', 'p1')
  const other = kid('other', 'p2')
  const combatants = lubecCharacterCombatants([own, other])
  const playerContext = { viewer: player, own, combatants }

  it('always has a player attack as their own character, at the token', () => {
    const request = lubecMapFightRequest([token({ characterId: 'other' })], playerContext)
    expect(request?.attacker).toMatchObject({ character: { id: 'mine' } })
    expect(request?.target).toMatchObject({ character: { id: 'other' } })
  })

  it('lets a player start with no target, and never at themselves', () => {
    expect(lubecMapFightRequest([], playerContext)?.target).toBeNull()
    expect(lubecMapFightRequest([token({ characterId: 'mine' })], playerContext)?.target).toBeNull()
  })

  it('gives a player with no character in play no fight', () => {
    expect(lubecMapFightRequest([token({ npcId: 'x' })], { ...playerContext, own: null })).toBeNull()
  })

  it('has the GM\'s first token attack the second', () => {
    const request = lubecMapFightRequest([token({ characterId: 'other' }), token({ npcId: 'x', name: 'Rene' })], { viewer: gm, own: null, combatants })
    expect(request?.attacker).toMatchObject({ character: { id: 'other' } })
    expect(request?.target).toMatchObject({ kind: 'npc', npc: { name: 'Rene' } })
  })

  it('leaves the GM\'s target to the modal for one token, and needs someone to attack as', () => {
    expect(lubecMapFightRequest([token({ characterId: 'other' })], { viewer: gm, own: null, combatants })?.target).toBeNull()
    expect(lubecMapFightRequest([], { viewer: gm, own: null, combatants })).toBeNull()
    expect(lubecMapFightRequest([token({})], { viewer: gm, own: null, combatants })).toBeNull()
  })
})

describe('reading a request', () => {
  const a: LubecCombatant = { kind: 'character', character: kid('a', 'p1') }
  const b: LubecCombatant = { kind: 'character', character: kid('b', 'p2') }
  const stub: LubecCombatant = { kind: 'npc', npc: npcRecord('rene'), sheet: null }
  const sheet = kid('rene', 'gm')
  const loaded: LubecCombatant = { kind: 'npc', npc: { ...npcRecord('rene'), name: 'Rene Dube' }, sheet }

  it('takes the combatants as they are now, keeping one the host does not hold', () => {
    const live = lubecLiveRequest({ attacker: a, target: stub }, [b, loaded])
    expect(live.attacker).toBe(a)
    expect(live.target).toBe(loaded)
    expect(lubecLiveRequest({ attacker: a, target: null }, [a]).target).toBeNull()
  })

  it('offers everyone but the attacker, with the request\'s own target first', () => {
    expect(lubecTargetChoices({ attacker: a, target: stub }, [a, b, loaded]).map(lubecCombatantKey)).toEqual(['npc:rene', 'character:b'])
    expect(lubecTargetChoices({ attacker: a, target: null }, [a, b]).map(lubecCombatantKey)).toEqual(['character:b'])
  })

  it('reads an NPC\'s sheet under its own name, and nothing without one', () => {
    expect(lubecCombatantRecord(loaded)?.name).toBe('Rene Dube')
    expect(lubecCombatantRecord(stub)).toBeNull()
    expect(lubecCombatantGear(stub).items).toEqual([])
    expect(lubecCombatantWielder(stub)).toEqual({ strength: null, handle: null })
    expect(lubecCombatantWielder(loaded)).toEqual(lubecWielder(sheet.lubec))
  })

  it('lists the sheet\'s pieces, or else the public summary\'s parts, or says it cannot', () => {
    const jacket = { id: 'jk', carrier: 'worn', name: 'Leather jacket', locs: ['torso'], armor: { cut: 2, pierce: 1, blunt: 1, gun: 0 } } as LubecItem
    const dressed: LubecCombatant = { ...loaded, sheet: { ...sheet, lubec: { ...sheet.lubec, gear: { ...sheet.lubec.gear, items: [jacket] } } } } as LubecCombatant
    expect(lubecCombatantWorn(dressed)).toEqual([{ key: 'jk', name: 'Leather jacket', covers: 'Torso', armor: { cut: 2, pierce: 1, blunt: 1, gun: 0 } }])
    expect(lubecCombatantWorn({ ...stub, summary: { armor: [{ locs: ['torso', 'waist'], armor: jacket.armor as LubecArmorNumbers }], woundLevel: 'Hurt' } } as LubecCombatant))
      .toEqual([{ key: 'torso,waist', name: 'Torso, Waist', covers: '', armor: jacket.armor }])
    expect(lubecCombatantWorn(stub)).toBeNull()
  })

  it('takes the wound level from the sheet, or else the summary', () => {
    expect(lubecCombatantWoundLevel(loaded)).toBeNull()
    expect(lubecCombatantWoundLevel({ ...stub, summary: { armor: [], woundLevel: 'Hurt' } } as LubecCombatant)).toBe('Hurt')
    expect(lubecCombatantWoundLevel(stub)).toBeNull()
  })

  it('names the NPC a player has to read the summary of, and lays it on the target', () => {
    const summary = { armor: [], woundLevel: null }
    expect(lubecSummaryNpcId({ attacker: a, target: stub }, false)).toBe('rene')
    expect(lubecSummaryNpcId({ attacker: a, target: stub }, true)).toBeNull()
    expect(lubecSummaryNpcId({ attacker: a, target: b }, false)).toBeNull()
    expect(lubecSummaryNpcId(null, false)).toBeNull()
    expect(lubecWithSummary({ attacker: a, target: stub }, summary).target).toMatchObject({ summary })
    expect(lubecWithSummary({ attacker: a, target: b }, summary).target).toBe(b)
    expect(lubecWithSummary({ attacker: a, target: stub }, null).target).toBe(stub)
  })
})
