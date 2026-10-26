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
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { User } from 'firebase/auth'
import type { Campaign, Role } from '../../types/app'
import type { LubecDice } from '../ruleSets/lubec/dice'
import tommyEvesFile from '../ruleSets/lubec/fixtures/tommy-eves.lubec-character.json'

type Fields = Record<string, unknown>
type Listener = { next: (snap: unknown) => void; fail: (error: unknown) => void }

// A case here mounts the whole tab, often more than once with reloads, and runs
// role queries over it in jsdom. Alone the slowest takes about a second and a
// half, but under coverage on a loaded machine the same cases ran past
// Vitest's 5 second default and failed without any assertion failing.
vi.setConfig({ testTimeout: 30_000 })

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
const { mapCharacterSummaryFromData } = await import('../maps/lib/mapCharacterSummary')
const { isPartyCharacter } = await import('../maps/lib/partyCharacterEligibility')

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
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }))
  return screen.getByRole('article', { name: `${name} character sheet` })
}

// A Stat or Save, found by the name under its roll circle: a role query here
// computes styles for every element on the sheet, which is slow enough under
// load to time a test out.
const abilityOf = (name: string) =>
  screen.getByText(name, { selector: '.ability-name' }).closest('.ability') as HTMLElement

const circleOf = (name: string) => abilityOf(name).querySelector('.roll-circle') as HTMLButtonElement
// A spinning circle's own number, the second die's ghost beside it, and its "done" tag.
const circleNumberOf = (name: string) => circleOf(name).querySelector(':scope > .number')?.textContent
const ghostOf = (name: string) => circleOf(name).querySelector('.lubec-roll-ghost')
const doneOf = (name: string) => circleOf(name).querySelector('.lubec-roll-done')

const noteOf = (name: string) => abilityOf(name).querySelector('.base-note')?.textContent

/**
 * A Stat or Save as the sheet shows it: the number in its circle, or a draft's
 * typed base in its field there, and what the note below says of it.
 */
const valuesOf = (name: string) => [circleOf(name).querySelector('input')?.value ?? circleOf(name).textContent, noteOf(name)]

const statusLine = () => document.querySelector('.abilities .status')?.textContent

// By attribute rather than by role, as naming every card's controls is slow in jsdom.
const classCard = (name: string) => document.querySelector(`.class-card[aria-label="${name}"]`) as HTMLElement

const chooseClass = (name: string) => fireEvent.click(classCard(name).querySelector('.class-select') as HTMLElement)

/** Picks a Stat in a class card's own choice. */
const chooseOnCard = (name: string, stat: string) =>
  fireEvent.change(classCard(name).querySelector('select') as HTMLSelectElement, { target: { value: stat } })

const cardOptions = (name: string) => [...(classCard(name).querySelector('select') as HTMLSelectElement).options].map((option) => option.textContent)

/** The card's modifier bars and its free skill line. */
const cardBars = (name: string) => [...classCard(name).querySelectorAll('.modifier')].map((bar) => bar.textContent)

const changeClassButton = () => screen.queryByText('Change class', { selector: '.skill-actions button' })

/** The Skills page's Change class, which brings the class cards back on the Core page. */
function changeClass() {
  // jsdom has no scrollIntoView, so the stub is taken away again after the case.
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn()
    onTestFinished(() => { delete (Element.prototype as Partial<Element>).scrollIntoView })
  }
  fireEvent.click(screen.getByText('Skills', { selector: 'nav button' }))
  fireEvent.click(changeClassButton() as HTMLElement)
}

const missingMarks = (name: string) => abilityOf(name).querySelectorAll('.lubec-missing').length

function openSkillsPage(name: string) {
  const sheet = openSheet(name)
  fireEvent.click(within(within(sheet).getByRole('navigation', { name: 'Character sheet pages' })).getByRole('button', { name: 'Skills' }))
  return sheet
}

/** The skills the tree marks as the character's, in tree order: fixed for the free class skill while skills are chosen, on otherwise. */
const treeMarks = () => [...document.querySelectorAll('.skill-tree .skill-node.on')]
  .map((node) => [node.getAttribute('data-skill'), node.classList.contains('fixed') ? 'fixed' : 'on'])

const treeColumn = (column: number) => [...document.querySelectorAll('.skill-tree .skill-row')]
  .map((row) => row.children[column].querySelector('.skill-node')?.getAttribute('data-skill'))
  .filter(Boolean)

// By attribute rather than by role: naming every button on the tree is slow in jsdom.
const treeNode = (name: string) =>
  [...document.querySelectorAll('.skill-tree .skill-node')].find((node) => node.getAttribute('data-skill') === name) as HTMLElement

const skillDot = (name: string) => treeNode(name).querySelector('.skill-dot') as HTMLButtonElement

const skillLabel = (name: string) => treeNode(name).querySelector('.skill-label') as HTMLButtonElement

const choosableDots = () => [...document.querySelectorAll('.skill-tree .skill-dot')].filter((dot) => dot.getAttribute('aria-disabled') !== 'true')

const nodesWith = (mark: string) => [...document.querySelectorAll(`.skill-tree .skill-node.${mark}`)].map((node) => node.getAttribute('data-skill'))

const freeChip = (name: string) => screen.getByText(name, { selector: '.free-chip' })

/** The class's free list as chips, with whether each is the chosen free class skill. */
const freeChips = () => [...document.querySelectorAll('.free-chip')].map((chip) => [chip.textContent, chip.getAttribute('aria-pressed')])

/** The package panel's two rules, each with whether it is ticked, then its picks counter. */
const packagePanel = () => ({
  rules: [...document.querySelectorAll('.package-rules li')].map((rule) => [rule.classList.contains('done'), rule.firstElementChild?.firstChild?.textContent]),
  count: document.querySelector('.package-count')?.textContent,
})

const packageProgress = () => document.querySelector('.skill-detail .package-progress')?.textContent

/** The detail bar's lines: its title row, description and meta lines, or its hint. */
const detailLines = () => [...(document.querySelector('.skill-detail [aria-live]')?.children ?? [])].map((line) => line.textContent)

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
  vi.unstubAllGlobals()
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

  it('shows a seeded character\'s Stats and Saves as roll circles, each with its base and class modifier under it', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')

    openSheet('Tommy Eves')

    expect(valuesOf('Strength')).toEqual(['29', '24 +5 class'])
    expect(valuesOf('Speed')).toEqual(['56', '51 +5 class'])
    expect(valuesOf('Intellect')).toEqual(['43', '38 +5 class'])
    expect(valuesOf('Handle')).toEqual(['55', '50 +5 class'])
    expect(valuesOf('Charm')).toEqual(['53', '48 +5 class'])
    expect(valuesOf('Sanity')).toEqual(['30', '20 +10 class'])
    expect(valuesOf('Fear')).toEqual(['34', '24 +10 class'])
    expect(valuesOf('Body')).toEqual(['31', '21 +10 class'])
    expect(screen.getByRole('region', { name: 'Stats' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Saves' })).toBeTruthy()
  })

  it('opens the sheet in the v4 frame, with Core sheet, Skills and Gear page tabs', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')

    const sheet = openSheet('Tommy Eves')

    expect(within(sheet).getByText('Lubec 1977')).toBeTruthy()
    expect(within(sheet).getByRole('heading', { level: 2, name: 'Tommy Eves' })).toBeTruthy()
    expect(within(sheet.querySelector('.lubec-idband') as HTMLElement).getByText('Working Kid')).toBeTruthy()
    expect(within(sheet).getByRole('img', { name: 'No photo yet' })).toBeTruthy()
    expect(bandToken('Tommy Eves').getByRole('button', { name: 'Edit map token' }).querySelector('.token-pawn-preview')).toBeTruthy()
    expect(sheet.querySelector('.lubec-stamp')?.textContent).toBe('LubecMaine1977')
    const tabs = within(within(sheet).getByRole('navigation', { name: 'Character sheet pages' })).getAllByRole('button')
    expect(tabs.map((tab) => [tab.textContent, tab.getAttribute('aria-current')])).toEqual([['Core sheet', 'page'], ['Skills', null], ['Gear', null]])

    fireEvent.click(tabs[1])

    expect(within(sheet).getByRole('region', { name: 'Skill tree' })).toBeTruthy()
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

  it('shows a missing base value as missing, never 0, in its circle', () => {
    seed({ tommy: withSheet({ base: { Strength: 24, Speed: null, Intellect: 38, Handle: 50, Charm: 48, Sanity: 20, Fear: 24 } }) })
    mountTab('player', 'player-1')

    openSheet('Tommy Eves')

    expect(valuesOf('Speed')).toEqual(['missing', ''])
    expect(missingMarks('Speed')).toBe(1)
    expect(valuesOf('Body')).toEqual(['missing', ''])
    expect(valuesOf('Strength')).toEqual(['29', '24 +5 class'])
  })

  it('shows every circle as missing when the class is missing, with the base alone under it', () => {
    seed({ tommy: withSheet({ class: { key: null } }) })
    mountTab('player', 'player-1')

    const sheet = openSheet('Tommy Eves')

    expect(valuesOf('Strength')).toEqual(['missing', '24'])
    expect(valuesOf('Body')).toEqual(['missing', '21'])
    expect(sheet.querySelector('.lubec-kid-meta .lubec-missing')?.textContent).toBe('missing')
  })

  it('shows the circles a missing class choice could touch as missing', () => {
    seed({ tommy: withSheet({ class: { key: 'nerd', choices: { statPenalty: null } } }) })
    mountTab('player', 'player-1')

    openSheet('Tommy Eves')

    expect(valuesOf('Strength')).toEqual(['missing', '24'])
    expect(valuesOf('Intellect')).toEqual(['58', '38 +20 class'])
    expect(valuesOf('Sanity')).toEqual(['50', '20 +30 class'])
  })

  it('keeps a hole through a reload, and writes nothing for viewing a sheet', () => {
    seed({ tommy: withSheet({ base: { Strength: null } }) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    reload('player', 'player-1')
    openSheet('Tommy Eves')

    expect(valuesOf('Strength')).toEqual(['missing', ''])
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
    const own = screen.getByRole('button', { name: /^Tommy Eves/ })
    const other = screen.getByRole('button', { name: /^Ada Mitchell/ })
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
    expect(within(screen.getByRole('region', { name: 'Stress' })).queryAllByRole('button')).toEqual([])
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
    const reminder = () => document.querySelector('.lubec-death-save p')?.textContent
    seed({
      tommy: withSheet({ counters: { trauma: 3 } }),
      tough: tommyEves({ name: 'Wayne Gardner', lubec: { ...(tommyEves().lubec as Fields), class: { key: 'tough' }, counters: { trauma: 4 } } }),
    })
    mountTab('player', 'player-1')

    openSheet('Tommy Eves')
    expect(reminder()).toBeUndefined()
    press('Raise Trauma')
    expect(reminder()).toBe('Trauma has reached 4.')

    press('Back to character list')
    openSheet('Wayne Gardner')
    expect(reminder()).toBeUndefined()
    press('Raise Trauma')
    expect(reminder()).toBe('Trauma has reached 5.')
  })

  it('call for no Death Save while the class is missing', () => {
    seed({ tommy: withSheet({ class: { key: null }, counters: { trauma: 9 } }) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    expect(counterValue('Trauma')).toBe('9')
    expect(document.querySelector('.lubec-death-save')).toBeNull()
  })
})

describe('Lubec class record', () => {
  const classRecord = (name: string) => screen.getByRole('region', { name })
  const meleeStrengthMod = (record: HTMLElement) => record.querySelector('.record-value strong')?.textContent
  const withStrength = (Strength: number | null, effects: Fields[] = []) =>
    withSheet({ base: { ...((tommyEves().lubec as Fields).base as Fields), Strength }, effects })

  it('shows the class under its name: description, Trauma Response and Melee Strength Mod', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    const record = classRecord('Working Kid')
    expect(within(record).getByText(/^Your family's work is your work\./)).toBeTruthy()
    expect(within(record).getByText('Trauma Response')).toBeTruthy()
    expect(within(record).getByText('Steady Under Pressure')).toBeTruthy()
    expect(within(record).getByText('Once per session, you may take Advantage on a Panic Check.')).toBeTruthy()
    expect(within(record).queryByText('Class Rule')).toBeNull()
    expect(within(record).getByText('Melee Strength Mod')).toBeTruthy()
    // Strength 29: one full 20.
    expect(meleeStrengthMod(record)).toBe('+1 Impact')
  })

  it('shows the Class Rule beside the Trauma Response when the class has one', () => {
    seed({ tommy: withSheet({ class: { key: 'scout', choices: { statBonus: 'Speed' } } }) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    const record = classRecord('Overachiever')
    expect(within(record).getByText('Your Success Raises the Stakes')).toBeTruthy()
    expect(within(record).getByText('Class Rule')).toBeTruthy()
    expect(within(record).getByText('Failed Stat Checks give +2 Stress instead of +1.')).toBeTruthy()
  })

  it('works the Melee Strength Mod out from current Strength, effects included', () => {
    const training = { id: 'training', name: 'Summer training', cause: 'Hauling traps', steps: [{ modifiers: [{ target: 'Strength', amount: 5 }] }] }
    seed({ tommy: withStrength(35, [training]) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    // 35 + 5 class + 5 from the effect is 45: two full 20s.
    expect(meleeStrengthMod(classRecord('Working Kid'))).toBe('+2 Impact')
  })

  it('marks the Melee Strength Mod missing while Strength is a hole', () => {
    seed({ tommy: withStrength(null) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    expect(meleeStrengthMod(classRecord('Working Kid'))).toBe('missing')
  })

  it('shows nothing when the class is missing', () => {
    seed({ tommy: withSheet({ class: { key: null } }) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    expect(screen.queryByText('Trauma Response')).toBeNull()
    expect(screen.queryByText('Melee Strength Mod')).toBeNull()
  })
})

describe('Lubec Fight panel', () => {
  const fightPanel = () => screen.getByRole('region', { name: 'Fight controls' })
  const fightToggle = () => within(fightPanel()).getByRole('button')
  const effectiveHandle = () => fightPanel().querySelector('.lubec-effective-handle')?.textContent

  it('shows the prototype\'s collapsed Fight bar, which opens on Effective Handle and an empty "In hand" line with no input', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    const panel = fightPanel().querySelector('.fight-panel') as HTMLElement
    expect(fightToggle().textContent).toBe('FightDivide your Effective Handle between Defense commitments and your attack⌄')
    expect(fightToggle().getAttribute('aria-expanded')).toBe('false')
    expect(fightToggle().getAttribute('aria-controls')).toBe(panel.id)
    expect(panel.hidden).toBe(true)

    fireEvent.click(fightToggle())
    expect(fightToggle().getAttribute('aria-expanded')).toBe('true')
    expect(panel.hidden).toBe(false)
    expect(within(panel).getByRole('heading', { name: 'Handle' })).toBeTruthy()
    expect(effectiveHandle()).toBe('55')
    expect(within(panel).getByText('In hand')).toBeTruthy()
    expect(panel.querySelector('.lubec-in-hand')?.textContent).toBe('')
    expect(panel.querySelectorAll('input, textarea, select, button')).toHaveLength(0)

    fireEvent.click(fightToggle())
    expect(fightToggle().getAttribute('aria-expanded')).toBe('false')
    expect(panel.hidden).toBe(true)
  })

  it('has no Fight bar while the character is still a draft, as the prototype shows it only in play', () => {
    seed({ tommy: tommyEves({ creationStatus: 'established_draft' }) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    expect(screen.queryByRole('region', { name: 'Fight controls' })).toBeNull()
  })

  it('caps Effective Handle at 100', () => {
    seed({ tommy: withSheet({ base: { ...((tommyEves().lubec as Fields).base as Fields), Handle: 120 } }) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    expect(valuesOf('Handle')).toEqual(['125', '120 +5 class'])
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
  return within(sheet).getByRole('region', { name: 'Character identity' })
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

    typeInto(editor, 'Character name', 'Tom Eves')
    typeInto(editor, 'Age', '13')

    expect(screen.getByRole('heading', { level: 2, name: 'Tom Eves' })).toBeTruthy()
    reload('player', 'player-1')
    const sheet = openSheet('Tom Eves')
    expect(database.tommy.name).toBe('Tom Eves')
    expect((database.tommy.lubec as Fields).age).toBe(13)
    expect(database.tommy.creationStatus).toBe('active')
    expect(sheet.querySelector('.lubec-kid-age')?.textContent).toBe('Age 13')
  })

  it('keeps the player name inside the stored sheet, kept through a reload', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    const editor = openNameBand('Tommy Eves')

    typeInto(editor, 'Player name', 'Eves')

    reload('player', 'player-1')
    const reopened = openNameBand('Tommy Eves')
    expect((within(reopened).getByLabelText('Player name') as HTMLInputElement).value).toBe('Eves')
    expect((database.tommy.lubec as Fields).playerName).toBe('Eves')
    expect(database.tommy).not.toHaveProperty('playerName')
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

    typeInto(editor, 'Character name', 'Thomas Eves')

    reload('gm', GM)
    expect(database.tommy.name).toBe('Thomas Eves')
    expect(database.tommy.ownerUserId).toBe('player-1')
  })

  it('offers a player no edits on someone else\'s character', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-2')

    const sheet = openSheet('Tommy Eves')

    expect(within(sheet).queryByRole('button', { name: 'Edit name band' })).toBeNull()
    expect(within(sheet).queryByRole('region', { name: 'Character identity' })).toBeNull()
  })

  it('closes the edits with Done', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    const editor = openNameBand('Tommy Eves')

    fireEvent.click(within(editor).getByRole('button', { name: 'Done' }))

    expect(screen.queryByRole('region', { name: 'Character identity' })).toBeNull()
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

const sheetToken = (name: string) =>
  screen.getByRole('article', { name: `${name} character sheet` }).querySelector('.lubec-id-art .lubec-token') as HTMLElement

const bandToken = (name: string) => within(sheetToken(name).parentElement as HTMLElement)

const tokenImageSrc = (name: string) => sheetToken(name).querySelector('img')?.getAttribute('src') ?? null

// Opens the token picker from the sheet's token, uploads an image in it, and confirms.
async function setTokenImage(name: string, file: File) {
  fireEvent.click(bandToken(name).getByRole('button', { name: 'Edit map token' }))
  await flushMicrotasks()
  const picker = screen.getByRole('dialog')
  fireEvent.change(within(picker).getByLabelText('Upload image').querySelector('input') as HTMLInputElement, { target: { files: [file] } })
  await flushMicrotasks()
  fireEvent.click(within(picker).getByRole('button', { name: 'Confirm' }))
}

describe('Lubec map token', () => {
  it('shows a viewer the token in its colour beside the portrait, with nothing to edit', () => {
    seed({ tommy: tommyEves({ tokenIcon: { icon: 'pawn', color: '#174b58', size: 34 } }) })
    mountTab('player', 'player-2')
    openSheet('Tommy Eves')

    const token = bandToken('Tommy Eves').getByRole('img', { name: 'Tommy Eves map token' })

    expect((token.querySelector('.token-pawn-preview') as HTMLElement).style.color).toBe('rgb(23, 75, 88)')
    expect(bandToken('Tommy Eves').queryByRole('button')).toBeNull()
  })

  it('gives a character with no stored token the Lubec pawn', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-2')
    openSheet('Tommy Eves')

    const token = bandToken('Tommy Eves').getByRole('img', { name: 'Tommy Eves map token' })

    expect((token.querySelector('.token-pawn-preview') as HTMLElement).style.color).toBe('rgb(192, 138, 46)')
  })

  it('shows the token image the store resolves from its stored path', async () => {
    seed({ tommy: tommyEves({ tokenIcon: { icon: 'custom', color: '#c08a2e', size: 34, customImagePath: 'tokens/tommy.png' } }) })
    mountTab('player', 'player-2')
    await flushMicrotasks()
    openSheet('Tommy Eves')

    expect(tokenImageSrc('Tommy Eves')).toBe('https://media.test/tokens/tommy.png')
    expect(mocks.resolveStoragePathUrl).toHaveBeenCalledWith('tokens/tommy.png')
  })

  it('lets the owner set the token from the sheet, uploading as the owner and storing only its path', async () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')
    mocks.uploadEntityImage.mockResolvedValueOnce({ path: 'uploaded/token.png', url: 'https://media.test/uploaded/token.png', name: 'token' } as never)

    await setTokenImage('Tommy Eves', imageFile('token.png'))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.uploadEntityImage).toHaveBeenCalledWith(expect.objectContaining({ entityId: 'tommy', mediaKind: 'token-icons', uploadAuthority: 'owner' }))
    expect(tokenImageSrc('Tommy Eves')).toBe('https://media.test/uploaded/token.png')
    reload('player', 'player-1')
    await flushMicrotasks()
    openSheet('Tommy Eves')
    expect(database.tommy.tokenIcon).toEqual({ icon: 'custom', color: '#c08a2e', size: 34, customImagePath: 'uploaded/token.png', customImageName: 'token' })
    expect(tokenImageSrc('Tommy Eves')).toBe('https://media.test/uploaded/token.png')
  })

  it('lets the GM recolour a player\'s token from the sheet', () => {
    seed({ tommy: tommyEves() })
    mountTab('gm', GM)
    openSheet('Tommy Eves')

    fireEvent.click(bandToken('Tommy Eves').getByRole('button', { name: 'Edit map token' }))
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('Token color'), { target: { value: '#a34229' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }))

    reload('gm', GM)
    expect(database.tommy.tokenIcon).toEqual({ icon: 'pawn', color: '#a34229', size: 34 })
    expect(database.tommy.ownerUserId).toBe('player-1')
  })

  it('keeps the token as it was when the picker is cancelled', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    fireEvent.click(bandToken('Tommy Eves').getByRole('button', { name: 'Edit map token' }))
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('Token color'), { target: { value: '#a34229' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect((sheetToken('Tommy Eves').querySelector('.token-pawn-preview') as HTMLElement).style.color).toBe('rgb(192, 138, 46)')
    reload('player', 'player-1')
    expect(database.tommy).not.toHaveProperty('tokenIcon')
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

    expect(valuesOf('Handle')).toEqual(['5', '50 +5 class -50 effect'])
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

    expect(valuesOf('Handle')).toEqual(['0', '50 +5 class -55 effect'])
    expect(valuesOf('Speed')).toEqual(['missing', ''])
    expect(document.querySelector('.lubec-effective-handle')?.textContent).toBe('0')
    expect(valuesOf('Strength')).toEqual(['29', '24 +5 class'])
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
    expect(valuesOf('Handle')).toEqual(['15', '50 +5 class -40 effect'])
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
    expect(valuesOf('Handle')).toEqual(['15', '50 +5 class -40 effect'])

    fireEvent.click(within(effectsRegion()).getByLabelText('Step down Severe Concussion'))

    expect(effectLines()).toEqual([['Severe Concussion', 'Handle -10']])
    expect(valuesOf('Handle')).toEqual(['45', '50 +5 class -10 effect'])
    await flushSave()
    expect(writtenEffects()[0].steps).toEqual([{ modifiers: [{ target: 'Handle', amount: -10 }], labels: [] }])
    expect(writtenEffects()[0].cause).toBe('Severe Concussion (failed Body Save)')
    reload('player', 'player-1')
    openSheet('Tommy Eves')
    expect(effectLines()).toEqual([['Severe Concussion', 'Handle -10']])

    fireEvent.click(within(effectsRegion()).getByLabelText('Step down Severe Concussion'))

    expect(effectLines()).toEqual([])
    expect(valuesOf('Handle')).toEqual(['55', '50 +5 class'])
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
    expect(valuesOf('Speed')).toEqual(['36', '51 +5 class -20 effect'])
    expect(valuesOf('Handle')).toEqual(['55', '50 +5 class'])
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
    expect(valuesOf('Handle')).toEqual(['55', '50 +5 class'])
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
    expect(valuesOf('Handle')).toEqual(['15', '50 +5 class -40 effect'])
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

  it('shows all 27 Trained and 27 Expert skills as the prototype\'s tree to read, with the character\'s skills filled in', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')

    openSkillsPage('Tommy Eves')

    expect(treeColumn(0)).toHaveLength(27)
    expect(new Set(treeColumn(0)).size).toBe(27)
    expect(treeColumn(1)).toHaveLength(27)
    expect(new Set(treeColumn(1)).size).toBe(27)
    expect(document.querySelectorAll('.skill-tree .skill-empty')).toHaveLength(8)
    expect([...document.querySelectorAll('.tree-head')].map((head) => head.textContent)).toEqual(['Trained Skills+10 bonus', 'Expert Skills+15 bonus'])
    expect(screen.getByRole('region', { name: 'Skill tree' }).querySelector('.section-kicker')?.textContent).toBe('Your skills are filled in')
    expect(treeMarks()).toEqual([['Swimming', 'on'], ['Diving', 'on'], ['Boatwork', 'on']])
    expect(document.querySelector('.skill-package')).toBeNull()
    expect(detailLines()).toEqual(['Click a name to read it and see its connections.'])
    expect(packageProgress()).toBe('Your skills are filled in')
  })

  it('reads a skill from its name: the detail bar, its wires\' ends lit, and a second click puts the hint back', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSkillsPage('Tommy Eves')

    fireEvent.click(skillLabel('Diving'))

    expect(document.querySelector('.skill-tree')?.classList.contains('focus')).toBe(true)
    expect(skillLabel('Diving').getAttribute('aria-expanded')).toBe('true')
    expect(nodesWith('hot')).toEqual(['Tides & Flats', 'Swimming', 'Diving'])
    expect(detailLines()).toEqual([
      'DivingExpert +15Chosen',
      'Breath-hold diving, working underwater in cold or murky conditions, and using actual diving equipment when it becomes available.',
      'Prerequisite (any one): Swimming, Tides & Flats',
      'Kit: A wetsuit, A weight belt, A dive light, A dive knife, A borrowed scuba tank and regulator',
    ])

    fireEvent.click(skillLabel('Hunting'))

    expect(skillLabel('Diving').getAttribute('aria-expanded')).toBe('false')
    expect(detailLines()).toEqual([
      'HuntingTrained +10',
      'Hunting game, reading sign, staying concealed from animals, playing the wind, fieldcraft, and competent use of your familiar hunting rifle.',
      'Leads to: Trapping, Tracking, Firearms, Slingshot / Archery',
      "Always have: Your rifle: a .22, or Dad's .30-30 you're allowed to take / Kit: A box of shells, Binoculars, A rifle scope, A tree stand you built, A skinning knife, A key to the deer camp up the woods road",
    ])

    fireEvent.click(skillLabel('Hunting'))

    expect(document.querySelector('.skill-tree')?.classList.contains('focus')).toBe(false)
    expect(nodesWith('hot')).toEqual([])
    expect(detailLines()).toEqual(['Click a name to read it and see its connections.'])
  })

  it('wires each Trained skill to the Experts it unlocks, and lights the focused skill\'s wires on top', () => {
    const observed: Element[] = []
    vi.stubGlobal('ResizeObserver', class {
      constructor(private readonly draw: () => void) {}
      observe(element: Element) {
        observed.push(element)
        this.draw()
      }
      disconnect() {}
    })
    onTestFinished(() => { vi.unstubAllGlobals() })
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSkillsPage('Tommy Eves')

    const wires = () => [...document.querySelectorAll('.skill-tree path.wire')]
    expect(observed).toEqual([document.querySelector('.skill-tree')])
    expect(wires()).toHaveLength(59)
    expect(wires().every((wire) => wire.getAttribute('marker-end') === 'url(#lubec-skill-arrow)')).toBe(true)

    fireEvent.click(skillLabel('Diving'))

    const hot = wires().filter((wire) => wire.classList.contains('hot'))
    expect(hot).toEqual(wires().slice(-2))
    expect(hot.map((wire) => wire.getAttribute('marker-end'))).toEqual(['url(#lubec-skill-arrow-hot)', 'url(#lubec-skill-arrow-hot)'])
  })

  it('offers no skill choices on a finalized character, even to its owner and the GM', () => {
    seed({ tommy: tommyEves() })
    mountTab('gm', GM)

    openSkillsPage('Tommy Eves')
    fireEvent.click(skillDot('Hunting'))
    sendSaves()

    expect(choosableDots()).toEqual([])
    expect(freeChips()).toEqual([])
    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(treeMarks()).toEqual([['Swimming', 'on'], ['Diving', 'on'], ['Boatwork', 'on']])
  })

  it('goes back to the Core page from the detail bar, bringing the skill strip into view', () => {
    const scrollIntoView = vi.fn()
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }))
    Element.prototype.scrollIntoView = scrollIntoView
    onTestFinished(() => {
      vi.unstubAllGlobals()
      delete (Element.prototype as Partial<Element>).scrollIntoView
    })
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    const sheet = openSkillsPage('Tommy Eves')

    fireEvent.click(within(sheet).getByText('Hide skill tree', { selector: 'button' }))

    const strip = within(sheet).getByRole('region', { name: 'Skills' })
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    expect(scrollIntoView.mock.contexts[0]).toBe(strip)
  })

  it('lets the owner choose the free class skill from its chips and add or remove picks with the dots, storing names only', () => {
    seed({ tommy: draft({ skills: { free: null, picked: [] } }) })
    mountTab('player', 'player-1')
    openSkillsPage('Tommy Eves')
    expect(screen.getByRole('region', { name: 'Choose your skills' })).toBeTruthy()
    expect(treeMarks()).toEqual([])
    expect(freeChips()).toEqual([['Boatwork', 'false'], ['Jury-Rigging', 'false'], ['Tides & Flats', 'false']])
    expect(nodesWith('suggested')).toEqual(['Tides & Flats', 'Boatwork', 'Jury-Rigging'])
    expect(packagePanel()).toEqual({
      rules: [[false, 'Free class skill:'], [false, 'Bonus:']],
      count: 'Picks madeNothing yetof 1 Expert + 1 Trained',
    })
    expect(packageProgress()).toBe('Choose your free class skill')
    expect(detailLines()).toEqual(['Click a dot to choose a skill. Click a name to read it and see its connections.'])

    fireEvent.click(freeChip('Tides & Flats'))
    expect(packageProgress()).toBe('Pick 1 Expert + 1 Trained')
    fireEvent.click(skillDot('Swimming'))
    fireEvent.click(skillDot('Diving'))
    fireEvent.click(skillDot('Swimming'))
    fireEvent.click(skillDot('Foraging'))
    sendSaves()

    expect(storedSkills('tommy')).toEqual({ free: 'Tides & Flats', picked: ['Diving', 'Foraging'] })
    expect(skillDot('Diving').getAttribute('aria-pressed')).toBe('true')
    expect(skillDot('Swimming').getAttribute('aria-pressed')).toBe('false')
    expect(treeMarks()).toEqual([['Tides & Flats', 'fixed'], ['Foraging', 'on'], ['Diving', 'on']])
    expect(nodesWith('suggested')).toEqual([])
    expect(freeChips()).toEqual([['Boatwork', 'false'], ['Jury-Rigging', 'false'], ['Tides & Flats', 'true']])
    expect(packagePanel()).toEqual({
      rules: [[true, 'Free class skill:'], [false, 'Bonus:']],
      count: 'Picks made2 Expertof 1 Expert + 1 Trained',
    })
    expect(packageProgress()).toBe('Picked 2 Expert of 1 Expert + 1 Trained')
    expect(detailLines()[0]).toBe('ForagingExpert +15Chosen')
  })

  it('takes the first dot from the class\'s free list as the free class skill, and clears it from its dot or its chip', () => {
    seed({ tommy: draft({ skills: { free: null, picked: ['Swimming'] } }) })
    mountTab('player', 'player-1')
    openSkillsPage('Tommy Eves')

    fireEvent.click(skillDot('Boatwork'))
    sendSaves()
    expect(storedSkills('tommy')).toEqual({ free: 'Boatwork', picked: ['Swimming'] })
    expect(detailLines()[0]).toBe('BoatworkTrained +10Class skill')

    fireEvent.click(skillDot('Jury-Rigging'))
    fireEvent.click(skillDot('Boatwork'))
    sendSaves()
    expect(storedSkills('tommy')).toEqual({ free: null, picked: ['Swimming', 'Jury-Rigging'] })

    fireEvent.click(freeChip('Tides & Flats'))
    fireEvent.click(freeChip('Tides & Flats'))
    sendSaves()
    expect(storedSkills('tommy')).toEqual({ free: null, picked: ['Swimming', 'Jury-Rigging'] })
  })

  it('lets the GM change the skills on a player\'s draft, and no other player', () => {
    seed({ tommy: draft({}, { creationMode: 'established', creationStatus: 'established_draft' }) })
    mountTab('gm', GM)
    openSkillsPage('Tommy Eves')
    expect(packageProgress()).toBe('Package complete')

    fireEvent.click(skillDot('Diving'))
    fireEvent.click(skillDot('Driving'))
    sendSaves()

    expect(storedSkills('tommy')).toEqual({ free: 'Boatwork', picked: ['Swimming', 'Driving'] })

    reload('player', 'player-2')
    openSkillsPage('Tommy Eves')

    expect(freeChips()).toEqual([])
    expect(choosableDots()).toEqual([])
    expect(treeMarks()).toEqual([['Swimming', 'on'], ['Boatwork', 'on'], ['Driving', 'on']])
  })

  it('takes the Nerd package as the free skill, 1 Trained and 2 Expert with one Expert off the chosen Trained skill, and keeps it through a reload', () => {
    seed({ ada: draft({ class: { key: 'nerd', choices: { statPenalty: 'Charm' } }, skills: { free: null, picked: [] } }, { name: 'Ada Mitchell' }) })
    mountTab('player', 'player-1')
    openSkillsPage('Ada Mitchell')
    expect(document.querySelectorAll('.package-rules li')[1].textContent).toBe(
      'Bonus: 1 Trained and 2 Expert. Each Expert needs one of its prerequisites among your Trained skills, the free class skill included.')
    expect(packagePanel().count).toBe('Picks madeNothing yetof 2 Expert + 1 Trained')

    fireEvent.click(freeChip('Science'))
    fireEvent.click(skillDot('Art'))
    fireEvent.click(skillDot('Science Fair Champ'))
    fireEvent.click(skillDot('Forgery'))
    sendSaves()

    expect(storedSkills('ada')).toEqual({ free: 'Science', picked: ['Art', 'Science Fair Champ', 'Forgery'] })
    const skillWarnings = lubecRuleWarnings(parseLubecCharacter('ada', database.ada).lubec)
      .filter((warning) => ['free-skill', 'package', 'prerequisite'].includes(warning.code))
    expect(skillWarnings).toEqual([])

    reload('player', 'player-1')
    openSkillsPage('Ada Mitchell')

    expect(freeChips()).toEqual([['Electronics & Radio', 'false'], ['Science', 'true'], ['History & Geography', 'false']])
    expect(treeMarks()).toEqual([['Science', 'fixed'], ['Science Fair Champ', 'on'], ['Art', 'on'], ['Forgery', 'on']])
    expect(packagePanel()).toEqual({
      rules: [[true, 'Free class skill:'], [true, 'Bonus:']],
      count: 'Picks made2 Expert + 1 Trainedof 2 Expert + 1 Trained',
    })
    expect(packageProgress()).toBe('Package complete')
  })

  it('names a stored skill the tree does not have, counting for nothing, and keeps it through a save', () => {
    seed({ tommy: draft({ skills: { free: 'Knot Tying', picked: ['Swimming', 'Whittling'] } }) })
    mountTab('player', 'player-1')
    openSkillsPage('Tommy Eves')

    expect(document.querySelector('.skill-detail .msg')?.textContent).toBe('Not on the tree, counting for nothing: Knot Tying, Whittling')
    expect(treeMarks()).toEqual([['Swimming', 'on']])
    expect(packagePanel()).toEqual({
      rules: [[false, 'Free class skill:'], [false, 'Bonus:']],
      count: 'Picks made1 Trainedof 1 Expert + 1 Trained',
    })
    expect(document.querySelector('.package-rules li')?.textContent).toMatch(/^Free class skill: Knot Tying/)
    expect(freeChips().map(([, pressed]) => pressed)).toEqual(['false', 'false', 'false'])

    fireEvent.click(skillDot('Diving'))
    sendSaves()

    expect(storedSkills('tommy')).toEqual({ free: 'Knot Tying', picked: ['Swimming', 'Whittling', 'Diving'] })
    reload('player', 'player-1')
    openSkillsPage('Tommy Eves')
    expect(document.querySelector('.skill-detail .msg')?.textContent).toBe('Not on the tree, counting for nothing: Knot Tying, Whittling')
    expect(treeMarks()).toEqual([['Swimming', 'on'], ['Diving', 'on']])
  })

  it('shows no package panel or progress while the class is a hole, and the dots still choose', () => {
    seed({ tommy: draft({ class: { key: null, choices: {} }, skills: { free: null, picked: [] } }) })
    mountTab('player', 'player-1')
    openSkillsPage('Tommy Eves')

    expect(document.querySelector('.skill-package')).toBeNull()
    expect(document.querySelector('.skill-actions')).toBeNull()
    expect(nodesWith('suggested')).toEqual([])

    fireEvent.click(skillDot('Boatwork'))
    sendSaves()

    expect(storedSkills('tommy')).toEqual({ free: null, picked: ['Boatwork'] })
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
      .toEqual(['Import a file', 'Direct entry', 'Guided roll-up', 'Cancel'])

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
    expect(valuesOf('Strength')).toEqual(['', ''])
    expect(within(sheet).getByText('Choose your class', { selector: 'h3' })).toBeTruthy()
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

  it('takes each base typed into its circle\'s place, says under it what it comes to, and saves the typed base values', async () => {
    seed({ ada: directDraft() })
    mountTab('player', 'player-1')
    openSheet('Ada Mitchell')

    chooseClass('Working Kid')
    typeBase('Strength', '24')
    typeBase('Sanity', '20')

    expect(valuesOf('Strength')).toEqual(['24', '+5 class = 29'])
    expect(valuesOf('Sanity')).toEqual(['20', '+10 class = 30'])
    expect(valuesOf('Speed')).toEqual(['', ''])
    expect(document.querySelector('.class-grid')).toBeNull()

    await settleSaves()

    expect(stored('ada').lubec.base).toMatchObject({ Strength: 24, Sanity: 20, Speed: null })
    expect(stored('ada').lubec.class.key).toBe('working')
  })

  it('offers the five class cards, each with its modifiers, free skill, description and its own choice, and no Trauma Response yet', () => {
    seed({ ada: directDraft() })
    mountTab('player', 'player-1')
    openSheet('Ada Mitchell')

    expect([...document.querySelectorAll('.class-card h4')].map((title) => title.textContent))
      .toEqual(['Working Kid', 'Nerd', 'Tough', 'Overachiever', 'Popular Kid'])
    expect(cardBars('Working Kid')).toEqual(['+5 all Stats', '+10 all Saves', 'Free skill: Boatwork, Jury-Rigging or Tides & Flats + 1 Trained and 1 Expert'])
    expect(cardBars('Tough').slice(0, 3)).toEqual(['+10 Strength', '+10 Body', '+20 Fear'])
    expect(within(classCard('Nerd')).getByText(/Tape on your glasses/)).toBeTruthy()
    expect(screen.queryByText(/Steady Under Pressure/)).toBeNull()
    expect(classCard('Working Kid').querySelector('select')).toBeNull()
    expect(document.querySelector('.class-lock')).toBeNull()
    expect(document.querySelector('.class-section .section-kicker')).toBeNull()
  })

  it('takes the Nerd and Popular Kid\'s -10 Stat and the Overachiever\'s +5 Stat from the card\'s own list, and Change class clears the class and its skills', async () => {
    seed({ ada: directDraft({ lubec: { ...(directDraft().lubec as Fields), skills: { free: 'Science', picked: ['Art'] } } }) })
    mountTab('player', 'player-1')
    openSheet('Ada Mitchell')
    typeBase('Charm', '40')
    typeBase('Intellect', '30')

    expect(cardOptions('Nerd')).toEqual(['Strength', 'Speed', 'Handle', 'Charm'])
    expect(cardOptions('Popular Kid')).toEqual(['Strength', 'Speed', 'Intellect', 'Handle'])
    expect(cardOptions('Overachiever')).toEqual(['Strength', 'Speed', 'Handle', 'Charm'])

    chooseOnCard('Nerd', 'Charm')
    chooseClass('Nerd')

    expect(valuesOf('Charm')).toEqual(['40', '-10 class = 30'])
    expect(valuesOf('Intellect')).toEqual(['30', '+20 class = 50'])

    changeClass()
    await settleSaves()

    expect(stored('ada').lubec.class).toMatchObject({ key: null, choices: { statPenalty: null, statBonus: null } })
    expect(stored('ada').lubec.skills).toEqual({ free: null, picked: [] })
    expect(document.querySelector('.lubec-skills')).toBeNull()
    expect(valuesOf('Charm')).toEqual(['40', 'missing'])

    chooseClass('Popular Kid')
    await settleSaves()

    expect(stored('ada').lubec.class).toMatchObject({ key: 'popular', choices: { statPenalty: 'Strength' } })

    changeClass()
    chooseOnCard('Overachiever', 'Charm')
    chooseClass('Overachiever')

    expect(valuesOf('Charm')).toEqual(['40', '+5 class = 45'])

    await settleSaves()

    expect(stored('ada').lubec.class).toMatchObject({ key: 'scout', choices: { statPenalty: null, statBonus: 'Charm' } })
  })

  it('stores an emptied field as null, shows it as missing, and keeps it a hole after a remount', async () => {
    seed({ ada: directDraft() })
    mountTab('player', 'player-1')
    openSheet('Ada Mitchell')
    chooseClass('Working Kid')
    typeBase('Speed', '51')
    await settleSaves()

    typeBase('Speed', '')
    typeBase('Handle', '12.5')
    await settleSaves()

    const written = (database.ada.lubec as Fields).base as Fields
    expect(written.Speed).toBeNull()
    expect(written.Handle).toBeNull()
    expect(valuesOf('Speed')).toEqual(['', ''])
    expect(valuesOf('Handle')).toEqual(['12.5', ''])

    reload('player', 'player-1')
    openSheet('Ada Mitchell')

    expect(valuesOf('Speed')).toEqual(['', ''])
    expect(valuesOf('Handle')).toEqual(['', ''])
  })

  it('neither blocks nor warns when a typed value breaks a rule', async () => {
    seed({ ada: directDraft() })
    mountTab('player', 'player-1')
    openSheet('Ada Mitchell')
    chooseClass('Working Kid')

    typeBase('Strength', '99')
    typeBase('Fear', '5')

    expect(valuesOf('Strength')).toEqual(['99', '+5 class = 104'])
    expect(valuesOf('Fear')).toEqual(['5', '+10 class = 15'])
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
    expect(document.querySelector('.class-grid')).toBeNull()
    expect(screen.getByText(/In creation · Direct entry/)).toBeTruthy()

    backToRoster()
    openSheet('Tommy Eves')
    expect(screen.queryByLabelText('Strength base')).toBeNull()
    expect(screen.queryByText(/In creation/)).toBeNull()
  })

  it('lets the owner delete their draft after confirming, through the shared delete dialog', async () => {
    seed({ ada: directDraft() })
    mountTab('player', 'player-1')
    openSheet('Ada Mitchell')

    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.deleteDoc).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }))
    expect(within(screen.getByRole('dialog')).getByText('Delete character?')).toBeTruthy()
    expect(screen.getByText('Are you sure you want to delete Ada Mitchell? This cannot be undone.')).toBeTruthy()
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

  it('lets the owner delete their finalized character from the sheet, and opens the next one left', async () => {
    window.innerWidth = 1440
    seed({ tommy: tommyEves(), ada: directDraft() })
    mountTab('player', 'player-1')
    const sheet = openSheet('Tommy Eves')

    fireEvent.click(within(sheet).getByRole('button', { name: 'Delete character' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(mocks.deleteDoc).not.toHaveBeenCalled()
    expect(rosterNames().sort()).toEqual(['Ada Mitchell', 'Tommy Eves'])

    fireEvent.click(within(sheet).getByRole('button', { name: 'Delete character' }))
    expect(screen.getByText('Are you sure you want to delete Tommy Eves? This cannot be undone.')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await flushMicrotasks()

    expect(mocks.deleteDoc).toHaveBeenCalledWith({ path: `${CHARACTERS_PATH}/tommy` })
    expect(database.tommy).toBeUndefined()
    expect(screen.queryByRole('button', { name: /^Tommy Eves/ })).toBeNull()
    expect(screen.getByRole('article', { name: 'Ada Mitchell character sheet' })).toBeTruthy()
  })

  it('lets the GM delete a player\'s finalized character from its roster card, after confirming', async () => {
    window.innerWidth = 1440
    seed({ tommy: tommyEves() })
    mountTab('gm', GM)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Tommy Eves' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(mocks.deleteDoc).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete Tommy Eves' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await flushMicrotasks()

    expect(database.tommy).toBeUndefined()
    expect(rosterNames()).toEqual([])
    expect(screen.getByText('Pick a character to open their sheet.')).toBeTruthy()
  })

  it('gives a player a Delete on their own characters and none on anyone else\'s, draft or finalized', () => {
    seed({
      tommy: tommyEves(),
      ada: directDraft({ ownerUserId: 'player-2' }),
      wayne: tommyEves({ name: 'Wayne Gardner', ownerUserId: 'player-2' }),
    })
    mountTab('player', 'player-1')

    expect(screen.getByRole('button', { name: 'Delete Tommy Eves' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Delete Ada Mitchell' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete Wayne Gardner' })).toBeNull()

    openSheet('Ada Mitchell')
    expect(screen.queryByRole('button', { name: 'Delete draft' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete character' })).toBeNull()

    backToRoster()
    openSheet('Wayne Gardner')
    expect(screen.queryByRole('button', { name: 'Delete character' })).toBeNull()

    backToRoster()
    openSheet('Tommy Eves')
    expect(screen.getByRole('button', { name: 'Delete character' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Delete draft' })).toBeNull()
  })
})

describe('Give to Player', () => {
  const giveButton = () => screen.queryByRole('button', { name: 'Give character to player' })

  /** The players the dialog offers, in order, and the one it has picked. */
  const offeredPlayers = () => within(screen.getByRole('dialog')).getAllByRole('radio')
    .map((radio) => [radio.closest('label')?.textContent, (radio as HTMLInputElement).checked])

  const confirmGive = () => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Give to Player' }))

  const ownerOnCard = (name: string) =>
    screen.getByRole('button', { name: new RegExp(`^${name}`) }).querySelector('.character-card-owner')?.textContent

  beforeEach(() => {
    window.innerWidth = 1440
  })

  it('gives the GM a Give to Player on every sheet, draft or finalized, their own included, and a player none', () => {
    seed({
      tommy: tommyEves(),
      ada: directDraft({ ownerUserId: 'player-2', ownerUsername: 'adamitc' }),
      wayne: directDraft({ name: 'Wayne Gardner', ownerUserId: GM, ownerUsername: 'gmuser1' }),
    })
    mountTab('gm', GM)

    for (const name of ['Tommy Eves', 'Ada Mitchell', 'Wayne Gardner']) {
      openSheet(name)
      expect(giveButton()).toBeTruthy()
    }

    reload('player', 'player-1')
    for (const name of ['Tommy Eves', 'Ada Mitchell']) {
      openSheet(name)
      expect(giveButton()).toBeNull()
    }
  })

  it('lets the GM give a draft they made to a player, who then sees it, can type into it and delete it, and writes nothing on Cancel', () => {
    vi.useFakeTimers()
    seed({
      tommy: tommyEves(),
      ada: directDraft({ ownerUserId: 'player-2', ownerUsername: 'adamitc' }),
      wayne: directDraft({ name: 'Wayne Gardner', ownerUserId: GM, ownerUsername: 'gmuser1' }),
    })
    mountTab('gm', GM)
    openSheet('Wayne Gardner')

    fireEvent.click(giveButton() as HTMLElement)
    expect(within(screen.getByRole('dialog')).getByText('Wayne Gardner')).toBeTruthy()
    expect(offeredPlayers()).toEqual([['adamitc', true], ['tommyev', false]])
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    sendSaves()

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.setDoc).not.toHaveBeenCalled()

    fireEvent.click(giveButton() as HTMLElement)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('radio', { name: 'tommyev' }))
    confirmGive()
    sendSaves()

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(database.wayne).toMatchObject({ ownerUserId: 'player-1', ownerUsername: 'tommyev', creationStatus: 'established_draft' })
    expect(ownerOnCard('Wayne Gardner')).toBe('tommyev')

    reload('player', 'player-1')
    expect(rosterNames()).toContain('Wayne Gardner')
    openSheet('Wayne Gardner')
    expect(baseInput('Strength')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete draft' })).toBeTruthy()
  })

  it('hands a finalized character over: the new owner can edit and delete it, and the old owner no longer can', () => {
    vi.useFakeTimers()
    seed({ tommy: tommyEves(), ada: directDraft({ ownerUserId: 'player-2', ownerUsername: 'adamitc' }) })
    mountTab('gm', GM)
    openSheet('Tommy Eves')

    fireEvent.click(giveButton() as HTMLElement)
    expect(offeredPlayers()).toEqual([['adamitc', true]])
    confirmGive()
    sendSaves()

    expect(database.tommy).toMatchObject({ ownerUserId: 'player-2', ownerUsername: 'adamitc', creationStatus: 'active' })
    expect(ownerOnCard('Tommy Eves')).toBe('adamitc')

    reload('player', 'player-2')
    let sheet = openSheet('Tommy Eves')
    expect(within(sheet).getByRole('button', { name: 'Edit name band' })).toBeTruthy()
    expect(within(sheet).getByRole('button', { name: 'Delete character' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete Tommy Eves' })).toBeTruthy()

    reload('player', 'player-1')
    sheet = openSheet('Tommy Eves')
    expect(within(sheet).queryByRole('button', { name: 'Edit name band' })).toBeNull()
    expect(within(sheet).queryByRole('button', { name: 'Delete character' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete Tommy Eves' })).toBeNull()
  })
})

describe('Lubec roller', () => {
  // Labels and classes, rather than role queries, keep these cases quick in jsdom.
  const rollButton = circleOf

  const roll = (name: string) => fireEvent.click(rollButton(name))

  const rollerButton = (text: string) => within(screen.getByLabelText('Advantage')).getByText(text, { selector: 'button' })

  const skillChip = (name: string) => within(screen.getByLabelText('Arm a skill')).getByText(name, { exact: false, selector: 'button' })

  /** The skill chips as the strip shows them, each with its bonus. */
  const shownChips = () => [...screen.getByLabelText('Arm a skill').children].map((chip) => chip.textContent)

  const writtenLastRoll = (id = 'tommy') => parseLubecCharacter(id, database[id]).lubec.lastRoll

  /** The status line under the circles. */
  const shownStatus = () => document.querySelector('.abilities .status')?.textContent

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
    expect(shownStatus()).toBe('')
    expect(rollButton('Strength').getAttribute('aria-label')).toBe('Roll Strength at or under 29')

    seedRolls(29)
    roll('Strength')
    expect(shownCounters().stress).toBe('2')
    expect(valuesOf('Strength')).toEqual(['29/29', '24 +5 class'])
    expect(circleOf('Strength').className).toBe('roll-circle has-value check-success')
    expect(circleOf('Strength').getAttribute('aria-label')).toBe('Strength rolled 29 against 29. Success. Click to clear.')
    expect(shownStatus()).toBe('Strength: 29 vs 29 - success.')

    roll('Strength')
    expect(valuesOf('Strength')).toEqual(['29', '24 +5 class'])
    expect(shownStatus()).toBe('Strength check cleared. Score unchanged.')

    seedRolls(30)
    roll('Strength')
    expect(shownCounters().stress).toBe('3')
    expect(valuesOf('Strength')).toEqual(['30/29', '24 +5 class'])
    expect(circleOf('Strength').className).toBe('roll-circle has-value check-failure')
    expect(shownStatus()).toBe('Strength: 30 vs 29 - failure, +1 Stress.')
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

    expect(shownStatus()).toBe('Fear: 35 vs 34 - failure, +1 Stress.')
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
    expect(shownStatus()).toBe('Speed (Advantage, 71 and 23): 23 vs 56 - success.')

    fireEvent.click(rollerButton('Disadvantage'))
    roll('Speed')
    seedRolls(23, 71)
    roll('Speed')
    expect(shownStatus()).toBe('Speed (Disadvantage, 23 and 71): 71 vs 56 - failure, +1 Stress.')
    await flushSave()
    expect(writtenLastRoll()).toMatchObject({ dice: [23, 71], result: 71, advantage: 'disadvantage', outcome: 'failure' })
  })

  /** The mode the Advantage switch shows pressed. */
  const pressedMode = () => within(screen.getByLabelText('Advantage')).getAllByRole('button')
    .filter((button) => button.getAttribute('aria-pressed') === 'true').map((button) => button.textContent)

  it('puts Advantage and Disadvantage back to Normal once a Stat Check or Save is rolled with it', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    fireEvent.click(rollerButton('Advantage'))
    expect(pressedMode()).toEqual(['Advantage'])
    seedRolls(71, 23)
    roll('Speed')
    expect(shownStatus()).toBe('Speed (Advantage, 71 and 23): 23 vs 56 - success.')
    expect(pressedMode()).toEqual(['Normal'])

    seedRolls(40)
    roll('Strength')
    expect(shownStatus()).toBe('Strength: 40 vs 29 - failure, +1 Stress.')

    fireEvent.click(rollerButton('Disadvantage'))
    seedRolls(12, 45)
    roll('Fear')
    expect(shownStatus()).toBe('Fear (Disadvantage, 12 and 45): 45 vs 34 - failure, +1 Stress.')
    expect(pressedMode()).toEqual(['Normal'])
  })

  it('turns the mode off when it is pressed again before a roll', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    fireEvent.click(rollerButton('Disadvantage'))
    fireEvent.click(rollerButton('Disadvantage'))
    expect(pressedMode()).toEqual(['Normal'])
    fireEvent.click(rollerButton('Advantage'))
    fireEvent.click(rollerButton('Normal'))
    expect(pressedMode()).toEqual(['Normal'])

    seedRolls(40)
    roll('Speed')
    expect(shownStatus()).toBe('Speed: 40 vs 56 - success.')
  })

  it('keeps the mode set when a result is only cleared, and never brings it back after a reload', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')
    seedRolls(40)
    roll('Speed')

    fireEvent.click(rollerButton('Advantage'))
    roll('Speed')
    expect(shownStatus()).toBe('Speed check cleared. Score unchanged.')
    expect(pressedMode()).toEqual(['Advantage'])

    reload('player', 'player-1')
    openSheet('Tommy Eves')
    expect(pressedMode()).toEqual(['Normal'])
  })

  it('applies an armed skill\'s bonus to the next roll only, then disarms it', async () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')
    expect(shownChips()).toEqual(['Boatwork +10', 'Swimming +10', 'Diving +15'])
    expect(skillChip('Diving').className).toBe('skill-chip expert')
    expect(screen.getByText('Tap a skill, then roll a Stat or Save').className).toBe('skill-strip-hint')

    fireEvent.click(skillChip('Diving'))
    expect(skillChip('Diving').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('+15 Diving applies to your next roll').className).toBe('skill-strip-hint armed')
    expect(rollButton('Intellect').getAttribute('aria-label')).toBe('Roll Intellect at or under 58')
    expect(valuesOf('Intellect')).toEqual(['58', '+15 skill'])
    expect(circleOf('Intellect').className).toBe('roll-circle has-value skill-armed')
    seedRolls(50)
    roll('Intellect')

    expect(skillChip('Diving').getAttribute('aria-pressed')).toBe('false')
    expect(valuesOf('Intellect')).toEqual(['50/58', '+15 Diving'])
    expect(valuesOf('Speed')).toEqual(['56', '51 +5 class'])
    expect(shownStatus()).toBe('Intellect + Diving: 50 vs 58 - success.')
    roll('Intellect')
    expect(rollButton('Intellect').getAttribute('aria-label')).toBe('Roll Intellect at or under 43')
    await flushSave()
    expect(writtenLastRoll()).toMatchObject({ target: 58, skill: 'Diving', outcome: 'success', stressAdded: 0 })

    seedRolls(50)
    roll('Intellect')
    expect(shownStatus()).toBe('Intellect: 50 vs 43 - failure, +1 Stress.')
  })

  it('keeps the strip under the Saves to arming skills, leaving the Skills tab to open the tree', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    const sheet = openSheet('Tommy Eves')
    const strip = within(sheet).getByRole('region', { name: 'Skills' })
    expect(strip.previousElementSibling?.getAttribute('aria-labelledby')).toBe('lubec-saves-title')
    expect(strip.querySelector('.dice-formula')?.textContent).toBe('Add to a roll')
    expect([...strip.querySelectorAll('.skill-strip-footer > *')].map((child) => child.className)).toEqual(['lubec-advantage', 'skill-strip-hint'])
    expect(within(sheet).queryByText('Show skill tree')).toBeNull()

    fireEvent.click(within(within(sheet).getByRole('navigation', { name: 'Character sheet pages' })).getByRole('button', { name: 'Skills' }))

    expect(within(sheet).queryByRole('region', { name: 'Stats' })).toBeNull()
    expect(within(sheet).getByRole('region', { name: 'Skill tree' })).toBeTruthy()
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

  it('leaves Scrapping, Boxing, Firearms and Slingshot / Archery off the strip', async () => {
    const fighter = { free: 'Scrapping', picked: ['Boxing', 'Firearms', 'Slingshot / Archery', 'Athletics'] }
    seed({ tommy: withSheet({ class: { key: 'tough', choices: {} }, skills: fighter }) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    expect(shownChips()).toEqual(['Athletics +10'])
    expect(rollButton('Handle').getAttribute('aria-label')).toBe('Roll Handle at or under 50')
    seedRolls(40)
    roll('Handle')

    expect(shownStatus()).toBe('Handle: 40 vs 50 - success.')
    await flushSave()
    expect(writtenLastRoll()).toMatchObject({ target: 50, skill: null })
  })

  it('adds 2 Stress for an Overachiever\'s failed Stat Check and 1 for a failed Save', async () => {
    seed({ tommy: withSheet({ class: { key: 'scout', choices: { statBonus: 'Handle' } } }) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    seedRolls(90)
    roll('Charm')
    expect(shownStatus()).toMatch(/^Charm: 90 vs \d+ - failure, \+2 Stress\.$/)
    expect(shownCounters().stress).toBe('4')
    await flushSave()
    expect(writtenLastRoll()).toMatchObject({ kind: 'stat-check', stressAdded: 2 })

    seedRolls(90)
    roll('Sanity')
    expect(shownStatus()).toMatch(/^Sanity: 90 vs \d+ - failure, \+1 Stress\.$/)
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

    expect(shownStatus()).toBe('')
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

    expect(shownCounters().stress).toBe('3')
    expect(circleOf('Strength').className).toBe('roll-circle has-value check-failure check-double')
    expect(circleOf('Strength').getAttribute('aria-label')).toBe('Strength rolled 33 against 29. Critical failure. Click to clear.')
    expect(shownStatus()).toBe('Strength: 33 vs 29 - critical failure, +1 Stress.')
  })

  it('spins the circle before it shows the result, where motion is allowed, with every circle held until it lands', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }))
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    seedRolls(12)
    roll('Strength')

    expect(circleOf('Strength').className).toBe('roll-circle rolling')
    expect(circleOf('Strength').textContent).toMatch(/^\d+\/29$/)
    expect(ghostOf('Strength')).toBeNull()
    expect(shownStatus()).toBe('Rolling Strength check...')
    expect([...document.querySelectorAll('button.roll-circle')].every((circle) => (circle as HTMLButtonElement).disabled)).toBe(true)

    // Each preview's timer is set once the last one has shown, so the spin is let run a step at a time.
    for (let step = 0; step < 11; step += 1) act(() => vi.advanceTimersByTime(500))
    expect(circleOf('Strength').className).toBe('roll-circle rolling')
    act(() => vi.advanceTimersByTime(500))

    expect(valuesOf('Strength')).toEqual(['12/29', '24 +5 class'])
    expect(circleOf('Strength').className).toBe('roll-circle has-value check-success')
    expect(shownStatus()).toBe('Strength: 12 vs 29 - success.')
    expect(circleOf('Speed').disabled).toBe(false)
  })

  it('adds a failed check\'s Stress only as its number lands, with the Stress buttons shut while it spins', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }))
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    seedRolls(30)
    roll('Strength')

    // Each preview's timer is set once the last one has shown, so the spin is let run a step at a time.
    for (let step = 0; step < 12; step += 1) {
      expect(circleOf('Strength').className).toBe('roll-circle rolling')
      expect(shownCounters().stress).toBe('2')
      expect((screen.getByRole('button', { name: 'Raise Stress' }) as HTMLButtonElement).disabled).toBe(true)
      act(() => vi.advanceTimersByTime(500))
    }

    expect(valuesOf('Strength')).toEqual(['30/29', '24 +5 class'])
    expect(shownCounters().stress).toBe('3')
    expect((screen.getByRole('button', { name: 'Raise Stress' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('spins a ghost for the second die under Disadvantage, shows "done" once both settle, then merges it into the kept die', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }))
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')
    fireEvent.click(rollerButton('Disadvantage'))

    seedRolls(23, 71)
    roll('Speed')

    // Each frame's timer is set once the last one has shown, so the spin is let run a frame at a time.
    for (let step = 0; step < 12; step += 1) {
      expect(pressedMode()).toEqual(['Disadvantage'])
      expect((rollerButton('Normal') as HTMLButtonElement).disabled).toBe(true)
      expect(circleNumberOf('Speed')).toMatch(/^\d+\/56$/)
      expect(ghostOf('Speed')?.textContent).toMatch(/^\d+\/56$/)
      expect(ghostOf('Speed')?.getAttribute('aria-hidden')).toBe('true')
      expect(doneOf('Speed')).toBeNull()
      act(() => vi.advanceTimersByTime(500))
    }

    expect(circleOf('Speed').className).toBe('roll-circle rolling')
    expect([circleNumberOf('Speed'), ghostOf('Speed')?.textContent, doneOf('Speed')?.textContent]).toEqual(['23/56', '71/56', 'done'])
    expect(shownStatus()).toBe('Rolling Speed check... done')
    expect(shownCounters().stress).toBe('2')
    act(() => vi.advanceTimersByTime(500))

    expect(circleNumberOf('Speed')).toBe('71/56')
    expect(ghostOf('Speed')?.className).toBe('roll-circle rolling lubec-roll-ghost merging')
    expect(doneOf('Speed')).toBeNull()
    expect(shownCounters().stress).toBe('2')
    expect(pressedMode()).toEqual(['Disadvantage'])
    act(() => vi.advanceTimersByTime(500))

    expect(pressedMode()).toEqual(['Normal'])
    expect((rollerButton('Normal') as HTMLButtonElement).disabled).toBe(false)
    expect(circleOf('Speed').className).toBe('roll-circle has-value check-failure')
    expect(ghostOf('Speed')).toBeNull()
    expect(valuesOf('Speed')).toEqual(['71/56', '51 +5 class'])
    expect(shownStatus()).toBe('Speed (Disadvantage, 23 and 71): 71 vs 56 - failure, +1 Stress.')
    expect(shownCounters().stress).toBe('3')
  })

  it('marks a double that succeeds a critical success', () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    seedRolls(22)
    roll('Strength')

    expect(shownStatus()).toBe('Strength: 22 vs 29 - critical success.')
    expect(circleOf('Strength').className).toBe('roll-circle has-value check-success check-double')
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

    expect(shownStatus()).toBe('Fear (Advantage, 12 and 44): 12 vs 34 - success.')
    expect(screen.queryByLabelText('Arm a skill')).toBeNull()
    expect([...document.querySelectorAll('button.roll-circle')].map((circle) => (circle as HTMLButtonElement).disabled)).toEqual(Array(10).fill(true))
    expect(valuesOf('Fear')).toEqual(['12/34', '24 +10 class'])
    expect(circleOf('Fear').className).toBe('roll-circle has-value check-success')
    await flushSave()
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('shows a stored last roll it cannot read as no roll yet, and keeps it until the next roll', async () => {
    seed({ tommy: withSheet({ lastRoll: { kind: 'stat', roll: 31 } }) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    expect(shownStatus()).toBe('')
    press('Raise Trauma')
    await flushSave()
    expect(writtenLastRoll()).toEqual({ kind: 'stat', roll: 31 })
  })
})

describe('Lubec Panic Check and Recovery Save', () => {
  /** The status line under the circles, which says how the last roll of any kind came out. */
  const shownStatus = () => document.querySelector('.abilities .status')?.textContent

  const writtenSheet = (id = 'tommy') => parseLubecCharacter(id, database[id]).lubec

  /** The next roll lands on this face of a die with this many sides. */
  const seedFace = (sides: number, face: number) => seedRolls((face * 100) / sides)

  const panicButton = () => screen.getByLabelText(/^Panic Check over Stress/, { selector: 'button' }) as HTMLButtonElement

  /** The Panic Check's circle, whatever it shows. */
  const panicCircle = () => circleOf('Panic Check')

  const recoveryButton = () => screen.getByLabelText(/^Recovery Save/, { selector: 'button' }) as HTMLButtonElement

  const panicResult = () => screen.queryByLabelText('Panic result')

  /** A failed Panic Check's row as the sheet shows it: the row, its text, each change and "Add effect". */
  const shownPanicResult = () => [...(panicResult()?.querySelectorAll('p, li, .lubec-panic-add') ?? [])].map((part) => part.textContent)

  const addPanicEffect = () => fireEvent.click(within(panicResult() as HTMLElement).getByText('Add effect', { selector: 'button' }))

  const dismissButton = () => within(panicResult() as HTMLElement).getByRole('button', { name: 'Dismiss panic result' })

  const effectsRegion = () => screen.getByLabelText('Active effects')

  const effectLines = () => [...effectsRegion().querySelectorAll('.lubec-effect-line')].map((line) =>
    [...line.children].map((part) => part.textContent))

  const effectiveHandle = () => document.querySelector('.lubec-effective-handle')?.textContent

  async function flushSave() {
    act(() => vi.advanceTimersByTime(500))
    await flushMicrotasks()
  }

  const stressed = (stress: number, minimumStress = 2) => withSheet({ counters: { stress, minimumStress, trauma: 0 } })

  const modeButton = (text: string) => within(screen.getByLabelText('Advantage')).getByText(text, { selector: 'button' })

  const modePressed = (text: string) => modeButton(text).getAttribute('aria-pressed') === 'true'

  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('succeeds above current Stress, shows no table row and adds no Stress', async () => {
    seed({ tommy: tommyEves() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')
    expect(panicButton().textContent).toBe('2')

    seedFace(20, 3)
    fireEvent.click(panicButton())

    expect(shownStatus()).toBe('Panic Check: 3 vs Stress 2 - success.')
    expect(panicCircle().textContent).toBe('3/2')
    expect(panicCircle().className).toBe('roll-circle has-value check-success')
    expect(panicResult()).toBeNull()
    expect(shownCounters().stress).toBe('2')
    await flushSave()
    expect(writtenSheet().lastRoll).toEqual({
      kind: 'panic', target: 2, dice: [3], result: 3, advantage: 'normal', outcome: 'success', stressAdded: 0, effectRolls: null, dismissed: false,
    })
  })

  it('fails at or under the pre-roll Stress, picks its row from that d20, and adds no Stress by itself', async () => {
    seed({ tommy: stressed(5) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    seedFace(20, 5)
    fireEvent.click(panicButton())

    expect(shownStatus()).toBe('Panic Check: 5 vs Stress 5 - failure.')
    expect(shownPanicResult()).toEqual(['05 COWARD', 'Gain a new Condition: You must make a Fear Save to engage in violence, otherwise you flee.', 'Add effect'])
    expect(shownCounters().stress).toBe('5')
    await flushSave()
    expect(writtenSheet().counters.stress).toBe(5)

    press('Raise Stress')
    press('Raise Stress')
    expect(shownPanicResult()[0]).toBe('05 COWARD')
  })

  it('adds a Minimum Stress row as an effect, raises Minimum Stress once and clears the row, even after a reload', async () => {
    seed({ tommy: stressed(4) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')
    seedFace(20, 4)
    fireEvent.click(panicButton())
    expect(shownPanicResult().slice(2)).toEqual(['Increase Minimum Stress by 1', 'Add effect'])

    addPanicEffect()

    expect(panicResult()).toBeNull()
    expect(shownCounters()).toEqual({ stress: '4', minimumStress: '3', trauma: '0' })
    expect(effectLines()).toEqual([['OVERWHEMED', 'Disadvantage on all rolls for the next 1d10 minutes. Increase Minimum Stress by 1.']])
    expect(panicCircle().textContent).toBe('4/4')
    await flushSave()
    expect(writtenSheet().effects).toEqual([expect.objectContaining({ name: 'OVERWHEMED', cause: 'Panic Check (rolled 4)' })])
    expect(writtenSheet().counters.minimumStress).toBe(3)

    reload('player', 'player-1')
    openSheet('Tommy Eves')
    expect(panicResult()).toBeNull()
    expect(shownCounters()).toEqual({ stress: '4', minimumStress: '3', trauma: '0' })
    expect(effectLines()).toHaveLength(1)
  })

  it('dismisses a row with its X, changing nothing on the character, and keeps it gone after a reload', async () => {
    seed({ tommy: stressed(4) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')
    seedFace(20, 2)
    fireEvent.click(panicButton())
    expect(shownPanicResult()).toEqual(['02 NERVOUS', 'Gain 1 Stress.', 'Increase Stress by 1', 'Add effect'])

    dismissButton().focus()
    expect(document.activeElement).toBe(dismissButton())
    fireEvent.click(dismissButton())

    expect(panicResult()).toBeNull()
    expect(shownCounters()).toEqual({ stress: '4', minimumStress: '2', trauma: '0' })
    expect(within(effectsRegion()).queryAllByText('NERVOUS')).toEqual([])
    expect(panicCircle().textContent).toBe('2/4')
    await flushSave()
    expect(writtenSheet()).toMatchObject({ counters: { stress: 4, minimumStress: 2 }, effects: [], lastRoll: { result: 2, effectRolls: null, dismissed: true } })

    reload('player', 'player-1')
    openSheet('Tommy Eves')
    expect(panicResult()).toBeNull()
    expect(shownStatus()).toBe('Panic Check: 2 vs Stress 4 - failure.')
  })

  it('shows the next failed check\'s row after one was dismissed, though the sheet is saved by merging', async () => {
    seed({ tommy: stressed(6) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')
    seedFace(20, 2)
    fireEvent.click(panicButton())
    fireEvent.click(dismissButton())
    await flushSave()

    fireEvent.click(panicCircle())
    seedFace(20, 5)
    fireEvent.click(panicButton())
    expect(shownPanicResult()[0]).toBe('05 COWARD')
    await flushSave()
    expect(writtenSheet().lastRoll).toMatchObject({ result: 5, dismissed: false })

    reload('player', 'player-1')
    openSheet('Tommy Eves')
    expect(shownPanicResult()[0]).toBe('05 COWARD')
  })

  it('keeps a cleared Panic number cleared when its row is then added or dismissed', () => {
    seed({ tommy: stressed(6) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')
    seedFace(20, 2)
    fireEvent.click(panicButton())
    fireEvent.click(panicCircle())
    expect(panicCircle().textContent).toBe('6')

    addPanicEffect()
    expect(panicCircle().textContent).toBe('7')

    seedFace(20, 3)
    fireEvent.click(panicButton())
    fireEvent.click(panicCircle())
    fireEvent.click(dismissButton())
    expect(panicCircle().textContent).toBe('7')
  })

  it('rolls row 01\'s 1d5 from the dice when "Add effect" is pressed, shows it, and stops Stress at Minimum Stress', async () => {
    seed({ tommy: stressed(3) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')
    seedFace(20, 1)
    fireEvent.click(panicButton())
    expect(shownPanicResult()[2]).toBe('Reduce Stress by 1d5')

    seedFace(5, 4)
    addPanicEffect()

    expect(panicResult()).toBeNull()
    expect(shownCounters().stress).toBe('2')
    await flushSave()
    expect(writtenSheet().lastRoll).toMatchObject({ result: 1, effectRolls: [4] })
    expect(writtenSheet().counters).toEqual({ stress: 2, minimumStress: 2, trauma: 0 })
  })

  it('adds an ordinary effect that can be edited and removed like any other', async () => {
    seed({ tommy: stressed(8) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')
    seedFace(20, 7)
    fireEvent.click(panicButton())
    addPanicEffect()

    fireEvent.click(effectsRegion().querySelector('button.lubec-effect-line') as HTMLElement)
    fireEvent.change(within(effectsRegion()).getByLabelText('Name'), { target: { value: 'Bad dreams' } })
    fireEvent.click(within(effectsRegion()).getByText('Save', { selector: 'button' }))
    expect(effectLines()).toEqual([['Bad dreams', 'Gain a new Condition: Sleep is difficult; Rest Saves are at Disadvantage.']])
    await flushSave()
    expect(writtenSheet().effects).toEqual([expect.objectContaining({ name: 'Bad dreams', cause: 'Panic Check (rolled 7)' })])

    fireEvent.click(effectsRegion().querySelector('button.lubec-effect-line') as HTMLElement)
    fireEvent.click(within(effectsRegion()).getByText('Remove effect', { selector: 'button' }))
    expect(effectLines()).toEqual([])
    await flushSave()
    expect(writtenSheet().effects).toEqual([])
  })

  it('spins a d20 on the Panic circle before it lands, where motion is allowed, and clears it with a tap', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }))
    seed({ tommy: stressed(5) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    seedFace(20, 4)
    fireEvent.click(panicButton())

    expect(panicCircle().className).toBe('roll-circle rolling')
    expect(Number(panicCircle().textContent?.split('/')[0])).toBeLessThanOrEqual(20)
    expect(panicCircle().textContent).toMatch(/\/5$/)
    expect(shownStatus()).toBe('Rolling Panic Check...')
    expect([...document.querySelectorAll('button.roll-circle')].every((circle) => (circle as HTMLButtonElement).disabled)).toBe(true)
    for (let step = 0; step < 12; step += 1) act(() => vi.advanceTimersByTime(500))

    expect(panicCircle().textContent).toBe('4/5')
    expect(panicCircle().className).toBe('roll-circle has-value check-failure')
    expect(shownPanicResult()[0]).toBe('04 OVERWHEMED')

    fireEvent.click(panicCircle())
    expect(panicCircle().textContent).toBe('5')
    expect(shownStatus()).toBe('Panic Check cleared. Score unchanged.')
    expect(shownPanicResult()[0]).toBe('04 OVERWHEMED')
  })

  it('shows a failed Panic Check\'s row only as its number lands, holding the last row back while it spins', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }))
    seed({ tommy: stressed(5) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')
    seedFace(20, 4)
    fireEvent.click(panicButton())
    for (let step = 0; step < 12; step += 1) act(() => vi.advanceTimersByTime(500))
    expect(shownPanicResult()[0]).toBe('04 OVERWHEMED')
    fireEvent.click(panicCircle())

    seedFace(20, 5)
    fireEvent.click(panicButton())

    // Each preview's timer is set once the last one has shown, so the spin is let run a step at a time.
    for (let step = 0; step < 12; step += 1) {
      expect(panicCircle().className).toBe('roll-circle rolling')
      expect(panicResult()).toBeNull()
      act(() => vi.advanceTimersByTime(500))
    }

    expect(panicCircle().textContent).toBe('5/5')
    expect(panicCircle().className).toBe('roll-circle has-value check-failure')
    expect(shownPanicResult()[0]).toBe('05 COWARD')
  })

  it('holds Stress, and the Panic circle\'s Stress, at their values before a Recovery Save until its number lands', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }))
    seed({ tommy: stressed(9) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    seedRolls(23)
    fireEvent.click(recoveryButton())

    for (let step = 0; step < 12; step += 1) {
      expect(circleOf('Recovery Save').className).toBe('roll-circle rolling')
      expect(shownCounters().stress).toBe('9')
      expect(panicButton().textContent).toBe('9')
      expect((screen.getByRole('button', { name: 'Lower Stress' }) as HTMLButtonElement).disabled).toBe(true)
      act(() => vi.advanceTimersByTime(500))
    }

    expect(recoveryButton().textContent).toBe('23/30')
    expect(shownCounters().stress).toBe('6')
    expect(panicButton().textContent).toBe('6')
    expect((screen.getByRole('button', { name: 'Lower Stress' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('spins a ghost d20 under Advantage and shows a failed check\'s row only once the ghost has merged into the kept die', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }))
    seed({ tommy: stressed(5) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')
    fireEvent.click(within(screen.getByLabelText('Advantage')).getByText('Advantage', { selector: 'button' }))

    seedFace(20, 2)
    seedFace(20, 4)
    fireEvent.click(panicButton())

    for (let step = 0; step < 12; step += 1) {
      expect(ghostOf('Panic Check')?.textContent).toMatch(/^\d+\/5$/)
      act(() => vi.advanceTimersByTime(500))
    }
    expect([circleNumberOf('Panic Check'), ghostOf('Panic Check')?.textContent, doneOf('Panic Check')?.textContent]).toEqual(['2/5', '4/5', 'done'])
    expect(panicResult()).toBeNull()
    act(() => vi.advanceTimersByTime(500))
    expect(circleNumberOf('Panic Check')).toBe('4/5')
    expect(panicResult()).toBeNull()
    expect(modePressed('Advantage')).toBe(true)
    act(() => vi.advanceTimersByTime(500))

    expect(modePressed('Normal')).toBe(true)
    expect(panicCircle().className).toBe('roll-circle has-value check-failure')
    expect(panicCircle().textContent).toBe('4/5')
    expect(shownPanicResult()[0]).toBe('04 OVERWHEMED')
  })

  it('keeps the higher d20 under Advantage, then puts the switch back to Normal', () => {
    seed({ tommy: stressed(5) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')
    fireEvent.click(within(screen.getByLabelText('Advantage')).getByText('Advantage', { selector: 'button' }))

    seedFace(20, 2)
    seedFace(20, 9)
    fireEvent.click(panicButton())

    expect(shownStatus()).toBe('Panic Check (Advantage, 2 and 9): 9 vs Stress 5 - success.')
    expect(modePressed('Normal')).toBe(true)
  })

  it('puts the switch back to Normal after a Recovery Save rolled with Disadvantage', () => {
    seed({ tommy: stressed(9) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')
    fireEvent.click(modeButton('Disadvantage'))

    seedRolls(23, 12)
    fireEvent.click(recoveryButton())

    expect(shownStatus()).toBe('Recovery Save on Sanity (Disadvantage, 23 and 12): 23 vs 30 - success, -3 Stress.')
    expect(modePressed('Normal')).toBe(true)
  })

  it('leaves the mode set when a Panic row is added as an effect, which is not a roll it counts for', () => {
    seed({ tommy: stressed(4) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')
    seedFace(20, 4)
    fireEvent.click(panicButton())

    fireEvent.click(modeButton('Advantage'))
    addPanicEffect()

    expect(effectLines()).toEqual([['OVERWHEMED', 'Disadvantage on all rolls for the next 1d10 minutes. Increase Minimum Stress by 1.']])
    expect(modePressed('Advantage')).toBe(true)
  })

  it('lowers Stress on a Recovery success by the roll\'s ones digit, stopping at Minimum Stress', async () => {
    seed({ tommy: stressed(9) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')
    expect(recoveryButton().getAttribute('aria-label')).toBe('Recovery Save on Sanity at or under 30')

    seedRolls(23)
    fireEvent.click(recoveryButton())
    expect(shownStatus()).toBe('Recovery Save on Sanity: 23 vs 30 - success, -3 Stress.')
    expect(recoveryButton().textContent).toBe('23/30')
    expect(recoveryButton().className).toBe('roll-circle has-value check-success')
    expect(shownCounters().stress).toBe('6')

    fireEvent.click(recoveryButton())
    expect(shownStatus()).toBe('Recovery Save cleared. Score unchanged.')
    expect(recoveryButton().textContent).toBe('30')
    seedRolls(27)
    fireEvent.click(recoveryButton())
    expect(shownStatus()).toMatch(/ - success, -4 Stress\.$/)
    expect(shownCounters().stress).toBe('2')
    await flushSave()
    expect(writtenSheet().counters.stress).toBe(2)
    expect(writtenSheet().lastRoll).toMatchObject({ kind: 'recovery', against: 'Sanity', result: 27, stressRemoved: 4 })
  })

  it('adds 1 Stress for a failed Recovery Save', async () => {
    seed({ tommy: stressed(3) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    seedRolls(31)
    fireEvent.click(recoveryButton())

    expect(shownStatus()).toBe('Recovery Save on Sanity: 31 vs 30 - failure, +1 Stress.')
    expect(shownCounters().stress).toBe('4')
    await flushSave()
    expect(writtenSheet().counters.stress).toBe(4)
  })

  it('disables the Recovery Save while any Save is a hole, and still rolls the Panic Check', () => {
    seed({ tommy: withSheet({ base: { Strength: 24, Speed: 51, Intellect: 38, Handle: 50, Charm: 48, Sanity: 20, Fear: null, Body: 21 } }) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    expect(recoveryButton().disabled).toBe(true)
    expect(recoveryButton().getAttribute('aria-label')).toBe('Recovery Save: missing value')
    expect(recoveryButton().title).toBe('missing value')
    fireEvent.click(recoveryButton())
    expect(shownStatus()).toBe('')

    seedFace(20, 12)
    fireEvent.click(panicButton())
    expect(shownStatus()).toBe('Panic Check: 12 vs Stress 2 - success.')
  })

  it('shows both rolls as the last roll after a reload', async () => {
    seed({ tommy: stressed(6) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')
    seedFace(20, 2)
    fireEvent.click(panicButton())
    await flushSave()

    reload('player', 'player-1')
    openSheet('Tommy Eves')
    expect(shownStatus()).toBe('Panic Check: 2 vs Stress 6 - failure.')
    expect(shownPanicResult()).toEqual(['02 NERVOUS', 'Gain 1 Stress.', 'Increase Stress by 1', 'Add effect'])

    seedRolls(14)
    fireEvent.click(recoveryButton())
    await flushSave()
    reload('player', 'player-1')
    openSheet('Tommy Eves')
    expect(shownStatus()).toBe('Recovery Save on Sanity: 14 vs 30 - success, -4 Stress.')
    expect(panicResult()).toBeNull()
    expect(shownCounters().stress).toBe('2')
  })

  it('shows a player someone else\'s Panic roll and row, with the Panic and Recovery circles shut and no "Add effect"', () => {
    const lastRoll = { kind: 'panic', target: 6, dice: [2], result: 2, advantage: 'normal', outcome: 'failure', stressAdded: 0, effectRolls: null }
    seed({ tommy: withSheet({ lastRoll }) })
    mountTab('player', 'player-2')
    openSheet('Tommy Eves')

    expect(shownPanicResult()).toEqual(['02 NERVOUS', 'Gain 1 Stress.', 'Increase Stress by 1'])
    expect(screen.queryByLabelText('Dismiss panic result')).toBeNull()
    expect(panicCircle().textContent).toBe('2/6')
    expect(panicCircle().className).toBe('roll-circle has-value check-failure')
    expect([panicCircle().disabled, recoveryButton().disabled]).toEqual([true, true])
  })

  it('lowers the Fight panel\'s Effective Handle by both Handle effects, capped at 100 and floored at 0, and restores it when one is removed', async () => {
    const handleEffect = (id: string, amount: number) =>
      ({ id, name: `Hurt ${amount}`, cause: 'Fell', steps: [{ modifiers: [{ target: 'Handle', amount }], labels: [] }] })
    const hurt = [handleEffect('concussion', -40), handleEffect('bruise', -10)]
    const base = (Handle: number) => ({ ...((tommyEves().lubec as Fields).base as Fields), Handle })
    seed({
      tommy: withSheet({ effects: hurt }),
      ada: withSheet({ base: base(145), effects: hurt }, { name: 'Ada Mitchell' }),
      cal: withSheet({ base: base(20), effects: hurt }, { name: 'Cal Pike' }),
    })
    mountTab('player', 'player-1')

    openSheet('Tommy Eves')
    expect(effectLines()).toEqual([['Hurt -40', 'Handle -40'], ['Hurt -10', 'Handle -10']])
    expect(effectiveHandle()).toBe('5')
    fireEvent.click(effectsRegion().querySelector('button.lubec-effect-line') as HTMLElement)
    fireEvent.click(within(effectsRegion()).getByText('Remove effect', { selector: 'button' }))
    expect(effectiveHandle()).toBe('45')
    await flushSave()
    expect(writtenSheet().effects.map((effect) => effect.id)).toEqual(['bruise'])

    const backToRoster = () => fireEvent.click(screen.getByLabelText('Back to character list'))
    backToRoster()
    openSheet('Ada Mitchell')
    expect(effectiveHandle()).toBe('100')
    backToRoster()
    openSheet('Cal Pike')
    expect(effectiveHandle()).toBe('0')
  })
})

const tommyBase = (tommyEves().lubec as Fields).base as Fields

const finalizeButton = () => screen.queryByText('Finalize', { selector: '.lubec-draft-bar button' })

const correctSwitch = () => screen.queryByRole('switch', { name: 'Correct' })

const correcting = () => correctSwitch()?.getAttribute('aria-checked')

function openFinalize() {
  fireEvent.click(finalizeButton() as HTMLElement)
  return screen.getByRole('dialog', { name: /^Finalize/ })
}

/** The notices the Finalize dialog lists under one heading. */
const noticesIn = (dialog: HTMLElement, title: string) =>
  [...(dialog.querySelector(`section[aria-label="${title}"]`)?.querySelectorAll('li') ?? [])].map((item) => item.textContent)

async function finalize() {
  fireEvent.click(within(openFinalize()).getByText('Finalize', { selector: 'button' }))
  await settleSaves()
}

const inParty = (id: string) => isPartyCharacter(mapCharacterSummaryFromData(id, database[id]), GM)

describe('Finalize, locked values and the Correct switch', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('offers Finalize to the owner and the GM on a draft, to no other player, and never on a finalized character', () => {
    seed({ ada: directDraft(), bea: directDraft({ name: 'Bea Lowell', ownerUserId: 'player-2' }), tommy: tommyEves() })
    mountTab('player', 'player-1')

    openSheet('Ada Mitchell')
    expect(finalizeButton()).toBeTruthy()
    backToRoster()
    openSheet('Bea Lowell')
    expect(finalizeButton()).toBeNull()
    backToRoster()
    openSheet('Tommy Eves')
    expect(finalizeButton()).toBeNull()

    reload('gm', GM)
    openSheet('Bea Lowell')
    expect(finalizeButton()).toBeTruthy()
    backToRoster()
    openSheet('Tommy Eves')
    expect(finalizeButton()).toBeNull()
  })

  it('lists each rule warning, each hole by name and each import note, and finalizes with them showing', async () => {
    const importNotes = ['This file is version 2; Table Keep read the fields it knows.']
    seed({
      ada: withSheet(
        { class: { key: 'nerd', choices: {} }, base: { ...tommyBase, Speed: null }, importNotes },
        { name: 'Ada Mitchell', creationStatus: 'established_draft' },
      ),
    })
    mountTab('player', 'player-1')
    openSheet('Ada Mitchell')
    const warnings = lubecRuleWarnings(stored('ada').lubec).map(({ message }) => message)

    const dialog = openFinalize()

    expect(warnings).toContain('Speed has no whole-number base value.')
    expect(noticesIn(dialog, 'Rule warnings')).toEqual(warnings)
    expect(noticesIn(dialog, 'Missing values')).toEqual(['Stat taking -10', 'Speed'])
    expect(noticesIn(dialog, 'Import notes')).toEqual(importNotes)
    expect(inParty('ada')).toBe(false)

    fireEvent.click(within(dialog).getByText('Finalize', { selector: 'button' }))
    await settleSaves()

    expect(database.ada.creationStatus).toBe('active')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText(/In creation/)).toBeNull()
    expect(inParty('ada')).toBe(true)
  })

  it('says there is nothing to warn about for a clean draft, and writes nothing when Finalize is cancelled', async () => {
    seed({ tommy: tommyEves({ creationStatus: 'established_draft' }) })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')

    const dialog = openFinalize()
    expect(within(dialog).getByText('Nothing to warn about.')).toBeTruthy()
    expect(dialog.querySelectorAll('section')).toHaveLength(0)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await settleSaves()

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(finalizeButton()).toBeTruthy()
  })

  it('finalizes a character missing a base value and its class, keeping both as holes through a remount', async () => {
    seed({
      ada: withSheet(
        { class: { key: null, choices: {} }, base: { ...tommyBase, Handle: null } },
        { name: 'Ada Mitchell', creationStatus: 'established_draft' },
      ),
    })
    mountTab('player', 'player-1')
    openSheet('Ada Mitchell')

    await finalize()

    expect(database.ada).toMatchObject({ creationStatus: 'active', lubec: { class: { key: null }, base: { Handle: null } } })

    reload('player', 'player-1')
    openSheet('Ada Mitchell')

    expect(valuesOf('Handle')).toEqual(['missing', ''])
    expect(valuesOf('Strength')).toEqual(['missing', '24'])
    expect(screen.queryByLabelText('Handle base')).toBeNull()
    expect(finalizeButton()).toBeNull()
  })

  it('locks the owner out of base values, class, class choice and skills once finalized', async () => {
    seed({ ada: withSheet({ class: { key: 'nerd', choices: {} } }, { name: 'Ada Mitchell', creationStatus: 'established_draft' }) })
    mountTab('player', 'player-1')
    openSheet('Ada Mitchell')
    expect(baseInput('Strength')).toBeTruthy()
    fireEvent.click(screen.getByText('Skills', { selector: 'nav button' }))
    expect(changeClassButton()).toBeTruthy()
    fireEvent.click(screen.getByText('Core sheet', { selector: 'nav button' }))

    await finalize()

    expect(screen.queryByLabelText('Strength base')).toBeNull()
    expect(document.querySelector('.class-grid')).toBeNull()
    fireEvent.click(screen.getByText('Skills', { selector: 'nav button' }))
    expect(freeChips()).toEqual([])
    expect(choosableDots()).toEqual([])
    expect(changeClassButton()).toBeNull()
    expect(correctSwitch()).toBeNull()
  })

  it('gives the GM a Correct switch on a finalized character that unlocks every value, holes included, and is never stored', async () => {
    seed({ tommy: withSheet({ class: { key: null, choices: {} }, base: { ...tommyBase, Handle: null } }) })
    mountTab('gm', GM)
    openSheet('Tommy Eves')
    expect(correcting()).toBe('false')
    expect(screen.queryByLabelText('Handle base')).toBeNull()

    fireEvent.click(correctSwitch() as HTMLElement)
    await settleSaves()
    expect(correcting()).toBe('true')
    expect(mocks.setDoc).not.toHaveBeenCalled()

    typeBase('Handle', '50')
    typeBase('Strength', '30')
    chooseClass('Working Kid')
    fireEvent.click(screen.getByText('Skills', { selector: 'nav button' }))
    fireEvent.click(skillDot('Swimming'))
    await settleSaves()

    expect(stored('tommy')).toMatchObject({
      creationStatus: 'active',
      lubec: { class: { key: 'working' }, base: { Handle: 50, Strength: 30 }, skills: { picked: ['Diving'] } },
    })

    fireEvent.click(correctSwitch() as HTMLElement)
    expect(choosableDots()).toEqual([])

    reload('gm', GM)
    openSheet('Tommy Eves')
    expect(correcting()).toBe('false')
    expect(screen.queryByLabelText('Handle base')).toBeNull()
    expect(valuesOf('Handle')).toEqual(['55', '50 +5 class'])
  })

  it('never shows a player the Correct switch, and shows the GM none on a draft', () => {
    seed({ tommy: tommyEves(), ada: directDraft() })
    mountTab('player', 'player-1')
    openSheet('Tommy Eves')
    expect(correctSwitch()).toBeNull()

    reload('player', 'player-2')
    openSheet('Tommy Eves')
    expect(correctSwitch()).toBeNull()

    reload('gm', GM)
    openSheet('Ada Mitchell')
    expect(correctSwitch()).toBeNull()
  })
})

// A draft made through Guided roll-up, with whatever has been rolled so far.
const guidedDraft = (sheet: Fields = {}, fields: Fields = {}): Fields => ({
  ...tommyEves({ name: 'Gus Pike', creationMode: 'new', creationStatus: 'draft', ...fields }),
  lubec: {
    door: 'guided',
    class: { key: null, choices: { statPenalty: null, statBonus: null } },
    base: { Strength: null, Speed: null, Intellect: null, Handle: null, Charm: null, Sanity: null, Fear: null, Body: null },
    skills: { free: null, picked: [] },
    ...sheet,
  },
})

// Every value rolled: Stats 47, 33, 24, 52 and 41, so Intellect is the lowest and Handle the highest, and each Save 10 + 3 + 4.
const allRolledSheet = (): Fields => ({
  base: { Strength: 47, Speed: 33, Intellect: 24, Handle: 52, Charm: 41, Sanity: 17, Fear: 17, Body: 17 },
  rollUp: {
    stats: {
      Strength: { tens: 40, d10: 7 },
      Speed: { tens: 30, d10: 3 },
      Intellect: { tens: 20, d10: 4 },
      Handle: { tens: 50, d10: 2 },
      Charm: { tens: 40, d10: 1 },
    },
    saves: { Sanity: [3, 4], Fear: [3, 4], Body: [3, 4] },
  },
})

// Every value rolled and the scores kept, so the class cards are open.
const keptSheet = (): Fields => ({ ...allRolledSheet(), rollUp: { ...allRolledSheet().rollUp as Fields, kept: true } })

/** A number the seeded dice turn into `face` on a die of `sides`. */
const face = (value: number, sides: number) => ((value - 0.5) * 100) / sides + 0.5

const VALUE_NAMES = ['Strength', 'Speed', 'Intellect', 'Handle', 'Charm', 'Sanity', 'Fear', 'Body']

/** Each value as its circle and the dice note under it show it. */
const rolledValues = () => VALUE_NAMES.map((name) => [name, ...valuesOf(name)])

/** The circles that roll their value on a tap. */
const rollUpButtons = () => VALUE_NAMES.filter((name) => circleOf(name).textContent === 'Roll' && !circleOf(name).disabled)

const rollUp = (name: string) => fireEvent.click(circleOf(name))

const writtenSheet = () => (mocks.setDoc.mock.calls.at(-1)?.[1] as Fields).lubec as Fields

const trayButton = (text: string) => screen.queryByText(text, { selector: '.decision-tray button' })

const trayIcon = (label: string) => document.querySelector(`.decision-tray [aria-label="${label}"]`) as HTMLElement | null

/** The Stats a tap does something on, at the Swap's current step. */
const tappableStats = () => VALUE_NAMES.slice(0, 5).filter((name) => !circleOf(name).disabled)

const swapMark = (name: string) => [...circleOf(name).classList].find((entry) => entry.startsWith('swap-')) ?? null

function startGuided() {
  fireEvent.click(screen.getByRole('button', { name: 'New character' }))
  const dialog = screen.getByRole('dialog', { name: 'New character' })
  fireEvent.click(within(dialog).getByRole('button', { name: /Guided roll-up/ }))
}

describe('Guided roll-up', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stores a guided character as a new character\'s draft, owned by whoever starts it, with the door recorded', async () => {
    mountTab('player', 'player-1')

    startGuided()
    await flushMicrotasks()

    const [id] = Object.keys(database)
    expect(database[id]).toMatchObject({
      system: 'lubec',
      ownerUserId: 'player-1',
      creationMode: 'new',
      creationStatus: 'draft',
      lubec: { door: 'guided', counters: { stress: 2, minimumStress: 2, trauma: 0 }, base: { Strength: null, Body: null } },
    })
    expect(screen.getByText(/In creation · Guided roll-up/)).toBeTruthy()
    expect(rollUpButtons()).toHaveLength(8)
    expect(circleOf('Strength').getAttribute('aria-label')).toBe('Generate Strength')
    expect(statusLine()).toBe('Roll each Stat and Save to begin.')
    expect(document.querySelector('.class-section .section-kicker')?.textContent).toBe('Settle Stats and Saves first')
    expect(document.querySelector('.class-lock')?.textContent).toMatch(/unlock after all eight abilities are rolled/)
    expect(document.querySelector('.class-grid')).toBeNull()

    reload('gm', GM)
    startGuided()
    await flushMicrotasks()

    expect(Object.values(database).map(({ ownerUserId, creationStatus }) => [ownerUserId, creationStatus]))
      .toEqual([['player-1', 'draft'], [GM, 'draft']])
  })

  it('writes each Stat and Save die from its circle before the debounce comes due, shows the same numbers after a remount, and offers no re-roll', () => {
    seed({ gus: guidedDraft() })
    mountTab('player', 'player-1')
    openSheet('Gus Pike')

    seedRolls(face(2, 5), face(7, 10))
    rollUp('Strength')

    expect(mocks.setDoc).toHaveBeenCalledTimes(1)
    expect(writtenSheet()).toMatchObject({ base: { Strength: 47 }, rollUp: { stats: { Strength: { tens: 40, d10: 7 } } } })
    expect(valuesOf('Strength')).toEqual(['47', '40 + 7'])
    expect(circleOf('Strength').className).toBe('roll-circle has-value awaiting-class')
    expect(circleOf('Strength').disabled).toBe(true)
    expect(statusLine()).toBe('Strength generated at 47.')

    const rolls: [string, ...number[]][] = [
      ['Speed', face(3, 4), face(3, 10)],
      ['Intellect', face(3, 3), face(4, 10)],
      ['Handle', face(1, 2), face(2, 10)],
      ['Charm', face(1, 1), face(1, 10)],
      ['Sanity', face(3, 10), face(4, 10)],
      ['Fear', face(10, 10), face(1, 10)],
      ['Body', face(5, 10), face(6, 10)],
    ]
    rolls.forEach(([name, ...dice], index) => {
      seedRolls(...dice)
      rollUp(name)
      expect(mocks.setDoc).toHaveBeenCalledTimes(index + 2)
      expect((writtenSheet().base as Fields)[name]).toEqual(stored('gus').lubec.base[name as 'Strength'])
    })

    expect(stored('gus').lubec.base).toEqual({ Strength: 47, Speed: 33, Intellect: 24, Handle: 52, Charm: 41, Sanity: 17, Fear: 21, Body: 21 })
    expect(stored('gus').lubec.rollUp).toEqual({
      stats: {
        Strength: { tens: 40, d10: 7 },
        Speed: { tens: 30, d10: 3 },
        Intellect: { tens: 20, d10: 4 },
        Handle: { tens: 50, d10: 2 },
        Charm: { tens: 40, d10: 1 },
      },
      saves: { Sanity: [3, 4], Fear: [10, 1], Body: [5, 6] },
    })
    expect(statusLine()).toBe('Keep these scores or swap your lowest Stat.')
    const shown = rolledValues()
    expect(rollUpButtons()).toHaveLength(0)

    reload('player', 'player-1')
    openSheet('Gus Pike')

    expect(rolledValues()).toEqual(shown)
    expect(shown.slice(0, 1).concat(shown.slice(-1))).toEqual([['Strength', '47', '40 + 7'], ['Body', '21', '10 + 5 + 6']])
    expect(rollUpButtons()).toHaveLength(0)
    expect(screen.queryByText(/re-?roll/i, { selector: 'button' })).toBeNull()
  })

  it('spins each circle rolled where motion is allowed, leaving the values not rolled yet to roll while it spins', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }))
    seed({ gus: guidedDraft() })
    mountTab('player', 'player-1')
    openSheet('Gus Pike')

    seedRolls(face(2, 5), face(7, 10))
    rollUp('Strength')

    expect(mocks.setDoc).toHaveBeenCalledTimes(1)
    expect(circleOf('Strength').className).toBe('roll-circle rolling')
    expect(circleOf('Strength').getAttribute('aria-label')).toBe('Rolling Strength')
    expect(statusLine()).toBe('Rolling Strength...')
    expect(rollUpButtons()).toHaveLength(7)

    act(() => vi.advanceTimersByTime(500))
    seedRolls(face(3, 4), face(3, 10))
    rollUp('Speed')

    expect(mocks.setDoc).toHaveBeenCalledTimes(2)
    expect(stored('gus').lubec.base).toMatchObject({ Strength: 47, Speed: 33 })
    expect(circleOf('Speed').className).toBe('roll-circle rolling')
    expect(statusLine()).toBe('Rolling Strength, Speed...')
    expect(rollUpButtons()).toHaveLength(6)

    // Each preview's timer is set once the last one has shown, so the spin is let run a step at a time.
    for (let step = 1; step < 11; step += 1) act(() => vi.advanceTimersByTime(500))
    expect(circleOf('Strength').className).toBe('roll-circle rolling')
    act(() => vi.advanceTimersByTime(500))

    expect(valuesOf('Strength')).toEqual(['47', '40 + 7'])
    expect(circleOf('Strength').className).toBe('roll-circle has-value awaiting-class landed')
    expect(circleOf('Speed').className).toBe('roll-circle rolling')
    expect(statusLine()).toBe('Rolling Speed...')
    act(() => vi.advanceTimersByTime(500))

    expect(valuesOf('Speed')).toEqual(['33', '30 + 3'])
    expect(circleOf('Speed').className).toBe('roll-circle has-value awaiting-class landed')
    expect(circleOf('Strength').className).toBe('roll-circle has-value awaiting-class')
    expect(statusLine()).toBe('Speed generated at 33.')
    expect(rollUpButtons()).toHaveLength(6)

    act(() => vi.advanceTimersByTime(500))
    expect(circleOf('Speed').className).toBe('roll-circle has-value awaiting-class')
  })

  it('rolls every value left at once from the tray, in one write, each with its own dice, and spins them all together', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }))
    seed({ gus: guidedDraft({ base: { ...allRolledSheet().base as Fields }, rollUp: { stats: { Strength: { tens: 40, d10: 7 } } } }) })
    mountTab('player', 'player-1')
    openSheet('Gus Pike')
    expect(trayButton('Swap lowest stat')).toBeNull()

    seedRolls(
      face(3, 4), face(3, 10), face(3, 3), face(4, 10), face(1, 2), face(2, 10), face(1, 1), face(1, 10),
      face(3, 10), face(4, 10), face(10, 10), face(1, 10), face(5, 10), face(6, 10),
    )
    fireEvent.click(trayButton('Roll all remaining') as HTMLElement)

    expect(mocks.setDoc).toHaveBeenCalledTimes(1)
    expect(stored('gus').lubec.base).toEqual({ Strength: 47, Speed: 33, Intellect: 24, Handle: 52, Charm: 41, Sanity: 17, Fear: 21, Body: 21 })
    expect(stored('gus').lubec.rollUp).toMatchObject({ stats: { Strength: { tens: 40, d10: 7 }, Charm: { tens: 40, d10: 1 } }, saves: { Body: [5, 6] } })
    expect(VALUE_NAMES.map((name) => circleOf(name).className.includes('rolling'))).toEqual([false, true, true, true, true, true, true, true])
    expect(statusLine()).toBe('Rolling Speed, Intellect, Handle, Charm, Sanity, Fear, Body...')
    expect((trayButton('Roll all remaining') as HTMLButtonElement).disabled).toBe(true)
    expect(trayButton('Swap lowest stat')).toBeNull()

    for (let step = 0; step < 12; step += 1) act(() => vi.advanceTimersByTime(500))

    expect(rolledValues()).toEqual([
      ['Strength', '47', '40 + 7'],
      ['Speed', '33', '30 + 3'],
      ['Intellect', '24', '20 + 4'],
      ['Handle', '52', '50 + 2'],
      ['Charm', '41', '40 + 1'],
      ['Sanity', '17', '10 + 3 + 4'],
      ['Fear', '21', '10 + 10 + 1'],
      ['Body', '21', '10 + 5 + 6'],
    ])
    expect(statusLine()).toBe('Keep these scores or swap your lowest Stat.')
    expect(trayButton('Swap lowest stat')).toBeTruthy()
    expect(trayButton('Roll all remaining')).toBeNull()
  })

  it('offers rolling every value left only to whoever may roll, and only while values are left', () => {
    seed({ gus: guidedDraft({ ...allRolledSheet(), rollUp: { ...allRolledSheet().rollUp as Fields, saves: { Sanity: [3, 4] } } }) })
    mountTab('gm', GM)
    openSheet('Gus Pike')
    expect(trayButton('Roll all remaining')).toBeTruthy()

    reload('player', 'player-2')
    openSheet('Gus Pike')
    expect(document.querySelector('.decision-tray')).toBeNull()

    seed({ gus: guidedDraft(allRolledSheet()) })
    reload('player', 'player-1')
    openSheet('Gus Pike')
    expect(trayButton('Roll all remaining')).toBeNull()
  })

  it('never lets the owner or the GM type over a base value on a guided draft, rolled or not', () => {
    seed({ gus: guidedDraft({ base: { ...tommyBase, Charm: null }, rollUp: { stats: { Strength: { tens: 20, d10: 4 } } } }) })
    mountTab('player', 'player-1')
    openSheet('Gus Pike')

    expect(screen.queryByLabelText('Strength base')).toBeNull()
    expect(screen.queryByLabelText('Charm base')).toBeNull()
    expect(rollUpButtons()).not.toContain('Strength')
    expect(rollUpButtons()).toContain('Charm')

    reload('gm', GM)
    openSheet('Gus Pike')

    expect(screen.queryByLabelText('Strength base')).toBeNull()
    expect(screen.queryByLabelText('Charm base')).toBeNull()
    expect(rollUpButtons()).toContain('Charm')
  })

  it('shows the GM every roll on a player\'s draft, and another player the rolls with no way to make one', () => {
    seed({ gus: guidedDraft({ ...allRolledSheet(), rollUp: { ...allRolledSheet().rollUp as Fields, saves: { Sanity: [3, 4] } } }) })
    mountTab('gm', GM)
    openSheet('Gus Pike')

    expect(rolledValues()).toEqual([
      ['Strength', '47', '40 + 7'],
      ['Speed', '33', '30 + 3'],
      ['Intellect', '24', '20 + 4'],
      ['Handle', '52', '50 + 2'],
      ['Charm', '41', '40 + 1'],
      ['Sanity', '17', '10 + 3 + 4'],
      ['Fear', 'Roll', ''],
      ['Body', 'Roll', ''],
    ])
    expect(rollUpButtons()).toEqual(['Fear', 'Body'])

    reload('player', 'player-2')
    openSheet('Gus Pike')

    expect(rolledValues().slice(-3)).toEqual([['Sanity', '17', '10 + 3 + 4'], ['Fear', 'Roll', ''], ['Body', 'Roll', '']])
    expect(circleOf('Fear').getAttribute('aria-label')).toBe('Fear not rolled yet')
    expect(rollUpButtons()).toHaveLength(0)
  })

  it('makes the Swap on the circles once every value is rolled, from the lowest Stat to any but the highest, and writes it only when confirmed', () => {
    seed({ gus: guidedDraft(allRolledSheet()) })
    mountTab('player', 'player-1')
    openSheet('Gus Pike')
    expect(tappableStats()).toEqual([])

    fireEvent.click(trayButton('Swap lowest stat') as HTMLElement)

    expect(tappableStats()).toEqual(['Strength', 'Speed', 'Charm'])
    expect([swapMark('Intellect'), noteOf('Intellect')]).toEqual(['swap-source', 'Lowest'])
    expect([swapMark('Handle'), noteOf('Handle')]).toEqual(['swap-locked', 'Locked'])
    expect(swapMark('Speed')).toBe('swap-target')
    expect(circleOf('Speed').getAttribute('aria-label')).toBe('Swap Intellect 24 with Speed 33')
    expect(document.querySelector('.swap-hint')?.textContent).toBe('Tap a Stat to trade with your lowest')
    expect(statusLine()).toBe('Intellect is your lowest. Tap a Stat to trade places with it. Your best Stat is locked.')

    fireEvent.click(circleOf('Speed'))

    expect(valuesOf('Intellect')).toEqual(['33', 'Swapped'])
    expect(valuesOf('Speed')).toEqual(['24', 'Swapped'])
    expect(swapMark('Speed')).toBe('swap-moved')
    expect(statusLine()).toBe('Intellect is now 33; Speed is now 24. Confirm or undo.')
    expect(trayButton('Keep these scores')).toBeNull()

    fireEvent.click(trayIcon('Undo swap') as HTMLElement)
    expect(valuesOf('Speed')).toEqual(['33', '30 + 3'])
    fireEvent.click(circleOf('Strength'))
    expect(mocks.setDoc).not.toHaveBeenCalled()

    fireEvent.click(trayIcon('Confirm swap') as HTMLElement)

    expect(mocks.setDoc).toHaveBeenCalledTimes(1)
    expect(writtenSheet()).toMatchObject({
      base: { Intellect: 47, Strength: 24 },
      rollUp: { swap: { lowest: 'Intellect', other: 'Strength' }, stats: { Intellect: { tens: 20, d10: 4 } } },
    })

    reload('player', 'player-1')
    openSheet('Gus Pike')

    expect(statusLine()).toBe('Intellect and Strength swapped. Now choose a class.')
    expect(document.querySelector('.decision-tray')).toBeNull()
    expect([valuesOf('Intellect'), valuesOf('Strength')]).toEqual([['47', 'Swapped'], ['24', 'Swapped']])
    expect(screen.queryByLabelText('Intellect base')).toBeNull()
    expect(document.querySelector('.class-section .section-kicker')?.textContent).toBe('Choose the kid after seeing the rolls')
    expect(classCard('Nerd')).toBeTruthy()
  })

  it('lets a tie for lowest pick which Stat moves, and Cancel puts the scores back as they were', () => {
    seed({ gus: guidedDraft({ ...allRolledSheet(), base: { ...allRolledSheet().base as Fields, Speed: 24 } }) })
    mountTab('player', 'player-1')
    openSheet('Gus Pike')

    fireEvent.click(trayButton('Swap lowest stat') as HTMLElement)
    expect(statusLine()).toBe('Two Stats tie for lowest. Tap the one you want to move.')
    expect(tappableStats()).toEqual(['Speed', 'Intellect'])
    expect(noteOf('Speed')).toBe('Pick one')

    fireEvent.click(circleOf('Speed'))

    expect(tappableStats()).toEqual(['Strength', 'Charm'])

    fireEvent.click(trayButton('Cancel') as HTMLElement)

    expect(tappableStats()).toEqual([])
    expect(statusLine()).toBe('Keep these scores or swap your lowest Stat.')
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('offers no Swap while a value is still to roll, and keeping the scores closes it and opens the class cards', async () => {
    seed({ gus: guidedDraft({ ...allRolledSheet(), rollUp: { ...allRolledSheet().rollUp as Fields, saves: {} } }) })
    mountTab('player', 'player-1')
    openSheet('Gus Pike')
    expect(trayButton('Swap lowest stat')).toBeNull()
    expect(trayButton('Keep these scores')).toBeNull()

    seed({ gus: guidedDraft(allRolledSheet()) })
    reload('player', 'player-1')
    openSheet('Gus Pike')
    expect(document.querySelector('.class-lock')).toBeTruthy()
    fireEvent.click(trayButton('Keep these scores') as HTMLElement)
    await settleSaves()

    expect(stored('gus').lubec.rollUp).toMatchObject({ kept: true })
    reload('player', 'player-1')
    openSheet('Gus Pike')
    expect(statusLine()).toBe('Scores settled. Now choose a class.')
    expect(document.querySelector('.decision-tray')).toBeNull()
    expect(document.querySelector('.class-lock')).toBeNull()
    expect(circleOf('Strength').className).toBe('roll-circle has-value awaiting-class')
  })

  it('takes more skills than the class package without a warning, a block or a GM\'s say-so', () => {
    const working = { class: { key: 'working', choices: { statPenalty: null, statBonus: null } } }
    seed({ gus: guidedDraft({ ...keptSheet(), ...working, skills: { free: 'Boatwork', picked: ['Swimming', 'Diving'] } }) })
    mountTab('player', 'player-1')
    openSkillsPage('Gus Pike')
    expect(packageProgress()).toBe('Package complete')

    fireEvent.click(skillDot('Driving'))
    fireEvent.click(skillDot('Art'))
    fireEvent.click(skillDot('Forgery'))
    sendSaves()

    expect(storedSkills('gus')).toEqual({ free: 'Boatwork', picked: ['Swimming', 'Diving', 'Driving', 'Art', 'Forgery'] })
    expect(treeMarks()).toEqual([['Swimming', 'on'], ['Diving', 'on'], ['Boatwork', 'fixed'], ['Driving', 'on'], ['Art', 'on'], ['Forgery', 'on']])
    expect(packagePanel()).toEqual({
      rules: [[true, 'Free class skill:'], [true, 'Bonus:']],
      count: 'Picks made3 Expert + 2 Trainedof 1 Expert + 1 Trained',
    })
    expect(packageProgress()).toBe('Package complete')
    expect(noticesIn(openFinalize(), 'Rule warnings')).toEqual([])
  })

  it('records the class chosen from its card with the card\'s choice, shows its class record, and lets Change class bring the cards back', async () => {
    seed({ gus: guidedDraft(keptSheet()) })
    mountTab('player', 'player-1')
    openSheet('Gus Pike')

    expect(cardBars('Nerd')).toEqual([
      '+20 Intellect',
      '-10 one other Stat',
      '+30 Sanity',
      'Free skill: Electronics & Radio, Science or History & Geography + 1 Trained and 2 Expert, each Expert with a Trained prerequisite',
    ])

    chooseOnCard('Nerd', 'Charm')
    chooseClass('Nerd')
    await settleSaves()

    expect(stored('gus').lubec.class).toMatchObject({ key: 'nerd', choices: { statPenalty: 'Charm' } })
    expect(valuesOf('Charm')).toEqual(['31', '41 -10 class'])
    expect(document.querySelector('.class-grid')).toBeNull()
    expect(document.querySelector('.class-section .section-bar h3')?.textContent).toBe('Nerd')
    expect(document.querySelector('.trauma-response strong')?.textContent).toBe('Failed Sanity Spreads Stress')

    changeClass()

    expect(classCard('Tough')).toBeTruthy()
    chooseClass('Tough')
    await settleSaves()

    expect(stored('gus').lubec.class).toMatchObject({ key: 'tough', choices: { statPenalty: null } })
    expect(valuesOf('Strength')).toEqual(['57', '47 +10 class'])
  })

  it('takes the Nerd package on the Skills page, then finalizes clean and gives the GM the Correct switch', async () => {
    seed({ gus: guidedDraft({ ...keptSheet(), class: { key: 'nerd', choices: { statPenalty: 'Charm' } } }) })
    mountTab('player', 'player-1')
    openSkillsPage('Gus Pike')

    fireEvent.click(freeChip('Science'))
    fireEvent.click(skillDot('Art'))
    fireEvent.click(skillDot('Science Fair Champ'))
    fireEvent.click(skillDot('Forgery'))
    await settleSaves()

    expect(storedSkills('gus')).toEqual({ free: 'Science', picked: ['Art', 'Science Fair Champ', 'Forgery'] })
    const dialog = openFinalize()
    expect(within(dialog).getByText('Nothing to warn about.')).toBeTruthy()
    fireEvent.click(within(dialog).getByText('Finalize', { selector: 'button' }))
    await settleSaves()

    expect(database.gus).toMatchObject({ creationMode: 'new', creationStatus: 'active' })

    reload('gm', GM)
    openSheet('Gus Pike')
    expect(document.querySelector('.decision-tray, .class-grid, .class-lock')).toBeNull()
    expect(screen.queryByLabelText('Strength base')).toBeNull()

    fireEvent.click(correctSwitch() as HTMLElement)
    typeBase('Strength', '50')
    await settleSaves()

    expect(stored('gus').lubec.base.Strength).toBe(50)
  })

  it('lists an unfinished roll-up as still incomplete in the Finalize dialog, and finalizes it anyway', async () => {
    const rolled = allRolledSheet()
    seed({ gus: guidedDraft({ ...rolled, rollUp: { ...rolled.rollUp as Fields, saves: { Sanity: [3, 4] } } }) })
    mountTab('player', 'player-1')
    openSheet('Gus Pike')

    const dialog = openFinalize()
    expect(noticesIn(dialog, 'Still incomplete')).toEqual(['Not rolled yet: Fear, Body.'])
    expect(noticesIn(dialog, 'Rule warnings')).toContain('No class is chosen.')

    fireEvent.click(within(dialog).getByText('Finalize', { selector: 'button' }))
    await settleSaves()

    expect(database.gus.creationStatus).toBe('active')
    expect(document.querySelector('.class-lock')).toBeNull()
  })

  it('rolls again only on a new draft once the old one is deleted', async () => {
    seed({ gus: guidedDraft(allRolledSheet()) })
    mountTab('player', 'player-1')
    openSheet('Gus Pike')
    expect(rollUpButtons()).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await flushMicrotasks()
    expect(database.gus).toBeUndefined()

    startGuided()
    await flushMicrotasks()

    expect(rollUpButtons()).toHaveLength(8)
  })
})

// The standalone sheet's file for Tommy Eves, with any fields replaced, as text.
const characterFileText = (fields: Fields = {}) => JSON.stringify({ ...tommyEvesFile, ...fields }, null, 2)

const SMOKE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='

function openImportDoor() {
  fireEvent.click(screen.getByRole('button', { name: 'New character' }))
  const dialog = screen.getByRole('dialog', { name: 'New character' })
  fireEvent.click(within(dialog).getByRole('button', { name: /Import a file/ }))
  return dialog
}

/** Lets an import read its input, create its character and upload any portrait. */
async function settleImport() {
  for (let round = 0; round < 5; round += 1) await flushMicrotasks()
}

async function chooseCharacterFile(text: string) {
  const dialog = openImportDoor()
  const file = new File([text], 'lubec-Tommy-Eves.json', { type: 'application/json' })
  fireEvent.change(within(dialog).getByLabelText('Character file'), { target: { files: [file] } })
  await settleImport()
  return dialog
}

async function pasteCharacterCode(text: string) {
  const dialog = openImportDoor()
  fireEvent.change(within(dialog).getByLabelText('Character code'), { target: { value: text } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Import code' }))
  await settleImport()
  return dialog
}

/** The one character the import wrote, by id. */
function importedId() {
  const ids = Object.keys(database)
  expect(ids).toHaveLength(1)
  return ids[0]
}

describe('Import a character file', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('imports the Tommy Eves file as the importer\'s Working Kid draft, with the right finals, no portrait and no warnings', async () => {
    mountTab('player', 'player-1')

    await chooseCharacterFile(characterFileText())

    const id = importedId()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(database[id]).toMatchObject({
      system: 'lubec',
      name: 'Tommy',
      ownerUserId: 'player-1',
      ownerUsername: 'viewer1',
      creationMode: 'established',
      creationStatus: 'established_draft',
      portraitPath: '',
      lubec: {
        door: 'import',
        class: { key: 'working' },
        base: { Strength: 24, Speed: 51, Intellect: 38, Handle: 50, Charm: 48, Sanity: 20, Fear: 24, Body: 21 },
        skills: { free: 'Boatwork', picked: ['Swimming', 'Diving'] },
        counters: { stress: 2, minimumStress: 2, trauma: 0 },
        effects: [],
        importNotes: [],
      },
    })
    expect(mocks.uploadEntityImage).not.toHaveBeenCalled()
    const sheet = screen.getByRole('article', { name: 'Tommy character sheet' })
    expect(within(sheet).getByText(/In creation · Imported/)).toBeTruthy()
    expect(within(sheet).getByRole('img', { name: 'No photo yet' })).toBeTruthy()
    expect(valuesOf('Strength')).toEqual(['24', '+5 class = 29'])
    expect(valuesOf('Handle')).toEqual(['50', '+5 class = 55'])
    expect(valuesOf('Sanity')).toEqual(['20', '+10 class = 30'])
    expect(counterValue('Stress')).toBe('2')
    expect(within(openFinalize()).getByText('Nothing to warn about.')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('dialog', { name: /^Finalize/ })).getByRole('button', { name: 'Cancel' }))
    fireEvent.click(within(within(sheet).getByRole('navigation', { name: 'Character sheet pages' })).getByRole('button', { name: 'Skills' }))
    expect(treeMarks()).toEqual([['Swimming', 'on'], ['Diving', 'on'], ['Boatwork', 'fixed']])
  })

  it('refuses input that is not JSON, not an object, or of another format, with a plain message, and writes nothing', async () => {
    mountTab('player', 'player-1')
    const dialog = await pasteCharacterCode('{ "format": "lubec-character", ')

    expect(within(dialog).getByRole('alert').textContent).toBe('That is not a Lubec character file: it is not readable JSON.')

    fireEvent.change(within(dialog).getByLabelText('Character code'), { target: { value: '["lubec-character"]' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Import code' }))
    expect(within(dialog).getByRole('alert').textContent).toBe('That is not a Lubec character file: it is not a JSON object.')

    fireEvent.change(within(dialog).getByLabelText('Character file'), {
      target: { files: [new File([characterFileText({ format: 'vtm-character' })], 'vampire.json', { type: 'application/json' })] },
    })
    await settleImport()
    expect(within(dialog).getByRole('alert').textContent).toBe('That is not a Lubec character file: its format is not "lubec-character".')

    await settleSaves()
    expect(screen.getByRole('dialog', { name: 'New character' })).toBeTruthy()
    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(database).toEqual({})

    fireEvent.click(within(dialog).getByRole('button', { name: 'Back' }))
    expect(within(dialog).getByRole('button', { name: /Import a file/ })).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('says so when a chosen file cannot be read, and writes nothing', async () => {
    mountTab('player', 'player-1')
    const dialog = openImportDoor()
    const unreadable = { name: 'locked.json', text: () => Promise.reject(new Error('NotReadableError')) }

    fireEvent.change(within(dialog).getByLabelText('Character file'), { target: { files: [unreadable] } })
    await settleImport()

    expect(within(dialog).getByRole('alert').textContent).toBe('That file could not be read.')
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('imports a version 2 file with its known fields read and the unfamiliar version noted in the Finalize dialog, also after a remount', async () => {
    const note = 'This file is version 2; Table Keep read the fields it knows.'
    mountTab('player', 'player-1')

    await chooseCharacterFile(characterFileText({ version: 2, futureField: { anything: true } }))

    const id = importedId()
    expect(database[id]).toMatchObject({ lubec: { class: { key: 'working' }, base: { Speed: 51 }, importNotes: [note] } })
    expect(JSON.stringify(database[id])).not.toContain('futureField')
    expect(noticesIn(openFinalize(), 'Import notes')).toEqual([note])

    reload('player', 'player-1')
    openSheet('Tommy')

    expect(valuesOf('Speed')).toEqual(['51', '+5 class = 56'])
    expect(noticesIn(openFinalize(), 'Import notes')).toEqual([note])
  })

  it('lands a file with rule breaks in creation, with each warning in the Finalize dialog', async () => {
    mountTab('player', 'player-1')

    await chooseCharacterFile(characterFileText({
      stats: { ...tommyEvesFile.stats, Strength: { base: 95 } },
      skills: { free: { name: 'Science' }, picked: [{ name: 'Diving' }, { name: 'Diving' }, { name: 'Juggling' }] },
    }))

    const id = importedId()
    const warnings = lubecRuleWarnings(stored(id).lubec)
    expect(database[id].creationStatus).toBe('established_draft')
    expect(warnings.map(({ code }) => code)).toEqual(['base-range', 'free-skill', 'package', 'unknown-skill', 'repeated-skill', 'prerequisite'])
    expect(noticesIn(openFinalize(), 'Rule warnings')).toEqual(warnings.map(({ message }) => message))
  })

  it('lands a file missing a base value and the class with both as null, listed as missing in the Finalize dialog', async () => {
    const { Handle: _handle, ...stats } = tommyEvesFile.stats
    mountTab('player', 'player-1')

    await chooseCharacterFile(characterFileText({ class: { name: 'Working Kid', choices: {} }, stats }))

    const id = importedId()
    expect((database[id].lubec as Fields).class).toEqual({ key: null, choices: { statPenalty: null, statBonus: null } })
    expect(((database[id].lubec as Fields).base as Fields).Handle).toBeNull()
    expect(valuesOf('Handle')).toEqual(['', ''])
    expect(noticesIn(openFinalize(), 'Missing values')).toEqual(['Class', 'Handle'])
  })

  it('imports pasted text the same as a chosen file', async () => {
    mountTab('gm', GM)

    await pasteCharacterCode(characterFileText())

    const id = importedId()
    expect(database[id]).toMatchObject({
      name: 'Tommy',
      ownerUserId: GM,
      creationStatus: 'established_draft',
      lubec: { door: 'import', class: { key: 'working' }, skills: { free: 'Boatwork', picked: ['Swimming', 'Diving'] } },
    })
    expect(valuesOf('Charm')).toEqual(['48', '+5 class = 53'])
  })

  it('hands a pasted portrait to the media upload as the owner, and stores only the path it returns', async () => {
    mountTab('player', 'player-1')

    await pasteCharacterCode(characterFileText({ portrait: `data:image/png;base64,${SMOKE_PNG_BASE64}` }))
    await settleSaves()

    const id = importedId()
    expect(mocks.uploadEntityImage).toHaveBeenCalledTimes(1)
    const [upload] = mocks.uploadEntityImage.mock.calls[0] as [{ file: File }]
    expect(upload).toMatchObject({ collectionName: 'characters', entityId: id, mediaKind: 'portraits', uploadAuthority: 'owner' })
    expect(upload.file.type).toBe('image/png')
    expect(upload.file.size).toBe(Buffer.from(SMOKE_PNG_BASE64, 'base64').length)
    expect(database[id].portraitPath).toBe('uploaded/portrait.png')
    expect(database[id]).not.toHaveProperty('portraitUrl')
    expect(JSON.stringify(database[id])).not.toContain('data:image')
    expect(bandPortrait('Tommy').getByRole('img', { name: 'Tommy portrait' }).getAttribute('src')).toBe('https://media.test/uploaded/portrait.png')
  })

  it('brings a character with an unreadable portrait in without one, noting it in the Finalize dialog', async () => {
    mountTab('player', 'player-1')

    await pasteCharacterCode(characterFileText({ portrait: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }))

    const id = importedId()
    expect(mocks.uploadEntityImage).not.toHaveBeenCalled()
    expect(database[id].portraitPath).toBe('')
    expect(noticesIn(openFinalize(), 'Import notes')).toEqual(['The file\'s portrait could not be read, so the character came in without one.'])
  })

  it('keeps the file\'s inventory, counters and derived values out of the written document', async () => {
    mountTab('player', 'player-1')

    await chooseCharacterFile(characterFileText({
      inventory: [{ name: 'Flashlight' }],
      counters: { stress: 7, minimumStress: 4, trauma: 3 },
      derived: { meleeStrengthImpact: 9, effectiveHandle: 99 },
    }))

    const id = importedId()
    const written = JSON.stringify(database[id])
    expect((database[id].lubec as Fields).counters).toEqual({ stress: 2, minimumStress: 2, trauma: 0 })
    expect(written).not.toContain('Flashlight')
    expect(written).not.toContain('inventory')
    expect(written).not.toContain('derived')
    expect(written).not.toContain('meleeStrengthImpact')
    expect(written).not.toContain('playerName')
    expect(written).not.toContain('defenseLines')
  })
})
