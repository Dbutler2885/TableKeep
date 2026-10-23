import { describe, expect, it } from 'vitest'
import type { CharacterSheetDetails } from '../../../types/app'
import {
  campaignPlayersFrom,
  isVisibleInDirectory,
  readDirectorySnapshot,
  transferTargetFromDoc,
} from './campaignCharacterDirectory'
import type { TransferTargetCharacter } from './characterTabTypes'

const doc = (id: string, data: Record<string, unknown>) => ({ id, data: () => data })

const target = (id: string, ownerUserId: string, ownerUsername: string | null = null): TransferTargetCharacter =>
  ({ id, name: id, ownerUserId, ownerUsername, details: null })

describe('transferTargetFromDoc', () => {
  it('lists a stored character by its name, owner and sheet', () => {
    const details = { thaco: '19', inventory: [] } as unknown as CharacterSheetDetails
    expect(transferTargetFromDoc(doc('a', { name: 'Aldric', ownerUserId: 'p1', ownerUsername: 'pip', details, hpCurrent: 4, schemaVersion: 1 }))).toEqual({
      id: 'a',
      name: 'Aldric',
      ownerUserId: 'p1',
      ownerUsername: 'pip',
      details,
    })
  })

  it('names a character without a name by its id, with no owner and no sheet', () => {
    expect(transferTargetFromDoc(doc('bare', {}))).toEqual({ id: 'bare', name: 'bare', ownerUserId: '', ownerUsername: null, details: null })
  })

  it('drops an owner name that is not text', () => {
    expect(transferTargetFromDoc(doc('a', { ownerUsername: 7 })).ownerUsername).toBeNull()
    expect(transferTargetFromDoc(doc('a', { ownerUsername: null })).ownerUsername).toBeNull()
  })
})

describe('isVisibleInDirectory', () => {
  it('shows the GM every character', () => {
    expect(isVisibleInDirectory(target('npc', 'gm-uid'), 'gm', 'gm-uid')).toBe(true)
  })

  it('hides the GM\'s own characters from anyone else', () => {
    expect(isVisibleInDirectory(target('npc', 'gm-uid'), 'player', 'gm-uid')).toBe(false)
    expect(isVisibleInDirectory(target('npc', 'gm-uid'), null, 'gm-uid')).toBe(false)
    expect(isVisibleInDirectory(target('a', 'p1'), 'player', 'gm-uid')).toBe(true)
  })
})

describe('readDirectorySnapshot', () => {
  it('lists the visible characters in snapshot order', () => {
    const docs = [doc('b', { ownerUserId: 'p2' }), doc('npc', { ownerUserId: 'gm-uid' }), doc('a', { ownerUserId: 'p1' })]
    expect(readDirectorySnapshot(docs, 'player', 'gm-uid').map(({ id }) => id)).toEqual(['b', 'a'])
    expect(readDirectorySnapshot(docs, 'gm', 'gm-uid').map(({ id }) => id)).toEqual(['b', 'npc', 'a'])
  })
})

describe('campaignPlayersFrom', () => {
  it('names each player once, by the name on their first character', () => {
    expect(campaignPlayersFrom([target('a', 'p1'), target('a2', 'p1', 'pip')], 'gm-uid')).toEqual([{ userId: 'p1', username: null }])
  })

  it('leaves out the GM and characters without an owner', () => {
    expect(campaignPlayersFrom([target('npc', 'gm-uid', 'gm'), target('x', '')], 'gm-uid')).toEqual([])
  })

  it('sorts by name, using the id for a player without one', () => {
    const players = campaignPlayersFrom([target('a', 'zed'), target('b', 'p2', 'bravo'), target('c', 'p3', 'alpha')], null)
    expect(players).toEqual([
      { userId: 'p3', username: 'alpha' },
      { userId: 'p2', username: 'bravo' },
      { userId: 'zed', username: null },
    ])
  })
})
