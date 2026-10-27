// @vitest-environment jsdom
/**
 * The Speed connection (spec 5.3): gear's Speed losses on the Core page's
 * Speed circle and its note, and the Effects panel's "From your gear" group
 * with its Turn off switch, through the Lubec character tab over the shared
 * store with `firebase/firestore` stubbed, as `LubecStrengthCheck.test.tsx`
 * mounts it. Rolls draw from seeded dice. Tommy Eves's Speed is 51 + 5 class
 * = 56 and his Strength 24 + 5 class = 29.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { User } from 'firebase/auth'
import type { Campaign, Role } from '../../../types/app'
import type { LubecDice } from '../../ruleSets/lubec/dice'

// These cases mount large component trees and run role queries over them in jsdom, as the other tab suites do.
vi.setConfig({ testTimeout: 30_000 })

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
  deleteDoc: vi.fn(),
  onSnapshot: (ref: Ref, next: Listener['next'], fail: Listener['fail']) => {
    mocks.listeners[ref.path] = { next, fail }
    if (ref.path.split('/').length % 2 === 0) queueMicrotask(() => next(docSnap(ref.path)))
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
const { LubecDiceContext } = await import('../useLubecRoller')

const CHARACTERS_PATH = 'groups/group-1/campaigns/campaign-1/characters'
const TOMMY = `${CHARACTERS_PATH}/tommy`
const GM = 'gm-1'

const campaign: Campaign = { id: 'campaign-1', name: 'Lubec', status: 'active', groupId: 'group-1', gmUserId: GM, system: 'lubec' }

/** Every stored document, by path. */
let database: Record<string, Fields> = {}
let clock = 0

const isMap = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value)
const isSentinel = (value: unknown) => isMap(value) && value.sentinel === 'serverTimestamp'

// The server's time on a write: later on every write, as Firestore's is, which a move waits to see.
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

const write = (ref: Ref, payload: Fields, options?: { merge?: boolean }) => {
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

// The d100 results the next rolls land on, in order; a roll past the last one fails the test.
let seededRolls: number[] = []
const seededDice: LubecDice = () => {
  const next = seededRolls.shift()
  if (next === undefined) throw new Error('No seeded roll left')
  return (next - 0.5) / 100
}

const T = (id: string, carrier: string, at: number | null, name: string, extra: Fields = {}) => ({
  id, kind: 'thing', carrier, ...(['hands', 'body'].includes(carrier) ? { slot: at } : { pocket: at }), name, size: 1, qty: 1, weight: 'normal', note: '', ...extra,
})

const ankle = { id: 'e1', name: 'Twisted ankle', cause: 'Fell off the wharf', steps: [{ modifiers: [{ target: 'Speed', amount: -36 }], labels: [] }] }

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

const withGear = (items: Fields[], lubec: Fields = {}, overrides: string[] = []) => tommyEves({ gear: { items, carriers: [], overrides, supplies: [] }, ...lubec })

function mountTab(role: Role, uid: string) {
  const LubecSheet = ruleSetSheets.lubec
  const view = render(
    <LubecDiceContext.Provider value={seededDice}>
      <LubecSheet campaign={campaign} role={role} user={{ uid } as User} username="viewer1" setError={vi.fn()} characterTabProps={null} />
    </LubecDiceContext.Provider>,
  )
  act(() => emitCharacters())
  return view
}

const pageTabs = () => within(screen.getByRole('navigation', { name: 'Character sheet pages' }))
const gearTab = () => pageTabs().getByRole('button', { name: /^Gear/ })

function openGear() {
  fireEvent.click(screen.getByRole('button', { name: /^Tommy Eves/ }))
  fireEvent.click(gearTab())
}

const prompt = () => screen.queryByRole('dialog', { name: /is (extra )?heavy$/ })
const inPrompt = () => within(prompt() as HTMLElement)
const strengthCircle = (root: HTMLElement) => root.querySelector('.ability .roll-circle') as HTMLButtonElement

// The add form, filled with a thing of this name and weight, and Add it pressed.
function addThing(name: string, weight: 'Heavy' | 'Extra heavy') {
  fireEvent.click(screen.getByRole('button', { name: '+ Add an item' }))
  const form = within(screen.getByRole('dialog', { name: 'Add an item' }))
  fireEvent.change(form.getByRole('combobox', { name: 'Name' }), { target: { value: name } })
  fireEvent.click(form.getByRole('radio', { name: new RegExp(`^${weight}`) }))
  fireEvent.click(form.getByRole('button', { name: 'Add it' }))
  return form
}

const stored = () => database[TOMMY].lubec as Fields
const storedItems = () => (stored().gear as Fields).items as Fields[]
const storedOverrides = () => (stored().gear as Fields).overrides as string[]

function saveNow() {
  act(() => vi.advanceTimersByTime(500))
  act(() => emitCharacters())
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listeners = {}
  database = {}
  clock = 0
  seededRolls = []
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
const speedAbility = () => screen.getByText('Speed', { selector: '.ability-name' }).closest('.ability') as HTMLElement
const speedTarget = () => speedAbility().querySelector('.roll-circle')?.getAttribute('aria-label')
const speedNote = () => speedAbility().querySelector('.base-note')?.textContent
const fromGear = () => screen.queryByRole('list', { name: 'From your gear' })
const gearLines = () => within(fromGear() as HTMLElement).getAllByRole('listitem').map((line) => line.querySelector('.lubec-effect-line')?.textContent)
const openCore = () => fireEvent.click(pageTabs().getByRole('button', { name: 'Core sheet' }))
const openTommy = () => fireEvent.click(screen.getByRole('button', { name: /^Tommy Eves/ }))

const anvil = T('a', 'backpack', 0, 'Small anvil', { weight: 'heavy', check: 'fail' })

// Wayne Gardner's things on him, from the prototype's sample: a full backpack, full hands and full body slots (Rule W6).
const FULL = [
  T('i1', 'backpack', 0, 'Flashlight', { kind: 'holder', hold: 'load', takes: 'dcell', capacity: 2, loaded: 2 }),
  T('i2', 'backpack', 0, 'Small anvil', { weight: 'heavy', check: 'pass' }),
  T('i3', 'backpack', 0, 'Peanut butter sandwich', { kind: 'consumable', qty: 1, per: 2 }),
  T('i4', 'backpack', 0, 'D batteries', { kind: 'consumable', qty: 2, per: 4, fits: 'dcell' }),
  T('i5', 'backpack', 0, 'Wool watch cap'),
  T('i6', 'backpack', 1, 'Box of .38 rounds', { kind: 'holder', hold: 'box', takes: 'a38', capacity: 50, loaded: 12 }),
  T('i7', 'backpack', 2, 'Photocopied 1898 map'),
  T('i8', 'hands', 0, "Grandpa's revolver", { kind: 'weapon', mode: 'firearm', capacity: 6, loaded: 0, takes: 'a38' }),
  T('i9', 'hands', 1, 'Walkie-talkie'),
  T('i10', 'body', 0, 'Rain slicker'),
  T('i11', 'body', 1, 'Pocketknife', { size: 0, kind: 'weapon', mode: 'melee', wounds: ['cut', 'pierce'] }),
]

describe('a heavy thing\'s Strength roll on the Core page\'s Speed', () => {
  it('lowers Speed by 20 for a failed anvil, notes it as gear, lists it under "From your gear", and Turn off restores it through a remount', () => {
    vi.useFakeTimers()
    database = { [TOMMY]: tommyEves() }
    mountTab('player', 'player-1')
    openGear()
    addThing('Small anvil', 'Heavy')
    seededRolls = [30]
    fireEvent.click(strengthCircle(prompt() as HTMLElement))
    fireEvent.click(inPrompt().getByRole('button', { name: 'Done' }))
    saveNow()
    const key = `heavy:${storedItems()[0].id as string}`

    openCore()
    expect(speedTarget()).toBe('Roll Speed at or under 36')
    expect(speedNote()).toBe('51 +5 class -20 gear')
    expect(gearLines()).toEqual(['Small anvil: heavy, Strength failedSpeed -20'])

    fireEvent.click(within(fromGear() as HTMLElement).getByRole('button', { name: 'Turn off Small anvil: heavy, Strength failed' }))
    expect(speedTarget()).toBe('Roll Speed at or under 56')
    expect(speedNote()).toBe('51 +5 class')
    expect(gearLines()).toEqual(['Small anvil: heavy, Strength failedSpeed -20turned off'])
    saveNow()
    expect(storedOverrides()).toEqual([key])

    cleanup()
    mountTab('player', 'player-1')
    openTommy()
    expect(speedTarget()).toBe('Roll Speed at or under 56')
    fireEvent.click(within(fromGear() as HTMLElement).getByRole('button', { name: 'Turn on Small anvil: heavy, Strength failed' }))
    expect(speedTarget()).toBe('Roll Speed at or under 36')
    saveNow()
    expect(storedOverrides()).toEqual([])
  })

  it('changes no Speed for a passed anvil, and shows no "From your gear"', () => {
    vi.useFakeTimers()
    database = { [TOMMY]: tommyEves() }
    mountTab('player', 'player-1')
    openGear()
    addThing('Small anvil', 'Heavy')
    seededRolls = [12]
    fireEvent.click(strengthCircle(prompt() as HTMLElement))
    fireEvent.click(inPrompt().getByRole('button', { name: 'Done' }))
    saveNow()

    openCore()
    expect(speedTarget()).toBe('Roll Speed at or under 56')
    expect(speedNote()).toBe('51 +5 class')
    expect(fromGear()).toBeNull()
  })

  it('offers the switch to the GM, and shows another player the losses with no switch', () => {
    database = { [TOMMY]: withGear([anvil]) }
    mountTab('gm', GM)
    openTommy()
    expect(within(fromGear() as HTMLElement).getByRole('button', { name: 'Turn off Small anvil: heavy, Strength failed' })).toBeTruthy()

    cleanup()
    mountTab('player', 'player-2')
    openTommy()
    expect(gearLines()).toEqual(['Small anvil: heavy, Strength failedSpeed -20'])
    expect(within(fromGear() as HTMLElement).queryByRole('button')).toBeNull()
  })

  it('forgets a switched-off loss once it stops being true, so it counts again when it comes back', () => {
    vi.useFakeTimers()
    database = { [TOMMY]: withGear([{ ...anvil, carrier: 'hands', slot: 0, pocket: undefined }], {}, ['heavy:a']) }
    mountTab('player', 'player-1')
    openGear()
    fireEvent.click(screen.getByRole('button', { name: /^Both hands.*Small anvil/ }))
    const card = within(screen.getByRole('dialog', { name: 'Small anvil' }))
    fireEvent.click(card.getByRole('button', { name: 'Passed' }))
    saveNow()
    expect(storedOverrides()).toEqual([])

    fireEvent.click(card.getByRole('button', { name: 'Failed' }))
    saveNow()
    expect(storedItems()).toMatchObject([{ id: 'a', check: 'fail' }])
    fireEvent.click(card.getByRole('button', { name: 'Close' }))
    openCore()
    expect(speedTarget()).toBe('Roll Speed at or under 36')
  })
})

describe('an 8-slot thing and a full inventory', () => {
  it('lowers Speed by 20 for an 8-slot thing on you', () => {
    database = { [TOMMY]: withGear([T('b', 'hands', 0, 'Buster', { size: 8 })]) }
    mountTab('player', 'player-1')
    openTommy()
    expect(speedTarget()).toBe('Roll Speed at or under 36')
    expect(speedNote()).toBe('51 +5 class -20 gear')
    expect(gearLines()).toEqual(['Buster: 8 slots, encumbering' + 'Speed -20'])
  })

  it('lowers Speed by 10 for a full inventory, with the tag on the Gear bar', () => {
    database = { [TOMMY]: withGear(FULL) }
    mountTab('player', 'player-1')
    openTommy()
    expect(speedTarget()).toBe('Roll Speed at or under 46')
    expect(speedNote()).toBe('51 +5 class -10 gear')
    expect(gearLines()).toEqual(['Full inventory' + 'Speed -10'])

    fireEvent.click(gearTab())
    expect(screen.getByText('Full inventory / Speed −10').className).toBe('tag red')
  })
})

describe('Speed at 0', () => {
  it('reads immobile, with one part that adds up where the floor clips', () => {
    database = { [TOMMY]: withGear([anvil], { effects: [ankle] }) }
    mountTab('player', 'player-1')
    openTommy()
    expect(speedTarget()).toBe('Roll Speed at or under 0')
    expect(speedNote()).toBe('51 +5 class -36 effect -20 gear, immobile')

    cleanup()
    database = { [TOMMY]: withGear([anvil, T('b', 'hands', 0, 'Buster', { size: 8 })], { effects: [ankle] }) }
    mountTab('player', 'player-1')
    openTommy()
    expect(speedNote()).toBe('51 +5 class -56 effect and gear, immobile')
  })
})
