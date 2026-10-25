/**
 * How the Lubec sheet reads a stored character and what a save writes back:
 * the rules' starting values where the rules give one, a hole (`null`) for
 * anything else missing or unreadable, and no media URL or writer field.
 */
import { describe, expect, it } from 'vitest'
import { ruleSets } from '../registry'
import { lubecCharacterParser, lubecCharacterStore, parseLubecCharacter, serializeLubecCharacter } from './characterParser'
import { lubecDefaultTokenIcon } from './characterRecord'
import { emptyLubecGear } from './gear/gearRecord'
import storedCharacter from './fixtures/stored-character.json'

const parse = (data: Record<string, unknown>) => parseLubecCharacter('pc-1', { system: 'lubec', ...data })

const holes = { Strength: null, Speed: null, Intellect: null, Handle: null, Charm: null, Sanity: null, Fear: null, Body: null }

describe('Lubec character parser', () => {
  it('reads a character with nothing stored as an established draft with the starting counters and every value a hole', () => {
    expect(parse({})).toEqual({
      id: 'pc-1',
      system: 'lubec',
      name: '',
      ownerUserId: '',
      ownerUsername: null,
      creationMode: 'established',
      creationStatus: 'established_draft',
      portraitPath: '',
      portraitUrl: null,
      portraitFocusX: 50,
      portraitFocusY: 50,
      tokenIcon: lubecDefaultTokenIcon,
      lubec: {
        age: null,
        class: { key: null, choices: { statPenalty: null, statBonus: null } },
        base: holes,
        skills: { free: null, picked: [] },
        door: null,
        rollUp: null,
        counters: { stress: 2, minimumStress: 2, trauma: 0 },
        effects: [],
        lastRoll: null,
        importNotes: [],
        gear: { items: [], carriers: [], overrides: [], supplies: [] },
      },
    })
  })

  it('reads a sheet that is not an object as an empty one', () => {
    expect(parse({ lubec: 'torn page' }).lubec).toEqual(parse({}).lubec)
  })

  it('reads a character started as new as a draft', () => {
    expect(parse({ creationMode: 'new' })).toMatchObject({ creationMode: 'new', creationStatus: 'draft' })
  })

  it('reads unreadable values as holes, never as defaults', () => {
    const { lubec } = parse({
      lubec: {
        age: '13',
        class: { key: 7, choices: { statPenalty: 3, statBonus: ['Speed'] } },
        base: { Strength: 'twelve', Speed: 12.5, Intellect: 40 },
        skills: { free: { name: 'Science' }, picked: ['Chemistry', 4, null] },
      },
    })
    expect(lubec.age).toBeNull()
    expect(lubec.class).toEqual({ key: null, choices: { statPenalty: null, statBonus: null } })
    expect(lubec.base).toEqual({ ...holes, Intellect: 40 })
    expect(lubec.skills).toEqual({ free: null, picked: ['Chemistry'] })
  })

  it('reads unreadable counters as their starting values', () => {
    const { lubec } = parse({ lubec: { counters: { stress: -1, minimumStress: 2.5, trauma: 'two' } } })
    expect(lubec.counters).toEqual({ stress: 2, minimumStress: 2, trauma: 0 })
  })

  it('reads an unknown door, a list that is not a list and entries that are not objects as nothing', () => {
    const { lubec } = parse({ lubec: { door: 'window', effects: 'none', rollUp: [1, 2], lastRoll: 'a 31', importNotes: ['Old file', 2] } })
    expect(lubec).toMatchObject({ door: null, effects: [], rollUp: null, lastRoll: null, importNotes: ['Old file'] })
  })

  it('reads the checked-in character as stored', () => {
    const record = parseLubecCharacter(storedCharacter.id, storedCharacter.data)
    expect(record).toMatchObject({
      name: 'Ada Mitchell',
      ownerUsername: 'adamitc',
      creationStatus: 'active',
      portraitFocusX: 40,
      lubec: {
        age: 13,
        door: 'direct',
        class: { key: 'nerd', choices: { statPenalty: 'Strength', statBonus: null } },
        skills: { free: 'Science', picked: ['Electronics & Radio', 'Chemistry', 'Computers'] },
        counters: { stress: 4, minimumStress: 3, trauma: 1 },
        lastRoll: { kind: 'stat', roll: 31 },
      },
      unknownFields: { hidden: false, unknownTopLevel: storedCharacter.data.unknownTopLevel },
    })
    expect(record.lubec.base.Speed).toBeNull()
    expect(record.lubec.effects).toEqual(storedCharacter.data.lubec.effects)
    expect(record.lubec.gear).toEqual(emptyLubecGear())
  })

  it('writes gear back as it read it, and reads the save as the same record', () => {
    const gear = {
      items: [{ id: 'item-1', kind: 'thing', name: 'Wool watch cap', note: 'Navy blue. Smells like the boat.', size: 1, weight: 'normal', qty: 1, carrier: 'backpack', pocket: 0, unknownItemField: 'kept' }],
      carriers: [{ id: 'chest', name: 'Bedroom chest', type: 'chest', pockets: [{ name: 'Chest', slots: 12, max: 8 }] }],
      overrides: ['heavy:item-1'],
      supplies: [{ id: 'dcell', name: 'D batteries', loose: [1, 4] }],
      backpackArt: 'teal',
      unknownGearField: { kept: true },
    }
    const record = parse({ lubec: { gear } })
    const serialized = serializeLubecCharacter(record)
    expect(serialized.lubec).toMatchObject({ gear })
    expect(parse(serialized)).toEqual(record)
  })

  it('drops a stored portrait URL, and saves no media URL, time or version field', () => {
    const record = parse({ portraitUrl: 'https://cdn.test/old.png', schemaVersion: 1, createdAt: 'then', updatedAt: 'now' })
    expect(record.unknownFields).toBeUndefined()
    const serialized = serializeLubecCharacter({
      ...record,
      portraitUrl: 'https://cdn.test/portrait.png',
      tokenIcon: { ...record.tokenIcon, customImageUrl: 'https://cdn.test/token.png' },
    })
    expect(serialized).not.toHaveProperty('portraitUrl')
    expect(serialized.tokenIcon).not.toHaveProperty('customImageUrl')
    for (const field of ['createdAt', 'updatedAt', 'schemaVersion', 'schemaWrittenAt']) {
      expect(serialized).not.toHaveProperty(field)
    }
  })

  it('stores its holes as explicit nulls', () => {
    const serialized = serializeLubecCharacter(parse({}))
    expect(serialized.lubec).toMatchObject({ age: null, class: { key: null }, base: holes })
  })

  it('gives a character with no token icon the Lubec pawn', () => {
    expect(lubecDefaultTokenIcon.color).toBe(ruleSets.lubec.skin.tokenColor)
  })
})

describe('Lubec character store', () => {
  it('loads and saves Lubec characters through the Lubec parser at version 1', () => {
    expect(lubecCharacterStore).toMatchObject({ system: 'lubec', label: 'Lubec', parser: lubecCharacterParser })
    expect(lubecCharacterStore.versioning.schemaVersion).toBe(1)
  })
})
