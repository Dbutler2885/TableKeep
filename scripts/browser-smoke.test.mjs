import { describe, expect, it } from 'vitest'
import {
  calibratedMapFields,
  changedFirestoreFields,
  groupIdFromUrl,
  interpolatePath,
  migratedFixtureFields,
  oseCharacterFields,
  ownedFixtureFields,
  partyTokenFields,
  step,
  storedItemsProblem,
  storedMediaProblems,
  storedVersionProblems,
  trackersAtZero,
  vtmCharacterFields,
  withVtmConcept,
} from './browser-smoke.mjs'
import { toFirestoreFields } from './browser-smoke-seed.mjs'
import { oseCharacterVersioning } from '../src/features/ruleSets/characterMigrations.ts'

const pageAt = (url) => ({ url: () => url })

describe('browser smoke steps', () => {
  it('returns what the step returns', async () => {
    await expect(step('seed', async () => 'campaign-1')).resolves.toBe('campaign-1')
  })

  it('names the step a failure happened in and keeps the original error', async () => {
    const timeout = new Error('Timed out after waiting 15000ms')
    const failure = await step('go back to the group home', async () => { throw timeout }).catch((error) => error)
    expect(failure.message).toBe('go back to the group home: Timed out after waiting 15000ms')
    expect(failure.cause).toBe(timeout)
  })

  it('names the step for a thrown value that is not an Error', async () => {
    await expect(step('seed', async () => { throw 'refused' })).rejects.toThrow('seed: refused')
  })
})

describe('reading the group id from the group home URL', () => {
  it('returns the id from a group home URL', () => {
    expect(groupIdFromUrl(pageAt('http://127.0.0.1:4173/groups/abc123'))).toBe('abc123')
  })

  it.each([
    'http://127.0.0.1:4173/groups',
    'http://127.0.0.1:4173/groups/abc123/campaigns/c1/character',
  ])('refuses %s, which is not a group home', (url) => {
    expect(() => groupIdFromUrl(pageAt(url))).toThrow(`Expected a group home URL, got ${url}.`)
  })
})

describe('seeding a VtM character', () => {
  it('writes an active, established VtM character owned by the user, with only the Concept on its sheet', () => {
    expect(vtmCharacterFields({ uid: 'u1', username: 'desk001', name: 'Mina', concept: 'Courier' })).toEqual({
      system: 'vtm',
      name: 'Mina',
      ownerUserId: 'u1',
      ownerUsername: 'desk001',
      creationMode: 'established',
      creationModeExplicit: true,
      creationStatus: 'active',
      xp: 0,
      vtm: { concept: 'Courier' },
      schemaVersion: 1,
    })
  })
})

describe('seeding an OSE character', () => {
  it('writes an active level 1 Fighter owned by the user, with no sheet details', () => {
    expect(oseCharacterFields({ uid: 'u1', username: 'desk001', name: 'Brom' })).toEqual({
      name: 'Brom',
      ownerUserId: 'u1',
      ownerUsername: 'desk001',
      class: 'Fighter',
      level: 1,
      hpCurrent: 8,
      hpMax: 8,
      creationStatus: 'active',
      schemaVersion: 1,
    })
  })
})

describe('seeding a calibrated map', () => {
  it('writes a blank map with a calibrated grid of 20 cells of 10 feet across', () => {
    expect(calibratedMapFields()).toEqual({
      name: 'Calibrated Map',
      kind: 'blank',
      width: 1600,
      height: 1000,
      sortOrder: 0,
      gridEnabled: true,
      gridCalibrated: true,
      gridCellScale: 0.05,
      gridUnitsPerCell: 10,
    })
  })

  it('writes a visible party token near the left edge, halfway down', () => {
    expect(partyTokenFields()).toEqual({ x: 0.1, y: 0.5, party: true, name: 'Party', size: 28, color: '#b45309' })
  })
})

describe('a dragging gesture', () => {
  it('passes through evenly spaced points on each leg, ending on each corner', () => {
    expect(interpolatePath([{ x: 0, y: 0 }, { x: 40, y: 20 }, { x: 0, y: 0 }], 2)).toEqual([
      { x: 20, y: 10 },
      { x: 40, y: 20 },
      { x: 20, y: 10 },
      { x: 0, y: 0 },
    ])
  })

  it('has nowhere to go from a single point', () => {
    expect(interpolatePath([{ x: 5, y: 5 }], 10)).toEqual([])
  })
})

describe('reading the distance tracker', () => {
  it.each([
    [["0'"], true],
    [["0'", "0'"], true],
    [[], false],
    [["0'", "120'"], false],
    [['1st'], false],
  ])('reads %j as still at zero: %s', (values, expected) => {
    expect(trackersAtZero(values)).toBe(expected)
  })
})

describe('seeding the filled-in VtM fixture', () => {
  const fixtureData = {
    name: 'Edda Marsh',
    ownerUserId: 'player-uid',
    ownerUsername: 'player1',
    portraitPath: 'groups/g1/portrait.png',
    tokenIcon: { icon: 'pawn', color: '#7a1a1f', customImagePath: 'groups/g1/token.png' },
    createdAt: { $timestamp: '2025-10-01T02:00:00.000Z' },
    vtm: { concept: 'Disgraced surgeon', unknownNested: { kept: true } },
  }

  it('gives the character to the smoke user, without its art, with real dates', () => {
    expect(ownedFixtureFields(fixtureData, { uid: 'u1', username: 'desk001' })).toEqual({
      name: 'Edda Marsh',
      ownerUserId: 'u1',
      ownerUsername: 'desk001',
      portraitPath: '',
      tokenIcon: { icon: 'pawn', color: '#7a1a1f' },
      createdAt: new Date('2025-10-01T02:00:00.000Z'),
      vtm: { concept: 'Disgraced surgeon', unknownNested: { kept: true } },
    })
  })

  it('changes only the sheet\'s Concept for an edit', () => {
    const fields = { name: 'Edda', vtm: { concept: 'Old', clan: 'tremere' } }
    expect(withVtmConcept(fields, 'New')).toEqual({ name: 'Edda', vtm: { concept: 'New', clan: 'tremere' } })
    expect(fields.vtm.concept).toBe('Old')
  })
})

describe('seeding a fixture as the migration left it', () => {
  it('gives the smoke user the fixture at version 1, with the items the migration made', () => {
    const fixture = { id: 'elf-1', data: { class: 'Elf', ownerUserId: 'player-uid', tokenIcon: { icon: 'pawn' }, details: { packedItems: ['Rope'] } } }
    const fields = migratedFixtureFields(oseCharacterVersioning, fixture, { uid: 'u1', username: 'desk001' })
    expect(fields).toMatchObject({ ownerUserId: 'u1', ownerUsername: 'desk001', schemaVersion: 1 })
    expect(fields.details.inventory.map((item) => item.id)).toEqual(['legacy-elf-1-packedItems-0', 'legacy-elf-1-spell-book'])
    expect(fields.details).not.toHaveProperty('packedItems')
  })

  it('finds the stored items the same as the seeded ones, whatever the map order', () => {
    const seededFields = { details: { inventory: [{ id: 'rope', name: 'Rope', qty: 1 }] } }
    const stored = toFirestoreFields({ details: { inventory: [{ qty: 1, name: 'Rope', id: 'rope' }], notes: 'kept' } })
    expect(storedItemsProblem(stored, seededFields)).toBeNull()
  })

  it('names the items stored when they differ from the seeded ones, or are missing', () => {
    const seededFields = { details: { inventory: [{ id: 'rope', name: 'Rope' }] } }
    const stored = toFirestoreFields({ details: { inventory: [{ id: 'rope-2', name: 'Rope' }] } })
    expect(storedItemsProblem(stored, seededFields)).toBe(
      `The sheet holds other items than the migration made: ${JSON.stringify(stored.details.mapValue.fields.inventory)}`,
    )
    expect(storedItemsProblem({}, seededFields)).toBe('The sheet holds other items than the migration made: undefined')
  })

  it('leaves a character already at version 1 as it was', () => {
    const fixture = { id: 'pc', data: { name: 'Ada', schemaVersion: 1, tokenIcon: {}, details: { inventory: [] } } }
    expect(migratedFixtureFields(oseCharacterVersioning, fixture, { uid: 'u1', username: 'desk001' })).toEqual({
      name: 'Ada', schemaVersion: 1, ownerUserId: 'u1', ownerUsername: 'desk001', portraitPath: '', tokenIcon: {}, details: { inventory: [] },
    })
  })
})

describe('comparing a stored document with what was seeded', () => {
  const seeded = toFirestoreFields({
    name: 'Edda',
    createdAt: new Date('2025-10-01T02:00:00.000Z'),
    vtm: { concept: 'Surgeon', rows: [{ id: 'a', rating: 2 }] },
    updatedAt: new Date('2025-10-01T02:00:00.000Z'),
  })

  it('finds nothing changed when only map order and timestamp spelling differ', () => {
    const stored = {
      updatedAt: { timestampValue: '2025-10-01T02:00:00Z' },
      vtm: { mapValue: { fields: { rows: seeded.vtm.mapValue.fields.rows, concept: { stringValue: 'Surgeon' } } } },
      createdAt: { timestampValue: '2025-10-01T02:00:00Z' },
      name: { stringValue: 'Edda' },
    }
    expect(changedFirestoreFields(stored, seeded)).toEqual([])
  })

  it('finds nothing changed when an empty list is stored without its values', () => {
    expect(changedFirestoreFields({ rows: { arrayValue: {} } }, toFirestoreFields({ rows: [] }))).toEqual([])
    expect(changedFirestoreFields({ rows: { arrayValue: {} } }, toFirestoreFields({ rows: [1] }))).toEqual(['rows'])
  })

  it('names each field that differs, is missing or was added', () => {
    const stored = {
      ...seeded,
      name: { stringValue: 'Edda Marsh' },
      updatedAt: { timestampValue: '2026-10-19T09:00:00Z' },
      extra: { booleanValue: true },
    }
    delete stored.createdAt
    expect(changedFirestoreFields(stored, seeded)).toEqual(['createdAt', 'extra', 'name', 'updatedAt'])
  })

  it('tells a reordered list apart', () => {
    const rows = toFirestoreFields({ rows: [1, 2] })
    expect(changedFirestoreFields(toFirestoreFields({ rows: [2, 1] }), rows)).toEqual(['rows'])
  })
})

describe('checking a saved character is stored at version 1', () => {
  it('finds nothing wrong with version 1 and a write time', () => {
    expect(storedVersionProblems(toFirestoreFields({ schemaVersion: 1, schemaWrittenAt: new Date('2026-10-19T00:00:00Z') }))).toEqual([])
  })

  it('names a missing, older or misspelled version and a missing write time', () => {
    expect(storedVersionProblems({})).toEqual(['schemaVersion is undefined, not 1', 'schemaWrittenAt is not a time'])
    expect(storedVersionProblems(toFirestoreFields({ schemaVersion: 0, schemaWrittenAt: new Date() }))).toEqual(['schemaVersion is {"integerValue":"0"}, not 1'])
    expect(storedVersionProblems(toFirestoreFields({ schemaVersion: '1', schemaWrittenAt: new Date() }))).toEqual(['schemaVersion is {"stringValue":"1"}, not 1'])
  })

  it('finds nothing wrong with a portrait and a token image stored by path alone', () => {
    expect(storedMediaProblems(toFirestoreFields({
      portraitPath: 'portraits/p.png',
      tokenIcon: { icon: 'custom', color: '#000', size: 30, customImagePath: 'token-icons/t.png' },
    }))).toEqual([])
  })

  it('names missing media paths and any stored media URL', () => {
    expect(storedMediaProblems(toFirestoreFields({ portraitPath: '', tokenIcon: { icon: 'pawn' } }))).toEqual([
      'no portrait path is stored', 'the token icon is not a custom image', 'no token image path is stored',
    ])
    expect(storedMediaProblems(toFirestoreFields({
      portraitPath: 'p.png', portraitUrl: 'https://cdn.test/p.png',
      tokenIcon: { icon: 'custom', customImagePath: 't.png', customImageUrl: 'https://cdn.test/t.png' },
    }))).toEqual(['a portrait URL is stored', 'a token image URL is stored'])
  })
})
