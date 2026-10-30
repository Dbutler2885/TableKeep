// @vitest-environment jsdom
/**
 * The card's Give, through the Lubec character tab over the shared store with
 * `firebase/firestore` stubbed: who it offers to, the saved sheet the offer
 * waits for, the stored offer, and the card while one is out.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { User } from 'firebase/auth'
import type { Campaign, Role } from '../../../types/app'

// See LubecGearTab.test.tsx: large trees under coverage on a loaded machine outlast the defaults.
vi.setConfig({ testTimeout: 30_000 })
configure({ asyncUtilTimeout: 10_000 })

type Fields = Record<string, unknown>
type Listener = { next: (snap: unknown) => void; fail: (error: unknown) => void }

const mocks = vi.hoisted(() => ({
  listeners: {} as Record<string, { next: (snap: unknown) => void; fail: (error: unknown) => void }>,
  setDoc: vi.fn(async (..._args: unknown[]) => undefined),
  deleteDoc: vi.fn(async (..._args: unknown[]) => undefined),
}))

vi.mock('../../../firebase', () => ({ db: { name: 'db-stub' } }))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  query: (ref: unknown) => ref,
  where: () => null,
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
vi.mock('../../common/mediaStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../common/mediaStorage')>()),
  resolveStoragePathUrl: vi.fn(async () => null),
}))

const { ruleSetSheets } = await import('../../ruleSets/sheetComponents')

const CAMPAIGN_PATH = 'groups/group-1/campaigns/campaign-1'
const CHARACTERS_PATH = `${CAMPAIGN_PATH}/characters`
const OFFERS_PATH = `${CAMPAIGN_PATH}/pendingTransfers`
const GM = 'gm-1'

const campaign: Campaign = { id: 'campaign-1', name: 'Lubec', status: 'active', groupId: 'group-1', gmUserId: GM, system: 'lubec' }

const sheet = (name: string, ownerUserId: string, items: Fields[] = [], extra: Fields = {}): Fields => ({
  system: 'lubec',
  schemaVersion: 1,
  name,
  ownerUserId,
  ownerUsername: `${name.toLowerCase().slice(0, 4)}`,
  creationMode: 'established',
  creationStatus: 'active',
  lubec: {
    class: { key: 'working', choices: {} },
    base: { Strength: 24, Speed: 51, Intellect: 38, Handle: 50, Charm: 48, Sanity: 20, Fear: 24, Body: 21 },
    skills: { free: 'Boatwork', picked: ['Swimming', 'Diving'] },
    gear: { items, carriers: [], overrides: [], supplies: [] },
  },
  ...extra,
})

const T = (id: string, name: string, extra: Fields = {}): Fields => ({
  id, kind: 'thing', carrier: 'backpack', pocket: 0, name, size: 1, qty: 1, weight: 'normal', note: '', ...extra,
})

const LIGHT = T('light', 'Flashlight', { cells: [1], batch: 'b1', check: 'pass' })

let database: Record<string, Fields> = {}
let offers: Record<string, Fields> = {}

const docsOf = (records: Record<string, Fields>) => ({ docs: Object.entries(records).map(([id, data]) => ({ id, data: () => data })) })

const emitOffers = () => act(() => mocks.listeners[OFFERS_PATH]?.next(docsOf(offers)))

function mountTab(role: Role, uid: string) {
  const LubecSheet = ruleSetSheets.lubec
  render(<LubecSheet campaign={campaign} role={role} user={{ uid } as User} username="viewer1" setError={vi.fn()} characterTabProps={null} />)
  act(() => mocks.listeners[CHARACTERS_PATH]?.next(docsOf(database)))
  emitOffers()
}

function openGear(name: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }))
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Character sheet pages' })).getByRole('button', { name: 'Gear' }))
}

const openCard = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }))
  return within(screen.getByRole('dialog', { name }))
}

const offerCalls = () => mocks.setDoc.mock.calls.filter(([ref]) => (ref as { path: string }).path.startsWith(OFFERS_PATH))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listeners = {}
  database = {}
  offers = {}
  mocks.setDoc.mockImplementation(async (...args: unknown[]) => {
    const [ref, payload] = args as [{ path: string }, Fields]
    const id = ref.path.split('/').pop() as string
    if (ref.path.startsWith(OFFERS_PATH)) offers[id] = payload
    else database[id] = { ...database[id], ...payload }
  })
  mocks.deleteDoc.mockImplementation(async (...args: unknown[]) => {
    delete offers[(args[0] as { path: string }).path.split('/').pop() as string]
  })
  window.innerWidth = 1024
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('the card\'s Give', () => {
  it('sits between Move and Drop, and its panel lists other people\'s finalized characters', () => {
    database = {
      tommy: sheet('Tommy', 'player-1', [LIGHT]),
      second: sheet('Second', 'player-1'),
      stephen: sheet('Stephen', 'player-2'),
      draft: sheet('Draft', 'player-3', [], { creationStatus: 'draft' }),
      gmKid: sheet('Gmkid', GM),
    }
    mountTab('player', 'player-1')
    openGear('Tommy')
    const card = openCard('Flashlight')

    expect(card.getAllByRole('button').map((b) => b.textContent)).toEqual(['×', 'Edit', 'Move', 'Give', 'Drop'])
    fireEvent.click(card.getByRole('button', { name: 'Give' }))

    expect(card.getByRole('button', { name: 'Give' }).getAttribute('aria-expanded')).toBe('true')
    const picker = card.getByRole('combobox', { name: 'Give to' }) as HTMLSelectElement
    expect([...picker.options].map((o) => o.textContent)).toEqual(['Stephen (step)'])
    expect(card.queryByRole('spinbutton')).toBeNull()
  })

  it('opens one panel at a time, as B\'s do', () => {
    database = { tommy: sheet('Tommy', 'player-1', [LIGHT]), stephen: sheet('Stephen', 'player-2') }
    mountTab('player', 'player-1')
    openGear('Tommy')
    const card = openCard('Flashlight')

    fireEvent.click(card.getByRole('button', { name: 'Give' }))
    fireEvent.click(card.getByRole('button', { name: 'Move' }))
    expect(card.queryByRole('combobox', { name: 'Give to' })).toBeNull()
    fireEvent.click(card.getByRole('button', { name: 'Give' }))
    expect(card.queryByRole('combobox', { name: 'Move to' })).toBeNull()
    expect(card.getByRole('combobox', { name: 'Give to' })).toBeTruthy()
  })

  it('says so when there is nobody to give it to', () => {
    database = { tommy: sheet('Tommy', 'player-1', [LIGHT]) }
    mountTab('player', 'player-1')
    openGear('Tommy')
    const card = openCard('Flashlight')

    fireEvent.click(card.getByRole('button', { name: 'Give' }))

    expect(card.getByText('No other player has a finalized character yet.')).toBeTruthy()
    expect(card.queryByRole('button', { name: 'Give it' })).toBeNull()
  })

  it('stores the offer with the twelve fields and no place, and the toast says so', async () => {
    database = { tommy: sheet('Tommy', 'player-1', [LIGHT]), stephen: sheet('Stephen', 'player-2') }
    mountTab('player', 'player-1')
    openGear('Tommy')
    const card = openCard('Flashlight')
    fireEvent.click(card.getByRole('button', { name: 'Give' }))
    fireEvent.click(card.getByRole('button', { name: 'Give it' }))
    expect((card.getByRole('button', { name: 'Offering...' }) as HTMLButtonElement).disabled).toBe(true)

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Offered Flashlight to Stephen.'))

    expect(screen.queryByRole('dialog', { name: 'Flashlight' })).toBeNull()
    expect(offerCalls()).toHaveLength(1)
    const [offer] = Object.values(offers)
    expect(offer).toEqual({
      id: expect.any(String),
      itemSnapshot: { id: 'light', kind: 'thing', name: 'Flashlight', note: '', size: 1, weight: 'normal', qty: 1 },
      itemId: 'light',
      itemKind: 'thing',
      itemName: 'Flashlight',
      fromCharacterId: 'tommy',
      fromCharacterName: 'Tommy',
      fromUserId: 'player-1',
      toCharacterId: 'stephen',
      toCharacterName: 'Stephen',
      toUserId: 'player-2',
      createdAt: { sentinel: 'serverTimestamp' },
    })
  })

  it('saves the sheet at once before the offer, so the callable finds a thing just added', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    database = { tommy: sheet('Tommy', 'player-1', [T('rope', 'Rope', { kind: 'consumable', qty: 3, per: 3 })]), stephen: sheet('Stephen', 'player-2') }
    mountTab('player', 'player-1')
    openGear('Tommy')
    const card = openCard('Rope')
    fireEvent.click(card.getByRole('button', { name: 'One fewer' }))
    expect(mocks.setDoc).not.toHaveBeenCalled()

    fireEvent.click(card.getByRole('button', { name: 'Give' }))
    fireEvent.click(card.getByRole('button', { name: 'Give it' }))

    await waitFor(() => expect(offerCalls()).toHaveLength(1))
    expect(mocks.setDoc.mock.calls.map(([ref]) => (ref as { path: string }).path.includes('characters'))).toEqual([true, false])
    const gear = (database.tommy.lubec as Fields).gear as { items: Fields[] }
    expect(gear.items[0].qty).toBe(2)
  })

  it('splits a stack: how many goes on the offer as a new item, and the sheet keeps its own', async () => {
    database = { tommy: sheet('Tommy', 'player-1', [T('rope', 'Rope', { kind: 'consumable', qty: 3, per: 3 })]), stephen: sheet('Stephen', 'player-2') }
    mountTab('player', 'player-1')
    openGear('Tommy')
    const card = openCard('Rope')
    fireEvent.click(card.getByRole('button', { name: 'Give' }))

    const howMany = card.getByRole('spinbutton', { name: 'How many (of 3)' }) as HTMLInputElement
    expect(howMany.value).toBe('1')
    fireEvent.change(howMany, { target: { value: '2' } })
    fireEvent.click(card.getByRole('button', { name: 'Give it' }))

    await waitFor(() => expect(offerCalls()).toHaveLength(1))
    const [offer] = Object.values(offers)
    expect(offer).toMatchObject({ itemId: 'rope', itemSnapshot: { qty: 2 } })
    expect((offer.itemSnapshot as Fields).id).not.toBe('rope')
  })

  it('reads "Offered to" with Cancel offer while one is out, and Cancel offer deletes the document', async () => {
    database = { tommy: sheet('Tommy', 'player-1', [LIGHT]), stephen: sheet('Stephen', 'player-2') }
    offers = { 'offer-1': { itemSnapshot: { id: 'light', kind: 'thing', name: 'Flashlight' }, itemId: 'light', fromCharacterId: 'tommy', fromUserId: 'player-1', toCharacterName: 'Stephen' } }
    mountTab('player', 'player-1')
    openGear('Tommy')
    const card = openCard('Flashlight')

    expect(card.getByText('Offered to Stephen')).toBeTruthy()
    expect((card.getByRole('button', { name: 'Give' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(card.getByRole('button', { name: 'Cancel offer' }))
    await waitFor(() => expect(mocks.deleteDoc).toHaveBeenCalledTimes(1))
    expect((mocks.deleteDoc.mock.calls[0][0] as { path: string }).path).toBe(`${OFFERS_PATH}/offer-1`)
    emitOffers()

    expect(card.queryByText('Offered to Stephen')).toBeNull()
    expect((card.getByRole('button', { name: 'Give' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows a refused offer on the card and keeps it open', async () => {
    database = { tommy: sheet('Tommy', 'player-1', [LIGHT]), stephen: sheet('Stephen', 'player-2') }
    mountTab('player', 'player-1')
    openGear('Tommy')
    const card = openCard('Flashlight')
    mocks.setDoc.mockRejectedValueOnce(new Error('Missing or insufficient permissions.'))
    fireEvent.click(card.getByRole('button', { name: 'Give' }))
    fireEvent.click(card.getByRole('button', { name: 'Give it' }))

    await waitFor(() => expect(card.getByRole('alert').textContent).toBe('Missing or insufficient permissions.'))
    expect(card.getByRole('button', { name: 'Give it' })).toBeTruthy()
  })

  it('is the owner\'s alone: the GM on a player\'s sheet has no Give', () => {
    database = { tommy: sheet('Tommy', 'player-1', [LIGHT]), stephen: sheet('Stephen', 'player-2') }
    mountTab('gm', GM)
    openGear('Tommy')
    const card = openCard('Flashlight')

    expect(card.getAllByRole('button').map((b) => b.textContent)).toEqual(['×', 'Edit', 'Move', 'Drop'])
  })
})
