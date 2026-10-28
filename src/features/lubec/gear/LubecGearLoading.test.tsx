// @vitest-environment jsdom
/**
 * Supplies, holders and loading (spec 5.6, component test 10), through the
 * Lubec character tab mounted as the shell mounts it, over the shared
 * character store with `firebase/firestore` stubbed, as
 * `LubecGearTab.test.tsx` does. A reload is a remount fed the documents as
 * last written.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { User } from 'firebase/auth'
import type { Campaign, Role } from '../../../types/app'

// These cases mount large component trees and run role queries over them in jsdom (see LubecGearTab.test.tsx).
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

const CHARACTERS_PATH = 'groups/group-1/campaigns/campaign-1/characters'

const campaign: Campaign = { id: 'campaign-1', name: 'Lubec', status: 'active', groupId: 'group-1', gmUserId: 'gm-1', system: 'lubec' }

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

// Wayne Gardner's revolver, rounds and batteries, from the prototype's sample.
const REVOLVER = T('i8', 'hands', 0, "Grandpa's revolver", 1, { kind: 'weapon', mode: 'firearm', impact: 1, wounds: ['gun'], capacity: 6, loaded: 0, takes: 'a38' })
const WALKIE = T('i9', 'hands', 1, 'Walkie-talkie', 1)
const ITEMS = [
  T('i1', 'backpack', 0, 'Flashlight', 1, { kind: 'holder', hold: 'load', takes: 'dcell', capacity: 2, loaded: 2 }),
  T('i4', 'backpack', 0, 'D batteries', 1, { kind: 'consumable', qty: 2, per: 4, fits: 'dcell' }),
  T('i6', 'backpack', 1, 'Box of .38 rounds', 1, { kind: 'holder', hold: 'box', takes: 'a38', capacity: 50, loaded: 12 }),
  REVOLVER,
]
const gearOf = (items: unknown[]) => ({ items, carriers: [], overrides: [], supplies: [] })

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

function openGear(items: unknown[]) {
  database = { tommy: tommyEves({ gear: gearOf(items) }) }
  mountTab('player', 'player-1')
  fireEvent.click(screen.getByRole('button', { name: /^Tommy Eves/ }))
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Character sheet pages' })).getByRole('button', { name: 'Gear' }))
}

const dialog = (name: string) => within(screen.getByRole('dialog', { name }))
const status = () => screen.getByRole('status').textContent
const openCard = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(name.replace(/[.()]/g, '\\$&')) }))
  return dialog(name)
}
const storedItems = () => ((database.tommy.lubec as Fields).gear as Fields).items as Fields[]
const stored = (name: string) => storedItems().find((i) => i.name === name)
const save = () => act(() => vi.advanceTimersByTime(500))
const buttonTexts = (scope: ReturnType<typeof dialog>) => scope.getAllByRole('button').map((b) => b.textContent)

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

describe('the empty-weapon prompt', () => {
  it('stops Fire on an empty firearm with three buttons, the red one requiring special dispensation, and only the player sees it', () => {
    openGear(ITEMS)
    fireEvent.click(openCard("Grandpa's revolver").getByRole('button', { name: 'Fire' }))
    const prompt = dialog("Grandpa's revolver isn't loaded")
    expect(prompt.getByText('Only you see this').className).toBe('prompt-who')
    expect(prompt.getByText('Reloading takes 3 actions, .38 rounds in the backpack.')).toBeTruthy()
    expect(buttonTexts(prompt)).toEqual(['×', 'Cancel', 'Reload', 'Reload & fireRequires special dispensation'])
    const red = prompt.getByRole('button', { name: /^Reload & fire/ })
    expect(red.className).toBe('btn dispensation')
    expect(red.querySelector('small')?.textContent).toBe('Requires special dispensation')
    expect(screen.getByRole('dialog', { name: "Grandpa's revolver isn't loaded" }).querySelector('.actions')?.className).toBe('actions three')
  })

  it('loads, fires and uses a round in one action with Reload & fire, and keeps it through a reload', () => {
    vi.useFakeTimers()
    openGear(ITEMS)
    fireEvent.click(openCard("Grandpa's revolver").getByRole('button', { name: 'Fire' }))
    fireEvent.click(dialog("Grandpa's revolver isn't loaded").getByRole('button', { name: /^Reload & fire/ }))
    expect(screen.queryByRole('dialog', { name: "Grandpa's revolver isn't loaded" })).toBeNull()
    expect(status()).toBe('Reloaded and fired. Roll it at the table.')
    expect(dialog("Grandpa's revolver").getByText('5 of 6')).toBeTruthy()
    save()
    expect(mocks.setDoc).toHaveBeenCalledTimes(1)
    expect([stored("Grandpa's revolver")?.loaded, stored('Box of .38 rounds')?.loaded]).toEqual([5, 6])
    cleanup()
    mountTab('player', 'player-1')
    fireEvent.click(screen.getByRole('button', { name: /^Tommy Eves/ }))
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Character sheet pages' })).getByRole('button', { name: 'Gear' }))
    expect(openCard("Grandpa's revolver").getByText('5 of 6')).toBeTruthy()
  })

  it('reloads with Reload, and Cancel changes nothing', () => {
    vi.useFakeTimers()
    openGear(ITEMS)
    fireEvent.click(openCard("Grandpa's revolver").getByRole('button', { name: 'Fire' }))
    fireEvent.click(dialog("Grandpa's revolver isn't loaded").getByRole('button', { name: 'Cancel' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    save()
    expect(mocks.setDoc).not.toHaveBeenCalled()
    fireEvent.click(dialog("Grandpa's revolver").getByRole('button', { name: 'Fire' }))
    fireEvent.click(dialog("Grandpa's revolver isn't loaded").getByRole('button', { name: 'Reload' }))
    expect(status()).toBe('Reloaded.')
    expect(dialog("Grandpa's revolver").getByText('6 of 6')).toBeTruthy()
  })

  it('keeps a refusal on the prompt, in B\'s words, and closes on Escape', () => {
    openGear([...ITEMS, WALKIE])
    fireEvent.click(openCard("Grandpa's revolver").getByRole('button', { name: 'Fire' }))
    const prompt = dialog("Grandpa's revolver isn't loaded")
    const busy = 'Your other hand holds Walkie-talkie. It needs to hold the .38 rounds, or be empty to fetch them.'
    expect(prompt.getByText(busy, { selector: '.prompt-text' })).toBeTruthy()
    fireEvent.click(prompt.getByRole('button', { name: 'Reload' }))
    expect(prompt.getByRole('alert').textContent).toBe(busy)
    fireEvent.keyDown(screen.getByRole('dialog', { name: "Grandpa's revolver isn't loaded" }), { key: 'Escape' })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })
})

describe('loading from the card', () => {
  it('loads the one gun from the box, says what reloading takes on the gun, and unloads it', () => {
    openGear(ITEMS)
    const gun = openCard("Grandpa's revolver")
    expect(document.querySelector('.item-facts')?.textContent).toContain('Reload3 actions, .38 rounds in the backpack')
    fireEvent.click(gun.getByRole('button', { name: 'Close' }))
    const box = openCard('Box of .38 rounds')
    fireEvent.click(box.getByRole('button', { name: "LoadGrandpa's revolver: 3 actions, .38 rounds in the backpack" }))
    expect(status()).toBe("Loaded Grandpa's revolver: 6 of 6.")
    expect(dialog('Box of .38 rounds').getByText('6 of 50')).toBeTruthy()
    fireEvent.click(dialog('Box of .38 rounds').getByRole('button', { name: 'Close' }))
    fireEvent.click(openCard("Grandpa's revolver").getByRole('button', { name: 'Unload' }))
    expect(status()).toBe("Grandpa's revolver: unloaded.")
  })

  it('asks which to load when more than one thing on you takes the supply, and the card keeps its size', () => {
    const derringer = T('i90', 'backpack', null, 'Derringer', 0, { kind: 'weapon', mode: 'firearm', wounds: ['gun'], capacity: 2, loaded: 0, takes: 'a38' })
    openGear([...ITEMS, derringer])
    const box = openCard('Box of .38 rounds')
    expect(box.getAllByRole('button', { name: /^Load/ })).toHaveLength(1)
    fireEvent.click(box.getByRole('button', { name: 'Load2 things on you take .38 rounds, 1 ready' }))
    const picker = dialog('Load which?')
    expect(picker.getByText('Load from Box of .38 rounds')).toBeTruthy()
    expect(picker.getByText('2 things on you take .38 rounds. Loading draws from the box of .38 rounds first.')).toBeTruthy()
    expect((picker.getByRole('button', { name: 'DerringerTake the derringer in hand first.' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(picker.getByRole('button', { name: "Grandpa's revolver0 of 6 now / 3 actions, .38 rounds in the backpack" }))
    expect(screen.queryByRole('dialog', { name: 'Load which?' })).toBeNull()
    expect(status()).toBe("Loaded Grandpa's revolver: 6 of 6.")
    expect(dialog('Box of .38 rounds').getByText('6 of 50')).toBeTruthy()
  })

  it('takes some out of a box and puts the loose ones back', () => {
    openGear(ITEMS)
    const box = openCard('Box of .38 rounds')
    const open = box.getByRole('button', { name: 'Take some out' })
    fireEvent.click(open)
    expect(open.getAttribute('aria-expanded')).toBe('true')
    fireEvent.change(box.getByRole('spinbutton', { name: 'How many' }), { target: { value: '4' } })
    expect(box.getByText('Backpack, small stuff, free.')).toBeTruthy()
    fireEvent.change(box.getByRole('spinbutton', { name: 'How many' }), { target: { value: '40' } })
    expect(box.getByText('Take out 1 to 12.')).toBeTruthy()
    fireEvent.click(box.getByRole('button', { name: 'Take them out' }))
    expect(box.getByRole('alert').textContent).toBe('Take out 1 to 12.')
    fireEvent.change(box.getByRole('spinbutton', { name: 'How many' }), { target: { value: '4' } })
    fireEvent.click(box.getByRole('button', { name: 'Take them out' }))
    expect(status()).toBe('Took 4 out of Box of .38 rounds.')
    fireEvent.click(dialog('Box of .38 rounds').getByRole('button', { name: 'Put loose ones infree' }))
    expect(status()).toBe('Box of .38 rounds: 12 of 50.')
  })

  it('gives a loose supply a Load button and no "Use one" (Rule L10)', () => {
    openGear(ITEMS)
    const batteries = openCard('D batteries')
    expect(buttonTexts(batteries)).toContain('LoadTake the flashlight in hand first.')
    expect(batteries.queryByRole('button', { name: 'Use one' })).toBeNull()
  })

  it('uses one of a canteen, empties it, and fills it at the table', () => {
    openGear([...ITEMS, T('c', 'body', 0, 'Canteen', 1, { kind: 'holder', hold: 'fill', takes: 'water', capacity: 4, loaded: 4 })])
    const canteen = openCard('Canteen')
    fireEvent.click(canteen.getByRole('button', { name: 'Use one' }))
    expect(canteen.getByText('3 of 4')).toBeTruthy()
    fireEvent.click(canteen.getByRole('button', { name: 'EmptyPour it out' }))
    expect(status()).toBe('Canteen: emptied.')
    fireEvent.click(dialog('Canteen').getByRole('button', { name: 'Fill upAt the table' }))
    expect(status()).toBe('Canteen: full.')
  })
})

describe('making a supply (Rule L1)', () => {
  const openHolderForm = () => {
    fireEvent.click(screen.getByRole('button', { name: '+ Add an item' }))
    const form = dialog('Add an item')
    fireEvent.click(form.getByRole('radio', { name: /^Holder/ }))
    fireEvent.change(form.getByRole('combobox', { name: 'Name' }), { target: { value: 'Camera' } })
    return form
  }

  it('makes a supply stored on the maker\'s sheet, picks it, and saves the holder with it', () => {
    vi.useFakeTimers()
    openGear([])
    const form = openHolderForm()
    const holds = form.getByRole('combobox', { name: 'Holds what' }) as HTMLSelectElement
    fireEvent.change(holds, { target: { value: '__make' } })
    expect(holds.value).toBe('')
    const name = form.getByRole('textbox', { name: 'New supply' })
    expect(document.activeElement).toBe(name)
    fireEvent.click(form.getByRole('button', { name: 'Make it' }))
    expect(form.getByRole('alert').textContent).toBe('Name the supply, like ".45 rounds" or "lamp oil".')
    fireEvent.change(name, { target: { value: 'Film' } })
    fireEvent.keyDown(name, { key: 'Enter' })
    expect(status()).toBe('Film is now a supply on this sheet.')
    expect(holds.selectedOptions[0].textContent).toBe('Film')
    expect(form.queryByRole('textbox', { name: 'New supply' })).toBeNull()
    fireEvent.click(form.getByRole('button', { name: 'Add it' }))
    save()
    const gear = (database.tommy.lubec as Fields).gear as Fields
    const [film] = gear.supplies as Fields[]
    expect(film).toMatchObject({ name: 'Film' })
    expect(stored('Camera')).toMatchObject({ kind: 'holder', takes: film.id })
  })

  it('picks the supply already known by a name in other letters, and Escape closes the maker but not the form', () => {
    vi.useFakeTimers()
    openGear([])
    const form = openHolderForm()
    const holds = form.getByRole('combobox', { name: 'Holds what' }) as HTMLSelectElement
    fireEvent.change(holds, { target: { value: '__make' } })
    fireEvent.change(form.getByRole('textbox', { name: 'New supply' }), { target: { value: ' .38 ROUNDS ' } })
    fireEvent.click(form.getByRole('button', { name: 'Make it' }))
    expect(holds.value).toBe('a38')
    fireEvent.change(holds, { target: { value: '__make' } })
    fireEvent.keyDown(form.getByRole('textbox', { name: 'New supply' }), { key: 'Escape' })
    expect(form.queryByRole('textbox', { name: 'New supply' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Add an item' })).toBeTruthy()
    fireEvent.change(holds, { target: { value: '__make' } })
    fireEvent.click(within(document.querySelector('.ammo-maker') as HTMLElement).getByRole('button', { name: 'Cancel' }))
    expect(form.queryByRole('textbox', { name: 'New supply' })).toBeNull()
    save()
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })
})
