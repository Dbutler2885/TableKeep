// @vitest-environment jsdom
/**
 * The Gear page through the Lubec character tab, mounted as the shell mounts
 * it over the shared character store with `firebase/firestore` stubbed, as
 * `LubecCharacterTab.test.tsx` does. Stored documents reach it through the
 * stubbed snapshot listener; a reload is a remount fed the documents as last
 * written.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { User } from 'firebase/auth'
import type { Campaign, Role } from '../../../types/app'

// These cases mount large component trees and run role queries over them in
// jsdom. Alone each takes about a second, but under coverage on a loaded
// machine the same cases ran past Vitest's 5 second default and failed without
// any assertion failing, as `LubecCharacterTab.test.tsx`'s did.
vi.setConfig({ testTimeout: 30_000 })

type Fields = Record<string, unknown>
type Listener = { next: (snap: unknown) => void; fail: (error: unknown) => void }

const mocks = vi.hoisted(() => ({
  listeners: {} as Record<string, { next: (snap: unknown) => void; fail: (error: unknown) => void }>,
  setDoc: vi.fn(async (..._args: unknown[]) => undefined),
}))

vi.mock('../../../firebase', () => ({ db: { name: 'db-stub' } }))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  // The campaign items for the stock picker are a filtered list of the collection.
  query: (ref: unknown) => ref,
  where: () => null,
  deleteDoc: vi.fn(),
  onSnapshot: (ref: { path: string }, next: Listener['next'], fail: Listener['fail']) => {
    mocks.listeners[ref.path] = { next, fail }
    return () => {
      if (mocks.listeners[ref.path]?.next === next) delete mocks.listeners[ref.path]
    }
  },
  serverTimestamp: () => ({ sentinel: 'serverTimestamp' }),
  setDoc: mocks.setDoc,
}))
vi.mock('../../common/mediaStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../common/mediaStorage')>()),
  resolveStoragePathUrl: vi.fn(async () => null),
}))

const { ruleSetSheets } = await import('../../ruleSets/sheetComponents')
const { LUBEC_BACKPACK_ARTS } = await import('./backpackArt')

const CHARACTERS_PATH = 'groups/group-1/campaigns/campaign-1/characters'
const GM = 'gm-1'

const campaign: Campaign = { id: 'campaign-1', name: 'Lubec', status: 'active', groupId: 'group-1', gmUserId: GM, system: 'lubec' }

let database: Record<string, Fields> = {}

const isMap = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value)

// With `{ merge: true }` maps merge field by field and anything else, lists included, replaces what was stored.
function written(stored: Fields, payload: Fields, merge: boolean): Fields {
  if (!merge) return payload
  const merged = { ...stored }
  Object.entries(payload).forEach(([key, value]) => {
    merged[key] = isMap(value) && isMap(stored[key]) ? written(stored[key], value, true) : value
  })
  return merged
}

function writeToDatabase(...args: unknown[]) {
  const [ref, payload, options] = args as [{ path: string }, Fields, { merge?: boolean } | undefined]
  const id = ref.path.split('/').pop() as string
  database[id] = written(database[id] ?? {}, payload, options?.merge === true)
}

const tommyEves = (lubec: Fields = {}): Fields => ({
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
    ...lubec,
  },
})

const T = (id: string, carrier: string, at: number | null, name: string, size: number, extra: Fields = {}) => ({
  id, kind: 'thing', carrier, ...(['hands', 'body'].includes(carrier) ? { slot: at } : { pocket: at }), name, size, qty: 1, weight: 'normal', note: '', ...extra,
})

// Wayne Gardner's things on him, from the prototype's sample: a full backpack, full hands and full body slots.
const FULL_GEAR = {
  items: [
    T('i1', 'backpack', 0, 'Flashlight', 1, { kind: 'holder', hold: 'load', takes: 'dcell', capacity: 2, loaded: 2 }),
    T('i2', 'backpack', 0, 'Small anvil', 1, { weight: 'heavy', check: 'fail' }),
    T('i3', 'backpack', 0, 'Peanut butter sandwich', 1, { kind: 'consumable', qty: 2, per: 2 }),
    T('i4', 'backpack', 0, 'D batteries', 1, { kind: 'consumable', qty: 2, per: 4, fits: 'dcell' }),
    T('i5', 'backpack', 0, 'Wool watch cap', 1),
    T('i6', 'backpack', 1, 'Box of .38 rounds', 1, { kind: 'holder', hold: 'box', takes: 'a38', capacity: 50, loaded: 12 }),
    T('i7', 'backpack', 2, 'Photocopied 1898 map', 1),
    T('i36', 'backpack', null, 'Timex watch', 0),
    T('i37', 'backpack', null, 'House key', 0),
    T('i38', 'backpack', null, 'Marbles', 0, { qty: 12 }),
    T('i8', 'hands', 0, "Grandpa's revolver", 1, { kind: 'weapon', mode: 'firearm', capacity: 6, loaded: 0, takes: 'a38' }),
    T('i9', 'hands', 1, 'Walkie-talkie', 1),
    T('i10', 'body', 0, 'Rain slicker', 1),
    T('i11', 'body', 1, 'Pocketknife', 0, { kind: 'weapon', mode: 'melee', wounds: ['cut', 'pierce'] }),
  ],
  carriers: [],
  overrides: [],
  supplies: [],
}

function emitDatabase() {
  const docs = Object.entries(database).map(([id, data]) => ({ id, data: () => data }))
  act(() => mocks.listeners[CHARACTERS_PATH]?.next({ docs }))
}

function mountTab(role: Role, uid: string) {
  const LubecSheet = ruleSetSheets.lubec
  const view = render(<LubecSheet campaign={campaign} role={role} user={{ uid } as User} username="viewer1" setError={vi.fn()} characterTabProps={null} />)
  emitDatabase()
  return view
}

function reload(role: Role, uid: string) {
  cleanup()
  return mountTab(role, uid)
}

function openSheet(name: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }))
  return screen.getByRole('article', { name: `${name} character sheet` })
}

const pageTabs = () => within(screen.getByRole('navigation', { name: 'Character sheet pages' }))

function openGear(name: string) {
  openSheet(name)
  fireEvent.click(pageTabs().getByRole('button', { name: 'Gear' }))
  return document.querySelector('.lubec-gear') as HTMLElement
}

const lastPayload = () => (mocks.setDoc.mock.calls.at(-1) as [{ path: string }, Fields])[1]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listeners = {}
  database = {}
  mocks.setDoc.mockImplementation(async (...args: unknown[]) => {
    writeToDatabase(...args)
    return undefined
  })
  window.innerWidth = 1024
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Lubec Gear page', () => {
  it('is the third page tab, and the sheet still opens on the Core page', () => {
    database = { tommy: tommyEves() }
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    expect(pageTabs().getAllByRole('button').map((tab) => tab.textContent)).toEqual(['Core sheet', 'Skills', 'Gear'])
    expect(pageTabs().getByRole('button', { name: 'Core sheet' }).getAttribute('aria-current')).toBe('page')

    fireEvent.click(pageTabs().getByRole('button', { name: 'Gear' }))

    expect(pageTabs().getByRole('button', { name: 'Gear' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('tab', { name: 'On you' }).getAttribute('aria-selected')).toBe('true')
  })

  it('shows a character with no gear the empty backpack, hands and body, and writes nothing for looking', async () => {
    database = { tommy: tommyEves() }
    mountTab('player', 'player-1')
    const gear = openGear('Tommy Eves')

    expect(gear.querySelectorAll('button[aria-label="Empty main-pocket slot, add an item"]')).toHaveLength(5)
    expect(gear.querySelector('button[aria-label="Front left pocket, empty, add an item"]')).not.toBeNull()
    expect(gear.querySelector('button[aria-label="Front right pocket, empty, add an item"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Small stuff: empty' }).textContent).toBe('Small stuff+ Add')
    expect(['Left hand', 'Right hand'].map((hand) => screen.getByRole('button', { name: `${hand}, empty, add an item` }))).toHaveLength(2)
    expect(gear.querySelectorAll('button[aria-label="Body, empty, add an item"]')).toHaveLength(2)
    await waitFor(() => expect(gear.querySelector('.pack-art')?.getAttribute('style')).toContain('navy-stripe.webp'))
    expect(screen.queryByText('Full inventory / Speed −10')).toBeNull()
    expect(gear.querySelector('.panel.rust .count')?.textContent).toBe('0 of 7 used / 7 free')

    reload('player', 'player-1')
    openGear('Tommy Eves')
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('saves a Thing the owner adds as one item with no URL, after the delay, and keeps it through a reload', () => {
    vi.useFakeTimers()
    database = { tommy: tommyEves() }
    mountTab('player', 'player-1')
    openGear('Tommy Eves')

    fireEvent.click(screen.getByRole('button', { name: '+ Add an item' }))
    const form = within(screen.getByRole('dialog', { name: 'Add an item' }))
    fireEvent.click(form.getByRole('button', { name: 'Add it' }))
    expect(form.getByRole('alert').textContent).toBe('Give it a name.')

    fireEvent.change(form.getByRole('combobox', { name: 'Name' }), { target: { value: 'Coil of rope' } })
    fireEvent.change(form.getByRole('textbox', { name: 'Description' }), { target: { value: 'Fifty feet.' } })
    fireEvent.click(form.getByRole('button', { name: 'Add it' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('Coil of rope: Backpack, main pocket.')
    expect(mocks.setDoc).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(500))
    expect(mocks.setDoc).toHaveBeenCalledTimes(1)
    const items = ((lastPayload().lubec as Fields).gear as Fields).items as Fields[]
    expect(items).toEqual([{
      id: expect.any(String), kind: 'thing', name: 'Coil of rope', note: 'Fifty feet.', size: 1, weight: 'normal', qty: 1, per: 1, carrier: 'backpack', pocket: 0,
    }])
    expect(JSON.stringify(items)).not.toMatch(/http|Url"/)

    reload('player', 'player-1')
    const gear = openGear('Tommy Eves')
    expect(gear.querySelector('.pack .slot.item')?.textContent).toBe('Coil of rope')
    expect(gear.querySelector('.panel.rust .count')?.textContent).toBe('1 of 7 used / 6 free')
  })

  it('adds where it was opened from: a small thing at the small stuff pill, and a hand from its empty slot', () => {
    vi.useFakeTimers()
    database = { tommy: tommyEves() }
    mountTab('gm', GM)
    openGear('Tommy Eves')

    fireEvent.click(screen.getByRole('button', { name: 'Small stuff: empty' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Small stuff' })).getByRole('button', { name: '+ Add a small thing' }))
    let form = within(screen.getByRole('dialog', { name: 'Add an item' }))
    expect((form.getByRole('radio', { name: 'Small' }) as HTMLInputElement).checked).toBe(true)
    fireEvent.change(form.getByRole('combobox', { name: 'Name' }), { target: { value: 'Marbles' } })
    fireEvent.change(form.getByRole('spinbutton', { name: 'How many in all' }), { target: { value: '12' } })
    fireEvent.click(form.getByRole('button', { name: 'Add it' }))
    expect(screen.getByRole('status').textContent).toBe('Marbles: Backpack, small stuff.')
    expect(within(screen.getByRole('dialog', { name: 'Small stuff' })).getByRole('button', { name: 'Marbles ×12' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByRole('button', { name: 'Small stuff: Marbles ×12' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Right hand, empty, add an item' }))
    form = within(screen.getByRole('dialog', { name: 'Add an item' }))
    fireEvent.change(form.getByRole('combobox', { name: 'Name' }), { target: { value: 'Oar' } })
    fireEvent.click(form.getByRole('radio', { name: '2' }))
    fireEvent.click(form.getByRole('button', { name: 'Add it' }))

    expect(screen.getByRole('status').textContent).toBe('Oar: Both hands.')
    expect(document.querySelector('.hb .slot.item.both')?.textContent).toBe('Both hands / 2 slotsOar')
    act(() => vi.advanceTimersByTime(500))
    expect(mocks.setDoc).toHaveBeenCalledTimes(1)
  })

  it('adds a stock flashlight the owner picks as one item with no URL, after the delay, and keeps it through a reload', () => {
    vi.useFakeTimers()
    database = { tommy: tommyEves() }
    mountTab('player', 'player-1')
    openGear('Tommy Eves')

    fireEvent.click(screen.getByRole('button', { name: '+ Add an item' }))
    fireEvent.click(screen.getByRole('button', { name: 'Browse stock' }))
    const picker = within(screen.getByRole('dialog', { name: 'Pick from stock' }))
    expect((picker.getByRole('radio', { name: 'Thing' }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(picker.getByRole('radio', { name: 'Holder' }))
    fireEvent.click(picker.getByRole('button', { name: /^Lubec 1977 ?Flashlight/ }))
    expect(screen.getByRole('status').textContent).toBe('Flashlight: copied in from stock.')
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Add an item' })).getByRole('button', { name: 'Add it' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.setDoc).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(500))
    expect(mocks.setDoc).toHaveBeenCalledTimes(1)
    const items = ((lastPayload().lubec as Fields).gear as Fields).items as Fields[]
    expect(items).toEqual([{
      id: expect.any(String), kind: 'holder', name: 'Flashlight', note: 'Two D batteries. About four hours of light.', size: 1, weight: 'normal', qty: 1,
      art: 'flashlight', shape: 'tall', stock: 'Flashlight', hold: 'load', capacity: 2, loaded: 2, takes: 'dcell', carrier: 'backpack', pocket: 0,
    }])
    expect(JSON.stringify(items)).not.toMatch(/http|Url"/)

    reload('player', 'player-1')
    const gear = openGear('Tommy Eves')
    expect(gear.querySelector('.pack .slot.item')?.textContent).toBe('Flashlight2 of 2 loaded')
    expect(gear.querySelector('.pack .slot.item .slot-pic.tall svg.lubec-art')).not.toBeNull()
  })

  it('takes a used-up consumable off the sheet, and keeps an empty box', () => {
    vi.useFakeTimers()
    const lastRound = FULL_GEAR.items.map((i) => (i.id === 'i6' ? { ...i, loaded: 1 } : i))
    database = { tommy: tommyEves({ gear: { ...FULL_GEAR, items: lastRound } }) }
    mountTab('player', 'player-1')
    openGear('Tommy Eves')

    fireEvent.click(screen.getByRole('button', { name: /^Peanut butter sandwich/ }))
    let card = within(screen.getByRole('dialog', { name: 'Peanut butter sandwich' }))
    fireEvent.click(card.getByRole('button', { name: 'One fewer' }))
    fireEvent.click(card.getByRole('button', { name: 'Use one' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('Peanut butter sandwich: used up.')

    fireEvent.click(screen.getByRole('button', { name: /^Box of \.38 rounds/ }))
    card = within(screen.getByRole('dialog', { name: 'Box of .38 rounds' }))
    fireEvent.click(card.getByRole('button', { name: 'One fewer' }))
    fireEvent.click(card.getByRole('button', { name: 'One fewer' }))
    expect(card.getByText('0 of 50')).toBeTruthy()
    fireEvent.click(card.getByRole('button', { name: 'Close' }))

    act(() => vi.advanceTimersByTime(500))
    const items = ((lastPayload().lubec as Fields).gear as Fields).items as Fields[]
    expect(items.map((i) => i.name)).not.toContain('Peanut butter sandwich')
    expect(items.find((i) => i.name === 'Box of .38 rounds')).toMatchObject({ loaded: 0 })
  })

  it('keeps the form open with the refusal when the place is full', () => {
    database = { tommy: tommyEves({ gear: FULL_GEAR }) }
    mountTab('player', 'player-1')
    openGear('Tommy Eves')

    fireEvent.click(screen.getByRole('button', { name: '+ Add an item' }))
    const form = within(screen.getByRole('dialog', { name: 'Add an item' }))
    fireEvent.change(form.getByRole('combobox', { name: 'Name' }), { target: { value: 'Brick' } })
    fireEvent.click(form.getByRole('button', { name: 'Add it' }))

    expect(form.getByRole('alert').textContent).toBe('Main pocket is full: 0 of 5 free, and this needs 1.')
    fireEvent.click(form.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes the add form on Escape without adding', () => {
    database = { tommy: tommyEves() }
    mountTab('player', 'player-1')
    openGear('Tommy Eves')

    fireEvent.click(screen.getByRole('button', { name: '+ Add an item' }))
    const form = within(screen.getByRole('dialog', { name: 'Add an item' }))
    fireEvent.change(form.getByRole('combobox', { name: 'Name' }), { target: { value: 'Brick' } })
    fireEvent.keyDown(form.getByRole('combobox', { name: 'Name' }), { key: 'Enter' })
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(form.getByRole('combobox', { name: 'Name' }), { key: 'Escape' })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelector('.lubec-gear .pack .slot.item')).toBeNull()
  })

  it('shows a full inventory with its tag, and another player the page with no buttons', () => {
    database = { tommy: tommyEves({ gear: FULL_GEAR }) }
    mountTab('player', 'player-2')
    const gear = openGear('Tommy Eves')

    expect(screen.getByText('Full inventory / Speed −10')).toBeTruthy()
    expect([...gear.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['On you', 'Carriers'])
    expect(gear.querySelector('[draggable="true"]')).toBeNull()
    expect(gear.querySelector('.small-stuff')?.textContent).toBe('Small stuff / 3Timex watch, House key +1 more')
    expect([...gear.querySelectorAll('.hb .slot')].map((slot) => slot.textContent)).toEqual([
      "Left handGrandpa's revolver0 of 6 loaded", 'Right handWalkie-talkie', 'BodyRain slicker', 'BodyPocketknife',
    ])
  })

  it('draws a 4-slot thing large across the block, and a 2-slot thing arranged one above the other upright', () => {
    database = { tommy: tommyEves({ gear: { ...FULL_GEAR, items: [
      T('a', 'backpack', 0, 'Toolbox', 4),
      T('b', 'backpack', 0, 'Wool watch cap', 1),
    ] } }), wayne: { ...tommyEves({ gear: { ...FULL_GEAR, items: [T('c', 'backpack', 0, 'Oar', 2, { cells: [1, 3] })] } }), name: 'Wayne Gardner' } }
    mountTab('player', 'player-2')
    const toolbox = openGear('Tommy Eves').querySelector('.pack .slot.item.large')
    expect(toolbox?.textContent).toBe('ToolboxLarge / 4 slots')
    expect((toolbox as HTMLElement).style.height).not.toBe('')

    cleanup()
    mountTab('player', 'player-2')
    expect(openGear('Wayne Gardner').querySelector('.pack .slot.item.upright')?.textContent).toBe('OarBulky / 2 slots')
  })

  it('shows stored gear that breaks the main pocket\'s rules as an empty main pocket rather than failing', () => {
    database = { tommy: tommyEves({ gear: { ...FULL_GEAR, items: [T('a', 'backpack', 0, 'Toolbox', 4), T('b', 'backpack', 0, 'Crate', 4)] } }) }
    mountTab('player', 'player-2')
    const gear = openGear('Tommy Eves')

    expect(gear.querySelectorAll('.pack .slot:not(.item)')).toHaveLength(7)
    expect(gear.querySelector('.pack .slot.item')).toBeNull()
  })

  it('lets anyone switch to Carriers and back', () => {
    database = { tommy: tommyEves() }
    mountTab('player', 'player-2')
    openGear('Tommy Eves')

    fireEvent.click(screen.getByRole('tab', { name: 'Carriers' }))
    expect(screen.getByRole('tab', { name: 'Carriers' }).getAttribute('aria-selected')).toBe('true')
    expect(document.querySelector('.lubec-gear .pack')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'On you' }))
    expect(document.querySelector('.lubec-gear .pack')).not.toBeNull()
  })
})

describe('Lubec Gear page: the backpack picture', () => {
  const packArt = () => document.querySelector('.lubec-gear .pack-art')?.getAttribute('style') ?? ''
  const picker = () => within(screen.getByRole('dialog', { name: 'Change pack' }))
  const storedArt = () => ((database.tommy.lubec as Fields).gear as Fields).backpackArt

  it('offers the owner 18 packs with the current one ringed, and saves a pick at once, kept through a reload', async () => {
    database = { tommy: tommyEves({ gear: { ...FULL_GEAR, backpackArt: 'olive-band' } }) }
    mountTab('player', 'player-1')
    openGear('Tommy Eves')
    await waitFor(() => expect(packArt()).toContain('olive-band.webp'))

    fireEvent.click(screen.getByRole('button', { name: 'Change pack' }))
    const choices = picker().getAllByRole('button').filter((button) => button.classList.contains('pack-choice'))
    expect(choices.map((choice) => choice.textContent)).toEqual([...LUBEC_BACKPACK_ARTS])
    const current = choices.filter((choice) => choice.getAttribute('aria-current') === 'true')
    expect(current.map((choice) => choice.textContent)).toEqual(['olive-band'])
    expect(document.activeElement).toBe(current[0])
    await waitFor(() => expect(choices[17].querySelector('.pack-thumb')?.getAttribute('style')).toContain('teal.thumb.webp'))

    fireEvent.click(picker().getByRole('button', { name: 'teal' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(packArt()).toContain('teal.webp'))
    await waitFor(() => expect(mocks.setDoc).toHaveBeenCalledTimes(1))
    expect(storedArt()).toBe('teal')
    expect(((database.tommy.lubec as Fields).gear as Fields).items).toEqual(FULL_GEAR.items)

    reload('player', 'player-1')
    openGear('Tommy Eves')
    await waitFor(() => expect(packArt()).toContain('teal.webp'))
  })

  it('closes on Cancel or Escape with the pack unchanged and nothing written', async () => {
    database = { tommy: tommyEves() }
    mountTab('gm', GM)
    openGear('Tommy Eves')

    fireEvent.click(screen.getByRole('button', { name: 'Change pack' }))
    expect(picker().getByRole('button', { name: 'navy-stripe' }).getAttribute('aria-current')).toBe('true')
    fireEvent.click(picker().getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Change pack' }))
    fireEvent.keyDown(picker().getByRole('button', { name: 'teal' }), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(packArt()).toContain('navy-stripe.webp'))
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('shows the default for a name it does not know, and another player the pick with no button', async () => {
    database = { tommy: tommyEves({ gear: { ...FULL_GEAR, backpackArt: 'tartan' } }), wayne: { ...tommyEves({ gear: { ...FULL_GEAR, backpackArt: 'rust-navy' } }), name: 'Wayne Gardner' } }
    mountTab('player', 'player-2')
    openGear('Tommy Eves')
    await waitFor(() => expect(packArt()).toContain('navy-stripe.webp'))
    expect(screen.queryByRole('button', { name: 'Change pack' })).toBeNull()

    cleanup()
    mountTab('player', 'player-2')
    openGear('Wayne Gardner')
    await waitFor(() => expect(packArt()).toContain('rust-navy.webp'))
    expect(screen.queryByRole('button', { name: 'Change pack' })).toBeNull()
  })
})

describe('Lubec Gear page: armor', () => {
  const armorPanel = () => within(document.querySelector('.lubec-gear .armor-panel') as HTMLElement)
  const part = (name: RegExp) => armorPanel().getByRole('button', { name })
  const readout = () => document.querySelector('.armor-panel .readout')?.textContent
  const wornHelmet = (id: string) => ({
    id, kind: 'armor', carrier: 'worn', name: 'Hockey helmet', size: 2, qty: 1, weight: 'normal', note: '', locs: ['head'], armor: { cut: 1, pierce: 1, blunt: 2, gun: 0 },
  })

  // "+ Make armor" opens the form on armor, worn; the picker opens on armor, and the helmet's tile copies it in.
  function wearStockHelmet() {
    fireEvent.click(armorPanel().getByRole('button', { name: '+ Make armor' }))
    const form = within(screen.getByRole('dialog', { name: 'Add an item' }))
    expect((form.getByRole('combobox', { name: 'Put it' }) as HTMLSelectElement).value).toBe('worn')
    fireEvent.click(form.getByRole('button', { name: 'Browse stock' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Pick from stock' })).getByRole('button', { name: /Hockey helmet/ }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Add an item' })).getByRole('button', { name: 'Add it' }))
  }

  it('wears a stock helmet, shades the head, and fills the readout while the head is pointed at', () => {
    vi.useFakeTimers()
    database = { tommy: tommyEves() }
    mountTab('player', 'player-1')
    openGear('Tommy Eves')
    expect(document.querySelector('.armor-panel .count')?.textContent).toBe('0 worn / takes no slots')
    expect(readout()).toBe('Point at a partCut–Pierce–Blunt–Gun–Tap worn armor to open it.')

    wearStockHelmet()

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('Hockey helmet: Worn: head.')
    expect(document.querySelector('.armor-panel .count')?.textContent).toBe('1 worn / takes no slots')
    expect(document.querySelectorAll('.armor-panel .body-map .worn')).toHaveLength(1)
    expect(armorPanel().getByRole('button', { name: /^Hockey helmet/ }).textContent).toBe('Hockey helmetHeadCut −1Pierce −1Blunt −2')
    fireEvent.mouseOver(part(/^Head:/))
    expect(readout()).toBe('Head1 of 2 layersCut−1Pierce−1Blunt−2Gun0Hockey helmet')
    expect([...document.querySelectorAll('.armor-panel .readout .some dt')].map((dt) => dt.textContent)).toEqual(['Cut', 'Pierce', 'Blunt'])
    fireEvent.mouseLeave(document.querySelector('.armor-panel .body-map') as Element)
    expect(readout()).toMatch(/^Point at a part/)
    fireEvent.focus(part(/^Neck:/))
    expect(readout()).toBe('Neck0 of 2 layersCut0Pierce0Blunt0Gun0Nothing worn here.')

    act(() => vi.advanceTimersByTime(500))
    const items = ((lastPayload().lubec as Fields).gear as Fields).items as Fields[]
    expect(items).toEqual([expect.objectContaining({ kind: 'armor', name: 'Hockey helmet', carrier: 'worn', locs: ['head'], armor: { cut: 1, pierce: 1, blunt: 2, gun: 0 } })])
  })

  it('wears a second helmet as the head\'s second layer', () => {
    database = { tommy: tommyEves({ gear: { items: [wornHelmet('h1')] } }) }
    mountTab('player', 'player-1')
    openGear('Tommy Eves')
    wearStockHelmet()

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelector('.armor-panel .count')?.textContent).toBe('2 worn / takes no slots')
    expect(part(/^Head:/).getAttribute('aria-label')).toBe('Head: 2 of 2 layers, armor Cut −2, Pierce −2, Blunt −4 (Hockey helmet, Hockey helmet)')
  })

  it('refuses a third helmet with the plain message, and keeps the form open saying the head is full', () => {
    database = { tommy: tommyEves({ gear: { items: [wornHelmet('h1'), wornHelmet('h2')] } }) }
    mountTab('player', 'player-1')
    openGear('Tommy Eves')
    wearStockHelmet()

    const form = within(screen.getByRole('dialog', { name: 'Add an item' }))
    expect(form.getByRole('alert').textContent).toBe('No free layer on the head: 2 of 2 taken by Hockey helmet, Hockey helmet. Take something off first.')
    expect(document.querySelector('.item-sheet p.picked')?.textContent).toBe("Covers Head. Already full: Head, so it can't be worn until something comes off there.")
    fireEvent.click(form.getByRole('button', { name: 'Cancel' }))
    expect(document.querySelector('.armor-panel .count')?.textContent).toBe('2 worn / takes no slots')
  })

  it('asks which piece to open when two cover the part tapped, and opens the one picked', () => {
    database = { tommy: tommyEves({ gear: { items: [wornHelmet('h1'), wornHelmet('h2')] } }) }
    mountTab('player', 'player-1')
    openGear('Tommy Eves')

    fireEvent.click(part(/^Head:/))
    const which = within(screen.getByRole('dialog', { name: 'Head: which piece?' }))
    expect(which.getByText('2 pieces are worn here. In all: Cut −2, Pierce −2, Blunt −4, Gun 0.')).toBeTruthy()
    expect(which.getAllByRole('button').map((button) => button.textContent)).toEqual(['×', 'Cancel', 'Hockey helmetCut −1, Pierce −1, Blunt −2', 'Hockey helmetCut −1, Pierce −1, Blunt −2'])
    fireEvent.click(which.getAllByRole('button', { name: /^Hockey helmet/ })[1])
    expect(screen.getByRole('dialog', { name: 'Hockey helmet' })).toBeTruthy()
  })

  it('picks a pair with "Both sides at once", and lights a worn piece\'s parts from its row and the pieces on a part from the body', () => {
    database = { tommy: tommyEves() }
    mountTab('gm', GM)
    openGear('Tommy Eves')

    fireEvent.click(armorPanel().getByRole('button', { name: '+ Make armor' }))
    const form = within(screen.getByRole('dialog', { name: 'Add an item' }))
    fireEvent.change(form.getByRole('combobox', { name: 'Name' }), { target: { value: 'Mittens' } })
    fireEvent.click(form.getByRole('checkbox', { name: /^Both sides at once/ }))
    fireEvent.click(form.getByRole('checkbox', { name: /^Left hand/ }))
    expect(document.querySelector('.item-sheet p.picked')?.textContent).toBe('Covers Hands.')
    expect(document.querySelectorAll('.item-sheet .body-map .picked')).toHaveLength(2)
    fireEvent.change(form.getByRole('spinbutton', { name: 'Blunt' }), { target: { value: '1' } })
    fireEvent.click(form.getByRole('button', { name: 'Add it' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.mouseOver(armorPanel().getByRole('button', { name: /^Mittens/ }))
    expect(document.querySelectorAll('.armor-panel .body-map .hl.on')).toHaveLength(2)
    fireEvent.mouseLeave(document.querySelector('.armor-panel .row-list') as Element)
    expect(document.querySelectorAll('.armor-panel .body-map .hl.on')).toHaveLength(0)
    fireEvent.mouseOver(part(/^Right hand:/))
    expect(armorPanel().getByRole('button', { name: /^Mittens/ }).className).toBe('row-item lit')
    expect(document.querySelectorAll('.armor-panel .body-map .hl.on')).toHaveLength(2)
    fireEvent.click(part(/^Right hand:/))
    expect(screen.getByRole('dialog', { name: 'Mittens' })).toBeTruthy()
  })

  it('shows another player the armor worn with no button to open it', () => {
    database = { tommy: tommyEves({ gear: { items: [wornHelmet('h')] } }) }
    mountTab('player', 'player-2')
    const gear = openGear('Tommy Eves')

    expect([...gear.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['On you', 'Carriers'])
    expect(gear.querySelector('.armor-panel .row-item.static')?.textContent).toBe('Hockey helmetHeadCut −1Pierce −1Blunt −2')
    expect(part(/^Head:/).getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(part(/^Head:/))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.mouseOver(part(/^Head:/))
    expect(readout()).toBe('Head1 of 2 layersCut−1Pierce−1Blunt−2Gun0Hockey helmet')
  })
})
