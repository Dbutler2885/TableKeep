/**
 * A deleted character's things (settled rule 7): every one becomes a dropped
 * item for the GM, with who dropped it and where it was, as a drop makes it.
 */
import { describe, expect, it } from 'vitest'
import { lubecDroppedOnDelete } from './deleteDrop'
import { parseLubecGear } from './gearRecord'

const by = { characterId: 'wayne', characterName: 'Wayne Gardner', userId: 'player-1' }

const gear = () => parseLubecGear({
  items: [
    { id: 'lamp', kind: 'holder', carrier: 'backpack', pocket: 0, cells: [2], name: 'Flashlight', size: 1, qty: 1, weight: 'normal', note: '', loaded: 2 },
    { id: 'anvil', kind: 'thing', carrier: 'hands', slot: 0, name: 'Small anvil', size: 1, qty: 1, weight: 'heavy', note: '', check: 'fail', batch: 'b1' },
    { id: 'tent', kind: 'thing', carrier: 'chest', pocket: 0, name: 'Tent', size: 4, qty: 1, weight: 'normal', note: '' },
  ],
  carriers: [{ id: 'chest', name: 'Bedroom chest', type: 'chest', pockets: [{ name: 'Chest', slots: 12, max: 8 }] }],
  overrides: [],
  supplies: [],
})

describe('a deleted character\'s things', () => {
  it('become dropped items, one for each thing, on you or in a personal carrier', () => {
    expect(lubecDroppedOnDelete(gear(), by).map((x) => [x.id, x.name, x.status, x.droppedFrom])).toEqual([
      ['lamp', 'Flashlight', 'dropped', 'backpack'],
      ['anvil', 'Small anvil', 'dropped', 'hands'],
      ['tent', 'Tent', 'dropped', 'Bedroom chest'],
    ])
  })

  it('carry who dropped them and lose where they were, keeping everything else', () => {
    expect(lubecDroppedOnDelete(gear(), by)[1]).toEqual({
      id: 'anvil', kind: 'thing', name: 'Small anvil', size: 1, qty: 1, weight: 'heavy', note: '',
      status: 'dropped', droppedFrom: 'hands', droppedByCharacterId: 'wayne', droppedByCharacterName: 'Wayne Gardner', droppedByUserId: 'player-1',
    })
    expect(lubecDroppedOnDelete(gear(), by)[0]).toMatchObject({ loaded: 2 })
    expect(lubecDroppedOnDelete(gear(), by)[0]).not.toHaveProperty('cells')
  })

  it('are none for a character with no things', () => {
    expect(lubecDroppedOnDelete(parseLubecGear(undefined), by)).toEqual([])
  })
})
