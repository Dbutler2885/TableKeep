// @vitest-environment jsdom
/**
 * Moves, swaps, drag and drop, and the drop, through the Lubec character tab
 * mounted as the shell mounts it, over the shared character store with
 * `firebase/firestore` stubbed. Documents are kept by path, so a drop's
 * transaction can write the character and a new GM item together, as
 * Firestore does. jsdom draws nothing, so a drag here runs over boxes given
 * made-up rectangles; the browser smoke drags with real pointer events.
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

const CHARACTERS_PATH = 'groups/group-1/campaigns/campaign-1/characters'
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

// Wayne Gardner's things on him, from the prototype's sample: a full backpack, full hands and full body slots.
const FULL = [
  T('i1', 'backpack', 0, 'Flashlight', 1, { kind: 'holder', hold: 'load', takes: 'dcell', capacity: 2, loaded: 2 }),
  T('i2', 'backpack', 0, 'Small anvil', 1, { weight: 'heavy', check: 'fail' }),
  T('i3', 'backpack', 0, 'Peanut butter sandwich', 1, { kind: 'consumable', qty: 1, per: 2 }),
  T('i4', 'backpack', 0, 'D batteries', 1, { kind: 'consumable', qty: 2, per: 4, fits: 'dcell' }),
  T('i5', 'backpack', 0, 'Wool watch cap', 1),
  T('i6', 'backpack', 1, 'Box of .38 rounds', 1, { kind: 'holder', hold: 'box', takes: 'a38', capacity: 50, loaded: 12 }),
  T('i7', 'backpack', 2, 'Photocopied 1898 map', 1),
  T('i8', 'hands', 0, "Grandpa's revolver", 1, { kind: 'weapon', mode: 'firearm', capacity: 6, loaded: 0, takes: 'a38' }),
  T('i9', 'hands', 1, 'Walkie-talkie', 1),
  T('i10', 'body', 0, 'Rain slicker', 1),
  T('i11', 'body', 1, 'Pocketknife', 0, { kind: 'weapon', mode: 'melee', wounds: ['cut', 'pierce'] }),
]

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
const gmItems = () => Object.entries(database).filter(([path]) => path.startsWith(`${GM_ITEMS_PATH}/`))

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

describe('the card\'s Move panel', () => {
  it('moves a thing in one commit, with B\'s cost line and toast, and closes the panel', () => {
    vi.useFakeTimers()
    database = { [TOMMY]: tommyEves({ items: [T('w', 'hands', 1, 'Walkie-talkie', 1)] }) }
    mountTab('player', 'player-1')
    openGear()

    const card = openCard('Walkie-talkie')
    expect(card.getAllByRole('button').map((b) => b.textContent)).toEqual(['×', 'Edit', 'Move', 'Give', 'Drop / free'])
    fireEvent.click(card.getByRole('button', { name: 'Move' }))
    expect(card.getByRole('button', { name: 'Move' }).getAttribute('aria-expanded')).toBe('true')
    const select = card.getByRole('combobox', { name: 'Move to' }) as HTMLSelectElement
    expect(select.value).toBe('backpack#0')
    expect(card.getByText('From a hand to the backpack: 2 actions.')).toBeTruthy()

    fireEvent.change(select, { target: { value: 'body' } })
    expect(card.getByText('From a hand to the body: 1 action.')).toBeTruthy()
    fireEvent.click(card.getByRole('button', { name: 'Move it' }))

    expect(screen.getByRole('status').textContent).toBe('Walkie-talkie: Body slot. 1 action.')
    expect(card.queryByRole('combobox', { name: 'Move to' })).toBeNull()
    expect(card.getByText('Body slot')).toBeTruthy()
    act(() => vi.advanceTimersByTime(500))
    expect(mocks.setDoc).toHaveBeenCalledTimes(1)
    expect(storedItem('w')).toMatchObject({ carrier: 'body', slot: 0 })
  })

  it('refuses a move when everything is full, pointing at swapping, and swaps through the list', () => {
    vi.useFakeTimers()
    database = { [TOMMY]: tommyEves({ items: FULL }) }
    mountTab('player', 'player-1')
    openGear()

    const card = openCard("Grandpa's revolver")
    fireEvent.click(card.getByRole('button', { name: 'Move' }))
    const select = card.getByRole('combobox', { name: 'Move to' }) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'backpack#0' } })
    fireEvent.click(card.getByRole('button', { name: 'Move it' }))
    expect(card.getByRole('alert').textContent).toBe('Main pocket is full: 0 of 5 free, and this needs 1. Or swap it: pick "Swap with" a thing in this list, or drag it onto one.')

    const swaps = within(select.querySelector('optgroup[label="Swap places"]') as HTMLElement).getAllByRole('option') as HTMLOptionElement[]
    expect(swaps.filter((o) => o.disabled).map((o) => o.textContent)).toEqual(['Swap with Small anvil (backpack, main pocket)'])
    fireEvent.change(select, { target: { value: 'swap:i1' } })
    expect(card.getByText('Swapping with the flashlight: 4 actions (a guess).')).toBeTruthy()
    fireEvent.click(card.getByRole('button', { name: 'Swap' }))

    expect(screen.getByRole('status').textContent).toBe("Grandpa's revolver: Backpack, main pocket. Flashlight: Left hand. 4 actions (a guess).")
    act(() => vi.advanceTimersByTime(500))
    expect(mocks.setDoc).toHaveBeenCalledTimes(1)
    expect([storedItem('i8')?.carrier, storedItem('i1')?.carrier]).toEqual(['backpack', 'hands'])
  })
})

describe('the drop (Rule M8)', () => {
  it('takes the thing off the sheet and makes one dropped GM item, with who dropped it and from where', async () => {
    database = { [TOMMY]: tommyEves({ items: FULL }) }
    mountTab('player', 'player-1')
    openGear()

    const card = openCard('Flashlight')
    fireEvent.click(card.getByRole('button', { name: 'Drop' }))
    expect(card.getByRole('button', { name: 'Moving...' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('status').textContent).toBe('Moving...')

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Dropped the flashlight. It goes to the GM.'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(slotOf('Flashlight')).toBeUndefined()
    expect(storedItem('i1')).toBeUndefined()
    expect(storedItems()).toHaveLength(FULL.length - 1)
    expect(gmItems().map(([path, data]) => [idOf(path), data])).toEqual([['i1', {
      id: 'i1', kind: 'holder', name: 'Flashlight', note: '', size: 1, weight: 'normal', qty: 1, hold: 'load', takes: 'dcell', capacity: 2, loaded: 2,
      status: 'dropped', droppedByCharacterId: 'tommy', droppedByCharacterName: 'Tommy Eves', droppedByUserId: 'player-1', droppedFrom: 'backpack',
      createdAt: expect.objectContaining({ seconds: expect.any(Number) }),
    }]])
    expect(database[TOMMY].schemaWrittenAt).toBeDefined()
  })

  it('says a drop from a hand is free on its button', () => {
    database = { [TOMMY]: tommyEves({ items: FULL }) }
    mountTab('gm', GM)
    openGear()
    expect(openCard('Walkie-talkie').getByRole('button', { name: 'Drop / free' })).toBeTruthy()
  })

  it('drops through the Move list\'s "Drop it" as the Drop button does', async () => {
    database = { [TOMMY]: tommyEves({ items: FULL }) }
    mountTab('gm', GM)
    openGear()

    const card = openCard('Small anvil')
    fireEvent.click(card.getByRole('button', { name: 'Move' }))
    fireEvent.change(card.getByRole('combobox', { name: 'Move to' }), { target: { value: 'drop' } })
    expect(card.getByText('Dropping it from the backpack: 2 actions.')).toBeTruthy()
    fireEvent.click(card.getByRole('button', { name: 'Move it' }))

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Dropped the small anvil. It goes to the GM.'))
    expect(gmItems().map(([, data]) => [data.name, data.droppedByUserId, data.check])).toEqual([['Small anvil', GM, undefined]])
  })

  it('keeps the card open with the reason when someone moved the thing first, and changes nothing', async () => {
    database = { [TOMMY]: tommyEves({ items: FULL }) }
    mountTab('player', 'player-1')
    openGear()

    const card = openCard('Flashlight')
    const moved = tommyEves({ items: FULL.map((i) => (i.id === 'i1' ? { ...i, carrier: 'body', slot: 0 } : i)) })
    database[TOMMY] = moved
    fireEvent.click(card.getByRole('button', { name: 'Drop' }))

    await waitFor(() => expect(card.getByRole('alert').textContent).toBe('Someone moved that first. Nothing changed.'))
    expect(gmItems()).toEqual([])
    expect(database[TOMMY]).toBe(moved)
  })

  it('uses up a consumable at 0 without making a GM item (Rule K4)', () => {
    database = { [TOMMY]: tommyEves({ items: FULL }) }
    mountTab('player', 'player-1')
    openGear()

    fireEvent.click(openCard('Peanut butter sandwich').getByRole('button', { name: 'Use one' }))

    expect(screen.getByRole('status').textContent).toBe('Peanut butter sandwich: used up.')
    expect(slotOf('Peanut butter sandwich')).toBeUndefined()
    expect(mocks.runTransaction).not.toHaveBeenCalled()
    expect(gmItems()).toEqual([])
  })

  it('frees a hand from the Fight bar\'s "Drop it, free" when both hold things that are not weapons, and Fisticuffs comes back', async () => {
    database = { [TOMMY]: tommyEves({ items: [T('th', 'hands', 0, 'Thermos', 1), T('w', 'hands', 1, 'Walkie-talkie', 1)] }) }
    mountTab('player', 'player-1')
    fireEvent.click(screen.getByRole('button', { name: /^Tommy Eves/ }))
    const fight = within(screen.getByRole('region', { name: 'Fight controls' }))
    fireEvent.click(fight.getByRole('button', { name: /^Fight/ }))
    expect(fight.getByRole('button', { name: /^Fisticuffs/ })).toHaveProperty('disabled', true)

    fireEvent.click(fight.getByRole('button', { name: 'Drop Walkie-talkie, free' }))

    await waitFor(() => expect(fight.getByRole('status').textContent).toBe('Dropped the walkie-talkie. It goes to the GM.'))
    expect(storedItems().map((i) => i.id)).toEqual(['th'])
    expect(gmItems().map(([path, data]) => [idOf(path), data.status, data.droppedFrom])).toEqual([['w', 'dropped', 'hands']])
    expect([...document.querySelectorAll('.lubec-in-hand > *')].map((chip) => chip.textContent)).toEqual(['Left hand: Thermos', 'Empty hand', 'FisticuffsHandle 55'])
    expect(fight.getByRole('button', { name: /^Fisticuffs/ })).toHaveProperty('disabled', false)
  })
})

// The boxes jsdom draws all at 0 by 0, so each one the drag reads is given a box of its own.
function layOut(gear: HTMLElement) {
  const boxes = [...gear.querySelectorAll<HTMLElement>('[data-drop], [data-item], .pack')]
  boxes.forEach((el, n) => {
    const left = 100 * (n % 8), top = 100 * Math.floor(n / 8)
    el.getBoundingClientRect = () => ({ left, top, right: left + 80, bottom: top + 80, width: 80, height: 80, x: left, y: top, toJSON: () => ({}) })
  })
  return (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    return { clientX: r.left + 40, clientY: r.top + 40 }
  }
}

const press = (type: string, el: Element | Document, at: { clientX: number; clientY: number }, pointerType = 'mouse') =>
  fireEvent(el, new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType, isPrimary: true, button: 0, ...at }))

describe('drag and drop (Rule M7)', () => {
  it('picks a thing up after a few pixels, lights where it can go, and moves it where it is let go, as the Move button would', () => {
    vi.useFakeTimers()
    database = { [TOMMY]: tommyEves({ items: [T('w', 'hands', 1, 'Walkie-talkie', 1), T('c', 'body', 0, 'Rain slicker', 1)] }) }
    mountTab('player', 'player-1')
    const centre = layOut(openGear())
    const walkie = slotOf('Walkie-talkie'), body = document.querySelector('[data-drop="body#1"]') as HTMLElement

    press('pointerdown', walkie, centre(walkie))
    press('pointermove', document, { clientX: centre(walkie).clientX + 2, clientY: centre(walkie).clientY })
    expect(document.querySelector('.drag-ghost')).toBeNull()
    press('pointermove', document, { clientX: centre(walkie).clientX + 12, clientY: centre(walkie).clientY })

    expect(slotOf('Walkie-talkie').classList).toContain('drag-src')
    expect(document.body.classList).toContain('lubec-dragging')
    expect(body.classList).toContain('drop-ok')
    expect(slotOf('Rain slicker').classList).toContain('drop-swap')
    expect(document.querySelectorAll('.pack .drop-cell')).toHaveLength(5)
    expect(screen.getByText('Drop it').closest('.drop-ground')).toBeTruthy()

    press('pointermove', document, centre(body))
    expect(body.classList).toContain('drop-hot')
    expect(document.querySelector('.drag-ghost .chip')?.textContent).toBe('1 action')
    press('pointerup', document, centre(body))

    expect(document.querySelector('.drag-ghost')).toBeNull()
    expect(document.body.classList).not.toContain('lubec-dragging')
    expect(screen.getByRole('status').textContent).toBe('Walkie-talkie: Body slot. 1 action.')
    fireEvent.click(slotOf('Walkie-talkie'))
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => vi.advanceTimersByTime(500))
    expect(storedItem('w')).toMatchObject({ carrier: 'body', slot: 1 })
  })

  it('swaps two things when one is let go on the other', () => {
    vi.useFakeTimers()
    database = { [TOMMY]: tommyEves({ items: FULL }) }
    mountTab('player', 'player-1')
    const centre = layOut(openGear())
    const walkie = slotOf('Walkie-talkie'), slicker = slotOf('Rain slicker')

    press('pointerdown', walkie, centre(walkie))
    press('pointermove', document, centre(slicker))
    expect(document.querySelector('.drag-ghost .chip')?.textContent).toBe('Swap with the rain slicker: 1 action (a guess)')
    press('pointerup', document, centre(slicker))

    expect(screen.getByRole('status').textContent).toBe('Walkie-talkie: Body slot. Rain slicker: Right hand. 1 action (a guess).')
  })

  it('says why when a thing is let go where it can\'t go, and leaves it', () => {
    database = { [TOMMY]: tommyEves({ items: FULL }) }
    mountTab('player', 'player-1')
    const centre = layOut(openGear())
    const walkie = slotOf('Walkie-talkie'), anvil = slotOf('Small anvil')

    press('pointerdown', walkie, centre(walkie))
    press('pointermove', document, centre(anvil))
    expect(anvil.classList).toContain('drop-no')
    expect(document.querySelector('.drag-ghost .chip.no')?.textContent).toBe("Small anvil can't go where Walkie-talkie was. A heavy thing takes both hands. Empty both hands first.")
    press('pointerup', document, centre(anvil))

    expect(screen.getByRole('status').textContent).toBe("Small anvil can't go where Walkie-talkie was. A heavy thing takes both hands. Empty both hands first.")
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('drops a thing let go on the drop zone to the GM', async () => {
    database = { [TOMMY]: tommyEves({ items: FULL }) }
    mountTab('player', 'player-1')
    const centre = layOut(openGear())
    const walkie = slotOf('Walkie-talkie')

    press('pointerdown', walkie, centre(walkie))
    press('pointermove', document, { clientX: 5000, clientY: 5000 })
    const zone = document.querySelector('.drop-ground') as HTMLElement
    zone.getBoundingClientRect = () => ({ left: 4900, top: 4900, right: 5100, bottom: 5100, width: 200, height: 200, x: 4900, y: 4900, toJSON: () => ({}) })
    press('pointermove', document, { clientX: 5000, clientY: 5000 })
    expect(zone.classList).toContain('drop-hot')
    expect(document.querySelector('.drag-ghost .chip')?.textContent).toBe('Free')
    press('pointerup', document, { clientX: 5000, clientY: 5000 })

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Dropped the walkie-talkie. It goes to the GM.'))
    expect(gmItems().map(([, data]) => [data.name, data.droppedFrom])).toEqual([['Walkie-talkie', 'hands']])
  })

  it('needs a finger to hold still before it picks a thing up, so a swipe still scrolls', () => {
    vi.useFakeTimers()
    database = { [TOMMY]: tommyEves({ items: FULL }) }
    mountTab('player', 'player-1')
    const centre = layOut(openGear())
    const walkie = slotOf('Walkie-talkie')

    press('pointerdown', walkie, centre(walkie), 'touch')
    press('pointermove', document, { clientX: centre(walkie).clientX, clientY: centre(walkie).clientY + 30 }, 'touch')
    act(() => vi.advanceTimersByTime(300))
    expect(document.querySelector('.drag-ghost')).toBeNull()
    press('pointerup', document, centre(walkie), 'touch')

    press('pointerdown', walkie, centre(walkie), 'touch')
    act(() => vi.advanceTimersByTime(300))
    expect(document.querySelector('.drag-ghost')).not.toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.querySelector('.drag-ghost')).toBeNull()
  })

  it('keeps the page from scrolling or opening its menu under a drag, and lets a cancelled pointer drop nothing', () => {
    database = { [TOMMY]: tommyEves({ items: FULL }) }
    mountTab('player', 'player-1')
    const centre = layOut(openGear())
    const walkie = slotOf('Walkie-talkie')

    press('pointerdown', walkie, centre(walkie))
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    walkie.dispatchEvent(menu)
    expect(menu.defaultPrevented).toBe(true)
    const swipe = new Event('touchmove', { bubbles: true, cancelable: true })
    document.dispatchEvent(swipe)
    expect(swipe.defaultPrevented).toBe(false)

    press('pointermove', document, { clientX: 0, clientY: 0 })
    const drag = new Event('touchmove', { bubbles: true, cancelable: true })
    document.dispatchEvent(drag)
    expect(drag.defaultPrevented).toBe(true)

    press('pointercancel', document, { clientX: 0, clientY: 0 })
    expect(document.querySelector('.drag-ghost')).toBeNull()
    press('pointerup', document, { clientX: 0, clientY: 0 })
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('scrolls the page while the pointer is near the window\'s bottom edge, and stops when it leaves', async () => {
    database = { [TOMMY]: tommyEves({ items: FULL }) }
    mountTab('player', 'player-1')
    const centre = layOut(openGear())
    const walkie = slotOf('Walkie-talkie')
    const scroller = document.scrollingElement ?? document.documentElement
    const scrollBy = vi.fn()
    scroller.scrollBy = scrollBy as unknown as Element['scrollBy']

    press('pointerdown', walkie, centre(walkie))
    press('pointermove', document, { clientX: 10, clientY: window.innerHeight - 10 })
    await waitFor(() => expect(scrollBy).toHaveBeenCalledWith(0, 10))
    press('pointermove', document, { clientX: 10, clientY: window.innerHeight / 2 })
    const calls = scrollBy.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(scrollBy.mock.calls.length).toBeLessThanOrEqual(calls + 1)
    press('pointerup', document, { clientX: 10, clientY: window.innerHeight / 2 })
  })

  it('offers another player nothing to drag', () => {
    database = { [TOMMY]: tommyEves({ items: FULL }) }
    mountTab('player', 'player-2')
    const centre = layOut(openGear())
    const walkie = slotOf('Walkie-talkie')

    press('pointerdown', walkie, centre(walkie))
    press('pointermove', document, { clientX: 0, clientY: 0 })
    expect(document.querySelector('.drag-ghost')).toBeNull()
  })
})
