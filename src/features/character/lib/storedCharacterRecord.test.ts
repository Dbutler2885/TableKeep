import { describe, expect, it } from 'vitest'
import { oseCharacterVersioning } from '../../ruleSets/characterMigrations'
import {
  oseCharacterStore,
  readCreationFields,
  readDetails,
  readHitPoints,
  readOwnerUsername,
  readStoredCharacter,
  serializeOseCharacter,
} from './storedCharacterRecord'

const viewer = { userId: 'user-1', currentUsername: 'Player One' }

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

describe('readStoredCharacter', () => {
  it('defaults every missing field', () => {
    expect(readStoredCharacter('bare', {}, { userId: 'gm', currentUsername: 'GM' })).toEqual({
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
    expect(readStoredCharacter('a', { name: '', class: 0, tokenIcon: 'odd' }, viewer))
      .toMatchObject({ name: '', className: 0, tokenIcon: 'odd' })
  })

  it('names the viewer\'s own character after them when it stores no owner name', () => {
    expect(readStoredCharacter('a', { ownerUserId: 'user-1' }, viewer).ownerUsername).toBe('Player One')
    expect(readStoredCharacter('a', { ownerUserId: 'user-2' }, viewer).ownerUsername).toBeNull()
  })
})

describe('oseCharacterStore', () => {
  const ruleSet = oseCharacterStore(viewer)

  it('reads every document, at OSE\'s version, as the viewer\'s sheet record, and saves it with OSE\'s serializer', () => {
    const record = ruleSet.parser.parse('a', { ownerUserId: 'user-1', class: 'Fighter' })

    expect(ruleSet.system).toBeUndefined()
    expect(ruleSet.versioning).toBe(oseCharacterVersioning)
    expect(record).toEqual(readStoredCharacter('a', { ownerUserId: 'user-1', class: 'Fighter' }, viewer))
    expect(ruleSet.parser.serialize(record)).toEqual(serializeOseCharacter(record))
  })

  it('keeps an edit\'s hit points within the maximum', () => {
    const target = readStoredCharacter('a', { hpCurrent: 6, hpMax: 10 }, viewer)

    expect(ruleSet.adjustUpdates?.(target, { hpCurrent: 15, name: 'Edited' })).toEqual({ hpCurrent: 10, name: 'Edited' })
  })
})
