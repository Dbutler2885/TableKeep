/**
 * What a store purchase puts in a character's inventory. Recorded from the
 * store as it stood while it still imported its list from storeCatalog.ts.
 * Carts are built the way the store builds them (`useStoreDomain`): keyed by
 * the store item's id, labelled with its name.
 */
import { describe, expect, it } from 'vitest'
import { materializeCartEntries } from './storeRules'

const anyId = expect.any(String)

describe('materializeCartEntries', () => {
  it('turns a cart with one weapon and one consumable into the recorded inventory items', () => {
    const result = materializeCartEntries([
      { key: 'wpn-sword', name: 'Sword', costGp: 10, qty: 1, kind: 'weapon', weaponId: 'sword', armourId: undefined, packedLabel: 'Sword' },
      { key: 'gear-torches', name: 'Torches (6)', costGp: 1, qty: 1, kind: 'consumable', packedLabel: 'Torches (6)' },
    ], 'Fighter')

    expect(result).toStrictEqual({
      ok: true,
      items: [
        {
          id: anyId,
          kind: 'weapon',
          costGp: 10,
          equipped: false,
          notes: '',
          typeId: 'sword',
          typeName: 'Sword',
          qty: 1,
          stack: { stackable: false },
          isMagic: false,
          damageDiceCount: '1',
          damageDiceSides: '8',
          attackBonus: '',
          damageBonus: '',
          rangeShort: '',
          rangeMedium: '',
          rangeLong: '',
          slow: false,
          twoHanded: false,
          weaponEffects: [],
          weaponRollTables: [],
        },
        {
          id: anyId,
          kind: 'consumable',
          typeId: 'con-torches',
          typeName: 'Torches',
          costGp: 1,
          equipped: false,
          notes: 'Torches (6)',
          description: '30 ft light radius; 1 hour burn each.',
          qty: 6,
          stack: { stackable: true, maxStack: 20 },
          effectText: '',
        },
      ],
    })
  })

  it('looks up ammunition and general gear in the store list for their templates', () => {
    const result = materializeCartEntries([
      { key: 'ammo-arrows', name: 'Arrows (20)', costGp: 5, qty: 1, kind: 'ammunition', packedLabel: 'Arrows (20)' },
      { key: 'gear-rope', name: 'Rope (50 ft)', costGp: 1, qty: 1, kind: 'general', packedLabel: 'Rope (50 ft)' },
    ], 'Fighter')

    expect(result).toStrictEqual({
      ok: true,
      items: [
        {
          id: anyId,
          kind: 'ammunition',
          typeId: 'ammo-arrows',
          typeName: 'Arrows',
          name: 'Arrows (20)',
          costGp: 5,
          equipped: false,
          notes: '',
          description: 'Quiver of 20 arrows.',
          qty: 20,
          stack: { stackable: true, maxStack: 40 },
        },
        {
          id: anyId,
          kind: 'general',
          typeId: 'gear-rope',
          typeName: 'Rope (50 ft)',
          name: 'Rope (50 ft)',
          costGp: 1,
          equipped: false,
          notes: 'Rope (50 ft)',
          description: 'Holds up to three people + equipment.',
          qty: 1,
          stack: { stackable: false },
        },
      ],
    })
  })
})
