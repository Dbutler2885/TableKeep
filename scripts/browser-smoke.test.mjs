import { describe, expect, it } from 'vitest'
import { groupIdFromUrl, oseCharacterFields, step, vtmCharacterFields } from './browser-smoke.mjs'

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
