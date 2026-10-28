// @vitest-environment jsdom
/**
 * The GM Items tab (spec 12.5, case 16), mounted as the shell mounts it, over
 * `firebase/firestore` stubbed with documents kept by path, so Give's
 * transaction writes the character and removes the GM item together, as
 * Firestore does. The GM sees the campaign items and what was dropped; Give
 * lands a thing by the arrival rule; Keep moves a dropped one to the campaign
 * items; Delete removes one; and a player's picker offers the campaign items,
 * never a dropped one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { User } from 'firebase/auth'
import type { Campaign, Role } from '../../../types/app'

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
const rowNames = (title: string) => group(title).queryAllByRole('button').map((b) => b.querySelector('span:not(.thumb)')?.firstChild?.textContent)
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

    expect(openRow('Brass storm lantern').getAllByRole('button').map((b) => b.textContent)).toEqual(['Edit', 'Give to...', 'Delete'])
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

  it('keeps a dropped item as a campaign item, without who dropped it or where from', async () => {
    await mountItems()

    fireEvent.click(openRow('Small anvil').getByRole('button', { name: 'Keep as a campaign item' }))

    await waitFor(() => expect(rowNames('Campaign items')).toEqual(['Small anvil', 'Brass storm lantern']))
    const kept = database[`${GM_ITEMS}/anvil`]
    expect(kept).toMatchObject({ id: 'anvil', name: 'Small anvil', weight: 'heavy', status: 'library', createdAt: { seconds: 2, nanoseconds: 0 } })
    for (const field of ['droppedByCharacterId', 'droppedByCharacterName', 'droppedByUserId', 'droppedFrom', 'carrier']) expect(kept).not.toHaveProperty(field)
    expect(openRow('Small anvil').getAllByRole('button').map((b) => b.textContent)).toEqual(['Edit', 'Give to...', 'Delete'])
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
