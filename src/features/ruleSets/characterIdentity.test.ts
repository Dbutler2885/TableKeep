import { describe, expect, it } from 'vitest'
import { readCharacterIdentity, storedCreationStatus } from './characterIdentity'

describe('character identity', () => {
  it('reads every identity field a stored character holds', () => {
    const tokenIcon = { icon: 'pawn', color: '#123456', size: 34 }
    const createdAt = { seconds: 1 }
    const updatedAt = { seconds: 2 }
    const schemaWrittenAt = { seconds: 3 }
    expect(readCharacterIdentity('pc-1', {
      name: 'Connor',
      ownerUserId: 'player-1',
      ownerUsername: 'player1',
      creationMode: 'established',
      creationStatus: 'active',
      portraitPath: 'groups/g/campaigns/c/characters/pc-1/portrait.webp',
      portraitFocusX: 40,
      portraitFocusY: 60,
      tokenIcon,
      hidden: true,
      deleted: false,
      createdAt,
      updatedAt,
      system: 'vtm',
      schemaVersion: 1,
      schemaWrittenAt,
      vtm: { health: { Incapacitated: true } },
      hpCurrent: 4,
    })).toStrictEqual({
      id: 'pc-1',
      name: 'Connor',
      ownerUserId: 'player-1',
      ownerUsername: 'player1',
      creationMode: 'established',
      creationStatus: 'active',
      portraitPath: 'groups/g/campaigns/c/characters/pc-1/portrait.webp',
      portraitFocusX: 40,
      portraitFocusY: 60,
      tokenIcon,
      hidden: true,
      deleted: false,
      createdAt,
      updatedAt,
      system: 'vtm',
      schemaVersion: 1,
      schemaWrittenAt,
    })
  })

  it('leaves out what is missing or malformed, and never reads rule-set fields', () => {
    const identity = readCharacterIdentity('pc-2', {
      name: 7,
      ownerUserId: null,
      ownerUsername: 3,
      creationMode: 'reborn',
      creationStatus: 'retired',
      portraitPath: false,
      portraitFocusX: '40',
      tokenIcon: ['pawn'],
      hidden: 'yes',
      system: 2,
      schemaVersion: 1.5,
      hpCurrent: 4,
      vtm: {},
    })
    expect(identity).toEqual({ id: 'pc-2', name: '', ownerUserId: '', hidden: false, deleted: false })
    expect(identity).not.toHaveProperty('hpCurrent')
    expect(identity).not.toHaveProperty('vtm')
  })

  it.each([
    [{ deleted: true }, true],
    [{ deletedAt: { seconds: 1 } }, true],
    [{ deletedAt: null }, false],
    [{ deleted: 'yes' }, false],
  ])('reads %j as deleted: %s', (fields, deleted) => {
    expect(readCharacterIdentity('pc', fields).deleted).toBe(deleted)
  })

  it.each([
    [0, 0],
    [2, 2],
    [-1, undefined],
    ['1', undefined],
    [undefined, undefined],
  ])('reads a stored version of %j as %j', (schemaVersion, expected) => {
    expect(readCharacterIdentity('pc', { schemaVersion }).schemaVersion).toBe(expected)
  })

  it.each([
    ['draft', 'draft'],
    ['established_draft', 'established_draft'],
    ['active', 'active'],
    ['retired', undefined],
    [undefined, undefined],
  ])('reads a stored creation status of %j as %j', (creationStatus, expected) => {
    expect(storedCreationStatus({ creationStatus })).toBe(expected)
  })
})
