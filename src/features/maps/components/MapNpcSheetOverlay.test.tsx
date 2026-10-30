// @vitest-environment jsdom
/**
 * An NPC's character sheet opened from its map token, mounted as the shell
 * mounts the Maps panel, over the real NPC sheet and the shared character
 * store with `firebase/firestore` and the media module stubbed. MapsTab is
 * stood in for by the two pieces of it this needs, as they are: the GM's map
 * tokens and the selected-token controls. Stored documents reach the sheet
 * through the stubbed snapshot listeners, by path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { User } from 'firebase/auth'
import type { Campaign, Role } from '../../../types/app'
import type { GameSystem } from '../../navigation/tabs'
import type { TokenRecord } from '../lib/types'

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
  resolveStoragePathUrl: vi.fn(async (path: string): Promise<string | null> => `https://media.test/${path}`),
  tokens: [] as TokenRecord[],
  selectedTokenIds: [] as string[],
}))

vi.mock('../../../firebase', () => ({ db: { name: 'db-stub' } }))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  query: (ref: { path: string }) => ({ path: ref.path }),
  where: () => ({}),
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
  resolveStoragePathUrl: mocks.resolveStoragePathUrl,
}))
vi.mock('../MapsTab', async () => {
  const { GmTokenItem } = await import('./MapTokenItems')
  const { SelectedTokenControls } = await import('./SelectedTokenControls')
  const { PlayerMapControls } = await import('./PlayerMapControls')
  const { tokenLivePosition } = await import('../lib/mapTokenDisplay')
  const { renderTokenDimensions } = await import('../lib/tokenRenderGeometry')
  const noop = async () => undefined
  return {
    MapsTab: ({ role }: { role: Role }) => (
      <>
        {mocks.tokens.map((token, index) => (
          <GmTokenItem
            key={token.id}
            token={token}
            index={index}
            visible
            position={tokenLivePosition(token, undefined, undefined)}
            selected={mocks.selectedTokenIds.includes(token.id)}
            dimensions={renderTokenDimensions(token, 1000)}
            playerViewPreview={false}
            onPress={() => undefined}
            onTouchStart={() => undefined}
            onTouchEnd={() => undefined}
            onToggleHidden={() => undefined}
          />
        ))}
        {role === 'gm' ? (
          <SelectedTokenControls
            selectedTokens={mocks.tokens.filter((token) => mocks.selectedTokenIds.includes(token.id))}
            tokenColor="#2f5bbf"
            sameCategory={false}
            onMakeGroup={() => undefined}
            onRequestDeleteTokens={() => undefined}
            onUpdateToken={noop}
            onUpdateTokenSize={noop}
            onUpdateTokenViewDistance={noop}
            tokenViewDistanceSliderValue={() => 100}
          />
        ) : (
          <PlayerMapControls
            cameraLock={false}
            onToggleCameraLock={() => undefined}
            selectedTokens={mocks.tokens.filter((token) => mocks.selectedTokenIds.includes(token.id))}
          />
        )}
      </>
    ),
  }
})

const { CampaignTabContent } = await import('../../shell/CampaignTabContent')

const GM = 'gm-1'
const BASE = 'groups/group-1/campaigns/campaign-1'
const NPCS = `${BASE}/npcs`
const SHEETS = `${BASE}/npcSheets`
const RENE = `${NPCS}/rene`
const RENE_SHEET = `${SHEETS}/rene`

// The documents as stored, by path. Every write lands here.
let database: Record<string, Fields> = {}

const npc = (name: string, fields: Fields = {}): Fields => ({
  name, title: 'Lobsterman', visibleToPlayers: false, tags: [], portraitPath: '', portraitFocusX: 50, portraitFocusY: 50,
  tokenIcon: { icon: 'pawn', color: '#2f5bbf', size: 34 }, playerDescription: '', playerNotes: '', ...fields,
})

const reneSheet = (): Fields => ({
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
  },
})

const token = (id: string, name: string, fields: Partial<TokenRecord> = {}): TokenRecord => ({
  id, x: 0.5, y: 0.5, color: '#2f5bbf', size: 28, sizeScale: null, rotationDeg: 0, flipHorizontal: false, flipVertical: false,
  viewDistance: null, viewDistanceScale: null, party: false, name, revealName: false, hidden: false,
  tokenImagePath: '', tokenImageUrl: '', tokenImageWidth: 0, tokenImageHeight: 0, monsterId: '', ...fields,
})

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

const campaign = (system: GameSystem): Campaign => ({ id: 'campaign-1', name: 'Lubec', status: 'active', groupId: 'group-1', gmUserId: GM, system })

function mountMaps(role: Role, gameSystem: GameSystem = 'lubec') {
  render(
    <CampaignTabContent
      activeTab="maps"
      campaign={campaign(gameSystem)}
      role={role}
      gameSystem={gameSystem}
      user={{ uid: role === 'gm' ? GM : 'player-1' } as User}
      username="gamemaster"
      setError={vi.fn()}
      characters={[]}
      characterTabProps={null}
    />,
  )
}

const flushMicrotasks = () => act(async () => { await Promise.resolve() })

async function settle() {
  act(() => vi.advanceTimersByTime(500))
  for (let round = 0; round < 5; round += 1) await flushMicrotasks()
}

const tokenNamed = (name: string) =>
  screen.getAllByRole('button', { name: 'Map token' }).find((button) => button.textContent?.includes(name)) as HTMLElement

const openButton = () => screen.queryByRole('button', { name: 'Open character sheet' })

const dialog = () => screen.queryByRole('dialog')

const writtenPaths = () => mocks.setDoc.mock.calls.map(([ref]) => (ref as { path: string }).path)

const listening = (prefix: string) => Object.keys(mocks.listeners).some((path) => path.startsWith(prefix))

/** Feeds the listeners until those each feed opens have been fed too: the NPC, then its sheet. */
async function emitAll() {
  for (let round = 0; round < 3; round += 1) {
    await flushMicrotasks()
    emitDatabase()
  }
  await flushMicrotasks()
}

/** Opens the sheet from the token row's button, after the NPC and its sheet have been fed. */
async function openFromTokenRow() {
  fireEvent.click(openButton() as HTMLElement)
  await emitAll()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  database = { [RENE]: npc('Rene Dube'), [`${NPCS}/hollis`]: npc('Hollis Varney') }
  mocks.setDoc.mockReset().mockImplementation(async (...args: unknown[]) => {
    const [ref, payload] = args as [{ path: string }, Fields]
    database[ref.path] = payload
  })
  mocks.resolveStoragePathUrl.mockReset().mockImplementation(async (path: string) => `https://media.test/${path}`)
  mocks.tokens = [
    token('t-rene', 'Rene', { npcId: 'rene' }),
    token('t-hollis', 'Hollis', { npcId: 'hollis' }),
    token('t-crate', 'Crate'),
  ]
  mocks.selectedTokenIds = []
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  mocks.listeners = {}
})

describe('the token row\'s Open character sheet button', () => {
  it('shows for the GM with one NPC token selected, beside the row\'s own toggles', () => {
    mocks.selectedTokenIds = ['t-rene']
    mountMaps('gm')

    const button = openButton() as HTMLElement
    expect(button.className).toBe('token-toggle-btn map-icon-btn fast-tooltip')
    expect(button.getAttribute('data-tooltip')).toBe('Character sheet')
    expect(button.querySelector('svg')?.getAttribute('width')).toBe('14')
  })

  it.each([
    ['no token', []],
    ['a token that stands for no NPC', ['t-crate']],
    ['two NPC tokens', ['t-rene', 't-hollis']],
  ])('is absent with %s selected', (_case, selected) => {
    mocks.selectedTokenIds = selected
    mountMaps('gm')

    expect(openButton()).toBeNull()
  })

  it('opens the one NPC among the selected tokens', async () => {
    database[RENE_SHEET] = reneSheet()
    mocks.selectedTokenIds = ['t-crate', 't-rene']
    mountMaps('gm')

    await openFromTokenRow()

    expect(within(dialog() as HTMLElement).getByRole('article', { name: 'Rene Dube character sheet' })).toBeTruthy()
  })

  it('is never offered to a player, who never listens to an NPC sheet', () => {
    mocks.selectedTokenIds = ['t-rene']
    mountMaps('player')
    fireEvent.doubleClick(tokenNamed('Rene'))

    expect(openButton()).toBeNull()
    expect(dialog()).toBeNull()
    expect(listening(SHEETS)).toBe(false)
  })

  it.each(['ose', 'vtm'] as const)('is absent on a %s map, whose rule set keeps no NPC sheets', (gameSystem) => {
    mocks.selectedTokenIds = ['t-rene']
    mountMaps('gm', gameSystem)
    fireEvent.doubleClick(tokenNamed('Rene'))

    expect(openButton()).toBeNull()
    expect(dialog()).toBeNull()
  })
})

describe('the NPC sheet over the map', () => {
  it('opens the same sheet the NPC tab shows, from npcSheets, under the NPC\'s own name and portrait', async () => {
    database[RENE] = npc('Rene Dube', { portraitPath: 'npcs/rene.png' })
    database[RENE_SHEET] = reneSheet()
    mocks.selectedTokenIds = ['t-rene']
    mountMaps('gm')

    await openFromTokenRow()

    const overlay = dialog() as HTMLElement
    expect(overlay.getAttribute('aria-modal')).toBe('true')
    expect(within(overlay).getByRole('heading', { name: 'Character sheet Rene Dube' })).toBeTruthy()
    const sheet = within(overlay).getByRole('article', { name: 'Rene Dube character sheet' })
    expect(within(sheet).getByRole('img', { name: 'Rene Dube portrait' }).getAttribute('src')).toBe('https://media.test/npcs/rene.png')
    expect(within(sheet).queryByRole('button', { name: /Edit/ })).toBeNull()
    expect(mocks.listeners[RENE_SHEET]).toBeDefined()
  })

  it('saves an edit made there to the NPC\'s sheet in npcSheets and nowhere else', async () => {
    database[RENE_SHEET] = reneSheet()
    mocks.selectedTokenIds = ['t-rene']
    mountMaps('gm')
    await openFromTokenRow()

    fireEvent.click(screen.getByRole('button', { name: 'Raise Stress' }))
    await settle()

    expect(writtenPaths()).toEqual([RENE_SHEET])
    expect((database[RENE_SHEET].lubec as Fields).counters).toMatchObject({ stress: 3 })
  })

  it('opens from a double-click on the NPC\'s token, and not from a token that stands for no NPC', async () => {
    database[RENE_SHEET] = reneSheet()
    mountMaps('gm')

    fireEvent.doubleClick(tokenNamed('Crate'))
    expect(dialog()).toBeNull()

    fireEvent.doubleClick(tokenNamed('Rene'))
    await emitAll()

    expect(within(dialog() as HTMLElement).getByRole('article', { name: 'Rene Dube character sheet' })).toBeTruthy()
  })

  it('offers the ways to make a sheet for an NPC that has none', async () => {
    mocks.selectedTokenIds = ['t-rene']
    mountMaps('gm')

    await openFromTokenRow()

    expect(within(dialog() as HTMLElement).getByText('has no character sheet yet.', { exact: false })).toBeTruthy()
    expect(within(dialog() as HTMLElement).getByRole('button', { name: 'Make a character sheet' })).toBeTruthy()
  })

  it('says so while the NPC loads, and when the token\'s NPC is gone', async () => {
    delete database[RENE]
    mocks.selectedTokenIds = ['t-rene']
    mountMaps('gm')

    fireEvent.click(openButton() as HTMLElement)
    expect(within(dialog() as HTMLElement).getByText('Opening the sheet…')).toBeTruthy()

    await emitAll()
    expect(within(dialog() as HTMLElement).getByText('This token\'s NPC has been deleted.')).toBeTruthy()
    expect(listening(SHEETS)).toBe(false)
  })

  it('leaves a portrait that resolves to nothing for the NPC\'s next change', async () => {
    mocks.resolveStoragePathUrl.mockResolvedValue(null)
    database[RENE] = npc('Rene Dube', { portraitPath: 'npcs/rene.png' })
    database[RENE_SHEET] = reneSheet()
    mocks.selectedTokenIds = ['t-rene']
    mountMaps('gm')

    await openFromTokenRow()
    const lookups = mocks.resolveStoragePathUrl.mock.calls.length
    for (let round = 0; round < 5; round += 1) await flushMicrotasks()

    expect(lookups).toBeGreaterThan(0)
    expect(mocks.resolveStoragePathUrl).toHaveBeenCalledTimes(lookups)
    expect(within(dialog() as HTMLElement).getByRole('article', { name: 'Rene Dube character sheet' })).toBeTruthy()
  })

  it('closes with its close button', async () => {
    database[RENE_SHEET] = reneSheet()
    mocks.selectedTokenIds = ['t-rene']
    mountMaps('gm')
    await openFromTokenRow()

    fireEvent.click(screen.getByRole('button', { name: 'Close character sheet' }))

    expect(dialog()).toBeNull()
    expect(listening(SHEETS)).toBe(false)
    expect(listening(RENE)).toBe(false)
  })
  describe('the fight modal over the map', () => {
    const fightButton = () => screen.queryByRole('button', { name: 'Fight' })
    const fightDialog = () => within(screen.getByRole('dialog', { name: 'Attack' }))
    const TOMMY = `${BASE}/characters/tommy`

    beforeEach(() => {
      database[RENE] = npc('Rene Dube')
      database[RENE_SHEET] = reneSheet()
      database[TOMMY] = { ...reneSheet(), name: 'Tommy Eves', ownerUserId: 'player-1', lubec: { ...(reneSheet().lubec as Fields), gear: { items: [{ id: 'jk', kind: 'armor', carrier: 'worn', name: 'Leather jacket', size: 1, qty: 1, weight: 'normal', note: '', locs: ['torso'], armor: { cut: 2, pierce: 1, blunt: 1, gun: 0 } }], carriers: [], overrides: [], supplies: [] } } }
      mocks.tokens = [token('t-tommy', 'Tommy', { characterId: 'tommy' }), token('t-rene', 'Rene Dube', { npcId: 'rene' })]
    })

    it.each(['gm', 'player'] as const)('shows the %s no Fight action outside Lubec', async (role) => {
      mocks.selectedTokenIds = ['t-tommy']
      mountMaps(role, 'ose')
      await emitAll()
      expect(fightButton()).toBeNull()
    })

    it('has the GM\'s first selected token attack the second, with the NPC\'s sheet behind the target', async () => {
      mocks.selectedTokenIds = ['t-tommy', 't-rene']
      mountMaps('gm')
      await emitAll()
      expect(listening(SHEETS)).toBe(false)

      fireEvent.click(fightButton() as HTMLElement)
      await emitAll()
      expect(fightDialog().getByText('Tommy Eves')).toBeTruthy()
      fireEvent.click(fightDialog().getByRole('button', { name: /Fisticuffs/ }))
      expect(fightDialog().getByRole('heading', { name: 'Rene Dube' })).toBeTruthy()
      expect(fightDialog().getByText('Nothing that stops a wound.')).toBeTruthy()

      fireEvent.click(fightDialog().getByRole('button', { name: 'Close' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(listening(SHEETS)).toBe(false)
      expect(writtenPaths()).toEqual([])
    })

    it('shows the armor of a character target', async () => {
      mocks.tokens = [mocks.tokens[1], mocks.tokens[0]]
      mocks.selectedTokenIds = ['t-rene', 't-tommy']
      mountMaps('gm')
      await emitAll()
      fireEvent.click(fightButton() as HTMLElement)
      await emitAll()
      fireEvent.click(fightDialog().getByRole('button', { name: /Fisticuffs/ }))
      expect(fightDialog().getByText('Leather jacket')).toBeTruthy()
    })

    describe('for a player', () => {
      const PUBLIC = { armor: [{ locs: ['torso', 'waist'], armor: { cut: 2, pierce: 1, blunt: 1, gun: 0 } }], woundLevel: null }

      beforeEach(() => {
        database[TOMMY] = { ...database[TOMMY], creationStatus: 'active' }
        database[RENE] = npc('Rene Dube', { visibleToPlayers: true, fightSummary: PUBLIC })
        mocks.selectedTokenIds = ['t-rene']
      })

      it('attacks as their own character, and sees only the NPC\'s public summary, under the token\'s name', async () => {
        mountMaps('player')
        await emitAll()
        fireEvent.click(fightButton() as HTMLElement)
        await emitAll()
        expect(fightDialog().getByText('Tommy Eves')).toBeTruthy()
        fireEvent.click(fightDialog().getByRole('button', { name: /Fisticuffs/ }))
        expect(fightDialog().getByRole('heading', { name: 'Someone unknown' })).toBeTruthy()
        expect(fightDialog().getByText('Torso, Waist')).toBeTruthy()
        expect(listening(SHEETS)).toBe(false)
        expect(listening(NPCS + '/rene')).toBe(true)

        fireEvent.click(fightDialog().getByRole('button', { name: 'Close' }))
        expect(listening(NPCS)).toBe(false)
        expect(writtenPaths()).toEqual([])
      })

      it('says the GM has it where the rules refuse the NPC', async () => {
        mountMaps('player')
        await emitAll()
        fireEvent.click(fightButton() as HTMLElement)
        await flushMicrotasks()
        act(() => mocks.listeners[RENE].fail(new Error('permission-denied')))
        fireEvent.click(fightDialog().getByRole('button', { name: /Fisticuffs/ }))
        expect(fightDialog().getByText('No sheet to read here. The GM says what they are wearing.')).toBeTruthy()
      })
    })

    it('keeps the NPC\'s public summary when the sheet\'s gear changes, and writes nothing for opening it', async () => {
      mocks.selectedTokenIds = ['t-rene']
      mountMaps('gm')
      await emitAll()
      await openFromTokenRow()
      expect(writtenPaths()).toEqual([])

      const gear = { items: [{ id: 'jk', kind: 'armor', carrier: 'worn', name: 'Secret vest', size: 1, qty: 1, weight: 'normal', note: '', locs: ['torso'], armor: { cut: 2, pierce: 1, blunt: 1, gun: 0 } }], carriers: [], overrides: [], supplies: [] }
      database[RENE_SHEET] = { ...database[RENE_SHEET], lubec: { ...(database[RENE_SHEET].lubec as Fields), gear } }
      await emitAll()

      expect(writtenPaths()).toEqual([RENE])
      expect(mocks.setDoc.mock.calls[0][1]).toEqual({ fightSummary: { armor: [{ locs: ['torso'], armor: { cut: 2, pierce: 1, blunt: 1, gun: 0 } }], woundLevel: null } })
    })

    it('stops listening to the campaign\'s characters when Maps closes', async () => {
      mocks.selectedTokenIds = ['t-tommy']
      mountMaps('gm')
      await emitAll()
      expect(listening(`${BASE}/characters`)).toBe(true)
      cleanup()
      expect(listening(`${BASE}/characters`)).toBe(false)
    })
  })
})
