// @vitest-environment jsdom
/**
 * The Carriers view and personal carriers (spec 12.5), through the Lubec
 * character tab mounted as the shell mounts it, over the shared character
 * store with `firebase/firestore` stubbed and documents kept by path. A
 * reload is a remount from the documents as last written.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, configure, fireEvent, render, screen, within } from '@testing-library/react'
import type { User } from 'firebase/auth'
import type { Campaign, Role } from '../../../types/app'
import type { LubecSharedSeat } from './lubecSharedSeat'

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
  deleteDoc: vi.fn(),
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
const { LubecCarrierDialog } = await import('./LubecCarrierDialog')
const { LUBEC_NPC_CARRIER_KINDS } = await import('../../ruleSets/lubec/gear/carriers')
const { emptyLubecGear } = await import('../../ruleSets/lubec/gear/gearRecord')

const CHARACTERS_PATH = 'groups/group-1/campaigns/campaign-1/characters'
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

function emitCharacters() {
  const docs = Object.entries(database).filter(([path]) => path.startsWith(`${CHARACTERS_PATH}/`)).map(([path, data]) => ({ id: idOf(path), data: () => data }))
  mocks.listeners[CHARACTERS_PATH]?.next({ docs })
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

const tommyEves = (gear: Fields): Fields => ({
  system: 'lubec',
  schemaVersion: 1,
  name: 'Tommy Eves',
  ownerUserId: 'player-1',
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

function mountTab(role: Role, uid: string) {
  const LubecSheet = ruleSetSheets.lubec
  const view = render(<LubecSheet campaign={campaign} role={role} user={{ uid } as User} username="viewer1" setError={vi.fn()} characterTabProps={null} />)
  act(() => emitCharacters())
  return view
}

function openGear() {
  fireEvent.click(screen.getByRole('button', { name: /^Tommy Eves/ }))
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Character sheet pages' })).getByRole('button', { name: 'Gear' }))
  return document.querySelector('.lubec-gear') as HTMLElement
}

const slotOf = (name: string) => [...document.querySelectorAll<HTMLElement>('.lubec-gear .slot.item')].find((el) => el.textContent?.includes(name)) as HTMLElement
const openCard = (name: string) => {
  fireEvent.click(slotOf(name))
  return within(screen.getByRole('dialog', { name }))
}

const storedItems = (): Fields[] => (((database[TOMMY].lubec as Fields).gear as Fields).items as Fields[])
const storedItem = (id: string) => storedItems().find((i) => i.id === id)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listeners = {}
  database = {}
  clock = 0
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
const DUFFEL = { id: 'duffel', name: 'Duffel bag', type: 'duffel', pockets: [pocket('Main', 8, 8)] }
const BAG = { id: 'bag', name: 'School bag', type: 'school-bag', pockets: [pocket('Main', 4, 4), pocket('Outside pocket', 1, 1)] }

const storedGear = () => (database[TOMMY].lubec as Fields).gear as Fields
const openCarriers = () => fireEvent.click(screen.getByRole('tab', { name: 'Carriers' }))
const cardOf = (name: string) => [...document.querySelectorAll<HTMLElement>('.carrier-card')].find((c) => c.querySelector('h3')?.textContent === name) as HTMLElement
const pocketOf = (name: string) => [...document.querySelectorAll<HTMLElement>('.pocket-section')].find((s) => s.querySelector('h3')?.textContent === name) as HTMLElement
const rowNames = (section: HTMLElement) => [...section.querySelectorAll('.row-item:not(.add) > span:nth-of-type(2)')].map((s) => s.firstChild?.textContent)
const meterOf = (card: HTMLElement) => [...card.querySelectorAll('.meter i')].map((i) => i.className || 'off')
const dialog = (name: string) => within(screen.getByRole('dialog', { name }))
const toastText = () => screen.getByRole('status').textContent
const settle = () => act(() => vi.advanceTimersByTime(500))

describe('the Carriers list', () => {
  it('shows a character with no carriers only the backpack\'s card, which opens On you, and writes nothing for looking', () => {
    vi.useFakeTimers()
    database = { [TOMMY]: tommyEves({ items: [T('cap', 'backpack', 0, 'Wool watch cap', 1)] }) }
    mountTab('player', 'player-1')
    openGear()
    openCarriers()

    expect(screen.getByRole('heading', { name: 'Carriers' })).toBeTruthy()
    expect(screen.getByText('They hold things. They never slow you down.')).toBeTruthy()
    const backpack = cardOf('Backpack')
    expect(document.querySelectorAll('.carrier-card')).toHaveLength(1)
    expect(backpack.querySelector('.type')?.textContent).toBe('Everyone has one')
    expect(backpack.querySelector('.count')?.textContent).toBe('1 of 7 used')
    expect(meterOf(backpack)).toEqual(['on', 'off', 'off', 'off', 'off', 'gap', 'off', 'gap', 'off'])
    expect(backpack.querySelector('.facts')?.textContent).toBe('PocketsMain pocket 5 (up to 4); Front pocket, left 1 (up to 1); Front pocket, right 1 (up to 1)OwnerTommy EvesAccessTommy EvesKnownKnown to all')
    expect(screen.queryByText('Needs a place')).toBeNull()

    fireEvent.click(backpack)
    expect(screen.getByRole('tab', { name: 'On you' }).getAttribute('aria-selected')).toBe('true')
    expect(document.querySelector('.lubec-gear .pack')).not.toBeNull()
    act(() => vi.advanceTimersByTime(2000))
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('adds a carrier from every preset with its pockets, and shows its meter or plenty of room', async () => {
    vi.useFakeTimers()
    const { LUBEC_CARRIER_TYPES } = await import('../../ruleSets/lubec/gear/carriers')
    database = { [TOMMY]: tommyEves({}) }
    mountTab('player', 'player-1')
    openGear()
    openCarriers()

    for (const t of LUBEC_CARRIER_TYPES) {
      fireEvent.click(screen.getByRole('button', { name: '+ New carrier' }))
      const form = dialog('Add a carrier')
      fireEvent.change(form.getByRole('combobox', { name: 'What is it?' }), { target: { value: t.id } })
      expect((form.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe(t.name)
      expect(form.getAllByRole('textbox', { name: 'Pocket' }).map((x) => (x as HTMLInputElement).value)).toEqual(t.pockets.map(([name]) => name))
      if (!t.name) fireEvent.change(form.getByRole('textbox', { name: 'Name' }), { target: { value: 'Crate' } })
      // The stash preset offers Hidden first; this case keeps every preset on the sheet.
      fireEvent.click(form.getByRole('radio', { name: /Known to all/ }))
      fireEvent.click(form.getByRole('button', { name: 'Add carrier' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(toastText()).toBe(`${t.name || 'Crate'} added to your carriers.`)
    }
    settle()
    expect(mocks.setDoc).toHaveBeenCalledTimes(1)
    const stored = storedGear().carriers as Fields[]
    expect(stored.map(({ type, name, pockets }) => ({ type, name, pockets }))).toEqual(LUBEC_CARRIER_TYPES.map((t) => ({
      type: t.id, name: t.name || 'Crate', pockets: t.pockets.map(([name, slots, max]) => ({ name, slots, max })),
    })))
    expect(new Set(stored.map((c) => c.id)).size).toBe(LUBEC_CARRIER_TYPES.length)

    expect(document.querySelectorAll('.carrier-card')).toHaveLength(12)
    expect(meterOf(cardOf('School locker'))).toEqual([...Array(6).fill('off'), 'gap', 'off', 'off'])
    expect(['Family car', 'Skiff', 'Shed'].map((name) => cardOf(name).querySelector('.vast')?.textContent)).toEqual(Array(3).fill('Plenty of room. Big things are settled at the table.'))
    expect(cardOf('Family car').querySelector('.type')?.textContent).toBe('Family car')
  })

  it('refuses a carrier with no name or a pocket smaller than its largest thing, keeps the last pocket, and totals the pockets', () => {
    vi.useFakeTimers()
    database = { [TOMMY]: tommyEves({}) }
    mountTab('gm', GM)
    openGear()
    openCarriers()

    fireEvent.click(screen.getByRole('button', { name: '+ New carrier' }))
    const form = dialog('Add a carrier')
    fireEvent.change(form.getByRole('combobox', { name: 'What is it?' }), { target: { value: 'other' } })
    expect(form.getByText('6 slots in 1 pocket. A thing has to fit inside one pocket.')).toBeTruthy()
    fireEvent.click(form.getByRole('button', { name: 'Add carrier' }))
    expect(form.getByRole('alert').textContent).toBe('Give it a name.')

    fireEvent.click(form.getByRole('button', { name: 'Remove this pocket' }))
    expect(toastText()).toBe('A carrier needs at least one pocket.')
    expect(form.getAllByRole('textbox', { name: 'Pocket' })).toHaveLength(1)

    fireEvent.click(form.getByRole('button', { name: '+ Add a pocket' }))
    expect(form.getByText('8 slots in 2 pockets. A thing has to fit inside one pocket.')).toBeTruthy()
    fireEvent.change(form.getAllByRole('spinbutton', { name: 'Slots' })[1], { target: { value: '30' } })
    expect(form.getByText('36 slots in 2 pockets. A thing has to fit inside one pocket. Effectively unlimited; big things are settled at the table.')).toBeTruthy()
    fireEvent.change(form.getByRole('textbox', { name: 'Name' }), { target: { value: 'Wagon' } })
    fireEvent.change(form.getAllByRole('spinbutton', { name: 'Slots' })[0], { target: { value: '2' } })
    fireEvent.click(form.getByRole('button', { name: 'Add carrier' }))
    expect(form.getByRole('alert').textContent).toBe("A pocket's largest thing can't be bigger than the pocket.")

    fireEvent.click(form.getAllByRole('button', { name: 'Remove this pocket' })[0])
    expect(form.getAllByRole('textbox', { name: 'Pocket' }).map((x) => (x as HTMLInputElement).value)).toEqual(['Pocket'])
    fireEvent.keyDown(form.getByRole('textbox', { name: 'Name' }), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => vi.advanceTimersByTime(2000))
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })
})

describe('a carrier\'s detail', () => {
  it('lists each pocket\'s things and the small stuff, and puts something in through the same form', () => {
    vi.useFakeTimers()
    database = {
      [TOMMY]: tommyEves({
        carriers: [BAG],
        items: [T('rope', 'bag', 0, 'Coil of rope', 2), T('lamp', 'bag', 0, 'Oil lamp', 1, { weight: 'heavy' }), T('map', 'bag', null, 'Bus map', 0)],
      }),
    }
    mountTab('player', 'player-1')
    openGear()
    openCarriers()
    expect(cardOf('School bag').querySelector('.count')?.textContent).toBe('3 of 5 used')
    expect(meterOf(cardOf('School bag'))).toEqual(['on', 'on', 'on heavy', 'off', 'gap', 'off'])

    fireEvent.click(cardOf('School bag'))
    const head = document.querySelector('.detail-head') as HTMLElement
    expect([head.querySelector('.eyebrow')?.textContent, head.querySelector('h2')?.textContent, head.querySelector('.count')?.textContent])
      .toEqual(['School bag', 'School bag', '3 of 5 used / 2 free'])
    expect(pocketOf('Main').querySelector('.count')?.textContent).toBe('3 of 4 / things up to 4 slots')
    expect(rowNames(pocketOf('Main'))).toEqual(['Coil of rope', 'Oil lamp'])
    expect(within(pocketOf('Main')).getByText('2 slots')).toBeTruthy()
    expect(within(pocketOf('Main')).getByText('Heavy')).toBeTruthy()
    expect(pocketOf('Outside pocket').querySelector('.count')?.textContent).toBe('0 of 1 / things up to 1 slot')
    expect(rowNames(pocketOf('Small stuff'))).toEqual(['Bus map'])

    fireEvent.click(within(pocketOf('Outside pocket')).getByRole('button', { name: '+ Put something in' }))
    const form = dialog('Add an item')
    expect((form.getByRole('combobox', { name: 'Put it' }) as HTMLSelectElement).value).toBe('bag#1')
    fireEvent.change(form.getByRole('combobox', { name: 'Name' }), { target: { value: 'Compass' } })
    fireEvent.click(form.getByRole('button', { name: 'Add it' }))

    expect(toastText()).toBe('Compass: School bag, outside pocket.')
    expect(rowNames(pocketOf('Outside pocket'))).toEqual(['Compass'])
    expect(within(pocketOf('Outside pocket')).queryByRole('button', { name: '+ Put something in' })).toBeNull()
    settle()
    expect(storedItems().find((i) => i.name === 'Compass')).toMatchObject({ carrier: 'bag', pocket: 1 })

    fireEvent.click(screen.getByRole('button', { name: '← All carriers' }))
    expect(cardOf('School bag')).toBeTruthy()
  })

  it('moves a thing out of a carrier and into one through the card\'s Move panel', () => {
    vi.useFakeTimers()
    database = { [TOMMY]: tommyEves({ carriers: [DUFFEL], items: [T('rope', 'duffel', 0, 'Coil of rope', 1), T('w', 'hands', 1, 'Walkie-talkie', 1)] }) }
    mountTab('player', 'player-1')
    openGear()
    openCarriers()
    fireEvent.click(cardOf('Duffel bag'))

    fireEvent.click(screen.getByRole('button', { name: 'Coil of rope' }))
    let card = dialog('Coil of rope')
    expect(card.getByText('Thing / Duffel bag')).toBeTruthy()
    fireEvent.click(card.getByRole('button', { name: 'Move' }))
    let select = card.getByRole('combobox', { name: 'Move to' }) as HTMLSelectElement
    expect([...select.querySelectorAll('optgroup')].map((g) => g.label)).toEqual(['On you', 'Carriers', 'Elsewhere'])
    expect(within(select.querySelector('optgroup[label="Carriers"]') as HTMLElement).getByRole('option', { name: 'Duffel bag (7 free)' })).toHaveProperty('disabled', true)
    fireEvent.change(select, { target: { value: 'hands' } })
    fireEvent.click(card.getByRole('button', { name: 'Move it' }))
    expect(toastText()).toBe('Coil of rope: Left hand.')
    fireEvent.click(card.getByRole('button', { name: 'Close' }))
    expect(rowNames(pocketOf('Main'))).toEqual([])

    fireEvent.click(screen.getByRole('tab', { name: 'On you' }))
    card = openCard('Walkie-talkie')
    fireEvent.click(card.getByRole('button', { name: 'Move' }))
    select = card.getByRole('combobox', { name: 'Move to' }) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'duffel#0' } })
    fireEvent.click(card.getByRole('button', { name: 'Move it' }))
    expect(toastText()).toBe('Walkie-talkie: Duffel bag.')
    settle()
    expect(storedItem('rope')).toMatchObject({ carrier: 'hands', slot: 0 })
    expect(storedItem('w')).toMatchObject({ carrier: 'duffel', pocket: 0 })
  })
})

describe('Rule C3: carrying a carrier', () => {
  const speedNote = () => screen.getByText('Speed', { selector: '.ability-name' }).closest('.ability')?.querySelector('.base-note')?.textContent

  it('carries one by special dispensation, lists it on On you, and puts it down; what is in it never slows you', () => {
    vi.useFakeTimers()
    database = { [TOMMY]: tommyEves({ carriers: [DUFFEL], items: [T('anvil', 'duffel', 0, 'Small anvil', 1, { weight: 'heavy', check: 'fail' }), T('canoe', 'duffel', 0, 'Canoe', 4, { weight: 'extra', check: 'pass' })] }) }
    mountTab('player', 'player-1')
    openGear()
    openCarriers()
    fireEvent.click(cardOf('Duffel bag'))

    const area = () => document.querySelector('.carry-area') as HTMLElement
    expect(area().querySelector('.head')?.textContent).toBe('Requires special dispensation')
    fireEvent.click(within(area()).getByRole('button', { name: 'Carry itRequires special dispensation' }))
    let prompt = dialog('Carry Duffel bag?')
    expect(prompt.getByText('Past the carry limit')).toBeTruthy()
    fireEvent.click(prompt.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(within(area()).getByRole('button', { name: 'Carry itRequires special dispensation' }))
    prompt = dialog('Carry Duffel bag?')
    fireEvent.click(prompt.getByRole('button', { name: 'Carry itRequires special dispensation' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(toastText()).toBe('Carrying Duffel bag.')
    expect(area().textContent).toBe('Carried / special dispensationYou are carrying Duffel bag past the carry limit.Put it down')

    fireEvent.click(screen.getByRole('button', { name: '← All carriers' }))
    expect(within(cardOf('Duffel bag')).getByText('Carried')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'On you' }))
    const panel = () => document.querySelector('.panel.ink') as HTMLElement | null
    expect(panel()?.querySelector('.row-item')?.getAttribute('data-drop')).toBe('duffel')
    expect(panel()?.textContent).toBe('CarryingSpecial dispensationDuffel bag5 of 8 usedOpenPut it down')
    settle()
    expect((storedGear().carriers as Fields[])[0]).toMatchObject({ id: 'duffel', carried: true })

    fireEvent.click(within(panel() as HTMLElement).getByRole('button', { name: 'Open' }))
    expect(document.querySelector('.detail-head h2')?.textContent).toBe('Duffel bag')
    fireEvent.click(screen.getByRole('tab', { name: 'On you' }))
    fireEvent.click(within(panel() as HTMLElement).getByRole('button', { name: 'Put it down' }))
    expect(panel()).toBeNull()
    settle()
    expect((storedGear().carriers as Fields[])[0]).toMatchObject({ id: 'duffel', carried: false })

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Character sheet pages' })).getByRole('button', { name: 'Core sheet' }))
    expect(speedNote()).toBe('51 +5 class')
  })
})

describe('"Needs a place"', () => {
  it('lists a thing whose place cannot be read, never drops or places it, and lets the owner move it', () => {
    vi.useFakeTimers()
    database = { [TOMMY]: tommyEves({ items: [T('radio', 'attic', 0, 'Old radio', 1), T('yoyo', 'hands', 5, 'Yo-yo', 1)] }) }
    mountTab('player', 'player-1')
    openGear()
    openCarriers()

    const section = () => pocketOf('Needs a place')
    expect(section().querySelector('.count')?.textContent).toBe('2 things')
    expect(rowNames(section())).toEqual(['Old radio', 'Yo-yo'])
    act(() => vi.advanceTimersByTime(2000))
    expect(mocks.setDoc).not.toHaveBeenCalled()

    fireEvent.click(within(section()).getByRole('button', { name: 'Old radio' }))
    const card = dialog('Old radio')
    expect(card.getByText('Thing / Needs a place')).toBeTruthy()
    fireEvent.click(card.getByRole('button', { name: 'Move' }))
    expect((card.getByRole('combobox', { name: 'Move to' }) as HTMLSelectElement).value).toBe('backpack#0')
    fireEvent.click(card.getByRole('button', { name: 'Move it' }))
    expect(toastText()).toBe('Old radio: Backpack, main pocket.')
    fireEvent.click(card.getByRole('button', { name: 'Close' }))
    expect(section().querySelector('.count')?.textContent).toBe('1 thing')
    settle()
    expect(storedItem('radio')).toMatchObject({ carrier: 'backpack', pocket: 0 })
    expect(storedItem('yoyo')).toMatchObject({ carrier: 'hands', slot: 5 })
  })
})

describe('a viewer who may only look', () => {
  it('sees the carriers, what is in them and what is carried, with no button to change them', () => {
    database = { [TOMMY]: tommyEves({ carriers: [{ ...DUFFEL, carried: true }], items: [T('rope', 'duffel', 0, 'Coil of rope', 1), T('ghost', 'attic', 0, 'Old radio', 1)] }) }
    mountTab('player', 'player-2')
    openGear()

    const panel = document.querySelector('.panel.ink') as HTMLElement
    expect(within(panel).getAllByRole('button').map((b) => b.textContent)).toEqual(['Open'])
    openCarriers()
    expect(screen.queryByRole('button', { name: '+ New carrier' })).toBeNull()
    expect(within(cardOf('Duffel bag')).getByText('Carried')).toBeTruthy()
    expect(within(pocketOf('Needs a place')).queryByRole('button')).toBeNull()

    fireEvent.click(cardOf('Duffel bag'))
    expect(rowNames(pocketOf('Main'))).toEqual(['Coil of rope'])
    expect(document.querySelectorAll('.pocket-section button')).toHaveLength(0)
    expect(document.querySelector('.carry-area')).toBeNull()
  })
})

describe('the kinds the add-carrier dialog offers', () => {
  const seat = { carriers: [], owners: [{ id: 'wayne', name: 'Wayne' }], ownerOf: () => '', mayChange: () => false, acts: {} } as unknown as LubecSharedSeat
  const renderDialog = (kinds: Parameters<typeof LubecCarrierDialog>[0]['kinds']) =>
    render(<LubecCarrierDialog gear={emptyLubecGear()} kinds={kinds} onAdded={vi.fn()} onClose={vi.fn()} toast={vi.fn()} shared={seat} />)

  it('offers a choice of every kind a sheet takes', () => {
    renderDialog(['personal', 'shared', 'hidden'])

    const kinds = within(dialog('Add a carrier').getByRole('group', { name: 'Who gets into it' })).getAllByRole('radio')
    expect(kinds.map((kind) => kind.closest('label')?.querySelector('span')?.firstChild?.textContent)).toEqual(['Just this character', 'Shared with the table', 'Hidden'])
  })

  it('offers no shared kind to a viewer with no character to own it', () => {
    render(<LubecCarrierDialog gear={emptyLubecGear()} kinds={['personal', 'shared']} onAdded={vi.fn()} onClose={vi.fn()} toast={vi.fn()} shared={{ ...seat, owners: [] }} />)

    expect(dialog('Add a carrier').queryByRole('radio')).toBeNull()
  })

  it('offers no choice on an NPC\'s sheet, which takes personal carriers only', () => {
    renderDialog(LUBEC_NPC_CARRIER_KINDS)

    expect(LUBEC_NPC_CARRIER_KINDS).toEqual(['personal'])
    expect(dialog('Add a carrier').queryByRole('radio')).toBeNull()
  })
})
