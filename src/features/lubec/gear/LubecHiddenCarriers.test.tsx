// @vitest-environment jsdom
/**
 * Hidden carriers (spec 12.5, test 15), through the Lubec character tab mounted
 * as the shell mounts it, over the shared character store with
 * `firebase/firestore` stubbed and documents kept by path. Every subscription is
 * logged, because the secrecy here is that another member's page never asks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { User } from 'firebase/auth'
import type { Campaign, Role } from '../../../types/app'

// These cases mount large component trees and run role queries over them in jsdom (see LubecGearTab.test.tsx).
vi.setConfig({ testTimeout: 30_000 })
configure({ asyncUtilTimeout: 10_000 })

type Fields = Record<string, unknown>
type Ref = { path: string }
type Listener = { next: (snap: unknown) => void; fail: (error: unknown) => void }

const mocks = vi.hoisted(() => ({
  listeners: {} as Record<string, { next: (snap: unknown) => void; fail: (error: unknown) => void }>,
  subscribed: [] as string[],
  setDoc: vi.fn(async (..._args: unknown[]) => undefined),
  getDocs: vi.fn(),
  deleteDoc: vi.fn(),
  runTransaction: vi.fn(),
}))

vi.mock('../../../firebase', () => ({ db: { name: 'db-stub' } }))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  query: (ref: unknown) => ref,
  where: () => null,
  deleteDoc: mocks.deleteDoc,
  getDocs: mocks.getDocs,
  onSnapshot: (ref: Ref, next: Listener['next'], fail: Listener['fail']) => {
    mocks.subscribed.push(ref.path)
    mocks.listeners[ref.path] = { next, fail }
    if (isDocPath(ref.path)) queueMicrotask(() => next(docSnap(ref.path)))
    else if (ref.path.endsWith('/hiddenCarriers')) queueMicrotask(() => next(listSnap(ref.path)))
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

const CAMPAIGN_PATH = 'groups/group-1/campaigns/campaign-1'
const CHARACTERS_PATH = `${CAMPAIGN_PATH}/characters`
const TOMMY = `${CHARACTERS_PATH}/tommy`
const HIDDEN_PATH = `${TOMMY}/hiddenCarriers`
const GM = 'gm-1'
const OWNER = 'player-1'
const OTHER = 'player-2'

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
  return { id: idOf(path), ref: { path }, exists: () => data !== undefined, data: () => data, get: (field: string) => data?.[field], metadata: { hasPendingWrites: false } }
}

const childrenOf = (path: string) => Object.keys(database).filter((p) => p.startsWith(`${path}/`) && p.split('/').length === path.split('/').length + 1)

function listSnap(path: string) {
  return { docs: childrenOf(path).map((p) => ({ ...docSnap(p), data: () => database[p] })) }
}

function emit() {
  Object.keys(mocks.listeners).filter((path) => !isDocPath(path) && path !== `${CAMPAIGN_PATH}/gmItems`).forEach((path) => mocks.listeners[path]?.next(listSnap(path)))
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
  act(() => emit())
  return result
}

const T = (id: string, carrier: string, at: number | null, name: string, extra: Fields = {}) => ({
  id, kind: 'thing', carrier, ...(['hands', 'body'].includes(carrier) ? { slot: at } : { pocket: at }), name, size: 1, qty: 1, weight: 'normal', note: '', ...extra,
})

const tommyEves = (gear: Fields): Fields => ({
  system: 'lubec',
  schemaVersion: 1,
  name: 'Tommy Eves',
  ownerUserId: OWNER,
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

const STASH = { name: 'Cigar box', type: 'stash', pockets: [{ name: 'Box', slots: 2, max: 1 }], items: [T('letter', 'stash', 0, 'Burnt letter')] }

function mountTab(role: Role, uid: string) {
  const LubecSheet = ruleSetSheets.lubec
  const view = render(<LubecSheet campaign={campaign} role={role} user={{ uid } as User} username="viewer1" setError={vi.fn()} characterTabProps={null} />)
  act(() => emit())
  return view
}

async function openGear() {
  fireEvent.click(screen.getByRole('button', { name: /^Tommy Eves/ }))
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Character sheet pages' })).getByRole('button', { name: 'Gear' }))
  await act(async () => {})
}

async function openCarriers(role: Role, uid: string) {
  mountTab(role, uid)
  await openGear()
  fireEvent.click(screen.getByRole('tab', { name: 'Carriers' }))
}

const cardOf = (name: string) => [...document.querySelectorAll<HTMLElement>('.carrier-card')].find((c) => c.querySelector('h3')?.textContent === name)
const dialog = (name: string) => within(screen.getByRole('dialog', { name }))
const toastText = () => screen.getByRole('status').textContent
const storedGear = () => (database[TOMMY].lubec as Fields).gear as Fields
const stashItems = () => database[`${HIDDEN_PATH}/stash`].items as Fields[]

async function openStashItem(name: string) {
  fireEvent.click(cardOf('Cigar box') as HTMLElement)
  fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }))
  return dialog(name)
}

const moveTo = (card: ReturnType<typeof within>, value: string) => {
  fireEvent.click(card.getByRole('button', { name: 'Move' }))
  fireEvent.change(card.getByRole('combobox', { name: 'Move to' }), { target: { value } })
  fireEvent.click(card.getByRole('button', { name: 'Move it' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listeners = {}
  mocks.subscribed = []
  database = {}
  clock = 0
  mocks.setDoc.mockImplementation(async (...args: unknown[]) => {
    const [ref, payload, options] = args as [Ref, Fields, { merge?: boolean } | undefined]
    write(ref, payload, options)
    act(() => emit())
    return undefined
  })
  mocks.getDocs.mockImplementation(async (ref: Ref) => listSnap(ref.path))
  mocks.runTransaction.mockImplementation(transaction)
  window.innerWidth = 1024
})

afterEach(() => cleanup())

describe('who sees a hidden carrier', () => {
  beforeEach(() => {
    database = { [TOMMY]: tommyEves({}), [`${HIDDEN_PATH}/stash`]: STASH }
  })

  it('shows it to the owner, tagged hidden, saying no more than who can see it', async () => {
    await openCarriers('player', OWNER)

    const card = cardOf('Cigar box') as HTMLElement
    expect(card.querySelector('.tag.ghost')?.textContent).toBe('Hidden')
    expect(card.querySelector('.type')?.textContent).toBe('Hidden stash box')
    expect(card.querySelector('.count')?.textContent).toBe('1 of 2 used')
    expect(card.querySelector('.facts')?.textContent).toBe('PocketsBox 2 (up to 1)OwnerTommy EvesAccessTommy Eves and the GMKnownOnly you and the GM can see this')
    expect(mocks.subscribed).toContain(HIDDEN_PATH)
  })

  it('shows it to the GM on the player\'s sheet, and the GM can open it', async () => {
    await openCarriers('gm', GM)

    fireEvent.click(cardOf('Cigar box') as HTMLElement)
    expect(screen.getByRole('heading', { name: 'Cigar box' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Burnt letter/ })).toBeTruthy()
    expect(screen.queryByText('Requires special dispensation')).toBeNull()
  })

  it('leaves another member no trace of it, and their page never subscribes', async () => {
    await openCarriers('player', OTHER)

    expect(mocks.subscribed.filter((path) => path.includes('hiddenCarriers'))).toEqual([])
    expect(cardOf('Cigar box')).toBeUndefined()
    expect(document.querySelectorAll('.carrier-card')).toHaveLength(1)
    const page = document.querySelector('.lubec-gear') as HTMLElement
    expect(page.textContent).not.toMatch(/hidden|cigar|letter/i)
    expect(document.querySelector('.tag.ghost')?.textContent).toBe('Known to all')
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('does not subscribe until the Gear page is open', async () => {
    mountTab('player', OWNER)
    fireEvent.click(screen.getByRole('button', { name: /^Tommy Eves/ }))
    await act(async () => {})

    expect(mocks.subscribed).not.toContain(HIDDEN_PATH)
  })

  it('reads a refused listen as nothing to see, as when the character has just been given away', async () => {
    await openCarriers('player', OWNER)
    expect(cardOf('Cigar box')).toBeDefined()

    act(() => mocks.listeners[HIDDEN_PATH].fail(new Error('permission-denied')))

    expect(cardOf('Cigar box')).toBeUndefined()
  })

  it('follows the character to its new owner, and leaves the old one', async () => {
    const view = mountTab('player', OWNER)
    await openGear()
    expect(mocks.listeners[HIDDEN_PATH]).toBeDefined()

    database[TOMMY] = { ...database[TOMMY], ownerUserId: OTHER }
    act(() => emit())
    await act(async () => {})
    expect(mocks.listeners[HIDDEN_PATH]).toBeUndefined()
    view.unmount()

    mocks.subscribed = []
    await openCarriers('player', OTHER)
    expect(mocks.subscribed).toContain(HIDDEN_PATH)
    expect(cardOf('Cigar box')).toBeDefined()
  })
})

describe('adding a hidden carrier', () => {
  beforeEach(() => {
    database = { [TOMMY]: tommyEves({}) }
  })

  const hiddenChoice = (form: ReturnType<typeof dialog>) => form.getByRole('radio', { name: /^Hidden/ }) as HTMLInputElement
  const knownChoice = (form: ReturnType<typeof dialog>) => form.getByRole('radio', { name: /^Known to all/ }) as HTMLInputElement

  it('offers Hidden first for the stash preset, and known to all for the rest', async () => {
    await openCarriers('player', OWNER)
    fireEvent.click(screen.getByRole('button', { name: '+ New carrier' }))
    const form = dialog('Add a carrier')

    expect(knownChoice(form).checked).toBe(true)
    expect(form.getByText('Only you and the GM can see this')).toBeTruthy()
    fireEvent.change(form.getByRole('combobox', { name: 'What is it?' }), { target: { value: 'stash' } })
    expect(hiddenChoice(form).checked).toBe(true)
    fireEvent.change(form.getByRole('combobox', { name: 'What is it?' }), { target: { value: 'duffel' } })
    expect(knownChoice(form).checked).toBe(true)
  })

  it('keeps a hidden carrier in its own record, with nothing on the character', async () => {
    vi.useFakeTimers()
    await openCarriers('player', OWNER)
    fireEvent.click(screen.getByRole('button', { name: '+ New carrier' }))
    const form = dialog('Add a carrier')
    fireEvent.change(form.getByRole('combobox', { name: 'What is it?' }), { target: { value: 'stash' } })
    fireEvent.click(form.getByRole('button', { name: 'Add carrier' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    vi.useRealTimers()

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(toastText()).toBe('Stash box added to your carriers.')
    const paths = Object.keys(database).filter((p) => p.startsWith(`${HIDDEN_PATH}/`))
    expect(paths).toHaveLength(1)
    expect(database[paths[0]]).toMatchObject({ name: 'Stash box', type: 'stash', pockets: [{ name: 'Box', slots: 2, max: 1 }], items: [] })
    expect(database[paths[0]]).not.toHaveProperty('ownerUserId')
    expect(storedGear().carriers).toEqual([])
    expect(cardOf('Stash box')?.querySelector('.tag.ghost')?.textContent).toBe('Hidden')
  })

  it('keeps a carrier that stays known on the character, as before', async () => {
    vi.useFakeTimers()
    await openCarriers('player', OWNER)
    fireEvent.click(screen.getByRole('button', { name: '+ New carrier' }))
    const form = dialog('Add a carrier')
    fireEvent.change(form.getByRole('combobox', { name: 'What is it?' }), { target: { value: 'stash' } })
    fireEvent.click(knownChoice(form))
    fireEvent.click(form.getByRole('button', { name: 'Add carrier' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    vi.useRealTimers()

    expect(storedGear().carriers).toMatchObject([{ name: 'Stash box' }])
    expect(Object.keys(database).filter((p) => p.startsWith(`${HIDDEN_PATH}/`))).toEqual([])
  })

  it('says so when the write is refused', async () => {
    mocks.setDoc.mockRejectedValueOnce(new Error('denied'))
    await openCarriers('player', OWNER)
    fireEvent.click(screen.getByRole('button', { name: '+ New carrier' }))
    const form = dialog('Add a carrier')
    fireEvent.change(form.getByRole('combobox', { name: 'What is it?' }), { target: { value: 'stash' } })
    fireEvent.click(form.getByRole('button', { name: 'Add carrier' }))

    await waitFor(() => expect(toastText()).toBe('Could not add Stash box. Nothing changed.'))
  })
})

describe('inside a hidden carrier', () => {
  beforeEach(() => {
    database = { [TOMMY]: tommyEves({ items: [T('cap', 'backpack', 0, 'Wool watch cap')] }), [`${HIDDEN_PATH}/stash`]: STASH }
  })

  it('adds a thing to the carrier\'s record, with no "Put it" that could send it elsewhere', async () => {
    await openCarriers('player', OWNER)
    fireEvent.click(cardOf('Cigar box') as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: '+ Put something in' }))
    const form = dialog('Add an item')

    expect(form.queryByRole('combobox', { name: 'Put it' })).toBeNull()
    fireEvent.change(form.getByRole('combobox', { name: 'Name' }), { target: { value: 'Spare key' } })
    fireEvent.click(form.getByRole('button', { name: 'Add it' }))

    await waitFor(() => expect(stashItems().map((i) => i.name)).toEqual(['Burnt letter', 'Spare key']))
    expect(stashItems()[1]).toMatchObject({ carrier: 'stash', pocket: 0 })
    expect(JSON.stringify(storedGear())).not.toContain('Spare key')
  })

  it('saves an edit to the carrier and never to the character', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await openCarriers('gm', GM)
    const card = await openStashItem('Burnt letter')
    fireEvent.click(card.getByRole('button', { name: 'Edit' }))
    const form = dialog('Burnt letter')
    fireEvent.change(form.getByRole('textbox', { name: /Description/ }), { target: { value: 'Burn it.' } })
    fireEvent.click(form.getByRole('button', { name: 'Save' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    vi.useRealTimers()

    expect(stashItems()[0].note).toBe('Burn it.')
    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(JSON.stringify(database[TOMMY])).not.toContain('Burnt letter')
  })

  it('refuses a change to a carrier that moved on under it', async () => {
    await openCarriers('player', OWNER)
    const card = await openStashItem('Burnt letter')
    database[`${HIDDEN_PATH}/stash`] = { ...STASH, items: [] }
    fireEvent.click(card.getByRole('button', { name: 'Edit' }))
    const form = dialog('Burnt letter')
    fireEvent.change(form.getByRole('textbox', { name: /Description/ }), { target: { value: 'Burn it.' } })
    fireEvent.click(form.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(toastText()).toBe('Someone moved that first. Nothing changed.'))
    expect(database[`${HIDDEN_PATH}/stash`].items).toEqual([])
  })

  it('moves a thing out onto the character in one transaction', async () => {
    await openCarriers('player', OWNER)
    const card = await openStashItem('Burnt letter')
    moveTo(card, 'backpack#1')

    await waitFor(() => expect(stashItems()).toEqual([]))
    expect((storedGear().items as Fields[]).map((i) => i.id)).toEqual(['cap', 'letter'])
    await waitFor(() => expect(toastText()).toContain('Burnt letter: '))
    expect(screen.queryByRole('dialog', { name: 'Burnt letter' })).toBeNull()
  })

  it('offers no Give inside it, as an offer is accepted from the character\'s own record', async () => {
    await openCarriers('player', OWNER)
    fireEvent.click(screen.getByRole('tab', { name: 'On you' }))
    fireEvent.click([...document.querySelectorAll<HTMLElement>('.lubec-gear .slot.item')].find((el) => el.textContent?.includes('Wool watch cap')) as HTMLElement)
    expect(dialog('Wool watch cap').getByRole('button', { name: 'Give' })).toBeTruthy()
    fireEvent.click(dialog('Wool watch cap').getByRole('button', { name: 'Close' }))

    fireEvent.click(screen.getByRole('tab', { name: 'Carriers' }))
    const card = await openStashItem('Burnt letter')
    expect(card.queryByRole('button', { name: 'Give' })).toBeNull()
    expect(card.getByRole('button', { name: 'Move' })).toBeTruthy()
  })

  it('moves a thing in from the character, offering the carrier only to who can see it', async () => {
    await openCarriers('player', OWNER)
    fireEvent.click(screen.getByRole('tab', { name: 'On you' }))
    fireEvent.click([...document.querySelectorAll<HTMLElement>('.lubec-gear .slot.item')].find((el) => el.textContent?.includes('Wool watch cap')) as HTMLElement)
    const card = dialog('Wool watch cap')
    fireEvent.click(card.getByRole('button', { name: 'Move' }))
    expect(card.getByRole('option', { name: 'Cigar box (1 free)' })).toBeTruthy()
    fireEvent.change(card.getByRole('combobox', { name: 'Move to' }), { target: { value: 'stash#0' } })
    fireEvent.click(card.getByRole('button', { name: 'Move it' }))

    await waitFor(() => expect(stashItems().map((i) => i.id)).toEqual(['letter', 'cap']))
    expect(storedGear().items).toEqual([])
    await waitFor(() => expect(toastText()).toBe('Wool watch cap: Cigar box.'))
  })

  it('shows a refusal from the carrier on the card and moves nothing', async () => {
    database[`${HIDDEN_PATH}/stash`] = { ...STASH, items: [T('a', 'stash', 0, 'Burnt letter'), T('b', 'stash', 0, 'Spare key')] }
    await openCarriers('player', OWNER)
    fireEvent.click(screen.getByRole('tab', { name: 'On you' }))
    fireEvent.click([...document.querySelectorAll<HTMLElement>('.lubec-gear .slot.item')].find((el) => el.textContent?.includes('Wool watch cap')) as HTMLElement)
    const card = dialog('Wool watch cap')
    fireEvent.click(card.getByRole('button', { name: 'Move' }))
    fireEvent.change(card.getByRole('combobox', { name: 'Move to' }), { target: { value: 'stash#0' } })
    fireEvent.click(card.getByRole('button', { name: 'Move it' }))

    expect((await card.findByRole('alert')).textContent).toBeTruthy()
    expect((database[`${HIDDEN_PATH}/stash`].items as Fields[])).toHaveLength(2)
    expect(storedGear().items).toHaveLength(1)
  })

  it('asks the owner for the Strength roll when a heavy thing comes out onto them', async () => {
    database[`${HIDDEN_PATH}/stash`] = { ...STASH, items: [T('anvil', 'stash', 0, 'Small anvil', { weight: 'heavy' })] }
    await openCarriers('player', OWNER)
    const card = await openStashItem('Small anvil')
    moveTo(card, 'backpack#1')

    await waitFor(() => expect(stashItems()).toEqual([]))
    expect(await screen.findByRole('dialog', { name: /Small anvil/ })).toBeTruthy()
  })

  it('drops a thing to the GM from the carrier, with where it was', async () => {
    await openCarriers('player', OWNER)
    const card = await openStashItem('Burnt letter')
    fireEvent.click(card.getByRole('button', { name: 'Drop' }))

    await waitFor(() => expect(stashItems()).toEqual([]))
    expect(database[`${CAMPAIGN_PATH}/gmItems/letter`]).toMatchObject({ status: 'dropped', droppedFrom: 'Cigar box', droppedByUserId: OWNER })
  })
})

describe('deleting a character', () => {
  it('removes its hidden carriers and leaves their things with the GM', async () => {
    database = { [TOMMY]: tommyEves({}), [`${HIDDEN_PATH}/stash`]: STASH }
    mountTab('player', OWNER)
    await openGear()
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Delete/ }))

    await waitFor(() => expect(database[TOMMY]).toBeUndefined())
    expect(database[`${HIDDEN_PATH}/stash`]).toBeUndefined()
    expect(database[`${CAMPAIGN_PATH}/gmItems/letter`]).toMatchObject({ status: 'dropped', droppedFrom: 'Cigar box' })
  })
})
