import { describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import type { LubecCharacterRecord } from '../../ruleSets/lubec/characterRecord'
import type { LubecSharedCarrier } from '../../ruleSets/lubec/gear/sharedCarrier'
import { lubecSharedSeat, type LubecSharedSeatOptions } from './lubecSharedSeat'

vi.mock('../../../firebase', () => ({ db: { name: 'db-stub' } }))

const hero = (id: string, name: string, ownerUserId: string) => ({ id, name, ownerUserId }) as unknown as LubecCharacterRecord
const wayne = hero('wayne', 'Wayne Gardner', 'p1')
const second = hero('second', 'Second', 'p1')
const stephen = hero('stephen', 'Stephen Moody', 'p2')
const carrier = (ownerCharacterId: string) => ({ id: 'skiff', name: 'Skiff', type: 'skiff', pockets: [], ownerCharacterId, items: [] }) as LubecSharedCarrier
const store = { updateCharacterNow: vi.fn(), hasPendingWrite: () => false }
const records = { db: {} as Firestore, scope: { groupId: 'g', campaignId: 'c' }, sheet: { kind: 'character', characterId: 'second' } as const }

const seat = (over: Partial<LubecSharedSeatOptions> = {}) => lubecSharedSeat({
  carriers: [], characters: [wayne, second, stephen], character: second, viewer: { role: 'player', userId: 'p1' }, store, records, ...over,
})

describe('lubecSharedSeat', () => {
  it('offers a player their own characters as owner, the open sheet first', () => {
    expect(seat().owners).toEqual([{ id: 'second', name: 'Second' }, { id: 'wayne', name: 'Wayne Gardner' }])
  })

  it('offers the GM every character', () => {
    expect(seat({ viewer: { role: 'gm', userId: 'gm' } }).owners.map((o) => o.id).sort()).toEqual(['second', 'stephen', 'wayne'])
  })

  it('names the owner, or says someone at the table for a character the viewer cannot see', () => {
    expect(seat().ownerOf(carrier('stephen'))).toBe('Stephen Moody')
    expect(seat().ownerOf(carrier('gone'))).toBe('Someone at the table')
  })

  it('lets the owning character\'s player and the GM change a carrier, and nobody else', () => {
    expect(seat().mayChange(carrier('wayne'))).toBe(true)
    expect(seat().mayChange(carrier('stephen'))).toBe(false)
    expect(seat().mayChange(carrier('gone'))).toBe(false)
    expect(seat({ viewer: { role: 'gm', userId: 'gm' } }).mayChange(carrier('gone'))).toBe(true)
  })

  it('gives no acts to a viewer who only looks at the open sheet, who then changes nothing', () => {
    const looking = seat({ character: stephen })
    expect(looking.acts).toBeNull()
    expect(looking.mayChange(carrier('wayne'))).toBe(false)
  })

  it('gives no acts without the records a move needs', () => {
    expect(seat({ records: null }).acts).toBeNull()
  })

  it('points the acts at the open sheet', () => {
    expect(seat().acts?.sheet).toEqual({ kind: 'character', characterId: 'second' })
  })
})
