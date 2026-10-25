// @vitest-environment jsdom
/**
 * The Lubec sheet seam: the Lubec character tab mounted as the shell mounts
 * it, for a given role and user, over the shared character store with
 * `firebase/firestore` and the media module stubbed. Stored documents reach it
 * through the stubbed snapshot listener, and every test asserts on what the
 * screen shows or on what the store writes. A reload is a remount fed the
 * documents as last written. Later sheet tickets add their cases here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { User } from 'firebase/auth'
import type { Campaign, Role } from '../../types/app'

type Fields = Record<string, unknown>
type Listener = { next: (snap: unknown) => void; fail: (error: unknown) => void }

const mocks = vi.hoisted(() => ({
  listeners: {} as Record<string, { next: (snap: unknown) => void; fail: (error: unknown) => void }>,
  setDoc: vi.fn(async (..._args: unknown[]) => undefined),
  resolveStoragePathUrl: vi.fn(async (path: string): Promise<string | null> => `https://media.test/${path}`),
  uploadEntityImage: vi.fn(async (..._args: unknown[]) => ({ path: 'uploaded/portrait.png', url: 'https://media.test/uploaded/portrait.png' })),
}))

vi.mock('../../firebase', () => ({ db: { name: 'db-stub' } }))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  deleteDoc: vi.fn(async () => undefined),
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

const { ruleSetSheets } = await import('../ruleSets/sheetComponents')
const { parseLubecCharacter } = await import('../ruleSets/lubec/characterParser')

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
    <LubecSheet campaign={campaign} role={role} user={{ uid } as User} username="viewer1" setError={vi.fn()} characterTabProps={null} />,
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
