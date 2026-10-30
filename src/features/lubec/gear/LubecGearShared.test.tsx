// @vitest-environment jsdom
/**
 * Shared carriers (spec 12.5, case 14), through the Lubec character tab mounted
 * as the shell mounts it, over the shared character store with
 * `firebase/firestore` stubbed and documents kept by path. Each mount is one
 * member's browser; a document changed without telling the listeners is what a
 * second member's page has not heard about yet.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { User } from 'firebase/auth'
import type { Campaign, Role } from '../../../types/app'

// These cases mount large component trees and run role queries over them in jsdom (see LubecGearTab.test.tsx).
vi.setConfig({ testTimeout: 30_000 })
// A drop waits on its transaction and the snapshot after it, which on a loaded machine outlasts waitFor's 1 second default.
configure({ asyncUtilTimeout: 10_000 })

type Fields = Record<string, unknown>
type Ref = { path: string }
type Listener = { next: (snap: unknown) => void; fail: (error: unknown) => void }

const mocks = vi.hoisted(() => ({
  listeners: {} as Record<string, { next: (snap: unknown) => void; fail: (error: unknown) => void }>,
  setDoc: vi.fn(async (..._args: unknown[]) => undefined),
  runTransaction: vi.fn(),
}))

vi.mock('../../../firebase', () => ({ db: { name: 'db-stub' } }))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  // The campaign items for the stock picker are a filtered list of the collection.
  query: (ref: unknown) => ref,
  where: () => null,
  deleteDoc: vi.fn(async () => undefined),
  onSnapshot: (ref: Ref, next: Listener['next'], fail: Listener['fail']) => {
    mocks.listeners[ref.path] = { next, fail }
    if (isDocPath(ref.path)) queueMicrotask(() => next(docSnap(ref.path)))
    return () => {
      if (mocks.listeners[ref.path]?.next === next) delete mocks.listeners[ref.path]
    }
  },
  runTransaction: mocks.runTransaction,
  serverTimestamp: () => ({ sentinel: 'serverTimestamp' }),
  setDoc: mocks.setDoc,
}))
vi.mock('../../common/mediaStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../common/mediaStorage')>()),
  resolveStoragePathUrl: vi.fn(async () => null),
}))

const { ruleSetSheets } = await import('../../ruleSets/sheetComponents')

const CHARACTERS_PATH = 'groups/group-1/campaigns/campaign-1/characters'
const SHARED_PATH = 'groups/group-1/campaigns/campaign-1/sharedCarriers'
const GM_ITEMS_PATH = 'groups/group-1/campaigns/campaign-1/gmItems'
const GM = 'gm-1'

const campaign: Campaign = { id: 'campaign-1', name: 'Lubec', status: 'active', groupId: 'group-1', gmUserId: GM, system: 'lubec' }

/** Every stored document, by path. */
let database: Record<string, Fields> = {}
let clock = 0

const isDocPath = (path: string) => path.split('/').length % 2 === 0
const isMap = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value)
const isSentinel = (value: unknown) => isMap(value) && value.sentinel === 'serverTimestamp'

// The server's time on a write: later on every write, as Firestore's is.
const stamped = (payload: Fields): Fields =>
  Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, isSentinel(value) ? { seconds: ++clock, nanoseconds: 0 } : value]))

// With `{ merge: true }` maps merge field by field and anything else, lists included, replaces what was stored.
function written(stored: Fields, payload: Fields, merge: boolean): Fields {
  if (!merge) return payload
  const merged = { ...stored }
  Object.entries(payload).forEach(([key, value]) => {
    merged[key] = isMap(value) && isMap(stored[key]) && !isSentinel(value) ? written(stored[key], value, true) : value
  })
  return merged
}

function write(ref: Ref, payload: Fields, options?: { merge?: boolean }) {
  database[ref.path] = written(database[ref.path] ?? {}, stamped(payload), options?.merge === true)
}

const idOf = (path: string) => path.split('/').pop() as string

function docSnap(path: string) {
  const data = database[path]
  return { id: idOf(path), exists: () => data !== undefined, data: () => data, get: (field: string) => data?.[field], metadata: { hasPendingWrites: false } }
}

function emit(collectionPath: string) {
  const docs = Object.entries(database).filter(([path]) => path.startsWith(`${collectionPath}/`)).map(([path, data]) => ({ id: idOf(path), data: () => data }))
  mocks.listeners[collectionPath]?.next({ docs })
}

function emitCharacters() {
  emit(CHARACTERS_PATH)
  emit(SHARED_PATH)
}

// A transaction over the stubbed database: reads see what is stored, and the writes land together once it returns.
async function transaction(_db: unknown, run: (tx: unknown) => Promise<unknown>) {
  const writes: (() => void)[] = []
  const tx = {
    get: async (ref: Ref) => docSnap(ref.path),
    set: (ref: Ref, payload: Fields, options?: { merge?: boolean }) => { writes.push(() => write(ref, payload, options)) },
    delete: (ref: Ref) => { writes.push(() => { delete database[ref.path] }) },
  }
  const result = await run(tx)
  writes.forEach((w) => w())
  act(() => emitCharacters())
  return result
}

const T = (id: string, carrier: string, at: number | null, name: string, size: number, extra: Fields = {}) => ({
  id, kind: 'thing', carrier, ...(['hands', 'body'].includes(carrier) ? { slot: at } : { pocket: at }), name, size, qty: 1, weight: 'normal', note: '', ...extra,
})

const tommyEves = (gear: Fields, name = 'Tommy Eves', ownerUserId = 'player-1'): Fields => ({
  system: 'lubec',
  schemaVersion: 1,
  name,
  ownerUserId,
  ownerUsername: 'tommyev',
  creationMode: 'established',
  creationStatus: 'active',
  lubec: {
    class: { key: 'working', choices: {} },
    base: { Strength: 24, Speed: 51, Intellect: 38, Handle: 50, Charm: 48, Sanity: 20, Fear: 24, Body: 21 },
    skills: { free: 'Boatwork', picked: ['Swimming', 'Diving'] },
    gear: { items: [], carriers: [], overrides: [], supplies: [], ...gear },
  },
})

const TOMMY = `${CHARACTERS_PATH}/tommy`
const STEPHEN = `${CHARACTERS_PATH}/stephen`
const SKIFF = `${SHARED_PATH}/skiff`

function mountTab(role: Role, uid: string) {
  const LubecSheet = ruleSetSheets.lubec
  const view = render(<LubecSheet campaign={campaign} role={role} user={{ uid } as User} username="viewer1" setError={vi.fn()} characterTabProps={null} />)
  act(() => emitCharacters())
  return view
}

function openGear(name: RegExp = /^Tommy Eves/) {
  fireEvent.click(screen.getByRole('button', { name }))
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Character sheet pages' })).getByRole('button', { name: 'Gear' }))
  return document.querySelector('.lubec-gear') as HTMLElement
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listeners = {}
  database = {}
  clock = 0
  mocks.setDoc.mockReset()
  mocks.setDoc.mockImplementation(async (...args: unknown[]) => {
    const [ref, payload, options] = args as [Ref, Fields, { merge?: boolean } | undefined]
    write(ref, payload, options)
    return undefined
  })
  mocks.runTransaction.mockImplementation(transaction)
  window.innerWidth = 1024
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const pocket = (name: string, slots: number, max: number) => ({ name, slots, max })
const skiff = (items: Fields[] = [], extra: Fields = {}) => ({
  name: 'Skiff', type: 'skiff', pockets: [pocket('Hull', 2, 2), pocket('Bow locker', 1, 1)], ownerCharacterId: 'tommy', items, updatedAt: { seconds: 0, nanoseconds: 0 }, ...extra,
})

const FLASHLIGHT = T('flashlight', 'backpack', 0, 'Flashlight', 1, { cells: [0] })
const ROPE = T('rope', 'skiff', 0, 'Rope', 1)

const party = (shared: Fields | null, tommy: Fields = {}, stephen: Fields = {}) => {
  database = { [TOMMY]: tommyEves(tommy), [STEPHEN]: tommyEves(stephen, 'Stephen Moody', 'player-2'), ...(shared ? { [SKIFF]: shared } : {}) }
}

const STEPHEN_NAME = /^Stephen Moody/

const openCarriers = () => fireEvent.click(screen.getByRole('tab', { name: 'Carriers' }))
const cardOf = (name: string) => [...document.querySelectorAll<HTMLElement>('.carrier-card')].find((c) => c.querySelector('h3')?.textContent === name) as HTMLElement
const pocketOf = (name: string) => [...document.querySelectorAll<HTMLElement>('.pocket-section')].find((s) => s.querySelector('h3')?.textContent === name) as HTMLElement
const dialog = (name: string) => within(screen.getByRole('dialog', { name }))
const toastText = () => screen.getByRole('status').textContent
const slotOf = (name: string) => [...document.querySelectorAll<HTMLElement>('.lubec-gear .slot.item')].find((el) => el.textContent?.includes(name)) as HTMLElement
const storedItems = (path: string) => database[path].items as Fields[]
const gearOf = (path: string) => (database[path].lubec as Fields).gear as Fields
const itemIds = (items: unknown) => (items as Fields[]).map((i) => i.id)
const moveTo = (name: string, value: string) => {
  const card = dialog(name)
  fireEvent.click(card.getByRole('button', { name: 'Move' }))
  fireEvent.change(card.getByRole('combobox', { name: 'Move to' }), { target: { value } })
  fireEvent.click(card.getByRole('button', { name: 'Move it' }))
}
const openSkiff = () => {
  openCarriers()
  fireEvent.click(cardOf('Skiff'))
}
const optionGroups = (select: HTMLElement) => [...select.querySelectorAll('optgroup')].map((g) => g.label)

describe('the Carriers list', () => {
  it('shows every member the shared carrier, tagged and labelled with its owner character, and writes nothing for looking', () => {
    vi.useFakeTimers()
    party(skiff([ROPE]))
    mountTab('player', 'player-2')
    openGear(STEPHEN_NAME)
    openCarriers()

    const card = cardOf('Skiff')
    expect(card.querySelector('.tag.blue')?.textContent).toBe('Shared')
    expect(card.querySelector('.type')?.textContent).toBe('Boat or skiff')
    expect(card.querySelector('.count')?.textContent).toBe('1 of 3 used')
    expect(card.querySelector('.facts')?.textContent).toBe('PocketsHull 2 (up to 2); Bow locker 1 (up to 1)OwnerTommy EvesAccessThe whole groupKnownKnown to all')
    expect(card.querySelector('.owner-line')?.textContent).toBe('Tommy Eves')
    act(() => vi.advanceTimersByTime(2000))
    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(mocks.runTransaction).not.toHaveBeenCalled()
  })

  it('shows another player\'s sheet read-only: they see the carrier and what is in it, with no button', () => {
    party(skiff([ROPE]))
    mountTab('player', 'player-2')
    openGear()
    openSkiff()

    expect(pocketOf('Hull').textContent).toContain('Rope')
    expect(screen.queryByRole('button', { name: '+ Put something in' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Change it' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Rope' })).toBeNull()
  })

  it('labels a carrier whose owner the player cannot see, and shows no red box: it is on nobody\'s body', () => {
    party(skiff([], { ownerCharacterId: 'gm-owned' }))
    mountTab('player', 'player-2')
    openGear(STEPHEN_NAME)
    openSkiff()

    expect(document.querySelector('.owner-line')?.textContent).toBe('Someone at the table')
    expect(document.querySelector('.dispensation-box')).toBeNull()
  })

  it('never affects Speed: a full carrier shows no tag on the sheet', () => {
    party(skiff([T('anvil', 'skiff', 0, 'Anvil', 2, { weight: 'heavy' }), T('tin', 'skiff', 1, 'Tin', 1)]))
    mountTab('player', 'player-1')
    openGear()
    openCarriers()

    expect(cardOf('Skiff').querySelector('.count')?.textContent).toBe('3 of 3 used')
    expect(screen.queryByText(/Full inventory/)).toBeNull()
  })
})

describe('moves between a sheet and a shared carrier', () => {
  it('lets a member who is not the owner put a thing in and take one out', async () => {
    party(skiff([ROPE]), {}, { items: [{ ...FLASHLIGHT }] })
    mountTab('player', 'player-2')
    openGear(STEPHEN_NAME)

    fireEvent.click(slotOf('Flashlight'))
    const list = dialog('Flashlight')
    fireEvent.click(list.getByRole('button', { name: 'Move' }))
    expect(optionGroups(list.getByRole('combobox', { name: 'Move to' }))).toEqual(['On you', 'Shared carriers', 'Elsewhere'])
    fireEvent.click(list.getByRole('button', { name: 'Move' }))
    moveTo('Flashlight', 'shared:skiff#1')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    expect(itemIds(gearOf(STEPHEN).items)).toEqual([])
    expect(storedItems(SKIFF).map((i) => [i.id, i.carrier, i.pocket])).toEqual([['rope', 'skiff', 0], ['flashlight', 'skiff', 1]])
    expect(toastText()).toBe('Flashlight: Skiff, bow locker.')

    openSkiff()
    fireEvent.click(within(pocketOf('Hull')).getByRole('button', { name: /Rope/ }))
    fireEvent.click(dialog('Rope').getByRole('button', { name: 'Move' }))
    expect(optionGroups(dialog('Rope').getByRole('combobox', { name: 'Move to' }))).toEqual(['On you', 'Shared carriers', 'Elsewhere'])
    fireEvent.click(dialog('Rope').getByRole('button', { name: 'Move' }))
    moveTo('Rope', 'sheet:backpack#0')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    expect(itemIds(storedItems(SKIFF))).toEqual(['flashlight'])
    expect(gearOf(STEPHEN).items).toMatchObject([{ id: 'rope', carrier: 'backpack', pocket: 0 }])
    expect(toastText()).toBe('Rope: Backpack, main pocket.')
  })

  it('refuses a second member\'s stale move, and nothing changes', async () => {
    party(skiff([ROPE]))
    mountTab('player', 'player-2')
    openGear(STEPHEN_NAME)
    openSkiff()
    fireEvent.click(within(pocketOf('Hull')).getByRole('button', { name: /Rope/ }))
    const after = skiff([{ ...ROPE, pocket: 1 }])
    database[SKIFF] = after

    moveTo('Rope', 'sheet:backpack#0')

    await waitFor(() => expect(toastText()).toBe('Someone moved that first. Nothing changed.'))
    expect(database[SKIFF]).toEqual(after)
    expect(itemIds(gearOf(STEPHEN).items)).toEqual([])
  })

  it('says a stale move on the page, where it outlasts the card of the thing that left', async () => {
    party(skiff([ROPE]))
    mountTab('player', 'player-2')
    openGear(STEPHEN_NAME)
    openSkiff()
    fireEvent.click(within(pocketOf('Hull')).getByRole('button', { name: /Rope/ }))
    database[SKIFF] = skiff([])

    moveTo('Rope', 'sheet:backpack#0')
    await waitFor(() => expect(toastText()).toBe('Someone moved that first. Nothing changed.'))
    act(() => emit(SHARED_PATH))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(toastText()).toBe('Someone moved that first. Nothing changed.')
  })

  it('says a stale drop on the page too, and nothing goes to the GM', async () => {
    party(skiff([ROPE]))
    mountTab('player', 'player-2')
    openGear(STEPHEN_NAME)
    openSkiff()
    fireEvent.click(within(pocketOf('Hull')).getByRole('button', { name: /Rope/ }))
    database[SKIFF] = skiff([])

    fireEvent.click(dialog('Rope').getByRole('button', { name: 'Drop' }))

    await waitFor(() => expect(toastText()).toBe('Someone moved that first. Nothing changed.'))
    expect(database[`${GM_ITEMS_PATH}/rope`]).toBeUndefined()
  })

  it('refuses a thing the carrier has no room for by the real contents', async () => {
    party(skiff([ROPE]), {}, { items: [{ ...FLASHLIGHT }] })
    mountTab('player', 'player-2')
    openGear(STEPHEN_NAME)
    fireEvent.click(slotOf('Flashlight'))
    database[SKIFF] = skiff([ROPE, T('oar', 'skiff', 1, 'Oar', 1)])

    moveTo('Flashlight', 'shared:skiff#1')

    expect((await dialog('Flashlight').findByRole('alert')).textContent).toContain('Bow locker')
    expect(itemIds(gearOf(STEPHEN).items)).toEqual(['flashlight'])
  })

  it('moves a thing to another pocket of the carrier, and to another shared carrier', async () => {
    party(skiff([ROPE]))
    database[`${SHARED_PATH}/shed`] = skiff([], { name: 'Shed', type: 'shed', ownerCharacterId: 'stephen' })
    mountTab('player', 'player-2')
    openGear(STEPHEN_NAME)
    openSkiff()

    fireEvent.click(within(pocketOf('Hull')).getByRole('button', { name: /Rope/ }))
    moveTo('Rope', 'skiff#1')
    await waitFor(() => expect(storedItems(SKIFF)).toMatchObject([{ id: 'rope', pocket: 1 }]))
    await waitFor(() => expect(within(pocketOf('Bow locker')).getByRole('button', { name: /Rope/ })).toBeTruthy())

    fireEvent.click(within(pocketOf('Bow locker')).getByRole('button', { name: /Rope/ }))
    moveTo('Rope', 'shared:shed#0')
    await waitFor(() => expect(storedItems(SKIFF)).toEqual([]))
    expect(storedItems(`${SHARED_PATH}/shed`)).toMatchObject([{ id: 'rope', carrier: 'shed', pocket: 0 }])
  })

  it('drops a thing from the carrier to the GM Items tab, named for the sheet it was dropped from', async () => {
    party(skiff([ROPE]))
    mountTab('player', 'player-2')
    openGear(STEPHEN_NAME)
    openSkiff()
    fireEvent.click(within(pocketOf('Hull')).getByRole('button', { name: /Rope/ }))
    fireEvent.click(dialog('Rope').getByRole('button', { name: 'Drop' }))

    await waitFor(() => expect(storedItems(SKIFF)).toEqual([]))
    expect(database[`${GM_ITEMS_PATH}/rope`]).toMatchObject({ status: 'dropped', droppedFrom: 'Skiff', droppedByCharacterName: 'Stephen Moody', droppedByUserId: 'player-2' })
    expect(toastText()).toBe('Dropped the rope. It goes to the GM.')
  })

  it('gives a thing from the sheet, not from inside a shared carrier', () => {
    party(skiff([ROPE]), {}, { items: [{ ...FLASHLIGHT }] })
    mountTab('player', 'player-2')
    openGear(STEPHEN_NAME)
    fireEvent.click(slotOf('Flashlight'))
    expect(dialog('Flashlight').getByRole('button', { name: 'Give' })).toBeTruthy()
    fireEvent.click(dialog('Flashlight').getByRole('button', { name: 'Close' }))

    openSkiff()
    fireEvent.click(within(pocketOf('Hull')).getByRole('button', { name: /Rope/ }))

    expect(dialog('Rope').queryByRole('button', { name: 'Give' })).toBeNull()
  })

  it('closes a card whose thing another member took', async () => {
    party(skiff([ROPE]))
    mountTab('player', 'player-2')
    openGear(STEPHEN_NAME)
    openSkiff()
    fireEvent.click(within(pocketOf('Hull')).getByRole('button', { name: /Rope/ }))

    database[SKIFF] = skiff([])
    act(() => emit(SHARED_PATH))

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('things in the carrier\'s own record', () => {
  it('adds a thing through the same form, offering only the carrier\'s pockets, in one record', async () => {
    party(skiff())
    mountTab('player', 'player-2')
    openGear(STEPHEN_NAME)
    openSkiff()

    fireEvent.click(within(pocketOf('Bow locker')).getByRole('button', { name: '+ Put something in' }))
    const form = dialog('Add an item')
    expect(optionGroups(form.getByRole('combobox', { name: 'Put it' }))).toEqual(['Carriers'])
    fireEvent.change(form.getByRole('combobox', { name: 'Name' }), { target: { value: 'Tin' } })
    fireEvent.click(form.getByRole('button', { name: 'Add it' }))

    await waitFor(() => expect(storedItems(SKIFF)).toMatchObject([{ name: 'Tin', carrier: 'skiff', pocket: 1 }]))
    expect(mocks.setDoc).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Carriers' }).getAttribute('aria-selected')).toBe('true'))
    expect(document.querySelector('.lubec-gear')?.getAttribute('aria-busy')).toBe('false')
  })

  it('"+ Add an item" adds to the open carrier, not the backpack', () => {
    party(skiff())
    mountTab('player', 'player-2')
    openGear(STEPHEN_NAME)
    openSkiff()

    fireEvent.click(screen.getByRole('button', { name: '+ Add an item' }))
    expect((dialog('Add an item').getByRole('combobox', { name: 'Put it' }) as HTMLSelectElement).value).toBe('skiff#0')
  })

  it('refuses an edit the page made from an old copy, in the toast', async () => {
    party(skiff([T('tins', 'skiff', 0, 'Tins', 1, { qty: 3, kind: 'consumable' })]))
    mountTab('player', 'player-2')
    openGear(STEPHEN_NAME)
    openSkiff()
    fireEvent.click(within(pocketOf('Hull')).getByRole('button', { name: /Tins/ }))
    const after = skiff([T('tins', 'skiff', 0, 'Tins', 1, { qty: 1, kind: 'consumable' })])
    database[SKIFF] = after

    fireEvent.click(dialog('Tins').getByRole('button', { name: 'Use one' }))

    await waitFor(() => expect(toastText()).toBe('Someone moved that first. Nothing changed.'))
    expect(database[SKIFF]).toEqual(after)
  })

  it('saves a change of count, and a page that has heard of it takes the next one', async () => {
    party(skiff([T('tins', 'skiff', 0, 'Tins', 1, { qty: 3, kind: 'consumable' })]))
    mountTab('player', 'player-2')
    openGear(STEPHEN_NAME)
    openSkiff()
    fireEvent.click(within(pocketOf('Hull')).getByRole('button', { name: /Tins/ }))

    fireEvent.click(dialog('Tins').getByRole('button', { name: 'Use one' }))
    await waitFor(() => expect(storedItems(SKIFF)[0].qty).toBe(2))
    await waitFor(() => expect(document.querySelector('.lubec-gear')?.getAttribute('aria-busy')).toBe('false'))
    fireEvent.click(dialog('Tins').getByRole('button', { name: 'Use one' }))
    await waitFor(() => expect(storedItems(SKIFF)[0].qty).toBe(1))
  })
})

describe('adding a shared carrier', () => {
  it('offers a player the kind choice and only their own characters as owner', async () => {
    party(null)
    database[`${CHARACTERS_PATH}/second`] = tommyEves({}, 'Second Stephen', 'player-2')
    mountTab('player', 'player-2')
    openGear(STEPHEN_NAME)
    openCarriers()
    fireEvent.click(screen.getByRole('button', { name: '+ New carrier' }))
    const form = dialog('Add a carrier')
    expect(form.queryByRole('combobox', { name: 'Owner' })).toBeNull()

    fireEvent.click(form.getByRole('radio', { name: /Shared with the table/ }))
    const owner = form.getByRole('combobox', { name: 'Owner' }) as HTMLSelectElement
    expect(owner.value).toBe('stephen')
    expect([...owner.options].map((o) => o.textContent)).toEqual(['Stephen Moody', 'Second Stephen'])
    fireEvent.change(form.getByRole('combobox', { name: 'What is it?' }), { target: { value: 'skiff' } })
    expect(form.getByRole('radio', { name: /Shared with the table/ })).toHaveProperty('checked', true)
    fireEvent.click(form.getByRole('button', { name: 'Add carrier' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const [path] = Object.keys(database).filter((p) => p.startsWith(`${SHARED_PATH}/`))
    expect(database[path]).toMatchObject({ name: 'Skiff', type: 'skiff', ownerCharacterId: 'stephen', items: [] })
    expect(gearOf(STEPHEN).carriers).toEqual([])
    expect(toastText()).toBe('Skiff is shared with the table.')
  })

  it('offers the GM every character as owner', () => {
    party(null)
    mountTab('gm', GM)
    openGear()
    openCarriers()
    fireEvent.click(screen.getByRole('button', { name: '+ New carrier' }))
    const form = dialog('Add a carrier')
    fireEvent.click(form.getByRole('radio', { name: /Shared with the table/ }))

    expect([...(form.getByRole('combobox', { name: 'Owner' }) as HTMLSelectElement).options].map((o) => o.textContent).sort()).toEqual(['Stephen Moody', 'Tommy Eves'])
  })

  it('keeps a personal carrier on the character, and refuses a shared one with no name', async () => {
    party(null)
    mountTab('player', 'player-1')
    openGear()
    openCarriers()
    fireEvent.click(screen.getByRole('button', { name: '+ New carrier' }))
    const form = dialog('Add a carrier')
    fireEvent.click(form.getByRole('radio', { name: /Shared with the table/ }))
    fireEvent.change(form.getByRole('combobox', { name: 'What is it?' }), { target: { value: 'other' } })
    fireEvent.click(form.getByRole('button', { name: 'Add carrier' }))
    expect((await form.findByRole('alert')).textContent).toBe('Give it a name.')
    expect(Object.keys(database).filter((p) => p.startsWith(`${SHARED_PATH}/`))).toEqual([])

    fireEvent.change(form.getByRole('textbox', { name: 'Name' }), { target: { value: 'Crate' } })
    fireEvent.click(form.getByRole('radio', { name: /Just this character/ }))
    fireEvent.click(form.getByRole('button', { name: 'Add carrier' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(toastText()).toBe('Crate added to your carriers.')
    expect(Object.keys(database).filter((p) => p.startsWith(`${SHARED_PATH}/`))).toEqual([])
  })

  it('says so when Firestore refuses the new carrier', async () => {
    party(null)
    mocks.setDoc.mockRejectedValueOnce(new Error('denied'))
    mountTab('player', 'player-1')
    openGear()
    openCarriers()
    fireEvent.click(screen.getByRole('button', { name: '+ New carrier' }))
    const form = dialog('Add a carrier')
    fireEvent.click(form.getByRole('radio', { name: /Shared with the table/ }))
    fireEvent.click(form.getByRole('button', { name: 'Add carrier' }))

    expect((await form.findByRole('alert')).textContent).toBe('Could not save that. Nothing changed.')
  })
})

describe('the owner\'s player and the GM change the carrier', () => {
  it('lets the owner\'s player rename it and change its pockets, and a member cannot', async () => {
    party(skiff())
    mountTab('player', 'player-2')
    openGear(STEPHEN_NAME)
    openSkiff()
    expect(screen.queryByRole('button', { name: 'Change it' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete it' })).toBeNull()
    cleanup()

    mountTab('player', 'player-1')
    openGear()
    openSkiff()
    fireEvent.click(screen.getByRole('button', { name: 'Change it' }))
    const form = dialog('Change Skiff')
    fireEvent.change(form.getByRole('textbox', { name: 'Name' }), { target: { value: 'Dory' } })
    fireEvent.change(form.getAllByRole('spinbutton', { name: 'Slots' })[0], { target: { value: '6' } })
    fireEvent.click(form.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(database[SKIFF]).toMatchObject({ name: 'Dory', pockets: [pocket('Hull', 6, 2), pocket('Bow locker', 1, 1)] })
  })

  it('refuses a change that would leave a thing without a place, and the dialog says why', async () => {
    party(skiff([T('tin', 'skiff', 1, 'Tin', 1)]))
    mountTab('gm', GM)
    openGear()
    openSkiff()
    fireEvent.click(screen.getByRole('button', { name: 'Change it' }))
    const form = dialog('Change Skiff')
    fireEvent.click(form.getAllByRole('button', { name: 'Remove this pocket' })[1])
    fireEvent.click(form.getByRole('button', { name: 'Save' }))

    expect((await form.findByRole('alert')).textContent).toBe("Tin wouldn't fit. Take it out first.")
    expect(database[SKIFF]).toMatchObject({ pockets: [pocket('Hull', 2, 2), pocket('Bow locker', 1, 1)] })
  })

  it('asks before deleting a carrier with things inside, and sends them to the GM Items tab as dropped', async () => {
    party(skiff([ROPE]))
    mountTab('player', 'player-1')
    openGear()
    openSkiff()
    fireEvent.click(screen.getByRole('button', { name: 'Delete it' }))
    const prompt = dialog('Delete Skiff?')
    expect(prompt.getByText("1 thing in it will go to the GM's Items tab as dropped.")).toBeTruthy()

    fireEvent.click(prompt.getByRole('button', { name: 'Cancel' }))
    expect(database[SKIFF]).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Delete it' }))
    fireEvent.click(dialog('Delete Skiff?').getByRole('button', { name: 'Delete it' }))
    await waitFor(() => expect(database[SKIFF]).toBeUndefined())

    expect(database[`${GM_ITEMS_PATH}/rope`]).toMatchObject({ status: 'dropped', droppedFrom: 'Skiff', droppedByUserId: 'player-1' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Carriers' })).toBeTruthy())
    expect(toastText()).toBe('Skiff deleted.')
  })

  it('deletes an empty carrier at once, and says so when Firestore refuses', async () => {
    party(skiff())
    mountTab('gm', GM)
    openGear()
    openSkiff()
    mocks.runTransaction.mockRejectedValueOnce(new Error('denied'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete it' }))
    await waitFor(() => expect(toastText()).toBe('Could not delete Skiff. Nothing changed.'))
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Delete it' }))
    await waitFor(() => expect(database[SKIFF]).toBeUndefined())
    await waitFor(() => expect(toastText()).toBe('Skiff deleted.'))
  })

  it('shows a refused delete on its prompt, which stays open', async () => {
    party(skiff([ROPE]))
    mountTab('gm', GM)
    openGear()
    openSkiff()
    fireEvent.click(screen.getByRole('button', { name: 'Delete it' }))
    mocks.runTransaction.mockRejectedValueOnce(new Error('denied'))
    const prompt = dialog('Delete Skiff?')
    fireEvent.click(prompt.getByRole('button', { name: 'Delete it' }))

    expect((await prompt.findByRole('alert')).textContent).toBe('Could not delete Skiff. Nothing changed.')
    expect(database[SKIFF]).toBeDefined()
  })
})
