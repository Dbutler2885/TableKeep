// @vitest-environment jsdom
/**
 * The Strength check for a heavy thing (Rule E5, spec 5.5), through the Lubec
 * character tab over the shared store with `firebase/firestore` stubbed, as
 * `LubecGearMoves.test.tsx` mounts it. Rolls draw from seeded dice provided
 * around the tab, as `LubecCharacterTab.test.tsx` does. Tommy Eves's Strength
 * is 24 + 5 class = 29, and he starts with 2 Stress.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { User } from 'firebase/auth'
import type { Campaign, Role } from '../../../types/app'
import type { LubecDice } from '../../ruleSets/lubec/dice'

// These cases mount large component trees and run role queries over them in jsdom, as the other tab suites do.
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
const GM_ITEMS_PATH = 'groups/group-1/campaigns/campaign-1/gmItems'
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

const sprain = { id: 'e1', name: 'Sprain', cause: 'Fell off the wharf', steps: [{ modifiers: [{ target: 'Strength', amount: -9 }], labels: [] }] }

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

const withItems = (...items: Fields[]) => tommyEves({ gear: { items, carriers: [], overrides: [], supplies: [] } })

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
const storedStress = () => (stored().counters as Fields | undefined)?.stress
const gmItems = () => Object.entries(database).filter(([path]) => path.startsWith(`${GM_ITEMS_PATH}/`))

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

describe('the Strength prompt for a heavy thing added onto you', () => {
  it('shows Strength from the sheet, a Strength effect counted, with the Core page\'s circle, and Cancel changes nothing', () => {
    vi.useFakeTimers()
    database = { [TOMMY]: tommyEves({ effects: [sprain] }) }
    mountTab('player', 'player-1')
    openGear()

    addThing('Small anvil', 'Heavy')

    expect(inPrompt().getByText('Strength check')).toBeTruthy()
    expect(prompt()?.querySelector('.prompt-text')?.textContent).toBe('Roll Strength (20). Passed: no penalty. Failed: Speed −20 while you carry it, and +1 Stress.')
    expect(strengthCircle(prompt() as HTMLElement).getAttribute('aria-label')).toBe('Roll Strength at or under 20')
    expect(inPrompt().getByRole('group', { name: 'Advantage' })).toBeTruthy()
    expect(inPrompt().getAllByRole('button').map((b) => b.textContent)).toEqual(['×', '20', 'Advantage', 'Normal', 'Disadvantage', 'Cancel'])

    fireEvent.click(inPrompt().getByRole('button', { name: 'Cancel' }))
    expect(prompt()).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Add an item' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add it' }))
    fireEvent.keyDown(prompt() as HTMLElement, { key: 'Escape' })
    expect(prompt()).toBeNull()

    saveNow()
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('rolls a failure through the Core roller: no Cancel after it, and Done adds the anvil failed, with the Stress, and the roll on the Core page', () => {
    vi.useFakeTimers()
    database = { [TOMMY]: tommyEves() }
    mountTab('player', 'player-1')
    openGear()
    addThing('Small anvil', 'Heavy')

    seededRolls = [30]
    fireEvent.click(strengthCircle(prompt() as HTMLElement))

    expect(inPrompt().getAllByRole('button').map((b) => b.textContent)).toEqual(['30/29', 'Done'])
    expect(strengthCircle(prompt() as HTMLElement).disabled).toBe(true)
    expect(strengthCircle(prompt() as HTMLElement).classList).toContain('check-failure')
    expect(inPrompt().getByRole('status').textContent).toBe('Strength: 30 vs 29 - failure, +1 Stress.')
    fireEvent.keyDown(prompt() as HTMLElement, { key: 'Escape' })
    expect(prompt()).not.toBeNull()

    fireEvent.click(inPrompt().getByRole('button', { name: 'Done' }))
    expect(prompt()).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Add an item' })).toBeNull()
    expect(screen.getAllByRole('status').at(-1)?.textContent).toBe('Small anvil: Backpack, main pocket.')

    saveNow()
    expect(storedItems()).toMatchObject([{ name: 'Small anvil', weight: 'heavy', check: 'fail', carrier: 'backpack', pocket: 0 }])
    expect(storedStress()).toBe(3)
    expect(stored().lastRoll).toMatchObject({ kind: 'stat-check', against: 'Strength', target: 29, result: 30, outcome: 'failure', stressAdded: 1 })

    const slot = [...document.querySelectorAll<HTMLElement>('.lubec-gear .slot.item')].find((el) => el.textContent?.includes('Small anvil')) as HTMLElement
    fireEvent.click(slot)
    const card = within(screen.getByRole('dialog', { name: 'Small anvil' }))
    expect(card.getByText(/Strength failed: Speed −20\./)).toBeTruthy()
    expect(card.getByRole('button', { name: 'Failed' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(card.getByRole('button', { name: 'Close' }))

    fireEvent.click(pageTabs().getByRole('button', { name: 'Core sheet' }))
    const core = screen.getByText('Strength', { selector: '.ability-name' }).closest('.ability') as HTMLElement
    expect(strengthCircle(core).textContent).toBe('30/29')
    expect(strengthCircle(core).classList).toContain('check-failure')
  })

  it('adds no Stress for a pass, and records it passed', () => {
    vi.useFakeTimers()
    database = { [TOMMY]: tommyEves() }
    mountTab('player', 'player-1')
    openGear()
    addThing('Small anvil', 'Heavy')

    seededRolls = [12]
    fireEvent.click(strengthCircle(prompt() as HTMLElement))
    expect(strengthCircle(prompt() as HTMLElement).classList).toContain('check-success')
    fireEvent.click(inPrompt().getByRole('button', { name: 'Done' }))

    saveNow()
    expect(storedItems()).toMatchObject([{ name: 'Small anvil', check: 'pass' }])
    expect(storedStress()).toBe(2)
    expect(stored().lastRoll).toMatchObject({ against: 'Strength', outcome: 'success', stressAdded: 0 })
  })

  it('keeps the form open with B\'s words when an extra heavy thing fails, adding nothing, and the Stress stays', () => {
    vi.useFakeTimers()
    database = { [TOMMY]: tommyEves() }
    mountTab('player', 'player-1')
    openGear()
    const form = addThing('Mushroom anchor', 'Extra heavy')

    expect(prompt()?.querySelector('.prompt-text')?.textContent).toBe("Roll Strength (29). Passed: you carry it, Speed −20 the whole time. Failed: you can't carry it, and +1 Stress.")
    seededRolls = [80]
    fireEvent.click(strengthCircle(prompt() as HTMLElement))
    fireEvent.click(inPrompt().getByRole('button', { name: 'Done' }))

    expect(form.getByRole('alert').textContent).toBe("Strength failed: you can't carry Mushroom anchor. Pick a carrier.")
    saveNow()
    expect(storedItems()).toEqual([])
    expect(storedStress()).toBe(3)
  })

  it('asks the GM about a heavy thing for their own character, and not for a player\'s, whose page then asks its owner', () => {
    vi.useFakeTimers()
    database = { [TOMMY]: tommyEves() }
    mountTab('gm', GM)
    openGear()
    expect(gearTab().querySelector('.lubec-page-dot')).toBeNull()

    addThing('Small anvil', 'Heavy')
    expect(prompt()).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    saveNow()
    expect(storedItems()).toEqual([expect.not.objectContaining({ check: expect.anything() })])
    expect(gearTab().querySelector('.lubec-page-dot')).toBeNull()

    cleanup()
    database[TOMMY] = { ...database[TOMMY], ownerUserId: GM }
    mountTab('gm', GM)
    openGear()
    expect(prompt()).not.toBeNull()
  })
})

describe('a heavy thing that came with no roll', () => {
  it('puts a dot on the owner\'s Gear tab and asks when the page opens; Cancel leaves it waiting, and Done records it', () => {
    vi.useFakeTimers()
    database = { [TOMMY]: withItems(T('a', 'backpack', 0, 'Small anvil', { weight: 'heavy' })) }
    mountTab('player', 'player-1')
    fireEvent.click(screen.getByRole('button', { name: /^Tommy Eves/ }))

    expect(gearTab().textContent).toBe('Gear, a Strength roll to make')
    expect(gearTab().querySelector('.lubec-page-dot')).not.toBeNull()
    expect(prompt()).toBeNull()

    fireEvent.click(gearTab())
    expect(screen.getByRole('dialog', { name: 'Small anvil is heavy' })).toBeTruthy()
    fireEvent.click(inPrompt().getByRole('button', { name: 'Close' }))
    expect(prompt()).toBeNull()
    expect(gearTab().querySelector('.lubec-page-dot')).not.toBeNull()

    fireEvent.click(pageTabs().getByRole('button', { name: 'Core sheet' }))
    fireEvent.click(gearTab())
    seededRolls = [5]
    fireEvent.click(strengthCircle(prompt() as HTMLElement))
    fireEvent.click(inPrompt().getByRole('button', { name: 'Done' }))
    expect(prompt()).toBeNull()

    saveNow()
    expect(storedItems()).toMatchObject([{ id: 'a', check: 'pass' }])
    expect(gearTab().querySelector('.lubec-page-dot')).toBeNull()
  })

  it('shows another viewer no dot and asks them nothing', () => {
    database = { [TOMMY]: withItems(T('a', 'backpack', 0, 'Small anvil', { weight: 'heavy' })) }
    mountTab('gm', GM)
    openGear()

    expect(gearTab().querySelector('.lubec-page-dot')).toBeNull()
    expect(prompt()).toBeNull()
  })
})

describe('the card\'s Passed and Failed switch', () => {
  it('overrides the recorded roll and never touches Stress', () => {
    vi.useFakeTimers()
    database = { [TOMMY]: withItems(T('a', 'hands', 0, 'Small anvil', { weight: 'heavy', check: 'fail' })) }
    mountTab('player', 'player-1')
    openGear()

    fireEvent.click(screen.getByRole('button', { name: /^Both hands.*Small anvil/ }))
    const card = within(screen.getByRole('dialog', { name: 'Small anvil' }))
    expect(card.getByRole('group', { name: 'Strength roll, recorded' })).toBeTruthy()
    fireEvent.click(card.getByRole('button', { name: 'Failed' }))
    fireEvent.click(card.getByRole('button', { name: 'Passed' }))
    expect(card.getByRole('button', { name: 'Passed' }).getAttribute('aria-pressed')).toBe('true')
    expect(card.getByText(/Strength passed: no penalty\./)).toBeTruthy()

    saveNow()
    expect(storedItems()).toMatchObject([{ id: 'a', check: 'pass' }])
    expect(storedStress()).toBe(2)
    expect(stored().lastRoll).toBeNull()
  })

  it('drops an extra heavy thing switched to Failed to the GM Items tab, with B\'s words', async () => {
    database = { [TOMMY]: withItems(T('a', 'hands', 0, 'Mushroom anchor', { weight: 'extra', check: 'pass' })) }
    mountTab('player', 'player-1')
    openGear()

    fireEvent.click(screen.getByRole('button', { name: /^Both hands.*Mushroom anchor/ }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Mushroom anchor' })).getByRole('button', { name: 'Failed' }))

    await waitFor(() => expect(screen.getAllByRole('status').at(-1)?.textContent).toBe('Too heavy to carry. Mushroom anchor is dropped where you are.'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(storedItems()).toEqual([])
    expect(gmItems().map(([, data]) => [data.name, data.status])).toEqual([['Mushroom anchor', 'dropped']])
  })
})
