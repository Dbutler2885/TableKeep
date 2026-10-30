// @vitest-environment jsdom
/**
 * The GM Items tab (spec 12.5, case 16), mounted as the shell mounts it, over
 * `firebase/firestore` stubbed with documents kept by path, so Give's
 * transaction writes the character and removes the GM item together, as
 * Firestore does. The GM sees the campaign items and what was dropped; Give
 * lands a thing by the arrival rule; Keep moves a dropped one to the campaign
 * items; Delete removes one; ticked dropped items are deleted together in one
 * batch; and a player's picker offers the campaign items, never a dropped one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { User } from 'firebase/auth'
import type { Campaign, Role } from '../../../types/app'
import { LUBEC_PIC_FILE } from '../gear/useLubecPictureUpload'

// These cases mount large component trees and run role queries over them in jsdom (see LubecGearTab.test.tsx).
vi.setConfig({ testTimeout: 30_000 })
// Give waits on its transaction and the snapshot after it, which on a loaded machine outlasts waitFor's 1 second default.
configure({ asyncUtilTimeout: 10_000 })

type Fields = Record<string, unknown>
type Ref = { path: string; filter?: { field: string; value: unknown } }
type Listener = { ref: Ref; next: (snap: unknown) => void }

const mocks = vi.hoisted(() => ({
  listeners: [] as { ref: { path: string; filter?: { field: string; value: unknown } }; next: (snap: unknown) => void }[],
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  commitBatch: vi.fn(),
  runTransaction: vi.fn(),
}))

vi.mock('../../../firebase', () => ({ db: { name: 'db-stub' } }))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  query: (ref: Ref, filter: Ref['filter']) => ({ ...ref, filter }),
  where: (field: string, _op: string, value: unknown) => ({ field, value }),
  onSnapshot: (ref: Ref, next: Listener['next']) => {
    const listener = { ref, next }
    mocks.listeners.push(listener)
    queueMicrotask(() => emit(listener))
    return () => { mocks.listeners = mocks.listeners.filter((l) => l !== listener) }
  },
  runTransaction: mocks.runTransaction,
  serverTimestamp: () => ({ sentinel: 'serverTimestamp' }),
  setDoc: mocks.setDoc,
  deleteDoc: mocks.deleteDoc,
  writeBatch: () => {
    const deletes: Ref[] = []
    return { delete: (ref: Ref) => { deletes.push(ref) }, commit: () => mocks.commitBatch(deletes) }
  },
}))
vi.mock('../../common/mediaStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../common/mediaStorage')>()),
  resolveStoragePathUrl: vi.fn(async () => null),
}))

const { ruleSetItemsTabs, ruleSetSheets } = await import('../../ruleSets/sheetComponents')

const CAMPAIGN = 'groups/group-1/campaigns/campaign-1'
const CHARACTERS = `${CAMPAIGN}/characters`
const GM_ITEMS = `${CAMPAIGN}/gmItems`
const GM = 'gm-1'

const campaign: Campaign = { id: 'campaign-1', name: 'Lubec', status: 'active', groupId: 'group-1', gmUserId: GM, system: 'lubec' }

/** Every stored document, by path. */
let database: Record<string, Fields> = {}
let clock = 0

const isDocPath = (path: string) => path.split('/').length % 2 === 0
const isMap = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value)
const isSentinel = (value: unknown) => isMap(value) && value.sentinel === 'serverTimestamp'
const idOf = (path: string) => path.split('/').pop() as string

// The server's time on a write: later on every write, as Firestore's is.
const stamped = (payload: Fields): Fields =>
  Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, isSentinel(value) ? { seconds: ++clock, nanoseconds: 0 } : value]))

function written(stored: Fields, payload: Fields, merge: boolean): Fields {
  if (!merge) return payload
  const merged = { ...stored }
  Object.entries(payload).forEach(([key, value]) => {
    merged[key] = isMap(value) && isMap(stored[key]) ? written(stored[key], value, true) : value
  })
  return merged
}

function docSnap(path: string) {
  const data = database[path]
  return { id: idOf(path), exists: () => data !== undefined, data: () => data, get: (field: string) => data?.[field], metadata: { hasPendingWrites: false } }
}

const inCollection = (ref: Ref, path: string) =>
  path.startsWith(`${ref.path}/`) && path.split('/').length === ref.path.split('/').length + 1
  && (!ref.filter || database[path][ref.filter.field] === ref.filter.value)

function emit({ ref, next }: Listener) {
  if (isDocPath(ref.path)) return next(docSnap(ref.path))
  next({ docs: Object.keys(database).filter((path) => inCollection(ref, path)).map((path) => ({ id: idOf(path), data: () => database[path] })) })
}

const emitAll = () => act(() => { [...mocks.listeners].forEach(emit) })

function write(ref: Ref, payload: Fields, options?: { merge?: boolean }) {
  database[ref.path] = written(database[ref.path] ?? {}, stamped(payload), options?.merge === true)
}

async function transaction(_db: unknown, run: (tx: unknown) => Promise<unknown>) {
  const writes: (() => void)[] = []
  const result = await run({
    get: async (ref: Ref) => docSnap(ref.path),
    set: (ref: Ref, payload: Fields, options?: { merge?: boolean }) => { writes.push(() => write(ref, payload, options)) },
    delete: (ref: Ref) => { writes.push(() => { delete database[ref.path] }) },
  })
  writes.forEach((w) => w())
  emitAll()
  return result
}

const sheet = (name: string, ownerUserId: string, creationStatus: string, items: Fields[] = []): Fields => ({
  system: 'lubec', schemaVersion: 1, name, ownerUserId, ownerUsername: 'someone', creationMode: 'established', creationStatus,
  lubec: {
    class: { key: 'working', choices: {} },
    base: { Strength: 24, Speed: 51, Intellect: 38, Handle: 50, Charm: 48, Sanity: 20, Fear: 24, Body: 21 },
    skills: { free: 'Boatwork', picked: ['Swimming', 'Diving'] },
    gear: { items, carriers: [], overrides: [], supplies: [] },
  },
})

const gmItem = (id: string, name: string, fields: Fields): Fields => ({ id, kind: 'thing', name, size: 1, qty: 1, weight: 'normal', note: '', ...fields })

const LANTERN = gmItem('lantern', 'Brass storm lantern', { size: 2, note: 'From the lighthouse shed.', status: 'library', createdAt: { seconds: 1, nanoseconds: 0 } })
const ANVIL = gmItem('anvil', 'Small anvil', {
  weight: 'heavy', status: 'dropped', droppedByCharacterId: 'wayne', droppedByCharacterName: 'Wayne Gardner', droppedByUserId: 'player-1',
  droppedFrom: 'backpack', createdAt: { seconds: 2, nanoseconds: 0 },
})
const CAP = gmItem('cap', 'Wool watch cap', { status: 'dropped', droppedByCharacterName: 'Wayne Gardner', droppedFrom: 'hands', createdAt: { seconds: 3, nanoseconds: 0 } })

function seed() {
  database = {
    [`${CHARACTERS}/wayne`]: sheet('Wayne Gardner', 'player-1', 'active'),
    [`${CHARACTERS}/ada`]: sheet('Ada Mitchell', 'player-2', 'draft'),
    [`${GM_ITEMS}/lantern`]: LANTERN,
    [`${GM_ITEMS}/anvil`]: ANVIL,
    [`${GM_ITEMS}/cap`]: CAP,
  }
}

async function mountItems(role: Role = 'gm') {
  const Items = ruleSetItemsTabs.lubec as NonNullable<typeof ruleSetItemsTabs.lubec>
  render(<Items campaign={campaign} role={role} user={{ uid: GM } as User} username="gm" setError={vi.fn()} characters={[]} />)
  await screen.findByText('Small anvil')
}

const group = (title: string) => within(screen.getByRole('region', { name: title }))
const rowNames = (title: string) => group(title).queryAllByRole('button').filter((b) => b.classList.contains('row-item')).map((b) => b.querySelector('span:not(.thumb)')?.firstChild?.textContent)
const openRow = (name: string) => {
  fireEvent.click(screen.getAllByRole('button').find((b) => b.classList.contains('row-item') && b.textContent?.includes(name)) as HTMLElement)
  return within(screen.getByRole('article', { name }))
}
const storedItems = (characterId: string) => (((database[`${CHARACTERS}/${characterId}`].lubec as Fields).gear as Fields).items as Fields[])

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listeners = []
  clock = 10
  seed()
  mocks.setDoc.mockImplementation(async (ref: Ref, payload: Fields, options?: { merge?: boolean }) => {
    write(ref, payload, options)
    emitAll()
  })
  mocks.deleteDoc.mockImplementation(async (ref: Ref) => {
    delete database[ref.path]
    emitAll()
  })
  mocks.commitBatch.mockImplementation(async (deletes: Ref[]) => {
    deletes.forEach((ref) => { delete database[ref.path] })
    emitAll()
  })
  mocks.runTransaction.mockImplementation(transaction)
  window.innerWidth = 1440
})

afterEach(() => {
  cleanup()
})

describe('the GM Items tab', () => {
  it('shows the campaign items and the dropped items, newest first, with who dropped each and from where', async () => {
    await mountItems()

    expect(rowNames('Campaign items')).toEqual(['Brass storm lantern'])
    expect(rowNames('Dropped')).toEqual(['Wool watch cap', 'Small anvil'])
    expect(group('Dropped').getByText('Dropped by Wayne Gardner, from backpack.')).toBeTruthy()

    fireEvent.click(screen.getByRole('radio', { name: 'Dropped' }))
    expect(screen.queryByRole('region', { name: 'Campaign items' })).toBeNull()
  })

  it('opens a dropped item\'s card with Give to..., Keep as a campaign item and Delete, and a campaign item\'s with Edit', async () => {
    await mountItems()

    const anvil = openRow('Small anvil')
    expect(anvil.getByText('Thing / Dropped')).toBeTruthy()
    expect(anvil.getByText('Dropped by Wayne Gardner, from backpack.')).toBeTruthy()
    expect(anvil.getAllByRole('button').map((b) => b.textContent)).toEqual(['Give to...', 'Keep as a campaign item', 'Delete'])

    expect(openRow('Brass storm lantern').getAllByRole('button').map((b) => b.textContent)).toEqual(['Add a picture', 'Edit', 'Give to...', 'Delete'])
  })

  it('gives a dropped item to a character in play: it lands in the backpack with no Strength roll and leaves the tab', async () => {
    await mountItems()

    const card = openRow('Small anvil')
    fireEvent.click(card.getByRole('button', { name: 'Give to...' }))
    const to = card.getByRole('combobox', { name: 'Give to' })
    expect(within(to).getAllByRole('option').map((o) => o.textContent)).toEqual(['Wayne Gardner'])
    fireEvent.click(card.getByRole('button', { name: 'Give it' }))

    await waitFor(() => expect(database[`${GM_ITEMS}/anvil`]).toBeUndefined())
    expect(storedItems('wayne')).toEqual([{ id: 'anvil', kind: 'thing', name: 'Small anvil', size: 1, qty: 1, weight: 'heavy', note: '', carrier: 'backpack', pocket: 0 }])
    await waitFor(() => expect(rowNames('Dropped')).toEqual(['Wool watch cap']))
    expect(screen.getByRole('status').textContent).toBe('Gave Small anvil to Wayne Gardner. It lands on Wayne Gardner\'s sheet.')
  })

  it('gives a copy of a campaign item, which stays in the tab', async () => {
    await mountItems()

    const card = openRow('Brass storm lantern')
    fireEvent.click(card.getByRole('button', { name: 'Give to...' }))
    fireEvent.click(card.getByRole('button', { name: 'Give it' }))

    await waitFor(() => expect(storedItems('wayne')).toHaveLength(1))
    expect(storedItems('wayne')[0]).toMatchObject({ name: 'Brass storm lantern', carrier: 'backpack', pocket: 0 })
    expect(storedItems('wayne')[0].id).not.toBe('lantern')
    expect(database[`${GM_ITEMS}/lantern`]).toBeDefined()
  })

  it('keeps a refused write on the card it came from, and changes nothing', async () => {
    await mountItems()
    mocks.deleteDoc.mockRejectedValueOnce(new Error('permission-denied'))

    const card = openRow('Wool watch cap')
    fireEvent.click(card.getByRole('button', { name: 'Delete' }))
    fireEvent.click(within(card.getByText('Delete for good').parentElement as HTMLElement).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(card.getByRole('alert').textContent).toBe('Could not save that. Nothing changed.'))
    expect(database[`${GM_ITEMS}/cap`]).toBeDefined()
    expect(openRow('Small anvil').queryByRole('alert')).toBeNull()
  })

  it('refuses Give with the arrival rule\'s words when the character has no room, and keeps the item', async () => {
    const full = Array.from({ length: 5 }, (_, n) => ({ id: `b${n}`, kind: 'thing', name: `Brick ${n}`, size: 1, qty: 1, weight: 'normal', note: '', carrier: 'backpack', pocket: 0 }))
    database[`${CHARACTERS}/wayne`] = sheet('Wayne Gardner', 'player-1', 'active', [...full, { ...full[0], id: 'f1', pocket: 1 }, { ...full[0], id: 'f2', pocket: 2 }])
    await mountItems()

    const card = openRow('Small anvil')
    fireEvent.click(card.getByRole('button', { name: 'Give to...' }))
    fireEvent.click(card.getByRole('button', { name: 'Give it' }))

    await waitFor(() => expect(card.getByRole('alert').textContent).toBe('Not enough room to accept this item. Make room in your backpack or hands, then accept again.'))
    expect(database[`${GM_ITEMS}/anvil`]).toBeDefined()
  })

  it('says so when no character is in play to give an item to', async () => {
    delete database[`${CHARACTERS}/wayne`]
    await mountItems()

    const card = openRow('Small anvil')
    fireEvent.click(card.getByRole('button', { name: 'Give to...' }))

    expect(card.getByText('No finalized characters yet. An item can only arrive on a character in play.')).toBeTruthy()
    expect(card.queryByRole('button', { name: 'Give it' })).toBeNull()
  })

  it('keeps a dropped item as a campaign item, without who dropped it or where from', async () => {
    await mountItems()

    fireEvent.click(openRow('Small anvil').getByRole('button', { name: 'Keep as a campaign item' }))

    await waitFor(() => expect(rowNames('Campaign items')).toEqual(['Small anvil', 'Brass storm lantern']))
    const kept = database[`${GM_ITEMS}/anvil`]
    expect(kept).toMatchObject({ id: 'anvil', name: 'Small anvil', weight: 'heavy', status: 'library', createdAt: { seconds: 2, nanoseconds: 0 } })
    for (const field of ['droppedByCharacterId', 'droppedByCharacterName', 'droppedByUserId', 'droppedFrom', 'carrier']) expect(kept).not.toHaveProperty(field)
    expect(openRow('Small anvil').getAllByRole('button').map((b) => b.textContent)).toEqual(['Add a picture', 'Edit', 'Give to...', 'Delete'])
  })

  it('deletes an item only once asked for good', async () => {
    await mountItems()

    const card = openRow('Wool watch cap')
    fireEvent.click(card.getByRole('button', { name: 'Delete' }))
    fireEvent.click(card.getByRole('button', { name: 'Keep it' }))
    expect(mocks.deleteDoc).not.toHaveBeenCalled()

    fireEvent.click(card.getByRole('button', { name: 'Delete' }))
    expect(card.getByText('Wool watch cap leaves the game. Nobody can get it back.')).toBeTruthy()
    fireEvent.click(within(card.getByText('Delete for good').parentElement as HTMLElement).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(database[`${GM_ITEMS}/cap`]).toBeUndefined())
    expect(rowNames('Dropped')).toEqual(['Small anvil'])
    expect(screen.getByText('Pick an item to see it.')).toBeTruthy()
  })

  it('adds a campaign item through the form, which has no "where it goes"', async () => {
    await mountItems()

    fireEvent.click(screen.getByRole('button', { name: '+ Add an item' }))
    const form = within(screen.getByRole('dialog'))
    expect(form.queryByText('Put it')).toBeNull()
    fireEvent.change(form.getByRole('combobox', { name: 'Name' }), { target: { value: 'Harbor map' } })
    fireEvent.click(form.getByRole('button', { name: 'Add it' }))

    await waitFor(() => expect(rowNames('Campaign items')).toEqual(['Harbor map', 'Brass storm lantern']))
    const [path, added] = Object.entries(database).find(([, data]) => data.name === 'Harbor map') as [string, Fields]
    expect(path.startsWith(`${GM_ITEMS}/`)).toBe(true)
    expect(added).toMatchObject({ id: idOf(path), kind: 'thing', name: 'Harbor map', status: 'library' })
    expect(added).not.toHaveProperty('carrier')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('article', { name: 'Harbor map' })).toBeTruthy()
  })
})

describe('picking several dropped items', () => {
  const pick = (name: string) => screen.getByRole('checkbox', { name: `Select ${name}` }) as HTMLInputElement
  const selectAll = () => screen.getByRole('checkbox', { name: /^(Select|Deselect) all Dropped items$/ }) as HTMLInputElement
  const askDelete = (count: number) => fireEvent.click(group('Dropped').getByRole('button', { name: `Delete selected (${count})` }))
  const confirmDelete = () => fireEvent.click(within(group('Dropped').getByText('Delete for good').parentElement as HTMLElement).getByRole('button', { name: 'Delete' }))

  beforeEach(() => {
    database[`${GM_ITEMS}/rag`] = gmItem('rag', 'Oily rag', { status: 'dropped', droppedByCharacterName: 'Wayne Gardner', createdAt: { seconds: 4, nanoseconds: 0 } })
  })

  it('puts a checkbox on each dropped item and none on a campaign item', async () => {
    await mountItems()

    expect(group('Dropped').getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual(['Select all Dropped items', 'Select Oily rag', 'Select Wool watch cap', 'Select Small anvil'])
    expect(group('Campaign items').queryAllByRole('checkbox')).toEqual([])
    expect(group('Dropped').queryByRole('button', { name: /Delete selected/ })).toBeNull()
  })

  it('ticks every dropped item from the top, leaves the rest ticked when one is unticked, and untick all clears them', async () => {
    await mountItems()

    fireEvent.click(selectAll())
    expect([pick('Oily rag').checked, pick('Wool watch cap').checked, pick('Small anvil').checked]).toEqual([true, true, true])
    expect(selectAll().getAttribute('aria-label')).toBe('Deselect all Dropped items')
    expect(group('Dropped').getByRole('button', { name: 'Delete selected (3)' })).toBeTruthy()

    fireEvent.click(pick('Wool watch cap'))
    expect([pick('Oily rag').checked, pick('Wool watch cap').checked, pick('Small anvil').checked]).toEqual([true, false, true])
    expect(selectAll().checked).toBe(false)
    expect(selectAll().indeterminate).toBe(true)
    expect(selectAll().getAttribute('aria-label')).toBe('Select all Dropped items')

    fireEvent.click(selectAll())
    expect(selectAll().checked).toBe(true)
    fireEvent.click(selectAll())
    expect([pick('Oily rag').checked, pick('Wool watch cap').checked, pick('Small anvil').checked]).toEqual([false, false, false])
    expect(selectAll().indeterminate).toBe(false)
    expect(group('Dropped').queryByRole('button', { name: /Delete selected/ })).toBeNull()
  })

  it('ticking a row does not open its card', async () => {
    await mountItems()

    fireEvent.click(pick('Small anvil'))

    expect(screen.queryByRole('article')).toBeNull()
    expect(screen.getByText('Pick an item to see it.')).toBeTruthy()
  })

  it('deletes the ticked items in one batch, only once asked, and clears the selection', async () => {
    await mountItems()
    fireEvent.click(pick('Oily rag'))
    fireEvent.click(pick('Small anvil'))

    askDelete(2)
    expect(group('Dropped').getByText('2 dropped items leave the game. Nobody can get them back.')).toBeTruthy()
    fireEvent.click(group('Dropped').getByRole('button', { name: 'Keep them' }))
    expect(mocks.commitBatch).not.toHaveBeenCalled()

    askDelete(2)
    confirmDelete()

    await waitFor(() => expect(rowNames('Dropped')).toEqual(['Wool watch cap']))
    expect(mocks.commitBatch).toHaveBeenCalledTimes(1)
    expect(mocks.commitBatch.mock.calls[0][0].map((ref: Ref) => ref.path).sort()).toEqual([`${GM_ITEMS}/anvil`, `${GM_ITEMS}/rag`])
    expect(mocks.deleteDoc).not.toHaveBeenCalled()
    expect(database[`${GM_ITEMS}/lantern`]).toBeDefined()
    expect(pick('Wool watch cap').checked).toBe(false)
    expect(group('Dropped').queryByRole('button', { name: /Delete selected/ })).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('Deleted 2 dropped items.')
  })

  it('closes the open card when its item is among those deleted', async () => {
    await mountItems()
    openRow('Small anvil')
    fireEvent.click(selectAll())

    askDelete(3)
    confirmDelete()

    await waitFor(() => expect(screen.getByText('Pick an item to see it.')).toBeTruthy())
    expect(group('Dropped').getByText('Nothing dropped. What players drop lands here.')).toBeTruthy()
    expect(group('Dropped').queryAllByRole('checkbox')).toEqual([])
  })

  it('keeps every ticked item when the batch is refused, and says nothing changed', async () => {
    await mountItems()
    mocks.commitBatch.mockRejectedValueOnce(new Error('permission-denied'))
    fireEvent.click(selectAll())

    askDelete(3)
    confirmDelete()

    await waitFor(() => expect(group('Dropped').getByRole('alert').textContent).toBe('Could not delete those. Nothing changed.'))
    expect(rowNames('Dropped')).toEqual(['Oily rag', 'Wool watch cap', 'Small anvil'])
    expect(selectAll().checked).toBe(true)
  })

  it('forgets a ticked item that leaves the list, so it never comes back ticked', async () => {
    await mountItems()
    fireEvent.click(pick('Small anvil'))
    fireEvent.click(pick('Oily rag'))

    fireEvent.click(openRow('Small anvil').getByRole('button', { name: 'Keep as a campaign item' }))
    await waitFor(() => expect(group('Dropped').getByRole('button', { name: 'Delete selected (1)' })).toBeTruthy())

    database[`${GM_ITEMS}/anvil`] = ANVIL
    emitAll()
    await waitFor(() => expect(rowNames('Dropped')).toEqual(['Oily rag', 'Wool watch cap', 'Small anvil']))
    expect(pick('Small anvil').checked).toBe(false)
    expect(pick('Oily rag').checked).toBe(true)
  })
})

describe('the campaign item form', () => {
  const openAdd = () => {
    fireEvent.click(screen.getByRole('button', { name: '+ Add an item' }))
    return within(screen.getByRole('dialog'))
  }

  it('keeps the form open with the form\'s own refusal when the item has no name, and writes nothing', async () => {
    await mountItems()

    const form = openAdd()
    fireEvent.click(form.getByRole('button', { name: 'Add it' }))

    expect(form.getByRole('alert').textContent).toBeTruthy()
    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('keeps the form and what was typed when the save is refused, and says nothing changed', async () => {
    await mountItems()
    mocks.setDoc.mockRejectedValueOnce(new Error('permission-denied'))

    const form = openAdd()
    fireEvent.change(form.getByRole('combobox', { name: 'Name' }), { target: { value: 'Harbor map' } })
    fireEvent.click(form.getByRole('button', { name: 'Add it' }))

    await waitFor(() => expect(form.getByRole('alert').textContent).toBe('Could not save that. Nothing changed.'))
    expect((form.getByRole('combobox', { name: 'Name' }) as HTMLInputElement).value).toBe('Harbor map')
    expect(Object.values(database).some((data) => data.name === 'Harbor map')).toBe(false)
  })

  it('edits a campaign item in place, keeping when it was first made, and Cancel writes nothing', async () => {
    await mountItems()

    fireEvent.click(openRow('Brass storm lantern').getByRole('button', { name: 'Edit' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Back' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.setDoc).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('article', { name: 'Brass storm lantern' }).querySelector('.actions button') as HTMLElement)
    const form = within(screen.getByRole('dialog'))
    expect(form.getByText('Edit item')).toBeTruthy()
    fireEvent.click(form.getByRole('radio', { name: 'Heavy' }))
    fireEvent.click(form.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(database[`${GM_ITEMS}/lantern`]).toMatchObject({ weight: 'heavy', status: 'library', createdAt: { seconds: 1, nanoseconds: 0 } }))
    expect(screen.getByRole('status').textContent).toBe('Saved Brass storm lantern.')
  })

  it('opens the edit form with its file picker from a campaign item\'s "Add a picture", which a dropped item does not offer', async () => {
    const clicked = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
    await mountItems()

    expect(openRow('Small anvil').queryByRole('button', { name: 'Add a picture' })).toBeNull()
    fireEvent.click(openRow('Brass storm lantern').getByRole('button', { name: 'Add a picture' }))

    expect(within(screen.getByRole('dialog')).getByText('Edit item')).toBeTruthy()
    expect(clicked.mock.contexts[0]).toBe(document.getElementById(LUBEC_PIC_FILE))
    clicked.mockRestore()
  })
})

describe('the campaign item form\'s stock and supplies', () => {
  it('copies a stock item in from the picker, which offers the campaign items too, and Escape closes the form', async () => {
    await mountItems()

    fireEvent.click(screen.getByRole('button', { name: '+ Add an item' }))
    fireEvent.click(screen.getByRole('button', { name: 'Browse stock' }))
    fireEvent.click(screen.getByRole('radio', { name: 'This campaign' }))
    expect([...document.querySelectorAll('.stock-tile')].map((t) => t.textContent)).toEqual([expect.stringContaining('Brass storm lantern')])
    fireEvent.click(screen.getByRole('button', { name: 'Back to the form' }))
    fireEvent.click(screen.getByRole('button', { name: 'Browse stock' }))
    fireEvent.click([...document.querySelectorAll<HTMLElement>('.stock-tile')].find((t) => t.textContent?.includes('Coil of rope')) as HTMLElement)

    const form = within(screen.getByRole('dialog'))
    expect((form.getByRole('combobox', { name: 'Name' }) as HTMLInputElement).value).toBe('Coil of rope')
    expect(screen.getByRole('status').textContent).toBe('Coil of rope: copied in from stock.')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('makes no supply for a campaign item, which belongs to no sheet, and says to pick one the game has', async () => {
    await mountItems()

    fireEvent.click(screen.getByRole('button', { name: '+ Add an item' }))
    const form = within(screen.getByRole('dialog'))
    fireEvent.click(form.getByRole('radio', { name: /Holder/ }))
    fireEvent.change(form.getAllByRole('combobox').find((c) => c.tagName === 'SELECT' && within(c).queryByText('+ Make a supply')) as HTMLElement, { target: { value: '__make' } })
    fireEvent.change(form.getByRole('textbox', { name: 'New supply' }), { target: { value: 'Kerosene' } })
    fireEvent.click(form.getByRole('button', { name: 'Make it' }))

    expect(form.getByRole('alert').textContent).toBe('A new supply is made on a character\'s sheet. Here, pick one the game has.')
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })
})

describe('on a narrow screen', () => {
  it('shows the list, then the chosen card alone with a way back', async () => {
    window.innerWidth = 820
    await mountItems()

    openRow('Small anvil')
    expect(screen.queryByRole('region', { name: 'Dropped' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Back to the items' }))

    expect(screen.getByRole('region', { name: 'Dropped' })).toBeTruthy()
    expect(screen.queryByRole('article')).toBeNull()
  })
})

describe('the picker\'s "This campaign"', () => {
  it('offers a player the campaign items and never a dropped one', async () => {
    const LubecSheet = ruleSetSheets.lubec
    render(<LubecSheet campaign={campaign} role="player" user={{ uid: 'player-1' } as User} username="wayne" setError={vi.fn()} characterTabProps={null} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Wayne Gardner/ }))
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Character sheet pages' })).getByRole('button', { name: 'Gear' }))

    expect(mocks.listeners.some((l) => l.ref.path === GM_ITEMS && l.ref.filter?.value === 'library')).toBe(true)
    expect(mocks.listeners.some((l) => l.ref.path === GM_ITEMS && !l.ref.filter)).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '+ Add an item' }))
    fireEvent.click(screen.getByRole('button', { name: 'Browse stock' }))
    fireEvent.click(screen.getByRole('radio', { name: 'This campaign' }))

    const tiles = [...document.querySelectorAll('.stock-tile')].map((t) => t.textContent)
    expect(tiles).toHaveLength(1)
    expect(tiles[0]).toContain('Brass storm lantern')
  })
})
