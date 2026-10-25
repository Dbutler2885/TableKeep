// @vitest-environment jsdom
/**
 * What the NPC tab does end to end, with only Firestore, Storage and the
 * session notes replaced. The detail editor is a stub that records its props,
 * so these tests pin how the tab wires the editor rather than the editor itself.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { Role, SessionNote } from '../../types/app'
import type { NpcDetailEditor as NpcDetailEditorType } from './NpcDetailEditor'

type SnapDoc = [id: string, data: Record<string, unknown>]
type EditorProps = ComponentProps<typeof NpcDetailEditorType>

const mocks = vi.hoisted(() => ({
  listeners: {} as Record<string, (snap: unknown) => void>,
  queries: {} as Record<string, unknown[]>,
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  resolveStoragePathUrl: vi.fn(),
  uploadEntityImage: vi.fn(),
  sessionNotes: [] as SessionNote[],
  editor: null as EditorProps | null,
}))

vi.mock('../../firebase', () => ({ db: { name: 'db-stub' } }))
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  query: (ref: { path: string }, ...constraints: unknown[]) => ({ path: ref.path, constraints }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  onSnapshot: (ref: { path: string; constraints?: unknown[] }, next: (snap: unknown) => void) => {
    mocks.listeners[ref.path] = next
    mocks.queries[ref.path] = ref.constraints ?? []
    return () => { delete mocks.listeners[ref.path] }
  },
  setDoc: mocks.setDoc,
  deleteDoc: mocks.deleteDoc,
  serverTimestamp: () => 'server-ts',
}))
vi.mock('../common/mediaStorage', async () => ({
  ...(await import('../common/mediaFields')),
  resolveStoragePathUrl: mocks.resolveStoragePathUrl,
  uploadEntityImage: mocks.uploadEntityImage,
}))
vi.mock('../notes/useSessionNotes', () => ({ useSessionNotes: () => ({ notes: mocks.sessionNotes }) }))
vi.mock('./NpcDetailEditor', () => ({
  NpcDetailEditor: (props: EditorProps) => {
    mocks.editor = props
    return (
      <div data-testid="npc-editor">
        {props.npc.name}
        <button type="button" onClick={props.onOpenTags}>Manage tags</button>
      </div>
    )
  },
}))

const { NpcsTab } = await import('./NpcsTab')

const BASE = 'groups/group-1/campaigns/campaign-1'
const NPCS = `${BASE}/npcs`
const PRIVATE = `${BASE}/npcPrivate`

const aldo: SnapDoc = ['a', { name: 'Aldo', title: 'Smith', visibleToPlayers: true, tags: ['merchant'], sortOrder: 1 }]
const bea: SnapDoc = ['b', { name: 'Bea', title: 'Guard', visibleToPlayers: true, tags: ['guard', 7], sortOrder: 0 }]
const cid: SnapDoc = ['c', { name: 'Cid', title: '', visibleToPlayers: false, tags: ['merchant', 'spy'] }]
const blank: SnapDoc = ['d', {}]
const party = [aldo, bea, cid, blank]

function snap(docs: SnapDoc[]) {
  return { docs: docs.map(([id, data]) => ({ id, data: () => data })) }
}

function emit(path: string, docs: SnapDoc[]) {
  act(() => mocks.listeners[path](snap(docs)))
}

function renderTab(role: Role | null = 'gm', docs: SnapDoc[] = party) {
  const view = render(<NpcsTab campaignId="campaign-1" groupId="group-1" role={role} />)
  if (mocks.listeners[NPCS]) emit(NPCS, docs)
  return view
}

function rows() {
  return Array.from(document.querySelectorAll<HTMLElement>('.npc-row'))
}

function rowNames() {
  return rows().map((row) => row.querySelector('strong')?.textContent)
}

function row(name: string) {
  const found = rows().find((entry) => entry.querySelector('strong')?.textContent === name)
  if (!found) throw new Error(`No row named ${name}`)
  return found
}

function editor() {
  if (!mocks.editor) throw new Error('The detail editor has not rendered')
  return mocks.editor
}

function writesTo(path: string) {
  return mocks.setDoc.mock.calls.filter(([ref]) => (ref as { path: string }).path === path)
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
}

beforeEach(() => {
  vi.useFakeTimers()
  setViewportWidth(1440)
  mocks.setDoc.mockReset().mockResolvedValue(undefined)
  mocks.deleteDoc.mockReset().mockResolvedValue(undefined)
  mocks.resolveStoragePathUrl.mockReset().mockResolvedValue(null)
  mocks.uploadEntityImage.mockReset()
  mocks.sessionNotes = []
  mocks.editor = null
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  for (const key of Object.keys(mocks.listeners)) delete mocks.listeners[key]
})

describe('the roster', () => {
  it('lists every NPC for the GM, shown ones first, ordered by sort order and then by name', () => {
    renderTab('gm')
    expect(mocks.queries[NPCS]).toEqual([])
    expect(screen.getByText('Shown to Players')).toBeTruthy()
    expect(screen.getByText('GM Only')).toBeTruthy()
    expect(rowNames()).toEqual(['Bea', 'Aldo', 'Cid', 'Unnamed NPC'])
    expect(row('Cid').textContent).toContain('No title')
    expect(row('Unnamed NPC').querySelector('.monster-portrait-empty')).toBeTruthy()
  })

  it('shows a GM the first three tags on a row, a visibility toggle and a delete button', () => {
    renderTab('gm', [['x', { name: 'Xan', tags: ['a', 'b', 'c', 'd'], visibleToPlayers: true }]])
    const xan = row('Xan')
    expect(Array.from(xan.querySelectorAll('.item-tag')).map((tag) => tag.textContent)).toEqual(['a', 'b', 'c'])
    expect(within(xan).getByLabelText('Visible to players')).toBeTruthy()
    expect(within(xan).getByLabelText('Delete Xan')).toBeTruthy()
  })

  it('asks a player only for shown NPCs and shows them without groups, tags or GM controls', () => {
    renderTab('player', [aldo, bea, cid])
    expect(mocks.queries[NPCS]).toEqual([{ field: 'visibleToPlayers', op: '==', value: true }])
    expect(mocks.listeners[PRIVATE]).toBeUndefined()
    expect(rowNames()).toEqual(['Bea', 'Aldo'])
    expect(screen.queryByText('Shown to Players')).toBeNull()
    expect(screen.queryByLabelText('Add NPC')).toBeNull()
    expect(document.querySelector('.item-tag')).toBeNull()
    expect(document.querySelector('.map-visibility-btn')).toBeNull()
    expect(document.querySelector('.character-card-delete-btn')).toBeNull()
  })

  it('selects the first NPC, and the next first one when the selected NPC disappears', () => {
    renderTab('gm')
    expect(editor().npc.id).toBe('b')
    expect(row('Bea').className).toContain('active')
    emit(NPCS, [aldo, cid])
    expect(editor().npc.id).toBe('a')
    emit(NPCS, [])
    expect(screen.getByText('Select an NPC from the list.')).toBeTruthy()
    expect(screen.getByText('No NPCs match the current filters.')).toBeTruthy()
  })

  it('selects an NPC by click or by Enter and Space', () => {
    renderTab('gm')
    fireEvent.click(row('Aldo').querySelector('.map-select')!)
    expect(editor().npc.id).toBe('a')
    fireEvent.keyDown(row('Cid').querySelector('.map-select')!, { key: 'Enter' })
    expect(editor().npc.id).toBe('c')
    fireEvent.keyDown(row('Bea').querySelector('.map-select')!, { key: ' ' })
    expect(editor().npc.id).toBe('b')
    fireEvent.keyDown(row('Aldo').querySelector('.map-select')!, { key: 'a' })
    expect(editor().npc.id).toBe('b')
  })
})

describe('reading NPC documents', () => {
  it('fills defaults for missing fields and drops tags that are not strings', () => {
    renderTab('gm', [blank, bea])
    const read = mocks.editor!.npc
    expect(read).toEqual({
      id: 'b',
      name: 'Bea',
      title: 'Guard',
      visibleToPlayers: true,
      tags: ['guard'],
      portraitPath: '',
      portraitUrl: null,
      portraitFocusX: 50,
      portraitFocusY: 50,
      tokenIcon: { icon: 'pawn', color: '#2f5bbf', size: 34 },
      playerDescription: '',
      playerNotes: '',
      sortOrder: 0,
    })
    fireEvent.click(row('Unnamed NPC').querySelector('.map-select')!)
    expect(editor().npc).toMatchObject({ name: 'Unnamed NPC', title: '', visibleToPlayers: false, tags: [], sortOrder: undefined })
  })

  it('resolves stored portrait and token paths into URLs, and keeps them across later snapshots', async () => {
    mocks.resolveStoragePathUrl.mockImplementation(async (path: string) => `https://cdn/${path}`)
    const pictured: SnapDoc = ['p', {
      name: 'Pia',
      portraitPath: 'portraits/p.png',
      portraitFocusX: 20,
      portraitFocusY: 70,
      tokenIcon: { icon: 'custom', color: '#000', size: 30, customImagePath: 'tokens/p.png' },
    }]
    renderTab('gm', [pictured])
    await flush()
    expect(mocks.resolveStoragePathUrl.mock.calls.map(([path]) => path)).toEqual(['portraits/p.png', 'tokens/p.png'])
    const img = row('Pia').querySelector('img')!
    expect(img.getAttribute('src')).toBe('https://cdn/portraits/p.png')
    expect(img.getAttribute('alt')).toBe('Pia portrait')
    expect(img.style.objectPosition).toBe('20% 0%')
    expect(editor().npc.tokenIcon.customImageUrl).toBe('https://cdn/tokens/p.png')

    mocks.resolveStoragePathUrl.mockClear()
    emit(NPCS, [pictured])
    await flush()
    expect(mocks.resolveStoragePathUrl).not.toHaveBeenCalled()
    expect(editor().npc.portraitUrl).toBe('https://cdn/portraits/p.png')
    expect(editor().npc.tokenIcon.customImageUrl).toBe('https://cdn/tokens/p.png')
  })

  it('uses URLs stored on the document and leaves an unresolvable path without one', async () => {
    mocks.resolveStoragePathUrl.mockRejectedValue(new Error('storage/object-not-found'))
    renderTab('gm', [
      ['s', { name: 'Sal', portraitPath: 'x.png', portraitUrl: 'https://stored/x.png', tokenIcon: { icon: 'custom', color: '#000', size: 30, customImageUrl: 'https://stored/t.png' } }],
      ['u', { name: 'Uma', portraitPath: 'missing.png' }],
    ])
    await flush()
    expect(mocks.resolveStoragePathUrl.mock.calls.map(([path]) => path)).toEqual(['missing.png'])
    expect(editor().npc.portraitUrl).toBe('https://stored/x.png')
    expect(editor().npc.tokenIcon.customImageUrl).toBe('https://stored/t.png')
    expect(row('Uma').querySelector('img')).toBeNull()
  })

  it('reads GM notes for the GM and passes the auto-notes that link to the selected NPC', () => {
    mocks.sessionNotes = [{
      title: 'Session 3',
      sessionNumber: 3,
      npcMentions: [
        { linkedNpcId: 'b', name: 'Bea', title: 'Guard', action: 'update', facts: ['Owes Aldo money'] },
        { linkedNpcId: 'a', name: 'Aldo', title: 'Smith', action: 'new', facts: ['Sells swords'] },
      ],
    } as unknown as SessionNote]
    renderTab('gm')
    act(() => mocks.listeners[PRIVATE]({ docs: [{ id: 'b', data: () => ({ gmNotes: 'Secretly a spy' }) }, { id: 'a', data: () => ({}) }] }))
    expect(editor().gmNotes).toBe('Secretly a spy')
    expect(editor().autoNotes).toEqual([{ sessionTitle: 'Session 3', sessionNumber: 3, npcName: 'Bea', title: 'Guard', action: 'update', facts: ['Owes Aldo money'] }])
    fireEvent.click(row('Aldo').querySelector('.map-select')!)
    expect(editor().gmNotes).toBe('')
    fireEvent.click(row('Cid').querySelector('.map-select')!)
    expect(editor().gmNotes).toBe('')
    expect(editor().autoNotes).toEqual([])
  })
})

describe('changing role', () => {
  it('drops the GM notes when the viewer stops being the GM, and reads them again on return', () => {
    const view = renderTab('gm', [bea])
    act(() => mocks.listeners[PRIVATE]({ docs: [{ id: 'b', data: () => ({ gmNotes: 'secret' }) }] }))
    expect(editor().gmNotes).toBe('secret')
    view.rerender(<NpcsTab campaignId="campaign-1" groupId="group-1" role="player" />)
    expect(mocks.listeners[PRIVATE]).toBeUndefined()
    view.rerender(<NpcsTab campaignId="campaign-1" groupId="group-1" role="gm" />)
    expect(editor().gmNotes).toBe('')
    act(() => mocks.listeners[PRIVATE]({ docs: [{ id: 'b', data: () => ({ gmNotes: 'secret' }) }] }))
    expect(editor().gmNotes).toBe('secret')
  })
})

describe('editing', () => {
  it('saves a GM edit half a second after the last change, without URLs and without an id', async () => {
    renderTab('gm', [['t', { name: 'Tam', sortOrder: 2, tokenIcon: { icon: 'custom', color: '#111', size: 30, customImagePath: 't.png', customImageUrl: 'https://t' } }]])
    act(() => editor().onChange({ name: 'Tamsin' }))
    expect(editor().npc.name).toBe('Tamsin')
    act(() => vi.advanceTimersByTime(300))
    act(() => editor().onChange({ title: 'Baker' }))
    act(() => vi.advanceTimersByTime(499))
    expect(mocks.setDoc).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(writesTo(`${NPCS}/t`)).toEqual([[
      { path: `${NPCS}/t` },
      {
        name: 'Tamsin',
        title: 'Baker',
        visibleToPlayers: false,
        tags: [],
        portraitPath: '',
        portraitFocusX: 50,
        portraitFocusY: 50,
        playerDescription: '',
        playerNotes: '',
        sortOrder: 2,
        tokenIcon: { icon: 'custom', color: '#111', size: 30, customImagePath: 't.png' },
        updatedAt: 'server-ts',
      },
      { merge: true },
    ]])
    await flush()
  })

  it('leaves out a missing sort order, and keeps local edits over snapshots until the write settles', async () => {
    let settle = () => {}
    mocks.setDoc.mockImplementation(() => new Promise<void>((resolve) => { settle = resolve }))
    renderTab('gm', [cid])
    act(() => editor().onChange({ name: 'Cidra' }))
    emit(NPCS, [cid])
    expect(editor().npc.name).toBe('Cidra')
    act(() => vi.advanceTimersByTime(500))
    expect(writesTo(`${NPCS}/c`)[0][1]).not.toHaveProperty('sortOrder')
    emit(NPCS, [cid])
    expect(editor().npc.name).toBe('Cidra')
    await act(async () => settle())
    emit(NPCS, [cid])
    expect(editor().npc.name).toBe('Cid')
  })

  it('toggles visibility from the row', () => {
    renderTab('gm')
    fireEvent.click(within(row('Cid')).getByLabelText('Hidden from players'))
    expect(rowNames()).toEqual(['Bea', 'Aldo', 'Cid', 'Unnamed NPC'])
    expect(within(row('Cid')).getByLabelText('Visible to players')).toBeTruthy()
    expect(editor().npc.id).toBe('b')
    act(() => vi.advanceTimersByTime(500))
    expect(writesTo(`${NPCS}/c`)[0][1]).toMatchObject({ visibleToPlayers: true })
  })

  it('routes a GM\'s player-notes edit through the full NPC write', () => {
    renderTab('gm')
    act(() => editor().onChangePlayerNotes('Seen at the inn'))
    act(() => vi.advanceTimersByTime(500))
    expect(writesTo(`${NPCS}/b`)[0][1]).toMatchObject({ name: 'Bea', playerNotes: 'Seen at the inn' })
  })

  it('saves GM notes to the private document, and keeps them over snapshots while pending', async () => {
    renderTab('gm')
    act(() => mocks.listeners[PRIVATE]({ docs: [{ id: 'b', data: () => ({ gmNotes: 'old' }) }] }))
    act(() => editor().onChangeGmNotes('new'))
    act(() => mocks.listeners[PRIVATE]({ docs: [{ id: 'b', data: () => ({ gmNotes: 'old' }) }] }))
    expect(editor().gmNotes).toBe('new')
    act(() => vi.advanceTimersByTime(500))
    expect(writesTo(`${PRIVATE}/b`)).toEqual([[{ path: `${PRIVATE}/b` }, { id: 'b', gmNotes: 'new', updatedAt: 'server-ts' }, { merge: true }]])
    await flush()
    act(() => mocks.listeners[PRIVATE]({ docs: [{ id: 'b', data: () => ({ gmNotes: 'server' }) }] }))
    expect(editor().gmNotes).toBe('server')
  })

  it('saves only the player-editable fields for a player', async () => {
    renderTab('player', [aldo])
    act(() => editor().onChange({ portraitFocusX: 10 }))
    act(() => editor().onChangePlayerNotes('Friendly'))
    act(() => editor().onChangeGmNotes('ignored'))
    act(() => vi.advanceTimersByTime(500))
    expect(mocks.setDoc.mock.calls).toEqual([[
      { path: `${NPCS}/a` },
      {
        playerNotes: 'Friendly',
        tags: ['merchant'],
        portraitPath: '',
        portraitFocusX: 10,
        portraitFocusY: 50,
        tokenIcon: { icon: 'pawn', color: '#2f5bbf', size: 34 },
        updatedAt: 'server-ts',
      },
      { merge: true },
    ]])
    await flush()
  })

  it('drops a pending write when the NPC has gone by the time it fires', () => {
    renderTab('gm')
    act(() => editor().onChange({ name: 'Gone' }))
    emit(NPCS, [aldo])
    act(() => vi.advanceTimersByTime(500))
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('ignores edits from a viewer with no role', () => {
    renderTab(null, [aldo])
    act(() => editor().onChange({ name: 'Nope' }))
    act(() => editor().onChangePlayerNotes('Nope'))
    expect(editor().npc.name).toBe('Aldo')
    expect(editor().npc.playerNotes).toBe('')
    act(() => vi.advanceTimersByTime(500))
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('uploads portrait and token images for the selected NPC with the viewer\'s authority', async () => {
    mocks.uploadEntityImage.mockResolvedValue({ path: 'stored/path.png', url: 'https://u', name: 'file.png' })
    const file = new File(['x'], 'file.png')
    renderTab('gm')
    await expect(editor().onUploadPortraitImage(file)).resolves.toEqual({ portraitPath: 'stored/path.png', portraitUrl: 'https://u' })
    await expect(editor().onUploadTokenImage(file)).resolves.toEqual({ customImagePath: 'stored/path.png', customImageUrl: 'https://u', customImageName: 'file.png' })
    expect(mocks.uploadEntityImage.mock.calls).toEqual([
      [{ campaignId: 'campaign-1', groupId: 'group-1', collectionName: 'npcs', entityId: 'b', uploadAuthority: undefined, mediaKind: 'portraits', file, maxWidth: 600, maxHeight: 800 }],
      [{ campaignId: 'campaign-1', groupId: 'group-1', collectionName: 'npcs', entityId: 'b', uploadAuthority: undefined, mediaKind: 'token-icons', file, maxWidth: 1024, maxHeight: 1024 }],
    ])
    cleanup()
    mocks.uploadEntityImage.mockClear()
    renderTab('player', [aldo])
    await editor().onUploadPortraitImage(file)
    await editor().onUploadTokenImage(file)
    expect(mocks.uploadEntityImage.mock.calls.map(([args]) => args.uploadAuthority)).toEqual(['player', 'player'])
  })
})

describe('adding and deleting', () => {
  it('adds an NPC after the highest sort order with an empty private document, and selects it', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('1-2-3-4-5')
    renderTab('gm')
    fireEvent.click(screen.getByLabelText('Add NPC'))
    await flush()
    await flush()
    expect(mocks.setDoc.mock.calls).toEqual([
      [{ path: `${NPCS}/1-2-3-4-5` }, {
        id: '1-2-3-4-5',
        name: 'New NPC',
        title: '',
        visibleToPlayers: false,
        tags: [],
        portraitPath: '',
        portraitUrl: null,
        portraitFocusX: 50,
        portraitFocusY: 50,
        tokenIcon: { icon: 'pawn', color: '#2f5bbf', size: 34 },
        playerDescription: '',
        playerNotes: '',
        sortOrder: 2,
        createdAt: 'server-ts',
        updatedAt: 'server-ts',
      }],
      [{ path: `${PRIVATE}/1-2-3-4-5` }, { id: '1-2-3-4-5', gmNotes: '', createdAt: 'server-ts', updatedAt: 'server-ts' }],
    ])
    expect(screen.getByText('Select an NPC from the list.')).toBeTruthy()
    emit(NPCS, [...party, ['1-2-3-4-5', { name: 'New NPC', sortOrder: 2 }]])
    expect(editor().npc.id).toBe('1-2-3-4-5')
  })

  it('starts the sort order at zero in an empty campaign', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('9-9-9-9-9')
    renderTab('gm', [])
    fireEvent.click(screen.getByLabelText('Add NPC'))
    await flush()
    expect(mocks.setDoc.mock.calls[0][1]).toMatchObject({ sortOrder: 0 })
  })

  it('confirms a delete, removes the NPC, its GM notes and its sheet, and drops that NPC\'s pending writes', async () => {
    renderTab('gm')
    act(() => editor().onChange({ name: 'Bee' }))
    act(() => editor().onChangeGmNotes('gone soon'))
    fireEvent.click(within(row('Bee')).getByLabelText('Delete Bee'))
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('Delete Bee?')
    fireEvent.click(within(dialog).getByText('Delete'))
    await flush()
    await flush()
    await flush()
    expect(mocks.deleteDoc.mock.calls).toEqual([[{ path: `${NPCS}/b` }], [{ path: `${PRIVATE}/b` }], [{ path: `${BASE}/npcSheets/b` }]])
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => vi.advanceTimersByTime(500))
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('cancels a delete without touching anything, and names an unnamed NPC generically', () => {
    renderTab('gm', [['n', { name: '' }]])
    fireEvent.click(screen.getByLabelText('Delete NPC'))
    expect(screen.getByRole('dialog').textContent).toContain('Delete this NPC?')
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.deleteDoc).not.toHaveBeenCalled()
  })
})

describe('searching and filtering', () => {
  it('matches the search against name, title and tags, ignoring case and surrounding space', () => {
    renderTab('gm')
    const search = screen.getByLabelText('Search NPCs')
    fireEvent.change(search, { target: { value: '  SMITH ' } })
    expect(rowNames()).toEqual(['Aldo'])
    fireEvent.change(search, { target: { value: 'spy' } })
    expect(rowNames()).toEqual(['Cid'])
    expect(screen.queryByText('Shown to Players')).toBeNull()
    fireEvent.change(search, { target: { value: 'nobody' } })
    expect(rowNames()).toEqual([])
    expect(screen.getByText('No NPCs match the current filters.')).toBeTruthy()
  })

  it('offers the tags in use on listed NPCs, searchable, and filters by the chosen one', () => {
    renderTab('gm')
    const trigger = document.querySelector<HTMLButtonElement>('.npc-tag-filter-trigger')!
    expect(trigger.textContent).toBe('All tags')
    fireEvent.click(trigger)
    const options = () => Array.from(document.querySelectorAll('.npc-tag-filter-option')).map((option) => option.textContent)
    expect(options()).toEqual(['All tags', 'guard', 'merchant', 'spy'])
    expect(document.querySelector('.npc-tag-filter-option.active')?.textContent).toBe('All tags')
    const tagSearch = screen.getByPlaceholderText('Search tags')
    fireEvent.change(tagSearch, { target: { value: ' MER' } })
    expect(options()).toEqual(['merchant'])
    fireEvent.change(tagSearch, { target: { value: 'zzz' } })
    expect(screen.getByText('No matching tags')).toBeTruthy()
    fireEvent.change(tagSearch, { target: { value: 'merch' } })
    fireEvent.click(screen.getByText('merchant', { selector: '.npc-tag-filter-option' }))
    expect(document.querySelector('.npc-tag-filter-menu')).toBeNull()
    expect(trigger.textContent).toBe('merchant')
    expect(rowNames()).toEqual(['Aldo', 'Cid'])

    fireEvent.click(trigger)
    expect((screen.getByPlaceholderText('Search tags') as HTMLInputElement).value).toBe('')
    expect(document.querySelector('.npc-tag-filter-option.active')?.textContent).toBe('merchant')
    fireEvent.click(screen.getByText('All tags', { selector: '.npc-tag-filter-option' }))
    expect(rowNames()).toEqual(['Bea', 'Aldo', 'Cid', 'Unnamed NPC'])
  })

  it('closes the tag menu from its backdrop and from its trigger', () => {
    renderTab('gm')
    const trigger = document.querySelector<HTMLButtonElement>('.npc-tag-filter-trigger')!
    fireEvent.click(trigger)
    fireEvent.click(document.querySelector('.npc-tag-filter-backdrop')!)
    expect(document.querySelector('.npc-tag-filter-menu')).toBeNull()
    fireEvent.click(trigger)
    fireEvent.click(trigger)
    expect(document.querySelector('.npc-tag-filter-menu')).toBeNull()
  })
})

describe('the tags dialog', () => {
  function openTags() {
    fireEvent.click(screen.getByText('Manage tags'))
    return screen.getByRole('dialog')
  }

  function chips(dialog: HTMLElement, selector: string) {
    return Array.from(dialog.querySelectorAll(selector)).map((chip) => chip.textContent)
  }

  it('starts from the NPC\'s tags and offers the campaign\'s other tags, searchable', () => {
    renderTab('gm')
    fireEvent.click(row('Aldo').querySelector('.map-select')!)
    const dialog = openTags()
    expect(within(dialog).getByText('Aldo', { selector: '.npc-tag-modal-subtitle' })).toBeTruthy()
    expect(chips(dialog, '.npc-tag-chip.selected')).toEqual(['merchant'])
    expect(chips(dialog, '.npc-tag-chip:not(.selected)')).toEqual(['guard', 'spy'])
    fireEvent.change(within(dialog).getByPlaceholderText('Search tags'), { target: { value: ' SP ' } })
    expect(chips(dialog, '.npc-tag-chip:not(.selected)')).toEqual(['spy'])
  })

  it('adds typed and offered tags once each, lower-cased, removes chips, and saves the change', () => {
    renderTab('gm')
    const dialog = openTags()
    const input = within(dialog).getByPlaceholderText('merchant') as HTMLInputElement
    const addButton = input.parentElement!.querySelector('button')!
    expect(addButton.disabled).toBe(true)
    fireEvent.change(input, { target: { value: '  Noble ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input.value).toBe('')
    fireEvent.change(input, { target: { value: 'NOBLE' } })
    fireEvent.click(addButton)
    fireEvent.change(input, { target: { value: 'x' } })
    fireEvent.keyDown(input, { key: 'a' })
    expect(input.value).toBe('x')
    fireEvent.click(within(dialog).getByText('spy'))
    expect(chips(dialog, '.npc-tag-chip.selected')).toEqual(['guard', 'noble', 'spy'])
    fireEvent.click(within(dialog).getByText('guard'))
    expect(chips(dialog, '.npc-tag-chip.selected')).toEqual(['noble', 'spy'])
    const actions = dialog.querySelector('.confirm-actions')!.querySelectorAll('button')
    fireEvent.click(actions[1])
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(editor().npc.tags).toEqual(['noble', 'spy'])
    act(() => vi.advanceTimersByTime(500))
    expect(writesTo(`${NPCS}/b`)[0][1]).toMatchObject({ tags: ['noble', 'spy'] })
  })

  it('shows an empty selection, and closes from the X and Cancel without saving', () => {
    renderTab('gm', [blank])
    let dialog = openTags()
    expect(within(dialog).getByText('No tags selected.')).toBeTruthy()
    expect(within(dialog).queryByText('Available Tags')).toBeNull()
    fireEvent.change(within(dialog).getByPlaceholderText('merchant'), { target: { value: 'kept?' } })
    fireEvent.click(within(dialog).getByLabelText('Close tags'))
    expect(screen.queryByRole('dialog')).toBeNull()
    dialog = openTags()
    expect((within(dialog).getByPlaceholderText('merchant') as HTMLInputElement).value).toBe('')
    fireEvent.click(within(dialog).getByText('Cancel'))
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => vi.advanceTimersByTime(500))
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('saves from a backdrop click only when the tags changed, and a player saves through the player write', () => {
    renderTab('player', [aldo])
    let dialog = openTags()
    fireEvent.click(dialog.querySelector('.npc-tag-modal')!)
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(dialog)
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => vi.advanceTimersByTime(500))
    expect(mocks.setDoc).not.toHaveBeenCalled()

    dialog = openTags()
    fireEvent.click(within(dialog).getByText('merchant'))
    fireEvent.click(dialog)
    act(() => vi.advanceTimersByTime(500))
    expect(mocks.setDoc.mock.calls[0][1]).toEqual(expect.objectContaining({ tags: [], playerNotes: '' }))
    expect(mocks.setDoc.mock.calls[0][1]).not.toHaveProperty('name')
  })

  it('starts the draft again from the NPC when its document changes while the dialog is open', () => {
    renderTab('gm', [aldo])
    const dialog = openTags()
    fireEvent.click(within(dialog).getByText('merchant'))
    expect(chips(dialog, '.npc-tag-chip.selected')).toEqual([])
    emit(NPCS, [['a', { ...aldo[1], tags: ['merchant', 'smith'] }]])
    expect(chips(screen.getByRole('dialog'), '.npc-tag-chip.selected')).toEqual(['merchant', 'smith'])
  })

  it('does not save tags for a viewer with no role', () => {
    renderTab(null, [aldo])
    const dialog = openTags()
    fireEvent.click(within(dialog).getByText('merchant'))
    fireEvent.click(dialog)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(editor().npc.tags).toEqual(['merchant'])
  })
})

describe('the mobile layout', () => {
  it('shows the list, then the selected NPC with a way back, and resets when widened', () => {
    setViewportWidth(600)
    renderTab('gm')
    expect(screen.queryByTestId('npc-editor')).toBeNull()
    fireEvent.click(row('Aldo').querySelector('.map-select')!)
    expect(rows()).toEqual([])
    expect(screen.getByTestId('npc-editor').textContent).toContain('Aldo')
    fireEvent.click(document.querySelector('.monster-mobile-back')!)
    expect(rowNames()).toEqual(['Bea', 'Aldo', 'Cid', 'Unnamed NPC'])

    fireEvent.click(row('Cid').querySelector('.map-select')!)
    act(() => {
      setViewportWidth(1200)
      window.dispatchEvent(new Event('resize'))
    })
    expect(rowNames()).toEqual(['Bea', 'Aldo', 'Cid', 'Unnamed NPC'])
    expect(screen.getByTestId('npc-editor').textContent).toContain('Cid')
    expect(document.querySelector('.monster-mobile-back')).toBeNull()
  })

  it('opens the NPC already selected, so the first one and the one just left open again', () => {
    setViewportWidth(600)
    renderTab('gm')
    fireEvent.click(row('Bea').querySelector('.map-select')!)
    expect(screen.getByTestId('npc-editor').textContent).toContain('Bea')

    fireEvent.click(document.querySelector('.monster-mobile-back')!)
    fireEvent.click(row('Bea').querySelector('.map-select')!)

    expect(rows()).toEqual([])
    expect(screen.getByTestId('npc-editor').textContent).toContain('Bea')
  })

  it('opens a newly added NPC straight away', async () => {
    setViewportWidth(600)
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('7-7-7-7-7')
    renderTab('gm')
    fireEvent.click(screen.getByLabelText('Add NPC'))
    await flush()
    await flush()
    expect(rows()).toEqual([])
    expect(screen.getByText('Select an NPC from the list.')).toBeTruthy()
  })
})

describe('drag to reorder', () => {
  const dataTransfer = () => ({ effectAllowed: '', dropEffect: '' })

  // jsdom has no DragEvent, so a drag event built from an init dict loses its
  // pointer position.
  function dragOverAt(target: Element, clientY: number) {
    const event = createEvent.dragOver(target, { dataTransfer: dataTransfer() })
    Object.defineProperty(event, 'clientY', { value: clientY })
    fireEvent(target, event)
  }

  function startDrag(name: string) {
    fireEvent.dragStart(row(name), { dataTransfer: dataTransfer() })
    act(() => vi.advanceTimersByTime(20))
  }

  it('previews the move within a group and saves the new order on drop', () => {
    renderTab('gm', [
      ['a', { name: 'A', visibleToPlayers: true, sortOrder: 0 }],
      ['b', { name: 'B', visibleToPlayers: true, sortOrder: 1 }],
      ['c', { name: 'C', visibleToPlayers: true, sortOrder: 2 }],
    ])
    startDrag('C')
    const placeholder = document.querySelector('.npc-row-placeholder')!
    expect(placeholder).toBeTruthy()
    expect(placeholder.querySelector('strong')).toBeNull()
    dragOverAt(row('A'), 0)
    expect(rowNames()).toEqual([undefined, 'A', 'B'])
    fireEvent.drop(row('A'), { dataTransfer: dataTransfer() })
    expect(rowNames()).toEqual(['C', 'A', 'B'])
    act(() => vi.advanceTimersByTime(500))
    expect(mocks.setDoc.mock.calls.map(([ref, data]) => [(ref as { path: string }).path, (data as { sortOrder: number }).sortOrder])).toEqual([
      [`${NPCS}/c`, 0],
      [`${NPCS}/a`, 1],
      [`${NPCS}/b`, 2],
    ])
  })

  it('does not move an NPC into the other visibility group, or onto itself', () => {
    renderTab('gm', [
      ['a', { name: 'A', visibleToPlayers: true, sortOrder: 0 }],
      ['b', { name: 'B', visibleToPlayers: false, sortOrder: 1 }],
    ])
    startDrag('A')
    fireEvent.dragOver(row('B'), { dataTransfer: dataTransfer() })
    fireEvent.drop(row('B'), { dataTransfer: dataTransfer() })
    startDrag('B')
    fireEvent.drop(document.querySelector('.npc-row-placeholder')!, { dataTransfer: dataTransfer() })
    act(() => vi.advanceTimersByTime(500))
    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(rowNames()).toEqual(['A', 'B'])
  })

  it('ends a drag without saving when it is let go outside a row', () => {
    renderTab('player', [aldo, bea])
    startDrag('Aldo')
    fireEvent.dragOver(row('Bea'), { dataTransfer: dataTransfer() })
    fireEvent.dragEnd(document.querySelector('.npc-row-placeholder')!)
    expect(document.querySelector('.npc-row-placeholder')).toBeNull()
    expect(rowNames()).toEqual(['Bea', 'Aldo'])
    act(() => vi.advanceTimersByTime(500))
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('lets a player reorder through the full NPC write, and ignores drags for a viewer with no role', () => {
    renderTab('player', [aldo, bea])
    startDrag('Aldo')
    fireEvent.dragOver(row('Bea'), { dataTransfer: dataTransfer() })
    fireEvent.drop(row('Bea'), { dataTransfer: dataTransfer() })
    expect(rowNames()).toEqual(['Aldo', 'Bea'])
    expect(mocks.setDoc).not.toHaveBeenCalled()
    cleanup()
    renderTab(null, [aldo, bea])
    expect(rows()[0].getAttribute('draggable')).toBe('false')
    fireEvent.dragStart(row('Aldo'), { dataTransfer: dataTransfer() })
    act(() => vi.advanceTimersByTime(20))
    expect(document.querySelector('.npc-row-placeholder')).toBeNull()
  })

  it('scrolls the list while dragging near its edges and stops on drop', () => {
    renderTab('gm', [
      ['a', { name: 'A', visibleToPlayers: true, sortOrder: 0 }],
      ['b', { name: 'B', visibleToPlayers: true, sortOrder: 1 }],
    ])
    const list = document.querySelector<HTMLElement>('.character-list-grid')!
    list.getBoundingClientRect = () => ({ top: 100, bottom: 400 }) as DOMRect
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 300 })
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 1000 })
    list.scrollTop = 50
    startDrag('A')
    dragOverAt(row('B'), 390)
    act(() => vi.advanceTimersByTime(20))
    expect(list.scrollTop).toBeGreaterThan(50)
    const afterDown = list.scrollTop
    dragOverAt(list.parentElement!, 105)
    act(() => vi.advanceTimersByTime(20))
    expect(list.scrollTop).toBeLessThan(afterDown)
    dragOverAt(list.parentElement!, 250)
    const settled = list.scrollTop
    act(() => vi.advanceTimersByTime(100))
    expect(list.scrollTop).toBe(settled)
    dragOverAt(list.parentElement!, 395)
    fireEvent.drop(list.parentElement!)
    const dropped = list.scrollTop
    act(() => vi.advanceTimersByTime(100))
    expect(list.scrollTop).toBe(dropped)
  })
})
