/**
 * A GM item read back from its own document (spec 4.5): the item parser's
 * reading, its document id as its id, and its status and drop fields.
 */
import { describe, expect, it } from 'vitest'
import { LUBEC_GM_ITEM_FIELDS, parseLubecGmItem } from './gmItem'

describe('reading a GM item', () => {
  it('reads a dropped item with who dropped it and from where', () => {
    const stored = {
      id: 'crowbar', kind: 'thing', name: 'Crowbar', size: 2, qty: 1, weight: 'normal', note: 'Rusty.', engraved: 'J.F.',
      status: 'dropped', droppedByCharacterId: 'wayne', droppedByCharacterName: 'Wayne Gardner', droppedByUserId: 'u1', droppedFrom: 'hands',
    }

    expect(parseLubecGmItem(stored, 'crowbar')).toEqual({ ...stored, carrier: '' })
  })

  it('reads a library item, and takes its id from its document', () => {
    expect(parseLubecGmItem({ id: 'other', name: 'Rope', status: 'library' }, 'rope')).toEqual({
      id: 'rope', kind: 'thing', name: 'Rope', note: '', size: 1, weight: 'normal', qty: 1, carrier: '', status: 'library',
    })
  })

  it('reads an unreadable status as dropped, which only the GM sees, and drops unreadable drop fields', () => {
    const item = parseLubecGmItem({ name: 'Rope', status: 'shared', droppedFrom: 4, droppedByUserId: null }, 'rope')

    expect(item.status).toBe('dropped')
    expect(item).not.toHaveProperty('droppedFrom')
    expect(item).not.toHaveProperty('droppedByUserId')
  })

  it('reads anything that is not a record as an empty dropped item', () => {
    expect(parseLubecGmItem('rope', 'rope')).toMatchObject({ id: 'rope', name: '', status: 'dropped' })
  })

  it('names the fields a GM item adds to an item', () => {
    expect(LUBEC_GM_ITEM_FIELDS).toEqual(['status', 'droppedByCharacterId', 'droppedByCharacterName', 'droppedByUserId', 'droppedFrom'])
  })
})
