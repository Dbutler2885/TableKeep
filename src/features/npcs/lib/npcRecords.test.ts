import { describe, expect, it } from 'vitest'
import type { NpcRecord } from '../../../types/app'
import {
  applyResolvedMedia,
  byOrder,
  defaultTokenIcon,
  findNpc,
  gmNotesFor,
  makeNpc,
  moveBefore,
  needsMediaUrls,
  nextSortOrder,
  patchNpc,
  readNpcDocument,
  readNpcSnapshot,
  readPrivateNotes,
} from './npcRecords'

const npc = (id: string, overrides: Partial<NpcRecord> = {}): NpcRecord => ({
  ...makeNpc(),
  id,
  name: id.toUpperCase(),
  ...overrides,
})

const ids = (npcs: NpcRecord[]) => npcs.map((entry) => entry.id)

const docs = (entries: Record<string, unknown>) =>
  Object.entries(entries).map(([id, data]) => ({ id, data: () => data }))

describe('byOrder', () => {
  it('puts ordered NPCs first by order, and breaks ties and unordered NPCs by name', () => {
    const list = [
      npc('d', { name: 'Dora' }),
      npc('b', { name: 'Bram', sortOrder: 1 }),
      npc('a', { name: 'Abel', sortOrder: 1 }),
      npc('c', { name: 'Cato' }),
      npc('z', { name: 'Zed', sortOrder: 0 }),
    ]
    expect(ids([...list].sort(byOrder))).toEqual(['z', 'a', 'b', 'c', 'd'])
  })
})

describe('moveBefore', () => {
  const list = [npc('a'), npc('b'), npc('c')]

  it('moves the source to just before the target, either way', () => {
    expect(ids(moveBefore(list, 'c', 'a'))).toEqual(['c', 'a', 'b'])
    expect(ids(moveBefore(list, 'a', 'c'))).toEqual(['b', 'a', 'c'])
  })

  it('returns the same list for a move onto itself or an unknown id', () => {
    expect(moveBefore(list, 'a', 'a')).toBe(list)
    expect(moveBefore(list, 'x', 'a')).toBe(list)
    expect(moveBefore(list, 'a', 'x')).toBe(list)
    expect(moveBefore(list, null, 'a')).toBe(list)
  })
})

describe('small record helpers', () => {
  it('numbers a new NPC after the highest order, from zero', () => {
    expect(nextSortOrder([])).toBe(0)
    expect(nextSortOrder([npc('a'), npc('b', { sortOrder: 4 }), npc('c', { sortOrder: 2 })])).toBe(5)
  })

  it('makes a hidden, untitled NPC with a fresh id and the default token', () => {
    const made = makeNpc()
    expect(made).toMatchObject({ name: 'New NPC', visibleToPlayers: false, tags: [], tokenIcon: defaultTokenIcon })
    expect(made.id).not.toBe(makeNpc().id)
  })

  it('finds an NPC by id, or null', () => {
    const list = [npc('a')]
    expect(findNpc(list, 'a')).toBe(list[0])
    expect(findNpc(list, 'b')).toBeNull()
  })

  it('patches only the matching NPC', () => {
    const list = [npc('a'), npc('b')]
    const patched = patchNpc(list, 'b', { title: 'Guard' })
    expect(patched[0]).toBe(list[0])
    expect(patched[1]).toMatchObject({ id: 'b', title: 'Guard' })
  })

  it('reads the selected NPC\'s GM notes, blank when there are none', () => {
    expect(gmNotesFor({ a: 'spy' }, npc('a'))).toBe('spy')
    expect(gmNotesFor({ a: 'spy' }, npc('b'))).toBe('')
    expect(gmNotesFor({ a: 'spy' }, null)).toBe('')
  })
})

describe('readNpcDocument', () => {
  it('fills defaults for a bare document', () => {
    expect(readNpcDocument('x', {}, undefined)).toEqual({
      id: 'x',
      name: 'Unnamed NPC',
      title: '',
      visibleToPlayers: false,
      tags: [],
      portraitPath: '',
      portraitUrl: null,
      portraitFocusX: 50,
      portraitFocusY: 50,
      tokenIcon: defaultTokenIcon,
      playerDescription: '',
      playerNotes: '',
      sortOrder: undefined,
    })
  })

  it('treats only a literal true as shown, and drops tags that are not strings', () => {
    const read = readNpcDocument('x', { visibleToPlayers: 'yes', tags: ['a', 3, 'b'] } as never, undefined)
    expect(read.visibleToPlayers).toBe(false)
    expect(read.tags).toEqual(['a', 'b'])
  })

  it('carries a resolved portrait URL forward only for the same path', () => {
    const local = npc('x', { portraitPath: 'p.png', portraitUrl: 'https://p' })
    expect(readNpcDocument('x', { portraitPath: 'p.png' }, local).portraitUrl).toBe('https://p')
    expect(readNpcDocument('x', { portraitPath: 'q.png' }, local).portraitUrl).toBeNull()
    const unrenderable = npc('x', { portraitPath: 'p.png', portraitUrl: 'blob:local' })
    expect(readNpcDocument('x', { portraitPath: 'p.png' }, unrenderable).portraitUrl).toBeNull()
    expect(readNpcDocument('x', { portraitPath: 'p.png', portraitUrl: 'https://stored' }, local).portraitUrl).toBe('https://stored')
  })

  it('carries a resolved token image URL forward only for the same custom image', () => {
    const icon = { icon: 'custom' as const, color: '#000', size: 30, customImagePath: 't.png' }
    const local = npc('x', { tokenIcon: { ...icon, customImageUrl: 'https://t' } })
    expect(readNpcDocument('x', { tokenIcon: icon }, local).tokenIcon).toEqual({ ...icon, customImageUrl: 'https://t' })
    expect(readNpcDocument('x', { tokenIcon: { ...icon, customImagePath: 'u.png' } }, local).tokenIcon.customImageUrl).toBeUndefined()
    expect(readNpcDocument('x', { tokenIcon: { ...icon, customImagePath: '' } }, npc('x', { tokenIcon: { ...icon, customImagePath: '', customImageUrl: 'https://t' } })).tokenIcon.customImageUrl).toBeUndefined()
    expect(readNpcDocument('x', { tokenIcon: icon }, npc('x', { tokenIcon: { ...icon, customImageUrl: 'blob:t' } })).tokenIcon.customImageUrl).toBeUndefined()
    expect(readNpcDocument('x', { tokenIcon: icon }, undefined).tokenIcon).toBe(icon)
  })
})

describe('readNpcSnapshot', () => {
  it('keeps the local copy of a busy NPC, reads the rest, and sorts', () => {
    const local = [npc('a', { name: 'Local A', sortOrder: 5 }), npc('b', { name: 'Local B' })]
    const read = readNpcSnapshot(
      docs({ a: { name: 'Server A', sortOrder: 5 }, b: { name: 'Server B', sortOrder: 1 }, c: { name: 'New C' } }),
      local,
      (npcId) => npcId === 'a' || npcId === 'c',
    )
    expect(read.map((entry) => entry.name)).toEqual(['Server B', 'Local A', 'New C'])
    expect(read[1]).toBe(local[0])
  })
})

describe('readPrivateNotes', () => {
  it('keeps the local notes of a busy NPC and reads the rest, blank when missing', () => {
    expect(readPrivateNotes(
      docs({ a: { gmNotes: 'server a' }, b: { gmNotes: 'server b' }, c: { gmNotes: 4 }, d: {} }),
      { a: 'local a' },
      (npcId) => npcId === 'a' || npcId === 'd',
    )).toEqual({ a: 'local a', b: 'server b', c: '', d: '' })
  })
})

describe('media URLs', () => {
  it('needs URLs for a stored path that has no renderable URL yet', () => {
    expect(needsMediaUrls(npc('a'))).toBe(false)
    expect(needsMediaUrls(npc('a', { portraitPath: 'p.png', portraitUrl: null }))).toBe(true)
    expect(needsMediaUrls(npc('a', { portraitPath: 'p.png', portraitUrl: 'https://p' }))).toBe(false)
    expect(needsMediaUrls(npc('a', { tokenIcon: { ...defaultTokenIcon, customImagePath: 't.png' } }))).toBe(true)
    expect(needsMediaUrls(npc('a', { tokenIcon: { ...defaultTokenIcon, customImagePath: 't.png', customImageUrl: 'https://t' } }))).toBe(false)
  })

  it('applies resolved URLs to the matching NPC and keeps what did not resolve', () => {
    const list = [npc('a', { portraitUrl: 'https://old' }), npc('b')]
    const portraitOnly = applyResolvedMedia(list, 'a', 'https://p', null)
    expect(portraitOnly[0]).toMatchObject({ portraitUrl: 'https://p', tokenIcon: defaultTokenIcon })
    expect(portraitOnly[1]).toBe(list[1])
    const tokenOnly = applyResolvedMedia(list, 'a', null, 'https://t')
    expect(tokenOnly[0]).toMatchObject({ portraitUrl: 'https://old', tokenIcon: { ...defaultTokenIcon, customImageUrl: 'https://t' } })
  })
})
