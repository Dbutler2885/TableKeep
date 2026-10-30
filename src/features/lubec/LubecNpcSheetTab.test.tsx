// @vitest-environment jsdom
/**
 * An NPC's character sheet, mounted as the shell mounts the NPCs tab of a
 * Lubec campaign, over the real NPC tab and the shared character store with
 * `firebase/firestore` and the media module stubbed. Stored documents reach it
 * through the stubbed snapshot listeners, by path, and every test asserts on
 * what the screen shows or on what the store writes. A reload is a remount fed
 * the documents as last written. Rolls draw from seeded dice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { User } from 'firebase/auth'
import type { Campaign, Role } from '../../types/app'
import type { LubecDice } from '../ruleSets/lubec/dice'
import tommyEvesFile from '../ruleSets/lubec/fixtures/tommy-eves.lubec-character.json'

// These cases mount the NPCs tab and the sheet in jsdom. Under coverage on a
// loaded machine they ran past Vitest's 5 second default and failed without
// any assertion failing, as the other Lubec tab suites' did.
vi.setConfig({ testTimeout: 30_000 })

type Fields = Record<string, unknown>
type Listener = { next: (snap: unknown) => void; fail?: (error: unknown) => void }

// These cases mount large component trees and run role queries over them in
// jsdom. Alone each takes about a second, but under coverage on a loaded
// machine the same cases ran past Vitest's 5 second default and failed without
// any assertion failing, as `LubecCharacterTab.test.tsx`'s did.
vi.setConfig({ testTimeout: 30_000 })

const mocks = vi.hoisted(() => ({
  listeners: {} as Record<string, { next: (snap: unknown) => void; fail?: (error: unknown) => void }>,
  setDoc: vi.fn(async (..._args: unknown[]) => undefined),
  deleteDoc: vi.fn(async (..._args: unknown[]) => undefined),
  runTransaction: vi.fn(),
  resolveStoragePathUrl: vi.fn(async (path: string): Promise<string | null> => `https://media.test/${path}`),
  uploadEntityImage: vi.fn(),
}))

vi.mock('../../firebase', () => ({ db: { name: 'db-stub' } }))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  query: (ref: { path: string }) => ({ path: ref.path }),
  where: () => ({}),
  deleteDoc: mocks.deleteDoc,
  onSnapshot: (ref: { path: string }, next: Listener['next'], fail: Listener['fail']) => {
    mocks.listeners[ref.path] = { next, fail }
    return () => {
      if (mocks.listeners[ref.path]?.next === next) delete mocks.listeners[ref.path]
    }
  },
  runTransaction: mocks.runTransaction,
  serverTimestamp: () => ({ sentinel: 'serverTimestamp' }),
  setDoc: mocks.setDoc,
}))
vi.mock('../common/mediaStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../common/mediaStorage')>()),
  resolveStoragePathUrl: mocks.resolveStoragePathUrl,
  uploadEntityImage: mocks.uploadEntityImage,
}))
vi.mock('../common/imageNormalization', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../common/imageNormalization')>()),
  normalizeImageForUpload: async (file: File) => ({ file }),
}))
vi.mock('../notes/useSessionNotes', () => ({ useSessionNotes: () => ({ notes: [] }) }))
// The shell's other tabs are not under test, and some reach the Firebase singleton at import time.
vi.mock('../maps/MapsTab', () => ({ MapsTab: () => null }))
vi.mock('../monsters/MonstersTab', () => ({ MonstersTab: () => null }))
vi.mock('../items/ItemsTab', () => ({ ItemsTab: () => null }))
vi.mock('../tables/TablesTab', () => ({ TablesTab: () => null }))
vi.mock('../notes/NotesTab', () => ({ NotesTab: () => null }))
vi.mock('../notes/CalendarTab', () => ({ CalendarTab: () => null }))
vi.mock('../common/RulesTab', () => ({ RulesTab: () => null }))

const { CampaignTabContent } = await import('../shell/CampaignTabContent')
const { parseLubecCharacter } = await import('../ruleSets/lubec/characterParser')
const { LubecDiceContext } = await import('./useLubecRoller')
const { LUBEC_NPC_PORTRAIT_NOTE } = await import('./LubecNpcSheetTab')
const { lubecArmorAt } = await import('../ruleSets/lubec/gear/armorAt')

const GM = 'gm-1'
const BASE = 'groups/group-1/campaigns/campaign-1'
const NPCS = `${BASE}/npcs`
const SHEETS = `${BASE}/npcSheets`
const RENE_SHEET = `${SHEETS}/rene`

const campaign: Campaign = { id: 'campaign-1', name: 'Lubec', status: 'active', groupId: 'group-1', gmUserId: GM, system: 'lubec' }

// The documents as stored, by path. Every write lands here, so a remount can be fed what was last written.
let database: Record<string, Fields> = {}

const isMap = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value)

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
  database[ref.path] = written(database[ref.path] ?? {}, payload, options?.merge === true)
}

const npc = (name: string, fields: Fields = {}): Fields => ({
  name, title: 'Lobsterman', visibleToPlayers: true, tags: [], portraitPath: '', portraitFocusX: 50, portraitFocusY: 50,
  tokenIcon: { icon: 'pawn', color: '#2f5bbf', size: 34 }, playerDescription: '', playerNotes: '', ...fields,
})

const reneSheet = (fields: Fields = {}, sheet: Fields = {}): Fields => ({
  system: 'lubec',
  schemaVersion: 1,
  name: 'Stored name',
  ownerUserId: GM,
  ownerUsername: 'gamemaster',
  creationMode: 'established',
  creationStatus: 'active',
  lubec: {
    class: { key: 'tough', choices: {} },
    base: { Strength: 40, Speed: 45, Intellect: 30, Handle: 42, Charm: 35, Sanity: 31, Fear: 27, Body: 33 },
    skills: { free: 'Boatwork', picked: [] },
    ...sheet,
  },
  ...fields,
})

let seededRolls: number[] = []

const seededDice: LubecDice = () => {
  const next = seededRolls.shift()
  if (next === undefined) throw new Error('No seeded roll left')
  return (next - 0.5) / 100
}

function seed(documents: Record<string, Fields>) {
  database = { ...database, ...documents }
}

// A path with an even number of segments names a document; an odd one a collection.
const isDocumentPath = (path: string) => path.split('/').length % 2 === 0

function snapshotOf(path: string) {
  if (isDocumentPath(path)) {
    return { id: path.split('/').pop(), exists: () => path in database, data: () => database[path] }
  }
  const docs = Object.entries(database)
    .filter(([docPath]) => docPath.startsWith(`${path}/`) && !docPath.slice(path.length + 1).includes('/'))
    .map(([docPath, data]) => ({ id: docPath.split('/').pop(), data: () => data }))
  return { docs }
}

/** Feeds every listener what is stored under its path. */
function emitDatabase() {
  act(() => Object.entries(mocks.listeners).forEach(([path, listener]) => listener.next(snapshotOf(path))))
}

function renderNpcs(role: Role, uid: string) {
  return render(
    <LubecDiceContext.Provider value={seededDice}>
      <CampaignTabContent
        activeTab="npcs"
        campaign={campaign}
        role={role}
        gameSystem="lubec"
        user={{ uid } as User}
        username="gamemaster"
        setError={vi.fn()}
        characters={[]}
        characterTabProps={null}
      />
    </LubecDiceContext.Provider>,
  )
}

function mountNpcs(role: Role, uid: string) {
  const view = renderNpcs(role, uid)
  emitDatabase()
  return view
}

function reload(role: Role, uid: string) {
  cleanup()
  return mountNpcs(role, uid)
}

const flushMicrotasks = () => act(async () => { await Promise.resolve() })

async function settle() {
  act(() => vi.advanceTimersByTime(500))
  for (let round = 0; round < 5; round += 1) await flushMicrotasks()
}

function pickNpc(name: string) {
  const row = [...document.querySelectorAll<HTMLElement>('.npc-row')].find((entry) => entry.querySelector('strong')?.textContent === name)
  if (!row) throw new Error(`No NPC row named ${name}`)
  fireEvent.click(row.querySelector('.map-select') as HTMLElement)
}

const strip = () => screen.queryByRole('tablist', { name: 'NPC views' })

const openTab = (name: 'Story' | 'Character sheet') => fireEvent.click(within(strip() as HTMLElement).getByRole('tab', { name }))

/** Opens the NPC's Character sheet tab, after the sheet's listener has been fed. */
function openSheetTab(name: string) {
  pickNpc(name)
  openTab('Character sheet')
  emitDatabase()
}

const sheetOf = (name: string) => screen.getByRole('article', { name: `${name} character sheet` })

const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

const counterValue = (label: string) =>
  screen.getByRole('group', { name: label }).querySelector('.lubec-counter-value')?.textContent

const writtenPaths = () => mocks.setDoc.mock.calls.map(([ref]) => (ref as { path: string }).path)

const storedSheet = (path = RENE_SHEET) => parseLubecCharacter(path.split('/').pop() as string, database[path])

const circleOf = (name: string) =>
  (screen.getByText(name, { selector: '.ability-name' }).closest('.ability') as HTMLElement).querySelector('.roll-circle') as HTMLElement

// A transaction's writes land together when it ends, and the listeners then hear them.
async function transaction(_db: unknown, run: (tx: unknown) => Promise<unknown>) {
  const writes: (() => void)[] = []
  const tx = {
    get: async ({ path }: { path: string }) => snapshotOf(path),
    set: (...args: unknown[]) => { writes.push(() => writeToDatabase(...args)) },
    delete: ({ path }: { path: string }) => { writes.push(() => { delete database[path] }) },
  }
  const result = await run(tx)
  writes.forEach((write) => write())
  emitDatabase()
  return result
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  database = {}
  seededRolls = []
  mocks.setDoc.mockReset().mockImplementation(async (...args: unknown[]) => writeToDatabase(...args))
  mocks.deleteDoc.mockReset().mockResolvedValue(undefined)
  mocks.runTransaction.mockReset().mockImplementation(transaction)
  seed({ [`${NPCS}/rene`]: npc('Rene Dube', { sortOrder: 0 }), [`${NPCS}/hollis`]: npc('Hollis Varney', { sortOrder: 1 }) })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  mocks.listeners = {}
})

describe('the NPC tab strip', () => {
  it('shows the GM Story and Character sheet over the NPC, with the story open first', () => {
    mountNpcs('gm', GM)
    pickNpc('Rene Dube')

    expect(within(strip() as HTMLElement).getAllByRole('tab').map((tab) => [tab.textContent, tab.getAttribute('aria-selected')]))
      .toEqual([['Story', 'true'], ['Character sheet', 'false']])
    expect(screen.getByDisplayValue('Rene Dube')).toBeTruthy()
    expect(mocks.listeners[RENE_SHEET]).toBeUndefined()
  })

  it('gives a player no strip and never listens to a sheet: their NPCs tab is the story alone', () => {
    seed({ [RENE_SHEET]: reneSheet() })
    mountNpcs('player', 'player-1')
    pickNpc('Rene Dube')

    expect(strip()).toBeNull()
    expect(screen.queryByRole('article')).toBeNull()
    expect(Object.keys(mocks.listeners).some((path) => path.startsWith(SHEETS))).toBe(false)
  })

  it('goes back to the story from the sheet', () => {
    seed({ [RENE_SHEET]: reneSheet() })
    mountNpcs('gm', GM)
    openSheetTab('Rene Dube')
    expect(sheetOf('Rene Dube')).toBeTruthy()

    openTab('Story')

    expect(screen.queryByRole('article')).toBeNull()
    expect(screen.getByDisplayValue('Rene Dube')).toBeTruthy()
  })

  it('keeps the sheet tab open moving to another NPC, and shows that NPC\'s own sheet, never the last one\'s', () => {
    seed({ [RENE_SHEET]: reneSheet() })
    mountNpcs('gm', GM)
    openSheetTab('Rene Dube')

    pickNpc('Hollis Varney')
    emitDatabase()

    expect(screen.queryByRole('article')).toBeNull()
    expect(screen.getByText('has no character sheet yet.', { exact: false }).textContent).toBe('Hollis Varney has no character sheet yet.')
  })
})

describe('an NPC\'s sheet', () => {
  it('loads from npcSheets under the NPC\'s own name, portrait and token, with a band that edits nothing', async () => {
    seed({ [`${NPCS}/rene`]: npc('Rene Dube', { portraitPath: 'npcs/rene.png' }), [RENE_SHEET]: reneSheet() })
    mountNpcs('gm', GM)
    pickNpc('Rene Dube')
    await flushMicrotasks()
    openTab('Character sheet')
    emitDatabase()

    const sheet = sheetOf('Rene Dube')
    expect(within(sheet).getByRole('heading', { level: 2 }).textContent).toBe('Rene Dube')
    expect(within(sheet).getByRole('img', { name: 'Rene Dube portrait' }).getAttribute('src')).toBe('https://media.test/npcs/rene.png')
    expect(within(sheet).queryByRole('button', { name: 'Edit name band' })).toBeNull()
    expect(within(sheet).queryByRole('button', { name: 'Edit map token' })).toBeNull()
    expect(within(sheet).queryByRole('button', { name: 'Give character to player' })).toBeNull()
    expect(within(sheet).queryByRole('button', { name: 'Delete character' })).toBeNull()
    expect(within(sheet).getByText('Tough', { selector: '.lubec-kid-meta span' })).toBeTruthy()
  })

  it('writes a counter tick to the NPC\'s sheet in npcSheets and nowhere else, kept through a reload', async () => {
    seed({ [RENE_SHEET]: reneSheet() })
    mountNpcs('gm', GM)
    openSheetTab('Rene Dube')

    press('Raise Stress')
    press('Raise Trauma')
    await settle()

    expect(writtenPaths()).toEqual([RENE_SHEET])
    expect(storedSheet().lubec.counters).toEqual({ stress: 3, minimumStress: 2, trauma: 1 })
    expect(database[RENE_SHEET].name).toBe('Stored name')
    expect(database[RENE_SHEET].ownerUserId).toBe(GM)

    reload('gm', GM)
    openSheetTab('Rene Dube')

    expect([counterValue('Stress'), counterValue('Trauma')]).toEqual(['3', '1'])
  })

  it('adds an effect that changes the sheet and saves it to npcSheets', async () => {
    seed({ [RENE_SHEET]: reneSheet() })
    mountNpcs('gm', GM)
    openSheetTab('Rene Dube')
    const effects = screen.getByLabelText('Active effects')

    fireEvent.click(within(effects).getByText('Add effect', { selector: 'button' }))
    const form = within(effects).getByLabelText('New effect')
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Bruised knuckles' } })
    fireEvent.click(within(form).getByLabelText('Add modifier to step 1'))
    fireEvent.change(within(form).getByLabelText('Step 1 modifier 1'), { target: { value: 'Handle' } })
    fireEvent.change(within(form).getByLabelText('Step 1 modifier 1 amount'), { target: { value: '-10' } })
    fireEvent.click(within(form).getByText('Add', { selector: 'button' }))
    await settle()

    expect(circleOf('Handle').textContent).toBe('32')
    expect(writtenPaths()).toEqual([RENE_SHEET])
    expect(storedSheet().lubec.effects.map(({ name }) => name)).toEqual(['Bruised knuckles'])
  })

  it('rolls a Stat Check on the NPC\'s sheet, adding Stress for a failure, and stores the roll in npcSheets', async () => {
    seed({ [RENE_SHEET]: reneSheet() })
    mountNpcs('gm', GM)
    openSheetTab('Rene Dube')

    seededRolls = [60]
    fireEvent.click(circleOf('Strength'))
    await settle()

    expect(counterValue('Stress')).toBe('3')
    expect(writtenPaths()).toEqual([RENE_SHEET])
    expect(storedSheet().lubec.lastRoll).toMatchObject({ kind: 'stat-check', against: 'Strength', target: 50, result: 60, outcome: 'failure' })
  })

  it('finalizes a draft through the draft bar, with no Delete on it, writing to npcSheets', async () => {
    seed({ [RENE_SHEET]: reneSheet({ creationStatus: 'established_draft' }) })
    mountNpcs('gm', GM)
    openSheetTab('Rene Dube')
    const bar = document.querySelector('.lubec-draft-bar') as HTMLElement
    expect(within(bar).queryByText('Delete draft')).toBeNull()

    fireEvent.click(within(bar).getByText('Finalize', { selector: 'button' }))
    const dialog = screen.getByRole('dialog', { name: 'Finalize Rene Dube' })
    fireEvent.click(within(dialog).getByText('Finalize', { selector: 'button' }))
    await settle()

    expect(database[RENE_SHEET].creationStatus).toBe('active')
    expect(writtenPaths()).toEqual([RENE_SHEET])
    expect(document.querySelector('.lubec-draft-bar')).toBeNull()
  })
})

describe('an NPC\'s Gear page', () => {
  const thing = (id: string, name: string, pocket: number, fields: Fields = {}): Fields => ({
    id, kind: 'thing', carrier: 'backpack', pocket, name, size: 1, qty: 1, weight: 'normal', note: '', ...fields,
  })
  const helmet: Fields = {
    id: 'helmet', kind: 'armor', carrier: 'worn', name: 'Hockey helmet', size: 2, qty: 1, weight: 'normal', note: '', locs: ['head'], armor: { cut: 1, pierce: 1, blunt: 2, gun: 0 },
  }
  const reneWith = (items: Fields[]) => reneSheet({}, { gear: { items, carriers: [], overrides: [], supplies: [] } })

  const pageTabs = () => within(screen.getByRole('navigation', { name: 'Character sheet pages' }))
  const gearTab = () => pageTabs().getByRole('button', { name: /^Gear/ })
  const openGear = () => fireEvent.click(gearTab())
  const dialog = (name: string | RegExp) => within(screen.getByRole('dialog', { name }))
  const slotOf = (name: string) => [...document.querySelectorAll<HTMLElement>('.lubec-gear .slot.item')].find((el) => el.textContent?.includes(name)) as HTMLElement
  const storedGear = () => storedSheet().lubec.gear

  function openSheet(items: Fields[]) {
    seed({ [RENE_SHEET]: reneWith(items) })
    mountNpcs('gm', GM)
    openSheetTab('Rene Dube')
  }

  it('has the same three pages as a player\'s sheet, and is empty for a sheet with no gear', () => {
    seed({ [RENE_SHEET]: reneSheet() })
    mountNpcs('gm', GM)
    openSheetTab('Rene Dube')

    expect(pageTabs().getAllByRole('button').map((tab) => tab.textContent)).toEqual(['Core sheet', 'Skills', 'Gear'])
    openGear()
    expect(document.querySelector('.lubec-gear .slot.item')).toBeNull()
    expect(screen.getByRole('button', { name: '+ Add an item' })).toBeTruthy()
  })

  it('adds a carrier with personal the only kind, saved to npcSheets and nowhere else, kept through a reload', async () => {
    openSheet([])
    openGear()
    fireEvent.click(screen.getByRole('tab', { name: 'Carriers' }))
    fireEvent.click(screen.getByRole('button', { name: '+ New carrier' }))

    const form = dialog('Add a carrier')
    expect(form.queryByRole('radio')).toBeNull()
    fireEvent.change(form.getByRole('textbox', { name: 'Name' }), { target: { value: 'Tackle box' } })
    fireEvent.click(form.getByRole('button', { name: 'Add carrier' }))
    await settle()

    expect(writtenPaths()).toEqual([RENE_SHEET])
    expect(storedGear()?.carriers.map(({ name }) => name)).toEqual(['Tackle box'])

    reload('gm', GM)
    openSheetTab('Rene Dube')
    openGear()
    fireEvent.click(screen.getByRole('tab', { name: 'Carriers' }))
    expect(screen.getByText('Tackle box')).toBeTruthy()
  })

  it('changes the backpack picture as on a player\'s sheet', async () => {
    openSheet([])
    openGear()

    fireEvent.click(screen.getByRole('button', { name: 'Change pack' }))
    fireEvent.click(dialog('Change pack').getByRole('button', { name: 'teal' }))
    await settle()

    expect(writtenPaths()).toEqual([RENE_SHEET])
    expect(storedGear()?.backpackArt).toBe('teal')
  })

  it('shows worn armor on the body drawing, and it counts for the location', () => {
    openSheet([helmet])
    openGear()

    expect(screen.getByRole('button', { name: /^Head: .*\(Hockey helmet\)$/ })).toBeTruthy()
    const gear = storedGear()
    expect(gear && lubecArmorAt(gear, 'head', 'blunt')).toBe(2)
  })

  it('asks the GM for a heavy thing\'s Strength roll, rolled on the NPC\'s own sheet and stored in npcSheets', async () => {
    openSheet([thing('anvil', 'Small anvil', 0, { weight: 'heavy' })])
    expect(gearTab().textContent).toBe('Gear, a Strength roll to make')
    openGear()

    const ask = screen.getByRole('dialog', { name: 'Small anvil is heavy' })
    seededRolls = [60]
    fireEvent.click(ask.querySelector('.ability .roll-circle') as HTMLElement)
    fireEvent.click(within(ask).getByRole('button', { name: 'Done' }))
    await settle()

    expect(writtenPaths()).toEqual([RENE_SHEET])
    expect(storedSheet().lubec.gear?.items).toMatchObject([{ id: 'anvil', check: 'fail' }])
    expect(storedSheet().lubec.counters.stress).toBe(3)
    expect(gearTab().querySelector('.lubec-page-dot')).toBeNull()
  })

  it('drops a thing to the GM Items tab like any drop, out of npcSheets, and offers nothing that needs a player', async () => {
    openSheet([thing('rope', 'Coil of rope', 0)])
    openGear()

    fireEvent.click(slotOf('Coil of rope'))
    const card = dialog('Coil of rope')
    expect(card.getAllByRole('button').map((button) => button.textContent)).toEqual(['×', 'Edit', 'Move', 'Drop'])
    fireEvent.click(card.getByRole('button', { name: 'Drop' }))
    await settle()

    expect(storedGear()?.items).toEqual([])
    const dropped = Object.entries(database).filter(([path]) => path.startsWith(`${BASE}/gmItems/`)).map(([, data]) => data)
    expect(dropped).toMatchObject([{ name: 'Coil of rope', status: 'dropped', droppedByCharacterId: 'rene', droppedByCharacterName: 'Rene Dube', droppedByUserId: GM }])
  })
})

describe('an NPC with no sheet', () => {
  function openDoors() {
    mountNpcs('gm', GM)
    openSheetTab('Hollis Varney')
    fireEvent.click(screen.getByRole('button', { name: 'Make a character sheet' }))
    return screen.getByRole('dialog', { name: 'New character' })
  }

  it('offers the three ways a new character comes in', () => {
    const dialog = openDoors()

    expect(within(dialog).getAllByRole('button').map((button) => button.querySelector('strong')?.textContent ?? button.textContent))
      .toEqual(['Import a file', 'Direct entry', 'Guided roll-up', 'Cancel'])
  })

  it('makes a Direct entry draft under the NPC\'s own id, owned by the GM, and opens it under the NPC\'s name', async () => {
    const dialog = openDoors()

    fireEvent.click(within(dialog).getByRole('button', { name: /^Direct entry/ }))
    await settle()

    expect(writtenPaths()).toEqual([`${SHEETS}/hollis`])
    expect(database[`${SHEETS}/hollis`]).toMatchObject({ system: 'lubec', ownerUserId: GM, ownerUsername: 'gamemaster', creationStatus: 'established_draft' })
    expect(sheetOf('Hollis Varney')).toBeTruthy()
    expect(screen.getByText(/In creation/).textContent).toContain('Direct entry')
  })

  it('makes a Guided roll-up draft under the NPC\'s own id', async () => {
    const dialog = openDoors()

    fireEvent.click(within(dialog).getByRole('button', { name: /^Guided roll-up/ }))
    await settle()

    expect(storedSheet(`${SHEETS}/hollis`).lubec.door).toBe('guided')
  })

  it('imports a file as the NPC\'s sheet under its own id, leaving the file\'s portrait out with a note', async () => {
    const dialog = openDoors()
    fireEvent.click(within(dialog).getByRole('button', { name: /Import a file/ }))
    const portrait = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='
    fireEvent.change(within(dialog).getByLabelText('Character code'), { target: { value: JSON.stringify({ ...tommyEvesFile, portrait }) } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Import code' }))
    await settle()

    const imported = storedSheet(`${SHEETS}/hollis`)
    expect(imported.lubec.door).toBe('import')
    expect(imported.lubec.importNotes).toContain(LUBEC_NPC_PORTRAIT_NOTE)
    expect(imported.portraitPath).toBe('')
    expect(mocks.uploadEntityImage).not.toHaveBeenCalled()
    expect(sheetOf('Hollis Varney')).toBeTruthy()
  })
})
