import { describe, expect, it } from 'vitest'
import {
  calibratedMapFields,
  groupIdFromUrl,
  interpolatePath,
  oseCharacterFields,
  partyTokenFields,
  step,
  trackersAtZero,
  vtmCharacterFields,
} from './browser-smoke.mjs'

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
