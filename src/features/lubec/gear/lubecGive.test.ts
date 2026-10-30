/** Who a thing can be given to, and the order an offer happens in: the sheet's save lands first. */
import { describe, expect, it, vi } from 'vitest'
import type { PendingTransfer } from '../../../types/app'
import type { LubecCharacterRecord } from '../../ruleSets/lubec/characterRecord'
import { makeLubecDirectEntryCharacter } from '../../ruleSets/lubec/directEntry'
import type { LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecGearGive, lubecGiveNote, lubecGiveTargets, type LubecGiveOptions } from './lubecGive'

vi.mock('../../../firebase', () => ({ db: { name: 'db-stub' } }))

const character = (id: string, userId: string, extra: Partial<LubecCharacterRecord> = {}): LubecCharacterRecord =>
  ({ ...makeLubecDirectEntryCharacter(id, { userId, username: `${userId}-name` }), name: id, creationStatus: 'active', ...extra })

const tommy = character('Tommy', 'player-1')
const stephen = character('Stephen', 'player-2')
const flashlight: LubecItem = { id: 'light', kind: 'thing', name: 'Flashlight', note: '', size: 1, weight: 'normal', qty: 1, carrier: 'backpack', pocket: 0 }

const options = (extra: Partial<LubecGiveOptions> = {}): LubecGiveOptions => ({
  from: tommy,
  characters: [tommy, stephen],
  outgoing: [],
  store: { updateCharacterNow: vi.fn(), hasPendingWrite: () => false },
  createTransfer: vi.fn(async () => undefined),
  cancelTransfer: vi.fn(async () => undefined),
  ...extra,
})

describe('lubecGiveTargets', () => {
  it('lists other people\'s finalized characters, with their player', () => {
    const second = character('Second', 'player-1')
    const draft = character('Draft', 'player-2', { creationStatus: 'draft' })
    const unowned = character('Unowned', '')
    expect(lubecGiveTargets([tommy, second, draft, unowned, stephen], tommy)).toEqual([
      { id: 'Stephen', name: 'Stephen', ownerUserId: 'player-2', label: 'Stephen (player-2-name)' },
    ])
  })

  it('names an unnamed kid, and a character with no player name by its own', () => {
    expect(lubecGiveTargets([character('', 'player-2', { ownerUsername: null })], tommy)[0]).toMatchObject({ name: 'Unnamed kid', label: 'Unnamed kid' })
  })
})

describe('an offer', () => {
  it('sends the sheet\'s waiting save and waits for it before the offer is written', async () => {
    const order: string[] = []
    let waiting = true
    const store = {
      updateCharacterNow: () => {
        order.push('save')
        waiting = false
      },
      hasPendingWrite: () => waiting,
    }
    const createTransfer = vi.fn(async () => {
      order.push('offer')
    })
    const give = lubecGearGive(options({ store, createTransfer }))

    await expect(give.offer(flashlight, give.targets[0], 1)).resolves.toEqual({ ok: true })

    expect(order).toEqual(['save', 'offer'])
    const { carrier: _carrier, pocket: _pocket, ...snapshot } = flashlight
    expect(createTransfer).toHaveBeenCalledWith(snapshot, 'light', { id: 'Tommy', name: 'Tommy', ownerUserId: 'player-1' }, give.targets[0])
  })

  it('comes back refused with the database\'s reason, and with its own when there is none', async () => {
    const fails = lubecGearGive(options({ createTransfer: vi.fn(async () => { throw new Error('This item is already offered to Stephen.') }) }))
    await expect(fails.offer(flashlight, fails.targets[0], 1)).resolves.toEqual({ ok: false, msg: 'This item is already offered to Stephen.' })
    const bare = lubecGearGive(options({ createTransfer: vi.fn(() => Promise.reject(new Error('nope').message)) }))
    await expect(bare.offer(flashlight, bare.targets[0], 1)).resolves.toEqual({ ok: false, msg: 'Could not make the offer. Nothing changed.' })
  })

  it('is found by the sheet and the thing it is for, and called off by its id', async () => {
    const out = { id: 'offer-1', itemId: 'light', fromCharacterId: 'Tommy', toCharacterName: 'Stephen' } as PendingTransfer
    const elsewhere = { ...out, id: 'offer-2', itemId: 'rope', fromCharacterId: 'Second' }
    const cancelTransfer = vi.fn(async () => undefined)
    const give = lubecGearGive(options({ outgoing: [elsewhere, out], cancelTransfer }))

    expect(give.offerOf('light')).toEqual({ id: 'offer-1', toName: 'Stephen' })
    expect(give.offerOf('rope')).toBeNull()
    await expect(give.cancel('offer-1')).resolves.toEqual({ ok: true })
    expect(cancelTransfer).toHaveBeenCalledWith('offer-1')
  })

  it('reports a cancel that fails', async () => {
    const give = lubecGearGive(options({ cancelTransfer: vi.fn(async () => { throw new Error('Denied.') }) }))
    await expect(give.cancel('offer-1')).resolves.toEqual({ ok: false, msg: 'Denied.' })
  })
})

describe('lubecGiveNote', () => {
  it('warns only about what is in a hidden carrier', () => {
    expect(lubecGiveNote({ carrier: 'stash' }, ['stash'])).toContain('hidden carrier')
    expect(lubecGiveNote({ carrier: 'backpack' }, ['stash'])).toBeNull()
  })
})
