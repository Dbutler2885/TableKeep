import { describe, expect, it } from 'vitest'
import type { CharacterRecord } from '../../../types/app'
import {
  readCreationFields,
  readDetails,
  readHitPoints,
  readOwnerUsername,
  readPortraitUrl,
  readStoredCharacter,
  withLocalTokenImage,
} from './storedCharacterRecord'

const viewer = { userId: 'user-1', currentUsername: 'Player One' }
const tokenIcon = { icon: 'pawn', color: '#000', size: 30 }

const local = (fields: Partial<CharacterRecord>): CharacterRecord =>
  ({ ...readStoredCharacter('a', {}, undefined, viewer), ...fields })

describe('readCreationFields', () => {
  it.each([
    [{}, 'new', false, 'active'],
    [{ creationMode: 'established' }, 'new', false, 'active'],
    [{ creationModeExplicit: true }, 'new', true, 'draft'],
    [{ creationModeExplicit: true, creationMode: 'established' }, 'established', true, 'active'],
    [{ creationModeExplicit: true, creationStatus: 'established_draft' }, 'new', true, 'established_draft'],
    [{ creationStatus: 'draft' }, 'new', false, 'draft'],
    [{ creationStatus: 'retired', creationModeExplicit: true }, 'new', true, 'draft'],
  ])('reads %o as %s / explicit %s / %s', (data, creationMode, creationModeExplicit, creationStatus) => {
    expect(readCreationFields(data)).toEqual({ creationMode, creationModeExplicit, creationStatus })
  })
})

describe('readDetails', () => {
  it('copies the details as stored', () => {
    const stored = { notes: 'Brave', inventory: [] }

    expect(readDetails(stored)).toEqual(stored)
    expect(readDetails(stored)).not.toBe(stored)
  })

  it.each([[null], [undefined], ['text'], [4]])('reads %o as no details', (raw) => {
    expect(readDetails(raw)).toBeNull()
  })
})

describe('readHitPoints', () => {
  it.each([
    [{ hpCurrent: 4, hpMax: 9 }, { hpCurrent: 4, hpMax: 9 }],
    [{ hpCurrent: 12, hpMax: 9 }, { hpCurrent: 9, hpMax: 9 }],
    [{ hpCurrent: -1, hpMax: 9 }, { hpCurrent: 0, hpMax: 9 }],
    [{ hpCurrent: 3, hpMax: -2 }, { hpCurrent: 0, hpMax: 0 }],
    [{}, { hpCurrent: 0, hpMax: 0 }],
  ])('reads %o as %o', (data, expected) => {
    expect(readHitPoints(data)).toEqual(expected)
  })
})

describe('readOwnerUsername', () => {
  it('keeps a stored owner name', () => {
    expect(readOwnerUsername({ ownerUsername: 'stored', ownerUserId: 'user-2' }, viewer)).toBe('stored')
  })

  it('names the viewer\'s own character after them, and nobody else\'s', () => {
    expect(readOwnerUsername({ ownerUserId: 'user-1' }, viewer)).toBe('Player One')
    expect(readOwnerUsername({ ownerUserId: 'user-2' }, viewer)).toBeNull()
    expect(readOwnerUsername({}, { ...viewer, userId: '' })).toBe('Player One')
  })
})

describe('readPortraitUrl', () => {
  it('prefers the stored URL', () => {
    expect(readPortraitUrl('https://cdn.test/stored.png', 'p.png', local({ portraitPath: 'p.png', portraitUrl: 'https://cdn.test/local.png' })))
      .toBe('https://cdn.test/stored.png')
  })

  it('keeps a renderable local URL for the same path only', () => {
    const resolved = local({ portraitPath: 'p.png', portraitUrl: 'https://cdn.test/local.png' })

    expect(readPortraitUrl(undefined, 'p.png', resolved)).toBe('https://cdn.test/local.png')
    expect(readPortraitUrl(undefined, 'q.png', resolved)).toBeNull()
    expect(readPortraitUrl(undefined, 'p.png', local({ portraitPath: 'p.png', portraitUrl: 'blob:x' }))).toBeNull()
    expect(readPortraitUrl(undefined, 'p.png', undefined)).toBeNull()
  })
})

describe('withLocalTokenImage', () => {
  const resolved = local({ tokenIcon: { ...tokenIcon, customImagePath: 't.png', customImageUrl: 'https://cdn.test/t.png' } })

  it('keeps a stored token image URL', () => {
    const stored = { ...tokenIcon, customImagePath: 't.png', customImageUrl: 'https://cdn.test/stored.png' }

    expect(withLocalTokenImage(stored, resolved)).toEqual(stored)
  })

  it('carries over a renderable local URL for the same path', () => {
    expect(withLocalTokenImage({ ...tokenIcon, customImagePath: 't.png' }, resolved))
      .toEqual({ ...tokenIcon, customImagePath: 't.png', customImageUrl: 'https://cdn.test/t.png' })
  })

  it('returns the stored icon itself when there is no URL to carry over', () => {
    const otherPath = { ...tokenIcon, customImagePath: 'u.png' }
    const blobLocal = local({ tokenIcon: { ...tokenIcon, customImagePath: 'u.png', customImageUrl: 'blob:u' } })

    expect(withLocalTokenImage(otherPath, resolved)).toBe(otherPath)
    expect(withLocalTokenImage(otherPath, blobLocal)).toBe(otherPath)
    expect(withLocalTokenImage(tokenIcon, local({ tokenIcon }))).toBe(tokenIcon)
    expect(withLocalTokenImage(tokenIcon, undefined)).toBe(tokenIcon)
  })
})

describe('readStoredCharacter', () => {
  it('defaults every missing field', () => {
    expect(readStoredCharacter('bare', {}, undefined, { userId: 'gm', currentUsername: 'GM' })).toEqual({
      id: 'bare',
      name: 'bare',
      ownerUserId: '',
      ownerUsername: null,
      creationMode: 'new',
      creationModeExplicit: false,
      creationStatus: 'active',
      className: '-',
      level: 1,
      hpCurrent: 0,
      hpMax: 0,
      ac: 10,
      xp: 0,
      portraitPath: '',
      portraitUrl: null,
      portraitFocusX: 50,
      portraitFocusY: 50,
      tokenIcon: { icon: 'pawn', color: '#bf2f2a', size: 34 },
      details: null,
    })
  })

  it('keeps a stored name, class and token icon that are present, whatever their type', () => {
    expect(readStoredCharacter('a', { name: '', class: 0, tokenIcon: 'odd' }, undefined, viewer))
      .toMatchObject({ name: '', className: 0, tokenIcon: 'odd' })
  })
})
