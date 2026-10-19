import { describe, expect, it } from 'vitest'
import {
  calibratedMapFields,
  changedFirestoreFields,
  filledVtmCharacterFields,
  groupIdFromUrl,
  interpolatePath,
  oseCharacterFields,
  partyTokenFields,
  step,
  trackersAtZero,
  vtmCharacterFields,
  withVtmConcept,
} from './browser-smoke.mjs'
import { toFirestoreFields } from './browser-smoke-seed.mjs'

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
    expect(filledVtmCharacterFields(fixtureData, { uid: 'u1', username: 'desk001' })).toEqual({
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
