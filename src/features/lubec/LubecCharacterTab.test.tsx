// @vitest-environment jsdom
/**
 * The Lubec sheet seam: the Lubec character tab mounted as the shell mounts
 * it, for a given role and user, over the shared character store with
 * `firebase/firestore` and the media module stubbed. Stored documents reach it
 * through the stubbed snapshot listener, and every test asserts on what the
 * screen shows or on what the store writes. A reload is a remount fed the
 * documents as last written. Rolls draw from seeded dice provided around the
 * tab. Later sheet tickets add their cases here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { User } from 'firebase/auth'
import type { Campaign, Role } from '../../types/app'
import type { LubecDice } from '../ruleSets/lubec/dice'

type Fields = Record<string, unknown>
type Listener = { next: (snap: unknown) => void; fail: (error: unknown) => void }

const mocks = vi.hoisted(() => ({
  listeners: {} as Record<string, { next: (snap: unknown) => void; fail: (error: unknown) => void }>,
  setDoc: vi.fn(async (..._args: unknown[]) => undefined),
  deleteDoc: vi.fn(async (..._args: unknown[]) => undefined),
  resolveStoragePathUrl: vi.fn(async (path: string): Promise<string | null> => `https://media.test/${path}`),
  uploadEntityImage: vi.fn(async (..._args: unknown[]) => ({ path: 'uploaded/portrait.png', url: 'https://media.test/uploaded/portrait.png' })),
}))

vi.mock('../../firebase', () => ({ db: { name: 'db-stub' } }))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  deleteDoc: mocks.deleteDoc,
  onSnapshot: (ref: { path: string }, next: Listener['next'], fail: Listener['fail']) => {
    mocks.listeners[ref.path] = { next, fail }
    return () => {
      if (mocks.listeners[ref.path]?.next === next) delete mocks.listeners[ref.path]
    }
  },
  serverTimestamp: () => ({ sentinel: 'serverTimestamp' }),
  setDoc: mocks.setDoc,
}))
vi.mock('../common/mediaStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../common/mediaStorage')>()),
  resolveStoragePathUrl: mocks.resolveStoragePathUrl,
  uploadEntityImage: mocks.uploadEntityImage,
}))
// jsdom has no canvas to decode with, so a chosen image goes on unchanged.
vi.mock('../common/imageNormalization', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../common/imageNormalization')>()),
  normalizeImageForUpload: async (file: File) => ({ file }),
}))

const { ruleSetSheets } = await import('../ruleSets/sheetComponents')
const { parseLubecCharacter } = await import('../ruleSets/lubec/characterParser')
const { lubecRuleWarnings } = await import('../ruleSets/lubec/ruleChecks')
const { LubecDiceContext } = await import('./useLubecRoller')

const CHARACTERS_PATH = 'groups/group-1/campaigns/campaign-1/characters'
const GM = 'gm-1'

const campaign: Campaign = { id: 'campaign-1', name: 'Lubec', status: 'active', groupId: 'group-1', gmUserId: GM, system: 'lubec' }

// The documents as stored, by id. Every write the store makes lands here, so a
// remount can be fed what was last written.
let database: Record<string, Fields> = {}

const isMap = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value)

// A stored document after a write: with `{ merge: true }` maps merge field by
// field and any other value, lists included, replaces what was stored; without
// it the write replaces the whole document.
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

const tommyEves = (fields: Fields = {}): Fields => ({
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
  },
  ...fields,
})

const withSheet = (sheet: Fields, fields: Fields = {}) =>
  tommyEves({ ...fields, lubec: { ...(tommyEves().lubec as Fields), ...sheet } })

// The d100 results the next rolls land on, in order; a roll past the last one fails the test.
let seededRolls: number[] = []

const seededDice: LubecDice = () => {
  const next = seededRolls.shift()
  if (next === undefined) throw new Error('No seeded roll left')
  return (next - 0.5) / 100
}

function seedRolls(...rolls: number[]) {
  seededRolls = [...seededRolls, ...rolls]
}

function seed(documents: Record<string, Fields>) {
  database = { ...database, ...documents }
}

function emitDatabase() {
  const docs = Object.entries(database).map(([id, data]) => ({ id, data: () => data }))
  act(() => mocks.listeners[CHARACTERS_PATH]?.next({ docs }))
}

// The tab as the shell mounts it, for the given viewer.
function renderTab(role: Role, uid: string) {
  const LubecSheet = ruleSetSheets.lubec
  return render(
    <LubecDiceContext.Provider value={seededDice}>
      <LubecSheet campaign={campaign} role={role} user={{ uid } as User} username="viewer1" setError={vi.fn()} characterTabProps={null} />
    </LubecDiceContext.Provider>,
  )
}

/** The tab, fed the stored documents. */
function mountTab(role: Role, uid: string) {
  const view = renderTab(role, uid)
  emitDatabase()
  return view
}

function reload(role: Role, uid: string) {
  cleanup()
  return mountTab(role, uid)
}

const flushMicrotasks = () => act(async () => { await Promise.resolve() })

const rosterNames = () => screen.queryAllByRole('heading', { level: 4 }).map((heading) => heading.textContent)

function openSheet(name: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }))
  return screen.getByRole('article', { name: `${name} character sheet` })
}

// A Stat or Save's row, found by its row header's text: a role query here
// computes styles for every element on the sheet, which is slow enough under
// load to time a test out.
const valueRow = (name: string) =>
  screen.getByText(name, { selector: 'th[scope="row"]' }).closest('tr') as HTMLTableRowElement

/** A Stat or Save's base, final and current values as the sheet shows them. */
const valuesOf = (name: string) => Array.from(valueRow(name).cells).slice(1).map((cell) => cell.textContent)

const missingMarks = (name: string) => valueRow(name).querySelectorAll('.lubec-missing').length

function openSkillsPage(name: string) {
  const sheet = openSheet(name)
  fireEvent.click(within(within(sheet).getByRole('navigation', { name: 'Character sheet pages' })).getByRole('button', { name: 'Skills' }))
  return sheet
}

/** The character's skills as the Skills page lists them: name, any Free mark, tier and bonus. */
const takenSkills = () =>
  within(screen.getByRole('list', { name: 'Skills taken' })).queryAllByRole('listitem')
    .map((item) => [...item.children].map((part) => part.textContent))

/** The skills the tree marks, with the mark each shows. */
const treeMarks = () => [...document.querySelectorAll('.lubec-tree-skill.free, .lubec-tree-skill.picked')]
  .map((cell) => [cell.querySelector('.lubec-skill-name')?.textContent, cell.querySelector('.lubec-skill-mark')?.textContent])

const treeColumn = (column: number) => [...document.querySelectorAll('.lubec-skill-tree tbody tr')]
  .map((row) => row.children[column])
  .filter((cell) => cell.classList.contains('lubec-tree-skill'))
  .map((cell) => cell.querySelector('.lubec-skill-name')?.textContent)

// By text rather than by role: naming every button on the tree is slow in jsdom.
const skillButton = (name: string) => screen.getByText(name, { selector: 'button' })

const skillButtons = () => screen.queryAllByText(/./, { selector: '.lubec-skill-tree button' })

const freeSkillChoice = () => screen.getByRole('combobox', { name: 'Free class skill' }) as HTMLSelectElement

const storedSkills = (id: string) => (database[id].lubec as Fields).skills

/** Lets the store's half-second debounce send its save. */
const sendSaves = () => act(() => { vi.advanceTimersByTime(500) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listeners = {}
  database = {}
  seededRolls = []
  mocks.setDoc.mockImplementation(async (...args: unknown[]) => {
    writeToDatabase(...args)
    return undefined
  })
  mocks.deleteDoc.mockImplementation(async (...args: unknown[]) => {
    delete database[(args[0] as { path: string }).path.split('/').pop() as string]
    return undefined
  })
  window.innerWidth = 1024
  URL.createObjectURL = vi.fn(() => 'blob:chosen-image')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Lubec character tab', () => {
  it('shows an empty roster for a campaign with no Lubec characters', async () => {
    renderTab('player', 'player-1')
    await flushMicrotasks()
    expect(screen.getByText('Loading characters...')).toBeTruthy()

    emitDatabase()

    expect(screen.queryByText('Loading characters...')).toBeNull()
    expect(screen.getByText('No characters yet.')).toBeTruthy()
    expect(rosterNames()).toEqual([])
  })

  it('shows a seeded character\'s Stats and Saves with base, final and current values', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')

    openSheet('Tommy Eves')

    expect(valuesOf('Strength')).toEqual(['24', '29', '29'])
    expect(valuesOf('Speed')).toEqual(['51', '56', '56'])
    expect(valuesOf('Intellect')).toEqual(['38', '43', '43'])
    expect(valuesOf('Handle')).toEqual(['50', '55', '55'])
    expect(valuesOf('Charm')).toEqual(['48', '53', '53'])
    expect(valuesOf('Sanity')).toEqual(['20', '30', '30'])
    expect(valuesOf('Fear')).toEqual(['24', '34', '34'])
    expect(valuesOf('Body')).toEqual(['21', '31', '31'])
    expect(screen.getByRole('region', { name: 'Stats' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Saves' })).toBeTruthy()
  })

  it('opens the sheet in the v4 frame, with Core sheet and Skills page tabs', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')

    const sheet = openSheet('Tommy Eves')

    expect(within(sheet).getByText('Lubec 1977')).toBeTruthy()
    expect(within(sheet).getByRole('heading', { level: 2, name: 'Tommy Eves' })).toBeTruthy()
    expect(within(sheet).getByText('Working Kid')).toBeTruthy()
    expect(within(sheet).getByRole('img', { name: 'No photo yet' })).toBeTruthy()
    expect(sheet.querySelector('.lubec-stamp')?.textContent).toBe('LubecMaine1977')
    const tabs = within(within(sheet).getByRole('navigation', { name: 'Character sheet pages' })).getAllByRole('button')
    expect(tabs.map((tab) => [tab.textContent, tab.getAttribute('aria-current')])).toEqual([['Core sheet', 'page'], ['Skills', null]])

    fireEvent.click(tabs[1])

    expect(within(sheet).getByRole('region', { name: 'Skills' })).toBeTruthy()
    expect(within(sheet).queryByRole('region', { name: 'Stats' })).toBeNull()
    expect(tabs[1].getAttribute('aria-current')).toBe('page')

    fireEvent.click(tabs[0])

    expect(within(sheet).getByRole('region', { name: 'Stats' })).toBeTruthy()
  })

  it('shows the portrait the store resolves from the stored path', async () => {
    seed({ tommy: tommyEves({ portraitPath: 'portraits/tommy.png', portraitFocusX: 30, portraitFocusY: 70 }) })
    mountTab('player', 'player-1')
    await flushMicrotasks()

    const sheet = openSheet('Tommy Eves')

    const portrait = within(sheet).getByRole('img', { name: 'Tommy Eves portrait' })
    expect(portrait.getAttribute('src')).toBe('https://media.test/portraits/tommy.png')
    expect((portrait as HTMLImageElement).style.objectPosition).toBe('30% 70%')
    expect(mocks.resolveStoragePathUrl).toHaveBeenCalledWith('portraits/tommy.png')
  })

  it('shows a missing base value as missing, never 0, and its final and current values as missing too', () => {
    seed({ tommy: withSheet({ base: { Strength: 24, Speed: null, Intellect: 38, Handle: 50, Charm: 48, Sanity: 20, Fear: 24 } }) })
    mountTab('player', 'player-1')

    openSheet('Tommy Eves')

    expect(valuesOf('Speed')).toEqual(['missing', 'missing', 'missing'])
    expect(missingMarks('Speed')).toBe(3)
    expect(valuesOf('Body')).toEqual(['missing', 'missing', 'missing'])
    expect(valuesOf('Strength')).toEqual(['24', '29', '29'])
  })

  it('shows every final and current value as missing when the class is missing', () => {
    seed({ tommy: withSheet({ class: { key: null } }) })
    mountTab('player', 'player-1')

    const sheet = openSheet('Tommy Eves')

    expect(valuesOf('Strength')).toEqual(['24', 'missing', 'missing'])
    expect(valuesOf('Body')).toEqual(['21', 'missing', 'missing'])
    expect(sheet.querySelector('.lubec-kid-meta .lubec-missing')?.textContent).toBe('missing')
  })

  it('shows the values a missing class choice could touch as missing', () => {
    seed({ tommy: withSheet({ class: { key: 'nerd', choices: { statPenalty: null } } }) })
    mountTab('player', 'player-1')

    openSheet('Tommy Eves')

    expect(valuesOf('Strength')).toEqual(['24', 'missing', 'missing'])
    expect(valuesOf('Intellect')).toEqual(['38', '58', '58'])
    expect(valuesOf('Sanity')).toEqual(['20', '50', '50'])
  })

  it('keeps a hole through a reload, and writes nothing for viewing a sheet', () => {
    seed({ tommy: withSheet({ base: { Strength: null } }) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    reload('player', 'player-1')
    openSheet('Tommy Eves')

    expect(valuesOf('Strength')).toEqual(['missing', 'missing', 'missing'])
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('shows the GM every Lubec character in the campaign, and no other system\'s', () => {
    seed({
      tommy: tommyEves(),
      ada: tommyEves({ name: 'Ada Mitchell', ownerUserId: 'player-2', ownerUsername: 'adamitc' }),
      gmKid: tommyEves({ name: 'Wayne Gardner', ownerUserId: GM, ownerUsername: 'gmhandl' }),
      vampire: { system: 'vtm', name: 'Not a kid', ownerUserId: 'player-1' },
    })
    mountTab('gm', GM)

    expect(rosterNames().sort()).toEqual(['Ada Mitchell', 'Tommy Eves', 'Wayne Gardner'])
  })

  it('shows a player the characters the shared store shows them, with their own marked', () => {
    seed({
      tommy: tommyEves(),
      ada: tommyEves({ name: 'Ada Mitchell', ownerUserId: 'player-2', ownerUsername: null, lubec: {} }),
      gmKid: tommyEves({ name: 'Wayne Gardner', ownerUserId: GM }),
    })
    mountTab('player', 'player-1')

    expect(rosterNames().sort()).toEqual(['Ada Mitchell', 'Tommy Eves'])
    const own = screen.getByRole('button', { name: /Tommy Eves/ })
    const other = screen.getByRole('button', { name: /Ada Mitchell/ })
    expect(within(own).getByText('Yours')).toBeTruthy()
    expect(within(own).getByText('Working Kid')).toBeTruthy()
    expect(within(other).queryByText('Yours')).toBeNull()
    expect(within(other).getByText('No class yet')).toBeTruthy()
    expect(within(other).getByText('Unassigned')).toBeTruthy()
  })

  it('names a character with no name an unnamed kid', () => {
    seed({ tommy: tommyEves({ name: '' }) })
    mountTab('player', 'player-1')

    expect(rosterNames()).toEqual(['Unnamed kid'])
    expect(openSheet('Unnamed kid')).toBeTruthy()
  })

  it('goes back to the roster from an open sheet on a narrow screen', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    fireEvent.click(screen.getByRole('button', { name: 'Back to character list' }))

    expect(screen.queryByRole('article')).toBeNull()
    expect(rosterNames()).toEqual(['Tommy Eves'])
  })

  it('shows the roster and the open sheet side by side on a wide screen', async () => {
    window.innerWidth = 1440
    seed({ tommy: tommyEves({ portraitPath: 'portraits/tommy.png' }) })
    mountTab('player', 'player-1')
    await flushMicrotasks()

    expect(rosterNames()).toEqual(['Tommy Eves'])
    expect(screen.getByRole('article', { name: 'Tommy Eves character sheet' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Back to character list' })).toBeNull()
  })

  it('asks for a pick on a wide screen when there is no character to open', () => {
    window.innerWidth = 1440
    mountTab('gm', GM)

    expect(screen.getByText('Pick a character to open their sheet.')).toBeTruthy()
  })
})

/** A counter's value as the Core page shows it. */
const counterValue = (label: string) =>
  screen.getByRole('group', { name: label }).querySelector('.lubec-counter-value')?.textContent

const shownCounters = () => ({
  stress: counterValue('Stress'),
  minimumStress: counterValue('Minimum Stress'),
  trauma: counterValue('Trauma'),
})

const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

/** The last document the store wrote, read back through the Lubec parser. */
function lastWritten() {
  const [ref, payload] = mocks.setDoc.mock.calls.at(-1) as [{ path: string }, Fields]
  return parseLubecCharacter(ref.path.split('/').pop() as string, payload)
}

const afterSaveDelay = () => act(() => vi.advanceTimersByTime(500))

describe('Lubec counters', () => {
  it('start at the rules\' starting values, and the owner\'s changes save after the debounce and survive a reload', () => {
    vi.useFakeTimers()
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')
    expect(shownCounters()).toEqual({ stress: '2', minimumStress: '2', trauma: '0' })

    press('Raise Stress')
    press('Raise Stress')
    press('Raise Minimum Stress')
    press('Raise Trauma')
    press('Raise Trauma')
    press('Lower Trauma')

    expect(shownCounters()).toEqual({ stress: '4', minimumStress: '3', trauma: '1' })
    expect(mocks.setDoc).not.toHaveBeenCalled()
    afterSaveDelay()
    expect(mocks.setDoc).toHaveBeenCalledTimes(1)
    expect(lastWritten().lubec.counters).toEqual({ stress: 4, minimumStress: 3, trauma: 1 })

    reload('player', 'player-1')
    openSheet('Tommy Eves')

    expect(shownCounters()).toEqual({ stress: '4', minimumStress: '3', trauma: '1' })
  })

  it('let the GM change a player\'s counters', () => {
    vi.useFakeTimers()
    seed({ tommy: tommyEves() })
    mountTab('gm', GM)
    openSheet('Tommy Eves')

    press('Lower Minimum Stress')
    afterSaveDelay()

    expect(lastWritten().lubec.counters).toEqual({ stress: 2, minimumStress: 1, trauma: 0 })
    expect(lastWritten().ownerUserId).toBe('player-1')
  })

  it('show a player someone else\'s counters with no way to change them', () => {
    seed({ ada: tommyEves({ name: 'Ada Mitchell', ownerUserId: 'player-2', lubec: { counters: { stress: 5, minimumStress: 3, trauma: 2 } } }) })
    mountTab('player', 'player-1')
    openSheet('Ada Mitchell')

    expect(shownCounters()).toEqual({ stress: '5', minimumStress: '3', trauma: '2' })
    expect(within(screen.getByRole('region', { name: 'Stress & Trauma' })).queryAllByRole('button')).toEqual([])
  })

  it('never go below 0: minus on a counter at 0 does nothing and writes nothing', () => {
    vi.useFakeTimers()
    seed({ tommy: withSheet({ counters: { stress: 0, minimumStress: 0, trauma: 0 } }) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    for (const label of ['Stress', 'Minimum Stress', 'Trauma']) {
      const minus = screen.getByRole('button', { name: `Lower ${label}` })
      expect((minus as HTMLButtonElement).disabled).toBe(true)
      fireEvent.click(minus)
    }
    afterSaveDelay()

    expect(shownCounters()).toEqual({ stress: '0', minimumStress: '0', trauma: '0' })
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('let minus take Stress below Minimum Stress, down to 0', () => {
    vi.useFakeTimers()
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    press('Lower Stress')
    press('Lower Stress')

    expect(shownCounters()).toEqual({ stress: '0', minimumStress: '2', trauma: '0' })
    expect((screen.getByRole('button', { name: 'Lower Stress' }) as HTMLButtonElement).disabled).toBe(true)
    afterSaveDelay()
    expect(lastWritten().lubec.counters).toEqual({ stress: 0, minimumStress: 2, trauma: 0 })
  })

  it('call for a Death Save at Trauma 4, or 5 for a Tough, and not below', () => {
    const reminder = () => screen.queryByText(/^Death Save/)?.textContent
    seed({
      tommy: withSheet({ counters: { trauma: 3 } }),
      tough: tommyEves({ name: 'Wayne Gardner', lubec: { ...(tommyEves().lubec as Fields), class: { key: 'tough' }, counters: { trauma: 4 } } }),
    })
    mountTab('player', 'player-1')

    openSheet('Tommy Eves')
    expect(reminder()).toBeUndefined()
    press('Raise Trauma')
    expect(reminder()).toBe('Death Save: Trauma has reached 4.')

    press('Back to character list')
    openSheet('Wayne Gardner')
    expect(reminder()).toBeUndefined()
    press('Raise Trauma')
    expect(reminder()).toBe('Death Save: Trauma has reached 5.')
  })

  it('call for no Death Save while the class is missing', () => {
    seed({ tommy: withSheet({ class: { key: null }, counters: { trauma: 9 } }) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    expect(counterValue('Trauma')).toBe('9')
    expect(screen.queryByText(/^Death Save/)).toBeNull()
  })
})

describe('Lubec class panel', () => {
  const classPanel = () => screen.getByRole('region', { name: 'Class' })

  it('shows the class\'s Trauma Response', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    const panel = classPanel()
    expect(within(panel).getByText('Trauma Response')).toBeTruthy()
    expect(within(panel).getByText(/Once per session, you may take Advantage on a Panic Check\./).textContent)
      .toBe('Steady Under Pressure. Once per session, you may take Advantage on a Panic Check.')
    expect(within(panel).queryByText('Class rule')).toBeNull()
  })

  it('shows the class rule beside the Trauma Response when the class has one', () => {
    seed({ tommy: withSheet({ class: { key: 'scout', choices: { statBonus: 'Speed' } } }) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    const panel = classPanel()
    expect(within(panel).getByText(/Your Success Raises the Stakes/)).toBeTruthy()
    expect(within(panel).getByText('Class rule')).toBeTruthy()
    expect(within(panel).getByText('Failed Stat Checks give +2 Stress instead of +1.')).toBeTruthy()
  })

  it('shows nothing when the class is missing', () => {
    seed({ tommy: withSheet({ class: { key: null } }) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    expect(screen.queryByRole('region', { name: 'Class' })).toBeNull()
    expect(screen.queryByText('Trauma Response')).toBeNull()
  })
})

describe('Lubec Fight panel', () => {
  const fightPanel = () => screen.getByRole('region', { name: 'Fight' })
  const effectiveHandle = () => fightPanel().querySelector('.lubec-effective-handle')?.textContent

  it('shows Effective Handle and an empty "In hand" line with no input', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    expect(effectiveHandle()).toBe('55')
    expect(within(fightPanel()).getByText('In hand')).toBeTruthy()
    expect(fightPanel().querySelector('.lubec-in-hand')?.textContent).toBe('')
    expect(fightPanel().querySelectorAll('input, textarea, select, button')).toHaveLength(0)
  })

  it('caps Effective Handle at 100', () => {
    seed({ tommy: withSheet({ base: { ...((tommyEves().lubec as Fields).base as Fields), Handle: 120 } }) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    expect(valuesOf('Handle')).toEqual(['120', '125', '125'])
    expect(effectiveHandle()).toBe('100')
  })

  it('shows Effective Handle as missing when Handle is a hole', () => {
    seed({ tommy: withSheet({ base: { ...((tommyEves().lubec as Fields).base as Fields), Handle: null } }) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    expect(effectiveHandle()).toBe('missing')
    expect(fightPanel().querySelector('.lubec-missing')).toBeTruthy()
  })
})

const imageFile = (name: string) => new File(['image bytes'], name, { type: 'image/png' })

function openNameBand(name: string) {
  const sheet = openSheet(name)
  fireEvent.click(within(sheet).getByRole('button', { name: 'Edit name band' }))
  return within(sheet).getByRole('region', { name: 'Name, age and portrait' })
}

const typeInto = (editor: HTMLElement, label: string, value: string) =>
  fireEvent.change(within(editor).getByLabelText(label), { target: { value } })

async function choosePortrait(editor: HTMLElement, file: File) {
  fireEvent.change(editor.querySelector('.monster-portrait-frame-empty input[type="file"]') as HTMLInputElement, { target: { files: [file] } })
  await flushMicrotasks()
  fireEvent.click(screen.getByRole('button', { name: 'Save portrait' }))
  await flushMicrotasks()
}

const bandPortrait = (name: string) =>
  within(screen.getByRole('article', { name: `${name} character sheet` }).querySelector('.lubec-idband') as HTMLElement)

describe('Lubec name band', () => {
  it('lets the owner of a finalized character change its name and age, kept through a reload', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    const editor = openNameBand('Tommy Eves')

    typeInto(editor, 'Name', 'Tom Eves')
    typeInto(editor, 'Age', '13')

    expect(screen.getByRole('heading', { level: 2, name: 'Tom Eves' })).toBeTruthy()
    reload('player', 'player-1')
    const sheet = openSheet('Tom Eves')
    expect(database.tommy.name).toBe('Tom Eves')
    expect((database.tommy.lubec as Fields).age).toBe(13)
    expect(database.tommy.creationStatus).toBe('active')
    expect(sheet.querySelector('.lubec-kid-age')?.textContent).toBe('Age 13')
  })

  it('keeps age a whole number or empty', () => {
    seed({ tommy: withSheet({ age: 12 }) })
    mountTab('player', 'player-1')
    const editor = openNameBand('Tommy Eves')
    const age = within(editor).getByLabelText('Age') as HTMLInputElement

    typeInto(editor, 'Age', '12.5')
    expect(age.value).toBe('12')
    typeInto(editor, 'Age', '')

    expect(age.value).toBe('')
    reload('player', 'player-1')
    const sheet = openSheet('Tommy Eves')
    expect((database.tommy.lubec as Fields).age).toBeNull()
    expect(sheet.querySelector('.lubec-kid-age')).toBeNull()
  })

  it('lets the GM change a player\'s character\'s name', () => {
    seed({ tommy: tommyEves() })
    mountTab('gm', GM)
    const editor = openNameBand('Tommy Eves')

    typeInto(editor, 'Name', 'Thomas Eves')

    reload('gm', GM)
    expect(database.tommy.name).toBe('Thomas Eves')
    expect(database.tommy.ownerUserId).toBe('player-1')
  })

  it('offers a player no edits on someone else\'s character', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-2')

    const sheet = openSheet('Tommy Eves')

    expect(within(sheet).queryByRole('button', { name: 'Edit name band' })).toBeNull()
    expect(within(sheet).queryByRole('region', { name: 'Name, age and portrait' })).toBeNull()
  })

  it('closes the edits with Done', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    const editor = openNameBand('Tommy Eves')

    fireEvent.click(within(editor).getByRole('button', { name: 'Done' }))

    expect(screen.queryByRole('region', { name: 'Name, age and portrait' })).toBeNull()
  })

  it('uploads a new portrait as the owner and stores only its path, which a reload shows again', async () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    const editor = openNameBand('Tommy Eves')
    const file = imageFile('tommy.png')

    await choosePortrait(editor, file)

    expect(mocks.uploadEntityImage).toHaveBeenCalledWith(expect.objectContaining({
      file, collectionName: 'characters', entityId: 'tommy', mediaKind: 'portraits', uploadAuthority: 'owner',
    }))
    expect(bandPortrait('Tommy Eves').getByRole('img', { name: 'Tommy Eves portrait' }).getAttribute('src')).toBe('https://media.test/uploaded/portrait.png')
    reload('player', 'player-1')
    await flushMicrotasks()
    openSheet('Tommy Eves')
    expect(database.tommy.portraitPath).toBe('uploaded/portrait.png')
    expect(database.tommy).not.toHaveProperty('portraitUrl')
    expect(mocks.resolveStoragePathUrl).toHaveBeenCalledWith('uploaded/portrait.png')
    expect(bandPortrait('Tommy Eves').getByRole('img', { name: 'Tommy Eves portrait' }).getAttribute('src')).toBe('https://media.test/uploaded/portrait.png')
  })

  it('lets the GM remove a portrait and replace it, uploading as the GM', async () => {
    seed({ tommy: tommyEves({ portraitPath: 'portraits/tommy.png' }) })
    mountTab('gm', GM)
    await flushMicrotasks()
    const editor = openNameBand('Tommy Eves')

    fireEvent.click(within(editor).getByRole('button', { name: 'Remove portrait' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    expect(bandPortrait('Tommy Eves').getByRole('img', { name: 'No photo yet' })).toBeTruthy()
    reload('gm', GM)
    expect(database.tommy.portraitPath).toBe('')

    const reopened = openNameBand('Tommy Eves')
    mocks.uploadEntityImage.mockResolvedValueOnce({ path: 'uploaded/replacement.png', url: 'https://media.test/uploaded/replacement.png' })
    await choosePortrait(reopened, imageFile('replacement.png'))

    expect(mocks.uploadEntityImage).toHaveBeenCalledWith(expect.objectContaining({ mediaKind: 'portraits', uploadAuthority: undefined }))
    reload('gm', GM)
    expect(database.tommy.portraitPath).toBe('uploaded/replacement.png')
    expect(database.tommy).not.toHaveProperty('portraitUrl')
  })

  it('sets the map token through the token picker and stores no download URL', async () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    const editor = openNameBand('Tommy Eves')
    mocks.uploadEntityImage.mockResolvedValueOnce({ path: 'uploaded/token.png', url: 'https://media.test/uploaded/token.png', name: 'token' } as never)

    fireEvent.click(within(editor).getByRole('button', { name: 'Set map token' }))
    await flushMicrotasks()
    const picker = screen.getByRole('dialog')
    fireEvent.change(within(picker).getByLabelText('Upload image').querySelector('input') as HTMLInputElement, { target: { files: [imageFile('token.png')] } })
    await flushMicrotasks()
    fireEvent.click(within(picker).getByRole('button', { name: 'Confirm' }))

    expect(mocks.uploadEntityImage).toHaveBeenCalledWith(expect.objectContaining({ mediaKind: 'token-icons', uploadAuthority: 'owner' }))
    reload('player', 'player-1')
    expect(database.tommy.tokenIcon).toEqual({ icon: 'custom', color: '#c08a2e', size: 34, customImagePath: 'uploaded/token.png', customImageName: 'token' })
  })
})

describe('Lubec active effects', () => {
  type StepEntry = { modifiers?: [string, string][]; labels?: string }

  const concussion = (fields: Fields = {}): Fields => ({
    id: 'concussion',
    name: 'Severe Concussion',
    cause: 'Severe Concussion (failed Body Save)',
    steps: [
      { modifiers: [{ target: 'Handle', amount: -40 }], labels: ['Dazed'] },
      { modifiers: [{ target: 'Handle', amount: -10 }], labels: [] },
    ],
    ...fields,
  })

  // Labels and text, rather than role queries, keep these many-step cases quick in jsdom.
  const effectsRegion = () => screen.getByLabelText('Active effects')

  const button = (container: HTMLElement, text: string) => within(container).getByText(text, { selector: 'button' })

  /** A Stat or Save's base, final and current values, as `valuesOf` reads them. */
  const shownValues = (name: string) => {
    const row = [...document.querySelectorAll('.lubec-values tbody tr')].find((candidate) => candidate.querySelector('th')?.textContent === name)
    return [...(row?.querySelectorAll('td') ?? [])].map((cell) => cell.textContent)
  }

  const openEffect = (index: number) => fireEvent.click(effectsRegion().querySelectorAll('button.lubec-effect-line')[index])

  /** Each effect's one-line view, as its name, current step and next step. */
  const effectLines = () => [...effectsRegion().querySelectorAll('.lubec-effect-line')].map((line) =>
    [...line.children].map((part) => part.textContent))

  const writtenEffects = (id = 'tommy') => parseLubecCharacter(id, database[id]).lubec.effects

  async function flushSave() {
    act(() => vi.advanceTimersByTime(500))
    await flushMicrotasks()
  }

  function fillStep(form: HTMLElement, index: number, step: StepEntry) {
    const name = `Step ${index + 1}`
    ;(step.modifiers ?? []).forEach(([target, amount], at) => {
      fireEvent.click(within(form).getByLabelText(`Add modifier to ${name.toLowerCase()}`))
      fireEvent.change(within(form).getByLabelText(`${name} modifier ${at + 1}`), { target: { value: target } })
      fireEvent.change(within(form).getByLabelText(`${name} modifier ${at + 1} amount`), { target: { value: amount } })
    })
    if (step.labels) fireEvent.change(within(form).getByLabelText(`${name} labels`), { target: { value: step.labels } })
  }

  function addEffect(name: string, cause: string, steps: StepEntry[]) {
    fireEvent.click(button(effectsRegion(), 'Add effect'))
    const form = within(effectsRegion()).getByLabelText('New effect')
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: name } })
    fireEvent.change(within(form).getByLabelText('Cause'), { target: { value: cause } })
    steps.forEach((step, index) => {
      if (index > 0) fireEvent.click(button(form, 'Add step'))
      fillStep(form, index, step)
    })
    fireEvent.click(button(form, 'Add'))
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('adds two Handle effects by hand, sums them in the current Handle, and writes both', async () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')
    expect(within(effectsRegion()).getByText('No active effects.')).toBeTruthy()

    addEffect('Bruised knuckles', 'Punched a locker', [{ modifiers: [['Handle', '-40']] }])
    addEffect('Sprained wrist', 'Fell off a bike', [{ modifiers: [['Handle', '-10']] }])

    expect(shownValues('Handle')).toEqual(['50', '55', '5'])
    expect(effectLines()).toEqual([['Bruised knuckles', 'Handle -40'], ['Sprained wrist', 'Handle -10']])
    await flushSave()
    expect(writtenEffects().map(({ name, cause, steps }) => ({ name, cause, steps }))).toEqual([
      { name: 'Bruised knuckles', cause: 'Punched a locker', steps: [{ modifiers: [{ target: 'Handle', amount: -40 }], labels: [] }] },
      { name: 'Sprained wrist', cause: 'Fell off a bike', steps: [{ modifiers: [{ target: 'Handle', amount: -10 }], labels: [] }] },
    ])
    expect(new Set(writtenEffects().map((effect) => effect.id)).size).toBe(2)
  })

  it('floors a value at 0 under a large penalty, and keeps a hole a hole whatever the effects', () => {
    const crushed = { id: 'crushed', name: 'Crushed hand', cause: 'Boat winch', steps: [{ modifiers: [{ target: 'Handle', amount: -80 }, { target: 'Speed', amount: -10 }] }] }
    seed({ tommy: withSheet({ base: { Strength: 24, Speed: null, Intellect: 38, Handle: 50, Charm: 48, Sanity: 20, Fear: 24, Body: 21 }, effects: [crushed] }) })
    mountTab('player', 'player-1')

    openSheet('Tommy Eves')

    expect(shownValues('Handle')).toEqual(['50', '55', '0'])
    expect(shownValues('Speed')).toEqual(['missing', 'missing', 'missing'])
    expect(document.querySelector('.lubec-effective-handle')?.textContent).toBe('0')
    expect(shownValues('Strength')).toEqual(['24', '29', '29'])
  })

  it('shows a stored effect with no steps by its name alone, and an empty next step as nothing', () => {
    const note = { id: 'note', name: 'Owes Wayne a favour', cause: 'Borrowed his bike', steps: [] }
    const fading = { id: 'fading', name: 'Sunburn', cause: 'Fell asleep on the dock', steps: [{ labels: ['Sore'] }, {}] }
    seed({ tommy: withSheet({ effects: [note, fading] }) })
    mountTab('player', 'player-1')

    openSheet('Tommy Eves')

    expect(effectLines()).toEqual([['Owes Wayne a favour'], ['Sunburn', 'Sore', 'then nothing']])
  })

  it('walks the Severe Concussion down its steps and off the sheet, writing each change so it survives a reload', async () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    addEffect('Severe Concussion', 'Severe Concussion (failed Body Save)', [{ modifiers: [['Handle', '-40']], labels: 'Dazed' }, { modifiers: [['Handle', '-10']] }])

    expect(effectLines()).toEqual([['Severe Concussion', 'Handle -40, Dazed', 'then Handle -10']])
    expect(effectsRegion().textContent).not.toContain('failed Body Save')
    expect(shownValues('Handle')).toEqual(['50', '55', '15'])
    await flushSave()
    expect(writtenEffects()).toEqual([{
      id: expect.any(String),
      name: 'Severe Concussion',
      cause: 'Severe Concussion (failed Body Save)',
      steps: [{ modifiers: [{ target: 'Handle', amount: -40 }], labels: ['Dazed'] }, { modifiers: [{ target: 'Handle', amount: -10 }], labels: [] }],
    }])
    reload('player', 'player-1')
    openSheet('Tommy Eves')
    expect(effectLines()).toEqual([['Severe Concussion', 'Handle -40, Dazed', 'then Handle -10']])
    expect(shownValues('Handle')).toEqual(['50', '55', '15'])

    fireEvent.click(within(effectsRegion()).getByLabelText('Step down Severe Concussion'))

    expect(effectLines()).toEqual([['Severe Concussion', 'Handle -10']])
    expect(shownValues('Handle')).toEqual(['50', '55', '45'])
    await flushSave()
    expect(writtenEffects()[0].steps).toEqual([{ modifiers: [{ target: 'Handle', amount: -10 }], labels: [] }])
    expect(writtenEffects()[0].cause).toBe('Severe Concussion (failed Body Save)')
    reload('player', 'player-1')
    openSheet('Tommy Eves')
    expect(effectLines()).toEqual([['Severe Concussion', 'Handle -10']])

    fireEvent.click(within(effectsRegion()).getByLabelText('Step down Severe Concussion'))

    expect(effectLines()).toEqual([])
    expect(shownValues('Handle')).toEqual(['50', '55', '55'])
    await flushSave()
    expect(writtenEffects()).toEqual([])
    reload('player', 'player-1')
    openSheet('Tommy Eves')
    expect(within(effectsRegion()).getByText('No active effects.')).toBeTruthy()
  })

  it('opens an effect to edit its name, cause, modifiers, labels and steps, keeping what the sheet does not model', async () => {
    seed({ tommy: withSheet({ effects: [concussion({ source: 'damage table' })] }) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    openEffect(0)
    const form = within(effectsRegion()).getByLabelText('Edit Severe Concussion')
    expect((within(form).getByLabelText('Cause') as HTMLInputElement).value).toBe('Severe Concussion (failed Body Save)')
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Concussion' } })
    fireEvent.change(within(form).getByLabelText('Cause'), { target: { value: 'Fell from the bleachers' } })
    fireEvent.change(within(form).getByLabelText('Step 1 modifier 1'), { target: { value: 'Speed' } })
    fireEvent.change(within(form).getByLabelText('Step 1 modifier 1 amount'), { target: { value: '-20' } })
    fireEvent.change(within(form).getByLabelText('Step 1 labels'), { target: { value: 'Dazed\nDisadvantage on exertion checks' } })
    fireEvent.click(within(form).getByLabelText('Remove step 2'))
    fireEvent.click(button(form, 'Add step'))
    fillStep(form, 1, { modifiers: [['Body', '-5']] })
    fireEvent.click(button(form, 'Save'))

    expect(effectLines()).toEqual([['Concussion', 'Speed -20, Dazed, Disadvantage on exertion checks', 'then Body -5']])
    expect(shownValues('Speed')).toEqual(['51', '56', '36'])
    expect(shownValues('Handle')).toEqual(['50', '55', '55'])
    await flushSave()
    expect(writtenEffects()).toEqual([{
      id: 'concussion',
      name: 'Concussion',
      cause: 'Fell from the bleachers',
      source: 'damage table',
      steps: [
        { modifiers: [{ target: 'Speed', amount: -20 }], labels: ['Dazed', 'Disadvantage on exertion checks'] },
        { modifiers: [{ target: 'Body', amount: -5 }], labels: [] },
      ],
    }])
  })

  it('drops the edits when an opened effect is cancelled, and removes an effect from its editor', async () => {
    const bruise = { id: 'bruise', name: 'Bruised ribs', cause: 'Fell off the pier', steps: [{ modifiers: [{ target: 'Strength', amount: -5 }], labels: [] }] }
    seed({ tommy: withSheet({ effects: [concussion(), bruise] }) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    openEffect(0)
    fireEvent.change(within(effectsRegion()).getByLabelText('Name'), { target: { value: 'Headache' } })
    fireEvent.click(button(effectsRegion(), 'Cancel'))

    expect(effectLines()).toEqual([['Severe Concussion', 'Handle -40, Dazed', 'then Handle -10'], ['Bruised ribs', 'Strength -5']])

    openEffect(0)
    fireEvent.click(button(effectsRegion(), 'Remove effect'))

    expect(effectLines()).toEqual([['Bruised ribs', 'Strength -5']])
    expect(shownValues('Handle')).toEqual(['50', '55', '55'])
    await flushSave()
    expect(writtenEffects().map((effect) => effect.id)).toEqual(['bruise'])
  })

  it('cannot add an effect without a name', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    fireEvent.click(button(effectsRegion(), 'Add effect'))

    expect((button(effectsRegion(), 'Add') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(button(effectsRegion(), 'Cancel'))
    expect(button(effectsRegion(), 'Add effect')).toBeTruthy()
    expect(within(effectsRegion()).getByText('No active effects.')).toBeTruthy()
  })

  it('lets the GM add to and step down the effects on a player\'s character', async () => {
    seed({ tommy: withSheet({ effects: [concussion()] }) })
    mountTab('gm', GM)
    openSheet('Tommy Eves')

    fireEvent.click(within(effectsRegion()).getByLabelText('Step down Severe Concussion'))
    addEffect('Grounded', 'Caught after curfew', [{ labels: 'No leaving the house' }])

    expect(effectLines()).toEqual([['Severe Concussion', 'Handle -10'], ['Grounded', 'No leaving the house']])
    await flushSave()
    expect(writtenEffects().map((effect) => [effect.name, effect.steps])).toEqual([
      ['Severe Concussion', [{ modifiers: [{ target: 'Handle', amount: -10 }], labels: [] }]],
      ['Grounded', [{ modifiers: [], labels: ['No leaving the house'] }]],
    ])
  })

  it('shows a player the effects on someone else\'s character, with no way to change them', async () => {
    seed({ tommy: withSheet({ effects: [concussion()] }) })
    mountTab('player', 'player-2')
    openSheet('Tommy Eves')

    expect(effectLines()).toEqual([['Severe Concussion', 'Handle -40, Dazed', 'then Handle -10']])
    expect(shownValues('Handle')).toEqual(['50', '55', '15'])
    expect(effectsRegion().querySelectorAll('button')).toHaveLength(0)
    await flushSave()
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })
})

describe('Lubec Skills page', () => {
  const draft = (sheet: Fields = {}, fields: Fields = {}) =>
    withSheet(sheet, { creationMode: 'new', creationStatus: 'draft', ...fields })

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows all 27 Trained and 27 Expert skills as a tree, with the free skill and picks marked and their bonus', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')

    openSkillsPage('Tommy Eves')

    expect(treeColumn(0)).toHaveLength(27)
    expect(new Set(treeColumn(0)).size).toBe(27)
    expect(treeColumn(1)).toHaveLength(27)
    expect(new Set(treeColumn(1)).size).toBe(27)
    expect([...document.querySelectorAll('.lubec-skill-tree thead th')].map((th) => th.textContent)).toEqual(['Trained +10', 'Expert +15'])
    expect(treeMarks()).toEqual([['Swimming', 'Pick +10'], ['Diving', 'Pick +15'], ['Boatwork', 'Free +10']])
    expect(takenSkills()).toEqual([
      ['Boatwork', 'Free', 'Trained', '+10'],
      ['Swimming', 'Trained', '+10'],
      ['Diving', 'Expert', '+15'],
    ])
    expect(screen.getByText('needs Swimming or Tides & Flats')).toBeTruthy()
  })

  it('offers no skill choices on a finalized character, even to its owner and the GM', () => {
    seed({ tommy: tommyEves() })
    mountTab('gm', GM)

    openSkillsPage('Tommy Eves')

    expect(screen.queryByRole('combobox', { name: 'Free class skill' })).toBeNull()
    expect(skillButtons()).toEqual([])
  })

  it('lets the owner choose the free class skill from the class\'s list and add or remove picks, storing names only', () => {
    seed({ tommy: draft({ skills: { free: null, picked: [] } }) })
    mountTab('player', 'player-1')
    openSkillsPage('Tommy Eves')
    expect(takenSkills()).toEqual([])
    expect(screen.getByText('No skills yet.')).toBeTruthy()
    expect([...freeSkillChoice().options].map((option) => option.text)).toEqual(['Not chosen', 'Boatwork', 'Jury-Rigging', 'Tides & Flats'])

    fireEvent.change(freeSkillChoice(), { target: { value: 'Tides & Flats' } })
    fireEvent.click(skillButton('Swimming'))
    fireEvent.click(skillButton('Diving'))
    fireEvent.click(skillButton('Swimming'))
    fireEvent.click(skillButton('Foraging'))
    sendSaves()

    expect(storedSkills('tommy')).toEqual({ free: 'Tides & Flats', picked: ['Diving', 'Foraging'] })
    expect(skillButton('Diving').getAttribute('aria-pressed')).toBe('true')
    expect(skillButton('Swimming').getAttribute('aria-pressed')).toBe('false')
    expect((skillButton('Tides & Flats') as HTMLButtonElement).disabled).toBe(true)
    expect(takenSkills()).toEqual([
      ['Tides & Flats', 'Free', 'Trained', '+10'],
      ['Diving', 'Expert', '+15'],
      ['Foraging', 'Expert', '+15'],
    ])
  })

  it('lets the GM change the skills on a player\'s draft, and no other player', () => {
    seed({ tommy: draft({}, { creationMode: 'established', creationStatus: 'established_draft' }) })
    mountTab('gm', GM)
    openSkillsPage('Tommy Eves')

    fireEvent.click(skillButton('Diving'))
    fireEvent.click(skillButton('Driving'))
    sendSaves()

    expect(storedSkills('tommy')).toEqual({ free: 'Boatwork', picked: ['Swimming', 'Driving'] })

    reload('player', 'player-2')
    openSkillsPage('Tommy Eves')

    expect(screen.queryByRole('combobox', { name: 'Free class skill' })).toBeNull()
    expect(skillButtons()).toEqual([])
    expect(treeMarks()).toEqual([['Swimming', 'Pick +10'], ['Boatwork', 'Free +10'], ['Driving', 'Pick +15']])
  })

  it('takes the Nerd package as the free skill, 1 Trained and 2 Expert with one Expert off the chosen Trained skill, and keeps it through a reload', () => {
    seed({ ada: draft({ class: { key: 'nerd', choices: { statPenalty: 'Charm' } }, skills: { free: null, picked: [] } }, { name: 'Ada Mitchell' }) })
    mountTab('player', 'player-1')
    openSkillsPage('Ada Mitchell')

    fireEvent.change(freeSkillChoice(), { target: { value: 'Science' } })
    fireEvent.click(skillButton('Art'))
    fireEvent.click(skillButton('Science Fair Champ'))
    fireEvent.click(skillButton('Forgery'))
    sendSaves()

    expect(storedSkills('ada')).toEqual({ free: 'Science', picked: ['Art', 'Science Fair Champ', 'Forgery'] })
    const skillWarnings = lubecRuleWarnings(parseLubecCharacter('ada', database.ada).lubec)
      .filter((warning) => ['free-skill', 'package', 'prerequisite'].includes(warning.code))
    expect(skillWarnings).toEqual([])

    reload('player', 'player-1')
    openSkillsPage('Ada Mitchell')

    expect(freeSkillChoice().value).toBe('Science')
    expect(takenSkills()).toEqual([
      ['Science', 'Free', 'Trained', '+10'],
      ['Art', 'Trained', '+10'],
      ['Science Fair Champ', 'Expert', '+15'],
      ['Forgery', 'Expert', '+15'],
    ])
  })

  it('shows a stored skill name the skill data does not know, counting for nothing, and keeps it through a save', () => {
    seed({ tommy: draft({ skills: { free: 'Knot Tying', picked: ['Swimming', 'Whittling'] } }) })
    mountTab('player', 'player-1')
    openSkillsPage('Tommy Eves')

    expect(takenSkills()).toEqual([
      ['Knot Tying', 'Free', 'Not a Lubec skill', 'counts for nothing'],
      ['Swimming', 'Trained', '+10'],
      ['Whittling', 'Not a Lubec skill', 'counts for nothing'],
    ])
    expect(freeSkillChoice().value).toBe('Knot Tying')

    fireEvent.click(skillButton('Diving'))
    sendSaves()

    expect(storedSkills('tommy')).toEqual({ free: 'Knot Tying', picked: ['Swimming', 'Whittling', 'Diving'] })
    reload('player', 'player-1')
    openSkillsPage('Tommy Eves')
    expect(takenSkills().map(([name]) => name)).toEqual(['Knot Tying', 'Swimming', 'Whittling', 'Diving'])
  })
})

// A draft typed in through Direct entry, with nothing given yet.
const directDraft = (fields: Fields = {}): Fields => ({
  ...tommyEves({ name: 'Ada Mitchell', creationStatus: 'established_draft', ...fields }),
  lubec: {
    door: 'direct',
    class: { key: null, choices: { statPenalty: null, statBonus: null } },
    base: { Strength: null, Speed: null, Intellect: null, Handle: null, Charm: null, Sanity: null, Fear: null, Body: null },
    skills: { free: null, picked: [] },
  },
})

const baseInput = (name: string) => screen.getByLabelText(`${name} base`) as HTMLInputElement

const typeBase = (name: string, text: string) => fireEvent.change(baseInput(name), { target: { value: text } })

/** A Stat or Save's final and current values; the base is a field while it can be typed into. */
const finalsOf = (name: string) => valuesOf(name).slice(1)

const picker = (label: string) => screen.getByLabelText(label, { selector: 'select' }) as HTMLSelectElement

const choose = (label: string, value: string) => fireEvent.change(picker(label), { target: { value } })

const optionsOf = (label: string) => [...picker(label).options].map((option) => option.textContent)

const backToRoster = () => fireEvent.click(screen.getByRole('button', { name: 'Back to character list' }))

/** Lets the store's half-second save come due and land. */
async function settleSaves() {
  act(() => { vi.advanceTimersByTime(500) })
  await flushMicrotasks()
}

const stored = (id: string) => parseLubecCharacter(id, database[id] as never)

function startDirectEntry() {
  fireEvent.click(screen.getByRole('button', { name: 'New character' }))
  const dialog = screen.getByRole('dialog', { name: 'New character' })
  fireEvent.click(within(dialog).getByRole('button', { name: /Direct entry/ }))
}

describe('New character and Direct entry', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('offers only the doors that exist when a player starts a new character', () => {
    mountTab('player', 'player-1')

    fireEvent.click(screen.getByRole('button', { name: 'New character' }))

    const dialog = screen.getByRole('dialog', { name: 'New character' })
    expect(within(dialog).getAllByRole('button').map((button) => button.querySelector('strong')?.textContent ?? button.textContent))
      .toEqual(['Direct entry', 'Cancel'])

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('stores a player\'s Direct entry character as their own established draft, with the starting counters and every value a hole', async () => {
    mountTab('player', 'player-1')

    startDirectEntry()
    await flushMicrotasks()

    const [id] = Object.keys(database)
    expect(database[id]).toMatchObject({
      system: 'lubec',
      ownerUserId: 'player-1',
      ownerUsername: 'viewer1',
      creationMode: 'established',
      creationStatus: 'established_draft',
      lubec: {
        door: 'direct',
        counters: { stress: 2, minimumStress: 2, trauma: 0 },
        effects: [],
        class: { key: null, choices: { statPenalty: null, statBonus: null } },
        base: { Strength: null, Speed: null, Intellect: null, Handle: null, Charm: null, Sanity: null, Fear: null, Body: null },
      },
    })
    const sheet = screen.getByRole('article', { name: 'Unnamed kid character sheet' })
    expect(within(sheet).getByText(/In creation · Direct entry/)).toBeTruthy()
    expect(finalsOf('Strength')).toEqual(['missing', 'missing'])
  })

  it('lets the GM create a Direct entry character, owned by the GM', async () => {
    mountTab('gm', GM)

    startDirectEntry()
    await flushMicrotasks()

    const [id] = Object.keys(database)
    expect(database[id]).toMatchObject({ ownerUserId: GM, creationStatus: 'established_draft', lubec: { door: 'direct' } })
  })

  it('offers no New character to a viewer with no role in the campaign', () => {
    const LubecSheet = ruleSetSheets.lubec
    render(<LubecSheet campaign={campaign} role={null} user={{ uid: 'stranger' } as User} username="viewer1" setError={vi.fn()} characterTabProps={null} />)

    expect(screen.queryByRole('button', { name: 'New character' })).toBeNull()
  })

  it('shows each final value beside its base as it is typed, and saves the typed base values', async () => {
    seed({ ada: directDraft() })
    mountTab('player', 'player-1')
    openSheet('Ada Mitchell')

    choose('Class', 'working')
    typeBase('Strength', '24')
    typeBase('Sanity', '20')

    expect(finalsOf('Strength')).toEqual(['29', '29'])
    expect(finalsOf('Sanity')).toEqual(['30', '30'])
    expect(finalsOf('Speed')).toEqual(['missing', 'missing'])

    await settleSaves()

    expect(stored('ada').lubec.base).toMatchObject({ Strength: 24, Sanity: 20, Speed: null })
    expect(stored('ada').lubec.class.key).toBe('working')
  })

  it('takes the Nerd and Popular Kid\'s -10 Stat and the Overachiever\'s +5 Stat from the class\'s own list', async () => {
    seed({ ada: directDraft() })
    mountTab('player', 'player-1')
    openSheet('Ada Mitchell')
    typeBase('Charm', '40')
    typeBase('Intellect', '30')

    choose('Class', 'nerd')

    expect(optionsOf('Stat taking -10')).toEqual(['Choose a Stat', 'Strength', 'Speed', 'Handle', 'Charm'])
    expect(finalsOf('Charm')).toEqual(['missing', 'missing'])

    choose('Stat taking -10', 'Charm')

    expect(finalsOf('Charm')).toEqual(['30', '30'])
    expect(finalsOf('Intellect')).toEqual(['50', '50'])

    choose('Class', 'popular')

    expect(optionsOf('Stat taking -10')).toEqual(['Choose a Stat', 'Strength', 'Speed', 'Intellect', 'Handle'])
    expect(finalsOf('Intellect')).toEqual(['missing', 'missing'])

    choose('Class', 'scout')
    choose('Stat gaining +5', 'Charm')

    expect(finalsOf('Charm')).toEqual(['45', '45'])
    expect(screen.queryByLabelText('Stat taking -10', { selector: 'select' })).toBeNull()

    await settleSaves()

    expect(stored('ada').lubec.class).toMatchObject({ key: 'scout', choices: { statPenalty: null, statBonus: 'Charm' } })
  })

  it('stores an emptied field as null, shows it as missing, and keeps it a hole after a remount', async () => {
    seed({ ada: directDraft() })
    mountTab('player', 'player-1')
    openSheet('Ada Mitchell')
    choose('Class', 'working')
    typeBase('Speed', '51')
    await settleSaves()

    typeBase('Speed', '')
    typeBase('Handle', '12.5')
    await settleSaves()

    const written = (database.ada.lubec as Fields).base as Fields
    expect(written.Speed).toBeNull()
    expect(written.Handle).toBeNull()
    expect(finalsOf('Speed')).toEqual(['missing', 'missing'])
    expect(baseInput('Handle').value).toBe('12.5')

    reload('player', 'player-1')
    openSheet('Ada Mitchell')

    expect(baseInput('Speed').value).toBe('')
    expect(finalsOf('Speed')).toEqual(['missing', 'missing'])
    expect(finalsOf('Handle')).toEqual(['missing', 'missing'])
  })

  it('neither blocks nor warns when a typed value breaks a rule', async () => {
    seed({ ada: directDraft() })
    mountTab('player', 'player-1')
    openSheet('Ada Mitchell')
    choose('Class', 'working')

    typeBase('Strength', '99')
    typeBase('Fear', '5')

    expect(finalsOf('Strength')).toEqual(['104', '104'])
    expect(finalsOf('Fear')).toEqual(['15', '15'])
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText(/warning|outside|range/i)).toBeNull()

    await settleSaves()

    expect(stored('ada').lubec.base).toMatchObject({ Strength: 99, Fear: 5 })
  })

  it('lets the GM type into a player\'s draft, and shows a field the stored value when it changes elsewhere', async () => {
    seed({ ada: directDraft() })
    mountTab('gm', GM)
    openSheet('Ada Mitchell')

    typeBase('Body', '21')
    await settleSaves()

    expect(stored('ada').lubec.base.Body).toBe(21)

    database.ada = { ...database.ada, lubec: { ...(directDraft().lubec as Fields), base: { Body: 33 } } }
    emitDatabase()

    expect(baseInput('Body').value).toBe('33')
  })

  it('gives a player no fields on someone else\'s draft, and nobody fields on a finalized character', () => {
    seed({ ada: directDraft({ ownerUserId: 'player-2' }), tommy: tommyEves() })
    mountTab('player', 'player-1')

    openSheet('Ada Mitchell')
    expect(screen.queryByLabelText('Strength base')).toBeNull()
    expect(screen.queryByLabelText('Class', { selector: 'select' })).toBeNull()
    expect(screen.getByText(/In creation · Direct entry/)).toBeTruthy()

    backToRoster()
    openSheet('Tommy Eves')
    expect(screen.queryByLabelText('Strength base')).toBeNull()
    expect(screen.queryByText(/In creation/)).toBeNull()
  })

  it('lets the owner delete their draft after confirming', async () => {
    seed({ ada: directDraft() })
    mountTab('player', 'player-1')
    openSheet('Ada Mitchell')

    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(mocks.deleteDoc).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }))
    expect(screen.getByText('Permanently delete Ada Mitchell? This cannot be undone.')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await flushMicrotasks()

    expect(mocks.deleteDoc).toHaveBeenCalledWith({ path: `${CHARACTERS_PATH}/ada` })
    expect(database.ada).toBeUndefined()
    expect(rosterNames()).toEqual([])
  })

  it('lets the GM delete a player\'s draft', async () => {
    seed({ ada: directDraft() })
    mountTab('gm', GM)
    openSheet('Ada Mitchell')

    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await flushMicrotasks()

    expect(database.ada).toBeUndefined()
  })

  it('gives a player no Delete on someone else\'s draft, and nobody a Delete on a finalized character', () => {
    seed({ ada: directDraft({ ownerUserId: 'player-2' }), tommy: tommyEves() })
    mountTab('player', 'player-1')

    openSheet('Ada Mitchell')
    expect(screen.queryByRole('button', { name: 'Delete draft' })).toBeNull()

    backToRoster()
    openSheet('Tommy Eves')
    expect(screen.queryByRole('button', { name: 'Delete draft' })).toBeNull()
  })
})

describe('Lubec roller', () => {
  // Labels and classes, rather than role queries, keep these cases quick in jsdom.
  const rollButton = (name: string) => valueRow(name).querySelector('button.lubec-roll-value') as HTMLButtonElement

  const roll = (name: string) => fireEvent.click(rollButton(name))

  const rollRegion = () => screen.getByLabelText('Roll', { selector: 'section' })

  const rollerButton = (text: string) => within(rollRegion()).getByText(text, { selector: 'button' })

  const skillChip = (name: string) => within(screen.getByLabelText('Arm a skill')).getByText(name, { exact: false, selector: 'button' })

  /** The last roll as the Core page shows it: what was rolled, the dice and the outcome. */
  const shownLastRoll = () => [...screen.getByLabelText('Last roll').children].map((part) => part.textContent)

  const writtenLastRoll = (id = 'tommy') => parseLubecCharacter(id, database[id]).lubec.lastRoll

  async function flushSave() {
    act(() => vi.advanceTimersByTime(500))
    await flushMicrotasks()
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('succeeds at or under the current value, and a failure adds 1 Stress that the Stress buttons take back', async () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')
    expect(shownLastRoll()).toEqual(['No roll yet.'])
    expect(rollButton('Strength').getAttribute('aria-label')).toBe('Roll Strength at or under 29')

    seedRolls(29)
    roll('Strength')
    expect(shownLastRoll()).toEqual(['Strength check', 'Rolled 29 vs 29', 'Success'])
    expect(shownCounters().stress).toBe('2')

    seedRolls(30)
    roll('Strength')
    expect(shownLastRoll()).toEqual(['Strength check', 'Rolled 30 vs 29', 'Failure, +1 Stress'])
    expect(shownCounters().stress).toBe('3')
    await flushSave()
    expect(writtenLastRoll()).toEqual({
      kind: 'stat-check', against: 'Strength', target: 29, dice: [30], result: 30,
      advantage: 'normal', skill: null, outcome: 'failure', stressAdded: 1,
    })
    expect(parseLubecCharacter('tommy', database.tommy).lubec.counters.stress).toBe(3)

    press('Lower Stress')
    await flushSave()
    expect(shownCounters().stress).toBe('2')
    expect(parseLubecCharacter('tommy', database.tommy).lubec.counters.stress).toBe(2)
    expect(writtenLastRoll()).toMatchObject({ stressAdded: 1 })
  })

  it('adds 1 Stress for a failed Save', async () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    seedRolls(35)
    roll('Fear')

    expect(shownLastRoll()).toEqual(['Fear save', 'Rolled 35 vs 34', 'Failure, +1 Stress'])
    expect(shownCounters().stress).toBe('3')
    await flushSave()
    expect(writtenLastRoll()).toMatchObject({ kind: 'save', against: 'Fear', stressAdded: 1 })
  })

  it('keeps the lower roll under Advantage and the higher under Disadvantage', async () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')
    expect(rollerButton('Normal').getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(rollerButton('Advantage'))
    seedRolls(71, 23)
    roll('Speed')
    expect(shownLastRoll()).toEqual(['Speed check', 'Advantage: 71 and 23, kept 23 vs 56', 'Success'])
    expect(rollerButton('Advantage').getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(rollerButton('Disadvantage'))
    seedRolls(23, 71)
    roll('Speed')
    expect(shownLastRoll()).toEqual(['Speed check', 'Disadvantage: 23 and 71, kept 71 vs 56', 'Failure, +1 Stress'])
    await flushSave()
    expect(writtenLastRoll()).toMatchObject({ dice: [23, 71], result: 71, advantage: 'disadvantage', outcome: 'failure' })
  })

  it('applies an armed skill\'s bonus to the next roll only, then disarms it', async () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')
    expect([...screen.getByLabelText('Arm a skill').children].map((chip) => chip.textContent))
      .toEqual(['Boatwork +10', 'Swimming +10', 'Diving +15'])

    fireEvent.click(skillChip('Diving'))
    expect(skillChip('Diving').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('+15 Diving applies to your next roll.')).toBeTruthy()
    expect(rollButton('Intellect').getAttribute('aria-label')).toBe('Roll Intellect at or under 58')
    seedRolls(50)
    roll('Intellect')

    expect(shownLastRoll()).toEqual(['Intellect check with Diving', 'Rolled 50 vs 58', 'Success'])
    expect(skillChip('Diving').getAttribute('aria-pressed')).toBe('false')
    expect(rollButton('Intellect').getAttribute('aria-label')).toBe('Roll Intellect at or under 43')
    await flushSave()
    expect(writtenLastRoll()).toMatchObject({ target: 58, skill: 'Diving', outcome: 'success', stressAdded: 0 })

    seedRolls(50)
    roll('Intellect')
    expect(shownLastRoll()).toEqual(['Intellect check', 'Rolled 50 vs 43', 'Failure, +1 Stress'])
  })

  it('disarms a skill tapped a second time', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    fireEvent.click(skillChip('Boatwork'))
    fireEvent.click(skillChip('Boatwork'))

    expect(skillChip('Boatwork').getAttribute('aria-pressed')).toBe('false')
    expect(rollButton('Handle').getAttribute('aria-label')).toBe('Roll Handle at or under 55')
  })

  it('cannot arm Scrapping, Boxing, Firearms or Slingshot / Archery', async () => {
    const fighter = { free: 'Scrapping', picked: ['Boxing', 'Firearms', 'Slingshot / Archery', 'Athletics'] }
    seed({ tommy: withSheet({ class: { key: 'tough', choices: {} }, skills: fighter }) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    for (const name of ['Scrapping', 'Boxing', 'Firearms', 'Slingshot / Archery']) {
      expect(skillChip(name).disabled).toBe(true)
      fireEvent.click(skillChip(name))
      expect(skillChip(name).getAttribute('aria-pressed')).toBe('false')
    }
    expect(skillChip('Athletics').disabled).toBe(false)
    expect(rollButton('Handle').getAttribute('aria-label')).toBe('Roll Handle at or under 50')
    seedRolls(40)
    roll('Handle')

    expect(shownLastRoll()[0]).toBe('Handle check')
    await flushSave()
    expect(writtenLastRoll()).toMatchObject({ target: 50, skill: null })
  })

  it('adds 2 Stress for an Overachiever\'s failed Stat Check and 1 for a failed Save', async () => {
    seed({ tommy: withSheet({ class: { key: 'scout', choices: { statBonus: 'Handle' } } }) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    seedRolls(90)
    roll('Charm')
    expect(shownLastRoll()[2]).toBe('Failure, +2 Stress')
    expect(shownCounters().stress).toBe('4')
    await flushSave()
    expect(writtenLastRoll()).toMatchObject({ kind: 'stat-check', stressAdded: 2 })

    seedRolls(90)
    roll('Sanity')
    expect(shownLastRoll()[2]).toBe('Failure, +1 Stress')
    expect(shownCounters().stress).toBe('5')

    press('Lower Stress')
    press('Lower Stress')
    press('Lower Stress')
    await flushSave()
    expect(parseLubecCharacter('tommy', database.tommy).lubec.counters.stress).toBe(2)
  })

  it('disables the roll on a hole with "missing value"', async () => {
    seed({ tommy: withSheet({ base: { Strength: 24, Speed: null, Intellect: 38, Handle: 50, Charm: 48, Sanity: 20, Fear: 24, Body: 21 } }) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    expect(rollButton('Speed').disabled).toBe(true)
    expect(rollButton('Speed').getAttribute('aria-label')).toBe('Roll Speed: missing value')
    expect(rollButton('Speed').title).toBe('missing value')
    fireEvent.click(rollButton('Speed'))
    await flushSave()

    expect(shownLastRoll()).toEqual(['No roll yet.'])
    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(rollButton('Strength').disabled).toBe(false)
  })

  it('writes the last roll to the character and shows it after a reload, with a double marked critical', async () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    seedRolls(33)
    roll('Strength')
    await flushSave()
    reload('player', 'player-1')
    openSheet('Tommy Eves')

    expect(shownLastRoll()).toEqual(['Strength check', 'Rolled 33 vs 29', 'Critical failure, +1 Stress'])
    expect(screen.getByLabelText('Last roll').querySelector('.critical')?.textContent).toBe('Critical failure, +1 Stress')
    expect(shownCounters().stress).toBe('3')
  })

  it('marks a double that succeeds a critical success', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    seedRolls(22)
    roll('Strength')

    expect(shownLastRoll()[2]).toBe('Critical success')
  })

  it('lets the GM roll on a player\'s character', async () => {
    seed({ tommy: tommyEves() })
    mountTab('gm', GM)
    openSheet('Tommy Eves')

    seedRolls(10)
    roll('Body')
    await flushSave()

    expect(writtenLastRoll()).toMatchObject({ kind: 'save', against: 'Body', result: 10, outcome: 'success' })
    expect(lastWritten().ownerUserId).toBe('player-1')
  })

  it('shows a player someone else\'s last roll with no roll controls', async () => {
    const lastRoll = {
      kind: 'save', against: 'Fear', target: 34, dice: [12, 44], result: 12,
      advantage: 'advantage', skill: null, outcome: 'success', stressAdded: 0,
    }
    seed({ tommy: withSheet({ lastRoll }) })
    mountTab('player', 'player-2')
    openSheet('Tommy Eves')

    expect(shownLastRoll()).toEqual(['Fear save', 'Advantage: 12 and 44, kept 12 vs 34', 'Success'])
    expect(rollRegion().querySelectorAll('button')).toHaveLength(0)
    expect(document.querySelectorAll('.lubec-values button')).toHaveLength(0)
    expect(valuesOf('Fear')).toEqual(['24', '34', '34'])
    await flushSave()
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('shows a stored last roll it cannot read as no roll yet, and keeps it until the next roll', async () => {
    seed({ tommy: withSheet({ lastRoll: { kind: 'stat', roll: 31 } }) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    expect(shownLastRoll()).toEqual(['No roll yet.'])
    press('Raise Trauma')
    await flushSave()
    expect(writtenLastRoll()).toEqual({ kind: 'stat', roll: 31 })
  })
})
