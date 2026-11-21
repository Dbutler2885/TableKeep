// @vitest-environment jsdom
import { createElement, useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, prettyDOM, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { Campaign, CharacterInventoryItem, GroupRecord, ItemApprovalRequest } from './types/app'
import { oseCarrying } from './features/ruleSets/ose/carrying'

// GroupShell is reached the way a signed-in user reaches it: through App's own
// routes. Everything GroupShell renders or subscribes through is replaced, so
// these tests pin what GroupShell decides, and with which arguments.

type Props = Record<string, unknown>

// These cases mount large component trees and run role queries over them in
// jsdom. Alone each takes about a second, but under coverage on a loaded
// machine the same cases ran past Vitest's 5 second default and failed without
// any assertion failing, as `LubecCharacterTab.test.tsx`'s did.
vi.setConfig({ testTimeout: 30_000 })

const mocks = vi.hoisted(() => ({
  props: {} as Record<string, Record<string, unknown>>,
  user: null as Record<string, unknown> | null,
  username: 'gmhandle' as string | null,
  visible: true,
  discordOutcome: null as string | null,
  access: {} as Record<string, unknown>,
  characters: {} as Record<string, unknown>,
  approvals: {} as Record<string, unknown>,
  useCharactersCalls: [] as unknown[][],
  useItemApprovalsCalls: [] as unknown[][],
  signOut: vi.fn(async (..._args: unknown[]) => undefined),
  forgetDemoExpiry: vi.fn(),
  readDemoExpiry: vi.fn((_uid: string): number | null => 1_800_000_000_000),
}))

function stub(name: string) {
  return function Stub(props: Props) {
    mocks.props[name] = props
    return createElement('div', { 'data-testid': name })
  }
}

vi.mock('./firebase', () => ({ auth: { name: 'auth-stub' }, db: { name: 'db-stub' } }))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, next: (user: unknown) => Promise<void>) => {
    void next(mocks.user)
    return () => undefined
  },
  signOut: mocks.signOut,
}))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  onSnapshot: (_ref: unknown, _options: unknown, next: (snapshot: unknown) => void) => {
    next({
      data: () => ({ username: mocks.username }),
      metadata: { fromCache: false, hasPendingWrites: false },
    })
    return () => undefined
  },
  serverTimestamp: () => ({ sentinel: 'serverTimestamp' }),
  setDoc: async () => undefined,
}))
vi.mock('./features/groups/useGroupAccess', () => ({ useGroupAccess: () => mocks.access }))
vi.mock('./features/character/hooks/useCharacters', () => ({
  useCharacters: (...args: unknown[]) => {
    mocks.useCharactersCalls.push(args)
    return mocks.characters
  },
}))
vi.mock('./features/character/hooks/useItemApprovals', () => ({
  useItemApprovals: (...args: unknown[]) => {
    mocks.useItemApprovalsCalls.push(args)
    return mocks.approvals
  },
}))
vi.mock('./features/common/useDocumentVisibility', () => ({ useDocumentVisibility: () => mocks.visible }))
vi.mock('./features/demo/demoSandboxState', () => ({
  forgetDemoExpiry: mocks.forgetDemoExpiry,
  readDemoExpiry: mocks.readDemoExpiry,
}))
vi.mock('./features/auth/AuthPanel', () => ({ AuthPanel: stub('AuthPanel') }))
vi.mock('./features/auth/DiscordConnection', () => ({ DiscordConnection: stub('DiscordConnection') }))
vi.mock('./features/auth/DiscordReturnNotice', () => ({ DiscordReturnNotice: stub('DiscordReturnNotice') }))
vi.mock('./features/auth/discordReturnOutcome', () => ({ pendingDiscordOutcome: () => mocks.discordOutcome }))
vi.mock('./features/auth/UsernameSetup', () => ({ UsernameSetup: stub('UsernameSetup') }))
vi.mock('./features/auth/VerifyEmailGate', () => ({ VerifyEmailGate: stub('VerifyEmailGate') }))
vi.mock('./features/character/CharacterTab', () => ({ CharacterTab: stub('CharacterTab') }))
vi.mock('./features/character/VtmCharacterTab', () => ({ VtmCharacterTab: stub('VtmCharacterTab') }))
vi.mock('./features/common/RulesTab', () => ({ RulesTab: stub('RulesTab') }))
vi.mock('./features/maps/MapsTab', () => ({ MapsTab: stub('MapsTab') }))
vi.mock('./features/monsters/MonstersTab', () => ({ MonstersTab: stub('MonstersTab') }))
vi.mock('./features/items/ItemsTab', () => ({ ItemsTab: stub('ItemsTab') }))
vi.mock('./features/npcs/NpcsTab', () => ({ NpcsTab: stub('NpcsTab') }))
vi.mock('./features/tables/TablesTab', () => ({ TablesTab: stub('TablesTab') }))
vi.mock('./features/notes/NotesTab', () => ({ NotesTab: stub('NotesTab') }))
vi.mock('./features/notes/CalendarTab', () => ({ CalendarTab: stub('CalendarTab') }))
vi.mock('./features/notes/CliffhangerModal', () => ({ CliffhangerModal: stub('CliffhangerModal') }))
vi.mock('./features/transfers/TransferNotification', () => ({ TransferNotification: stub('TransferNotification') }))
vi.mock('./features/groups/GroupPicker', () => ({ GroupPicker: stub('GroupPicker') }))
vi.mock('./features/groups/GroupHome', () => ({ GroupHome: stub('GroupHome') }))
vi.mock('./features/invites/AcceptInvite', () => ({ AcceptInvite: stub('AcceptInvite') }))
vi.mock('./features/campaign/CampaignSettingsModal', () => ({ CampaignSettingsModal: stub('CampaignSettingsModal') }))
vi.mock('./features/demo/DemoBanner', () => ({ DemoBanner: stub('DemoBanner') }))
vi.mock('./features/demo/DemoEntry', () => ({ DemoEntry: stub('DemoEntry') }))

const { default: App } = await import('./App')

const GM = 'gm-1'
const PLAYER = 'player-1'
const SRD = 'https://oldschoolessentials.necroticgnome.com/srd/index.php/Main_Page'

const campaign = (overrides: Partial<Campaign> = {}): Campaign => ({
  id: 'c1',
  name: 'The Black Wyrm',
  status: 'active',
  groupId: 'g1',
  system: 'ose',
  gmUserId: GM,
  ...overrides,
})

const group = (overrides: Partial<GroupRecord> = {}): GroupRecord => ({
  id: 'g1',
  name: 'Home Boys',
  slug: 'home-boys',
  activeCampaignId: 'c1',
  activeCampaign: campaign(),
  drafts: [],
  inactiveCampaigns: [],
  memberRole: 'member',
  ...overrides,
})

const vtmGroup = () => group({ activeCampaign: campaign({ system: 'vtm' }) })

const probe = { location: '' }
function LocationProbe() {
  const { pathname } = useLocation()
  useEffect(() => { probe.location = pathname }, [pathname])
  return null
}

async function renderAt(path: string) {
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  )
  await act(async () => { await Promise.resolve() })
  return view
}

const asUser = (uid: string) => {
  mocks.user = { uid, isAnonymous: false, emailVerified: true, email: `${uid}@test`, displayName: null, photoURL: null }
}
const asDemoVisitor = () => {
  mocks.user = { uid: 'anon-1', isAnonymous: true, emailVerified: false, email: null, displayName: null, photoURL: null }
}

const props = (name: string) => mocks.props[name]
const call = async (name: string, handler: string, ...args: unknown[]) => {
  await act(async () => { await (props(name)[handler] as (...values: unknown[]) => unknown)(...args) })
}
const lastCharactersCall = () => mocks.useCharactersCalls.at(-1)
const lastApprovalsCall = () => mocks.useItemApprovalsCalls.at(-1)
const navLinks = () => Array.from(document.querySelectorAll('.nav-list > *')).map((link) => [
  link.textContent,
  link.getAttribute('href'),
  link.getAttribute('class'),
])
const sideNav = () => document.querySelector('nav') as HTMLElement
const contentPanel = () => document.querySelector('section.content-panel') as HTMLElement
const shellTheme = () => document.querySelector('main.shell-root')?.getAttribute('data-theme')
const accountIdentity = () => document.querySelector('.account-identity')?.textContent

// A phone-width window: the sidebar becomes a bar that opens it as a drawer.
// jsdom has neither media queries nor a modal dialog, so both are stood in for.
const asPhone = () => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}
const drawer = () => document.querySelector('dialog.side-drawer') as HTMLDialogElement
const markup = (element: Element) => prettyDOM(element, Infinity, { highlight: false })

const deferred = () => {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.props = {}
  mocks.useCharactersCalls = []
  mocks.useItemApprovalsCalls = []
  mocks.visible = true
  mocks.discordOutcome = null
  mocks.username = 'gmhandle'
  asUser(GM)
  mocks.access = {
    groups: [group()],
    loading: false,
    error: null,
    createCampaign: vi.fn(async () => undefined),
    createGroup: vi.fn(async () => 'g-new'),
    setActiveCampaign: vi.fn(async () => undefined),
    deactivateCampaign: vi.fn(async () => undefined),
    deleteInactiveCampaign: vi.fn(async () => undefined),
    deleteDraftCampaign: vi.fn(async () => undefined),
    deleteGroup: vi.fn(async () => undefined),
    setError: vi.fn(),
  }
  mocks.characters = {
    characters: [{ id: 'ch1', name: 'Mirelda' }],
    charactersLoading: false,
    currentCharacterId: 'ch1',
    setCurrentCharacter: vi.fn(),
    selectedCharacterId: 'ch1',
    setSelectedCharacterId: vi.fn(),
    selectedCharacter: { id: 'ch1', name: 'Mirelda' },
    updateCharacter: vi.fn(),
    syncCharacterLocal: vi.fn(),
    deleteCharacter: vi.fn(),
    hasPendingWrite: vi.fn(),
  }
  mocks.approvals = {
    pendingRequests: [],
    approveRequest: vi.fn(async () => undefined),
    rejectRequest: vi.fn(async () => undefined),
  }
})

afterEach(() => {
  cleanup()
})

describe('GroupShell routes', () => {
  it('shows the group picker on /groups with the signed-in username and groups', async () => {
    await renderAt('/groups')

    expect(screen.getByTestId('GroupPicker')).toBeTruthy()
    expect(props('GroupPicker')).toMatchObject({ username: 'gmhandle', groups: mocks.access.groups, discordUserId: GM })
    expect(screen.queryByTestId('DemoBanner')).toBeNull()
    expect(shellTheme()).toBe('default')
  })

  it('shows the group picker for a group the user does not belong to', async () => {
    await renderAt('/groups/elsewhere')

    expect(screen.getByTestId('GroupPicker')).toBeTruthy()
    expect(screen.queryByTestId('GroupHome')).toBeNull()
  })

  it('shows the group picker inside a campaign route of an unknown group', async () => {
    await renderAt('/groups/elsewhere/campaigns/c1/maps')

    expect(screen.getByTestId('GroupPicker')).toBeTruthy()
  })

  it('shows the group home for a known group with no campaign in the route', async () => {
    await renderAt('/groups/g1')

    expect(screen.getByTestId('GroupHome')).toBeTruthy()
    expect(props('GroupHome')).toMatchObject({
      user: mocks.user,
      username: 'gmhandle',
      canInvite: true,
      group: (mocks.access.groups as GroupRecord[])[0],
    })
    expect(shellTheme()).toBe('default')
  })

  it('keeps the default theme on the group home of a VtM group', async () => {
    mocks.access.groups = [vtmGroup()]
    await renderAt('/groups/g1')

    expect(shellTheme()).toBe('default')
  })

  it('opens the campaign workspace on a campaign route', async () => {
    await renderAt('/groups/g1/campaigns/c1/maps')

    expect(sideNav()).toBeTruthy()
    expect(screen.getByTestId('MapsTab')).toBeTruthy()
    expect(shellTheme()).toBe('default')
  })

  it('switches the shell to the VtM theme inside a VtM campaign', async () => {
    mocks.access.groups = [vtmGroup()]
    await renderAt('/groups/g1/campaigns/c1/character')

    expect(shellTheme()).toBe('vtm')
  })

  it('finds a draft campaign by the route id', async () => {
    mocks.access.groups = [group({ drafts: [campaign({ id: 'd1', name: 'Draft Run', status: 'draft' })] })]
    await renderAt('/groups/g1/campaigns/d1/notes')

    expect(screen.getByRole('button', { name: 'Back to Home Boys' }).textContent).toBe('Draft Run')
    expect(props('NotesTab')).toEqual({ campaignId: 'd1', groupId: 'g1', role: 'gm' })
  })

  it('finds an inactive campaign by the route id', async () => {
    mocks.access.groups = [group({ activeCampaign: null, activeCampaignId: null, inactiveCampaigns: [campaign({ id: 'i1', name: 'Old Run', system: 'vtm' })] })]
    await renderAt('/groups/g1/campaigns/i1/character')

    expect(screen.getByRole('button', { name: 'Back to Home Boys' }).textContent).toBe('Old Run')
    expect(shellTheme()).toBe('vtm')
  })

  it('says there is no active campaign for an unknown campaign id', async () => {
    await renderAt('/groups/g1/campaigns/missing/character')

    expect(screen.getByRole('heading', { name: 'No Active Campaign' })).toBeTruthy()
    expect(screen.getByText('This group does not have an active campaign yet.')).toBeTruthy()
    expect(sideNav()).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull()
    expect(screen.queryByTestId('CliffhangerModal')).toBeNull()
    expect(screen.queryByTestId('TransferNotification')).toBeNull()
    expect(shellTheme()).toBe('default')
  })

  it('shows the loading state ahead of an access error inside a campaign route', async () => {
    mocks.access.loading = true
    mocks.access.error = 'Denied'
    await renderAt('/groups/g1/campaigns/c1/character')

    expect(screen.getByRole('heading', { name: 'Loading Campaign' })).toBeTruthy()
    expect(screen.getByText('Checking active campaign access...')).toBeTruthy()
    expect(sideNav()).toBeNull()
    expect(screen.getByTestId('CliffhangerModal')).toBeTruthy()
  })

  it('shows an access error inside a campaign route', async () => {
    mocks.access.error = 'Missing or insufficient permissions.'
    await renderAt('/groups/g1/campaigns/c1/character')

    expect(screen.getByRole('heading', { name: 'Access Error' })).toBeTruthy()
    expect(screen.getByText('Missing or insufficient permissions.')).toBeTruthy()
    expect(sideNav()).toBeNull()
  })

  it('redirects a VtM campaign off the tabs its system does not have', async () => {
    mocks.access.groups = [vtmGroup()]
    for (const tab of ['items', 'tables', 'rules']) {
      await renderAt(`/groups/g1/campaigns/c1/${tab}`)
      expect(probe.location).toBe('/groups/g1/campaigns/c1/character')
      cleanup()
    }
  })

  it('leaves an OSE campaign on any of its tabs', async () => {
    for (const tab of ['items', 'tables', 'rules', 'calendar']) {
      await renderAt(`/groups/g1/campaigns/c1/${tab}`)
      expect(probe.location).toBe(`/groups/g1/campaigns/c1/${tab}`)
      cleanup()
    }
  })

  it('treats a campaign route with no tab segment as the character tab', async () => {
    await renderAt('/groups/g1/campaigns/c1')

    expect(screen.getByTestId('CharacterTab')).toBeTruthy()
    expect(probe.location).toBe('/groups/g1/campaigns/c1')
  })
})

describe('GroupShell group picker actions', () => {
  it('opens the active campaign of a selected group on its character tab', async () => {
    await renderAt('/groups')
    await call('GroupPicker', 'onSelectGroup', 'g1')

    expect(probe.location).toBe('/groups/g1/campaigns/c1/character')
  })

  it('opens the home of a selected group that has no active campaign', async () => {
    mocks.access.groups = [group(), group({ id: 'g2', activeCampaign: null, activeCampaignId: null })]
    await renderAt('/groups')
    await call('GroupPicker', 'onSelectGroup', 'g2')

    expect(probe.location).toBe('/groups/g2')
  })

  it('opens the home path of a group id it does not know', async () => {
    await renderAt('/groups')
    await call('GroupPicker', 'onSelectGroup', 'nowhere')

    expect(probe.location).toBe('/groups/nowhere')
  })

  it('creates a group and opens its home', async () => {
    await renderAt('/groups')
    await call('GroupPicker', 'onCreateGroup', 'New Table')

    expect(mocks.access.createGroup).toHaveBeenCalledWith('New Table')
    expect(probe.location).toBe('/groups/g-new')
  })

  it('does not navigate when creating a group fails', async () => {
    (mocks.access.createGroup as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('nope'))
    await renderAt('/groups')
    await expect(call('GroupPicker', 'onCreateGroup', 'New Table')).rejects.toThrow('nope')

    expect(probe.location).toBe('/groups')
  })

  it('signs out and forgets the demo expiry', async () => {
    await renderAt('/groups')
    await call('GroupPicker', 'onSignOut')

    expect(mocks.forgetDemoExpiry).toHaveBeenCalledTimes(1)
    expect(mocks.signOut).toHaveBeenCalledWith({ name: 'auth-stub' })
  })
})

describe('GroupShell group home actions', () => {
  it('creates a campaign and returns to the group home', async () => {
    await renderAt('/groups/g1')
    await call('GroupHome', 'onCreateCampaign', 'g1', 'Next Run', 'vtm')

    expect(mocks.access.createCampaign).toHaveBeenCalledWith('g1', 'Next Run', 'vtm')
    expect(probe.location).toBe('/groups/g1')
  })

  it('sets and deactivates the active campaign without navigating', async () => {
    await renderAt('/groups/g1')
    await call('GroupHome', 'onSetActiveCampaign', 'g1', 'd1')
    await call('GroupHome', 'onDeactivateCampaign', 'g1', 'c1')

    expect(mocks.access.setActiveCampaign).toHaveBeenCalledWith('g1', 'd1')
    expect(mocks.access.deactivateCampaign).toHaveBeenCalledWith('g1', 'c1')
    expect(probe.location).toBe('/groups/g1')
  })

  it('deletes draft and inactive campaigns without leaving the group home', async () => {
    await renderAt('/groups/g1')
    await call('GroupHome', 'onDeleteDraftCampaign', 'g1', 'd1')
    await call('GroupHome', 'onDeleteInactiveCampaign', 'g1', 'i1')

    expect(mocks.access.deleteDraftCampaign).toHaveBeenCalledWith('g1', 'd1')
    expect(mocks.access.deleteInactiveCampaign).toHaveBeenCalledWith('g1', 'i1')
    expect(probe.location).toBe('/groups/g1')
  })

  it('deletes the group and returns to the picker', async () => {
    await renderAt('/groups/g1')
    await call('GroupHome', 'onDeleteGroup', 'g1')

    expect(mocks.access.deleteGroup).toHaveBeenCalledWith('g1')
    expect(probe.location).toBe('/groups')
  })

  it('goes back to the picker', async () => {
    await renderAt('/groups/g1')
    await call('GroupHome', 'onBackToGroups')

    expect(probe.location).toBe('/groups')
  })

  it('opens a chosen campaign on its character tab', async () => {
    await renderAt('/groups/g1')
    await call('GroupHome', 'onOpenCampaign', 'i9')

    expect(probe.location).toBe('/groups/g1/campaigns/i9/character')
  })

  it('opens the active campaign on its character tab', async () => {
    await renderAt('/groups/g1')
    await call('GroupHome', 'onOpenActiveCampaign')

    expect(probe.location).toBe('/groups/g1/campaigns/c1/character')
  })

  it('stays put when asked to open an active campaign the group does not have', async () => {
    mocks.access.groups = [group({ activeCampaign: null, activeCampaignId: null })]
    await renderAt('/groups/g1')
    await call('GroupHome', 'onOpenActiveCampaign')

    expect(probe.location).toBe('/groups/g1')
  })

  it('signs out from the group home', async () => {
    await renderAt('/groups/g1')
    await call('GroupHome', 'onSignOut')

    expect(mocks.forgetDemoExpiry).toHaveBeenCalledTimes(1)
    expect(mocks.signOut).toHaveBeenCalledTimes(1)
  })
})

describe('GroupShell demo visitor', () => {
  it('gives a demo visitor the stand-in name, no Discord and no invites, and a banner', async () => {
    asDemoVisitor()
    await renderAt('/groups/g1')

    expect(props('GroupHome')).toMatchObject({ username: 'Visitor', canInvite: false })
    expect(mocks.readDemoExpiry).toHaveBeenCalledWith('anon-1')
    expect(props('DemoBanner')).toMatchObject({ expiresAtMs: 1_800_000_000_000 })

    await call('DemoBanner', 'onLeave')
    expect(mocks.forgetDemoExpiry).toHaveBeenCalledTimes(1)
    expect(mocks.signOut).toHaveBeenCalledTimes(1)
  })

  it('withholds the Discord user id from the picker for a demo visitor', async () => {
    asDemoVisitor()
    await renderAt('/groups')

    expect(props('GroupPicker')).toMatchObject({ discordUserId: undefined, username: 'Visitor' })
  })

  it('hides the Discord panel inside the workspace for a demo visitor', async () => {
    asDemoVisitor()
    await renderAt('/groups/g1/campaigns/c1/character')

    expect(screen.queryByRole('button', { name: 'Discord' })).toBeNull()
    expect(screen.queryByTestId('DiscordConnection')).toBeNull()
    expect(screen.queryByTestId('DiscordReturnNotice')).toBeNull()
    expect(accountIdentity()).toBe('Username: Visitor, role: player')
    expect(screen.getByTestId('DemoBanner')).toBeTruthy()
  })

  it('does not read a demo expiry for an ordinary account', async () => {
    await renderAt('/groups')

    expect(mocks.readDemoExpiry).not.toHaveBeenCalled()
  })
})

describe('GroupShell side navigation', () => {
  it('renders the GM side navigation for an OSE campaign', async () => {
    await renderAt('/groups/g1/campaigns/c1/maps')

    expect(markup(sideNav())).toMatchInlineSnapshot(`
      "<nav
        aria-label="Campaign"
        class="side-nav"
      >
        <h1
          class="side-title"
        >
          <span
            class="vtm-fang-anchor"
          >
            Table
          </span>
          <img
            alt=""
            aria-hidden="true"
            class="side-title-logo"
            src="/logo/Tower%20Keep.svg"
          />
          <span
            class="vtm-fang-anchor"
          >
            Keep
          </span>
        </h1>
        <p
          class="side-meta"
        >
          Home Boys
        </p>
        <button
          aria-label="Back to Home Boys"
          class="side-campaign-back"
          type="button"
        >
          <svg
            aria-hidden="true"
            class="lucide lucide-chevron-left"
            fill="none"
            height="16"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            viewBox="0 0 24 24"
            width="16"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="m15 18-6-6 6-6"
            />
          </svg>
          <span>
            The Black Wyrm
          </span>
        </button>
        <div
          class="nav-list"
        >
          <a
            class="tab-button"
            data-discover="true"
            href="/groups/g1/campaigns/c1/character"
          >
            <span
              class="tab-label"
              data-label="Characters"
            >
              Characters
            </span>
          </a>
          <a
            aria-current="page"
            class="tab-button active"
            data-discover="true"
            href="/groups/g1/campaigns/c1/maps"
          >
            <span
              class="tab-label"
              data-label="Maps"
            >
              Maps
            </span>
          </a>
          <a
            class="tab-button"
            data-discover="true"
            href="/groups/g1/campaigns/c1/monsters"
          >
            <span
              class="tab-label"
              data-label="Monsters"
            >
              Monsters
            </span>
          </a>
          <a
            class="tab-button"
            data-discover="true"
            href="/groups/g1/campaigns/c1/items"
          >
            <span
              class="tab-label"
              data-label="Items"
            >
              Items
            </span>
          </a>
          <a
            class="tab-button"
            data-discover="true"
            href="/groups/g1/campaigns/c1/npcs"
          >
            <span
              class="tab-label"
              data-label="NPCs"
            >
              NPCs
            </span>
          </a>
          <a
            class="tab-button"
            data-discover="true"
            href="/groups/g1/campaigns/c1/tables"
          >
            <span
              class="tab-label"
              data-label="Tables"
            >
              Tables
            </span>
          </a>
          <a
            class="tab-button"
            data-discover="true"
            href="/groups/g1/campaigns/c1/notes"
          >
            <span
              class="tab-label"
              data-label="Notes"
            >
              Notes
            </span>
          </a>
          <a
            class="tab-button"
            data-discover="true"
            href="/groups/g1/campaigns/c1/handouts"
          >
            <span
              class="tab-label"
              data-label="Handouts"
            >
              Handouts
            </span>
          </a>
          <a
            class="tab-button"
            data-discover="true"
            href="/groups/g1/campaigns/c1/calendar"
          >
            <span
              class="tab-label"
              data-label="Calendar"
            >
              Calendar
            </span>
          </a>
          <a
            class="tab-button"
            href="https://oldschoolessentials.necroticgnome.com/srd/index.php/Main_Page"
            rel="noreferrer noopener"
            target="_blank"
          >
            <span
              class="tab-label"
              data-label="OSE SRD"
            >
              OSE SRD
            </span>
          </a>
        </div>
        <div
          class="account-panel"
        >
          <p
            class="account-email account-identity"
          >
            <span
              class="sr-only"
            >
              Username: 
            </span>
            <span
              class="account-username"
            >
              gmhandle
            </span>
            <span
              class="sr-only"
            >
              , role: 
            </span>
            <span
              class="account-role"
            >
              gm
            </span>
          </p>
          <div
            class="account-actions"
          >
            <button
              aria-label="Discord"
              class="account-action"
              title="Discord"
              type="button"
            >
              <svg
                aria-hidden="true"
                class="lucide lucide-messages-square"
                fill="none"
                height="16"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                viewBox="0 0 24 24"
                width="16"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"
                />
                <path
                  d="M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1"
                />
              </svg>
            </button>
            <button
              aria-label="Campaign settings"
              class="account-action"
              title="Campaign settings"
              type="button"
            >
              <svg
                aria-hidden="true"
                class="lucide lucide-settings"
                fill="none"
                height="16"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                viewBox="0 0 24 24"
                width="16"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="3"
                />
              </svg>
            </button>
            <button
              aria-label="Sign out"
              class="account-action"
              title="Sign out"
              type="button"
            >
              <svg
                aria-hidden="true"
                class="lucide lucide-log-out"
                fill="none"
                height="16"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                viewBox="0 0 24 24"
                width="16"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="m16 17 5-5-5-5"
                />
                <path
                  d="M21 12H9"
                />
                <path
                  d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
                />
              </svg>
            </button>
          </div>
        </div>
      </nav>"
    `)
    expect(screen.queryByTestId('DiscordConnection')).toBeNull()
  })

  it('hides the GM-only OSE tabs from a player and labels the sheet in the singular', async () => {
    asUser(PLAYER)
    await renderAt('/groups/g1/campaigns/c1/character')

    expect(navLinks()).toEqual([
      ['Character', '/groups/g1/campaigns/c1/character', 'tab-button active'],
      ['Maps', '/groups/g1/campaigns/c1/maps', 'tab-button'],
      ['NPCs', '/groups/g1/campaigns/c1/npcs', 'tab-button'],
      ['Notes', '/groups/g1/campaigns/c1/notes', 'tab-button'],
      ['Handouts', '/groups/g1/campaigns/c1/handouts', 'tab-button'],
      ['Calendar', '/groups/g1/campaigns/c1/calendar', 'tab-button'],
      ['OSE SRD', SRD, 'tab-button'],
    ])
    expect(accountIdentity()).toBe('Username: gmhandle, role: player')
    expect(screen.queryByRole('button', { name: 'Campaign settings' })).toBeNull()
  })

  it('shows the VtM tabs, including monsters, to a player', async () => {
    asUser(PLAYER)
    mocks.access.groups = [vtmGroup()]
    await renderAt('/groups/g1/campaigns/c1/character')

    expect(navLinks().map(([label]) => label)).toEqual(['Character', 'Maps', 'Monsters', 'NPCs', 'Notes', 'Handouts', 'Calendar'])
  })

  it('shows the VtM tabs to the GM', async () => {
    mocks.access.groups = [vtmGroup()]
    await renderAt('/groups/g1/campaigns/c1/character')

    expect(navLinks().map(([label]) => label)).toEqual(['Characters', 'Maps', 'Monsters', 'NPCs', 'Notes', 'Handouts', 'Calendar'])
  })

  it('shows only the enabled tabs, in system order', async () => {
    mocks.access.groups = [group({ activeCampaign: campaign({ enabledTabs: ['rules', 'notes', 'items', 'maps'] }) })]
    await renderAt('/groups/g1/campaigns/c1/notes')

    expect(navLinks().map(([label]) => label)).toEqual(['Maps', 'Items', 'Notes', 'Handouts', 'OSE SRD'])
  })

  it('applies the player filter after the enabled tabs', async () => {
    asUser(PLAYER)
    mocks.access.groups = [group({ activeCampaign: campaign({ enabledTabs: ['items', 'tables', 'npcs'] }) })]
    await renderAt('/groups/g1/campaigns/c1/npcs')

    expect(navLinks().map(([label]) => label)).toEqual(['NPCs', 'Handouts'])
  })

  it('drops enabled tabs the VtM system does not have', async () => {
    mocks.access.groups = [group({ activeCampaign: campaign({ system: 'vtm', enabledTabs: ['items', 'rules', 'npcs'] }) })]
    await renderAt('/groups/g1/campaigns/c1/npcs')

    expect(navLinks().map(([label]) => label)).toEqual(['NPCs', 'Handouts'])
  })

  it('keeps the required Handouts tab for an empty enabled list', async () => {
    mocks.access.groups = [group({ activeCampaign: campaign({ enabledTabs: [] }) })]
    await renderAt('/groups/g1/campaigns/c1/notes')

    expect(navLinks()).toEqual([['Handouts', '/groups/g1/campaigns/c1/handouts', 'tab-button']])
  })

  it('keeps the sidebar beside the page, with no toggle or backdrop', async () => {
    await renderAt('/groups/g1/campaigns/c1/maps')

    const layout = Array.from(document.querySelector('.shell-layout')?.children ?? []).map((child) => child.tagName.toLowerCase())
    expect(layout).toEqual(['nav', 'section'])
    expect(sideNav().className).toBe('side-nav')
    expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull()
    expect(document.querySelector('.phone-nav-bar, .side-drawer, .drawer-backdrop')).toBeNull()
  })

  it('keeps the sidebar and moves to the tab when a tab is chosen', async () => {
    await renderAt('/groups/g1/campaigns/c1/maps')
    fireEvent.click(screen.getByRole('link', { name: 'Notes' }))

    expect(probe.location).toBe('/groups/g1/campaigns/c1/notes')
    expect(sideNav().className).toBe('side-nav')
    expect(screen.getByRole('link', { name: 'Notes' }).className).toBe('tab-button active')
  })

  it('keeps the page and the sidebar when the rules link is chosen', async () => {
    await renderAt('/groups/g1/campaigns/c1/maps')
    const rules = screen.getByRole('link', { name: 'OSE SRD' })
    rules.addEventListener('click', (event) => event.preventDefault())
    fireEvent.click(rules)

    expect(sideNav().className).toBe('side-nav')
    expect(probe.location).toBe('/groups/g1/campaigns/c1/maps')
  })

  describe('on a phone', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('shows a bar with the open tab instead of the sidebar', async () => {
      asPhone()
      await renderAt('/groups/g1/campaigns/c1/maps')

      const layout = Array.from(document.querySelector('.shell-layout')?.children ?? []).map((child) => child.className)
      expect(layout).toEqual(['phone-nav-bar', 'side-drawer', contentPanel().className])
      expect(document.querySelector('.phone-nav-title')?.textContent).toBe('Maps')
      expect(drawer().open).toBe(false)
      expect(screen.getByRole('button', { name: 'Open navigation' }).getAttribute('aria-expanded')).toBe('false')
    })

    it('opens the drawer from the bar and closes it from its close button and its backdrop', async () => {
      asPhone()
      await renderAt('/groups/g1/campaigns/c1/maps')
      const toggle = screen.getByRole('button', { name: 'Open navigation' })

      fireEvent.click(toggle)
      expect(drawer().open).toBe(true)
      expect(toggle.getAttribute('aria-expanded')).toBe('true')
      expect(within(drawer()).getByRole('navigation', { name: 'Campaign' })).toBeTruthy()

      fireEvent.click(within(drawer()).getByRole('button', { name: 'Close navigation' }))
      expect(drawer().open).toBe(false)
      expect(toggle.getAttribute('aria-expanded')).toBe('false')

      fireEvent.click(toggle)
      fireEvent.click(within(drawer()).getByRole('navigation', { name: 'Campaign' }))
      expect(drawer().open).toBe(true)
      fireEvent.click(drawer())
      expect(drawer().open).toBe(false)
    })

    it('closes the drawer and moves to the tab when a tab is chosen', async () => {
      asPhone()
      await renderAt('/groups/g1/campaigns/c1/maps')
      fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
      fireEvent.click(within(drawer()).getByRole('link', { name: 'Notes' }))

      expect(probe.location).toBe('/groups/g1/campaigns/c1/notes')
      expect(drawer().open).toBe(false)
      expect(document.querySelector('.phone-nav-title')?.textContent).toBe('Notes')
    })

    it('closes the drawer when the rules link is chosen', async () => {
      asPhone()
      await renderAt('/groups/g1/campaigns/c1/maps')
      fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
      const rules = within(drawer()).getByRole('link', { name: 'OSE SRD' })
      rules.addEventListener('click', (event) => event.preventDefault())
      fireEvent.click(rules)

      expect(drawer().open).toBe(false)
      expect(probe.location).toBe('/groups/g1/campaigns/c1/maps')
    })

    it('closes the drawer before opening the campaign settings', async () => {
      asPhone()
      await renderAt('/groups/g1/campaigns/c1/maps')
      fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
      fireEvent.click(within(drawer()).getByRole('button', { name: 'Campaign settings' }))

      expect(drawer().open).toBe(false)
      expect(screen.getByTestId('CampaignSettingsModal')).toBeTruthy()
    })
  })

  it('goes back to the group home from the campaign name', async () => {
    await renderAt('/groups/g1/campaigns/c1/maps')
    fireEvent.click(screen.getByRole('button', { name: 'Back to Home Boys' }))

    expect(probe.location).toBe('/groups/g1')
  })

  it('opens and closes the campaign settings for the GM', async () => {
    await renderAt('/groups/g1/campaigns/c1/maps')
    expect(screen.queryByTestId('CampaignSettingsModal')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Campaign settings' }))
    expect(props('CampaignSettingsModal')).toMatchObject({ groupId: 'g1', campaign: (mocks.access.groups as GroupRecord[])[0].activeCampaign })

    await call('CampaignSettingsModal', 'onClose')
    expect(screen.queryByTestId('CampaignSettingsModal')).toBeNull()
  })

  it('opens the Discord connection from the sidebar and closes it again', async () => {
    await renderAt('/groups/g1/campaigns/c1/maps')
    expect(screen.queryByRole('heading', { name: 'Discord' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Discord' }))
    expect(screen.getByRole('heading', { name: 'Discord' })).toBeTruthy()
    expect(props('DiscordConnection')).toEqual({ userId: GM, variant: 'panel' })
    expect(props('DiscordReturnNotice')).toEqual({ variant: 'panel' })

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('heading', { name: 'Discord' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Discord' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('DiscordConnection')).toBeNull()
  })

  it('opens the Discord connection by itself for someone just back from Discord', async () => {
    mocks.discordOutcome = 'connected'
    await renderAt('/groups/g1/campaigns/c1/maps')

    expect(screen.getByRole('heading', { name: 'Discord' })).toBeTruthy()
    expect(screen.getByTestId('DiscordReturnNotice')).toBeTruthy()
  })

  it('never opens the Discord connection for a demo visitor', async () => {
    mocks.discordOutcome = 'connected'
    asDemoVisitor()
    await renderAt('/groups/g1/campaigns/c1/maps')

    expect(screen.queryByRole('heading', { name: 'Discord' })).toBeNull()
  })

  it('signs out from the side navigation', async () => {
    await renderAt('/groups/g1/campaigns/c1/maps')
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(mocks.forgetDemoExpiry).toHaveBeenCalledTimes(1)
    expect(mocks.signOut).toHaveBeenCalledTimes(1)
  })
})

describe('GroupShell tab content', () => {
  const characterTabProps = (role: string, uid: string) => ({
    campaignId: 'c1',
    groupId: 'g1',
    gmUserId: GM,
    currentUserId: uid,
    currentUsername: 'gmhandle',
    role,
    ...mocks.characters,
  })

  it('gives the OSE character tab the shared character state', async () => {
    await renderAt('/groups/g1/campaigns/c1/character')

    expect(contentPanel().className).toBe('content-panel sidebar-panel')
    expect(props('CharacterTab')).toEqual(characterTabProps('gm', GM))
    expect(screen.queryByTestId('VtmCharacterTab')).toBeNull()
  })

  it('gives the character tab a null GM when the campaign has none', async () => {
    asUser(PLAYER)
    mocks.access.groups = [group({ activeCampaign: campaign({ gmUserId: undefined }) })]
    await renderAt('/groups/g1/campaigns/c1/character')

    expect(props('CharacterTab')).toMatchObject({ gmUserId: null, role: 'player', currentUserId: PLAYER })
  })

  it('renders the VtM character tab for a VtM campaign', async () => {
    mocks.access.groups = [vtmGroup()]
    await renderAt('/groups/g1/campaigns/c1/character')

    expect(props('VtmCharacterTab')).toEqual({
      campaignId: 'c1',
      groupId: 'g1',
      role: 'gm',
      currentUserId: GM,
      currentUsername: 'gmhandle',
      gmUserId: GM,
      setError: mocks.access.setError,
    })
    expect(screen.queryByTestId('CharacterTab')).toBeNull()
  })

  it('gives the VtM character tab a null GM when the campaign has none', async () => {
    mocks.access.groups = [group({ activeCampaign: campaign({ system: 'vtm', gmUserId: null }) })]
    await renderAt('/groups/g1/campaigns/c1/character')

    expect(props('VtmCharacterTab')).toMatchObject({ gmUserId: null, role: 'player' })
  })

  it('passes the character state to the OSE maps tab only', async () => {
    await renderAt('/groups/g1/campaigns/c1/maps')
    expect(props('MapsTab')).toEqual({
      campaignId: 'c1',
      groupId: 'g1',
      role: 'gm',
      gmUserId: GM,
      characterTabProps: characterTabProps('gm', GM),
    })
    cleanup()

    mocks.access.groups = [group({ activeCampaign: campaign({ system: 'vtm', gmUserId: null }) })]
    await renderAt('/groups/g1/campaigns/c1/maps')
    expect(props('MapsTab')).toEqual({ campaignId: 'c1', groupId: 'g1', role: 'player', gmUserId: null, characterTabProps: undefined })
  })

  it('shows monsters to the GM, and to VtM players, but not to OSE players', async () => {
    await renderAt('/groups/g1/campaigns/c1/monsters')
    expect(props('MonstersTab')).toEqual({ campaignId: 'c1', groupId: 'g1', role: 'gm' })
    cleanup()

    asUser(PLAYER)
    await renderAt('/groups/g1/campaigns/c1/monsters')
    expect(screen.queryByTestId('MonstersTab')).toBeNull()
    expect(contentPanel().className).toBe('content-panel sidebar-panel')
    expect(contentPanel().childElementCount).toBe(0)
    cleanup()

    mocks.access.groups = [vtmGroup()]
    await renderAt('/groups/g1/campaigns/c1/monsters')
    expect(props('MonstersTab')).toEqual({ campaignId: 'c1', groupId: 'g1', role: 'player' })
  })

  it('shows items and tables to the GM only', async () => {
    await renderAt('/groups/g1/campaigns/c1/items')
    expect(props('ItemsTab')).toEqual({ campaignId: 'c1', groupId: 'g1', role: 'gm', characters: mocks.characters.characters })
    cleanup()

    await renderAt('/groups/g1/campaigns/c1/tables')
    expect(props('TablesTab')).toEqual({ campaignId: 'c1', groupId: 'g1' })
    expect(contentPanel().className).toBe('content-panel sidebar-panel')
    cleanup()

    asUser(PLAYER)
    await renderAt('/groups/g1/campaigns/c1/items')
    expect(screen.queryByTestId('ItemsTab')).toBeNull()
    expect(contentPanel().childElementCount).toBe(0)
    cleanup()

    await renderAt('/groups/g1/campaigns/c1/tables')
    expect(screen.queryByTestId('TablesTab')).toBeNull()
    expect(contentPanel().childElementCount).toBe(0)
  })

  it('renders the NPC, notes and calendar tabs for any role', async () => {
    asUser(PLAYER)
    await renderAt('/groups/g1/campaigns/c1/npcs')
    expect(props('NpcsTab')).toEqual({ campaignId: 'c1', groupId: 'g1', role: 'player' })
    expect(contentPanel().className).toBe('content-panel sidebar-panel')
    cleanup()

    await renderAt('/groups/g1/campaigns/c1/notes')
    expect(props('NotesTab')).toEqual({ campaignId: 'c1', groupId: 'g1', role: 'player' })
    expect(contentPanel().className).toBe('content-panel sidebar-panel')
    cleanup()

    await renderAt('/groups/g1/campaigns/c1/calendar')
    expect(props('CalendarTab')).toEqual({ campaignId: 'c1', groupId: 'g1', role: 'player' })
    expect(contentPanel().className).toBe('content-panel')
  })

  it('renders the rules tab on the rules route', async () => {
    await renderAt('/groups/g1/campaigns/c1/rules')

    expect(screen.getByTestId('RulesTab')).toBeTruthy()
    expect(props('RulesTab')).toEqual({})
    expect(contentPanel().className).toBe('content-panel')
  })
})

describe('GroupShell subscriptions', () => {
  it('subscribes to characters only for a visible OSE character, maps or items tab', async () => {
    for (const tab of ['character', 'maps', 'items']) {
      await renderAt(`/groups/g1/campaigns/c1/${tab}`)
      expect(lastCharactersCall()).toEqual(['c1', 'g1', GM, 'gmhandle', 'gm', GM, mocks.access.setError, true])
      cleanup()
    }
    for (const tab of ['monsters', 'npcs', 'tables', 'notes', 'calendar', 'rules']) {
      await renderAt(`/groups/g1/campaigns/c1/${tab}`)
      expect(lastCharactersCall()?.[7]).toBe(false)
      cleanup()
    }
  })

  it('does not subscribe to characters while the page is hidden', async () => {
    mocks.visible = false
    await renderAt('/groups/g1/campaigns/c1/character')

    expect(lastCharactersCall()?.[7]).toBe(false)
  })

  it('does not subscribe to OSE characters inside a VtM campaign', async () => {
    mocks.access.groups = [vtmGroup()]
    await renderAt('/groups/g1/campaigns/c1/character')

    expect(lastCharactersCall()?.[7]).toBe(false)
  })

  it('subscribes for the group active campaign while on the group home', async () => {
    asUser(PLAYER)
    await renderAt('/groups/g1')

    expect(lastCharactersCall()).toEqual(['c1', 'g1', PLAYER, 'gmhandle', 'player', GM, mocks.access.setError, true])
    expect(lastApprovalsCall()).toEqual(['c1', 'g1', 'player', PLAYER, true])
  })

  it('subscribes to nothing on the picker', async () => {
    await renderAt('/groups')

    expect(lastCharactersCall()).toEqual([null, null, GM, 'gmhandle', null, null, mocks.access.setError, true])
    expect(lastApprovalsCall()).toEqual([null, null, null, GM, true])
  })

  it('passes a null GM to the character hook when the campaign has none', async () => {
    mocks.access.groups = [group({ activeCampaign: campaign({ gmUserId: undefined }) })]
    await renderAt('/groups/g1/campaigns/c1/character')

    expect(lastCharactersCall()).toEqual(['c1', 'g1', GM, 'gmhandle', 'player', null, mocks.access.setError, true])
  })

  it('listens for approvals as GM on any tab, and as a player on the character tab', async () => {
    await renderAt('/groups/g1/campaigns/c1/notes')
    expect(lastApprovalsCall()).toEqual(['c1', 'g1', 'gm', GM, true])
    cleanup()

    asUser(PLAYER)
    await renderAt('/groups/g1/campaigns/c1/notes')
    expect(lastApprovalsCall()).toEqual(['c1', 'g1', 'player', PLAYER, false])
    cleanup()

    await renderAt('/groups/g1/campaigns/c1/character')
    expect(lastApprovalsCall()).toEqual(['c1', 'g1', 'player', PLAYER, true])
    cleanup()

    mocks.visible = false
    await renderAt('/groups/g1/campaigns/c1/character')
    expect(lastApprovalsCall()).toEqual(['c1', 'g1', 'player', PLAYER, false])
  })

  it('shows transfer notifications on a visible character or maps tab', async () => {
    for (const tab of ['character', 'maps']) {
      await renderAt(`/groups/g1/campaigns/c1/${tab}`)
      expect(props('TransferNotification')).toEqual({
        campaignId: 'c1',
        groupId: 'g1',
        currentUserId: GM,
        role: 'gm',
        characters: mocks.characters.characters,
        carrying: oseCarrying,
      })
      cleanup()
    }
    for (const tab of ['notes', 'npcs']) {
      await renderAt(`/groups/g1/campaigns/c1/${tab}`)
      expect(screen.queryByTestId('TransferNotification')).toBeNull()
      cleanup()
    }
    mocks.visible = false
    await renderAt('/groups/g1/campaigns/c1/maps')
    expect(screen.queryByTestId('TransferNotification')).toBeNull()
  })

  it('enables the cliffhanger modal off the notes tab while the page is visible', async () => {
    await renderAt('/groups/g1/campaigns/c1/maps')
    expect(props('CliffhangerModal')).toEqual({ campaignId: 'c1', groupId: 'g1', userId: GM, enabled: true })
    cleanup()

    await renderAt('/groups/g1/campaigns/c1/notes')
    expect(props('CliffhangerModal')).toMatchObject({ enabled: false })
    cleanup()

    mocks.visible = false
    await renderAt('/groups/g1/campaigns/c1/maps')
    expect(props('CliffhangerModal')).toMatchObject({ enabled: false })
  })

  it('renders the workspace overlays in order after the shell layout', async () => {
    mocks.approvals.pendingRequests = [rerollRequest()]
    await renderAt('/groups/g1/campaigns/c1/maps')
    fireEvent.click(screen.getByRole('button', { name: 'Campaign settings' }))

    const order = Array.from(document.querySelector('main.shell-root')?.children ?? []).map((child) => (
      child.getAttribute('data-testid') ?? child.className
    ))
    expect(order).toEqual(['shell-layout', 'confirm-overlay', 'TransferNotification', 'CliffhangerModal', 'CampaignSettingsModal'])
  })
})

const item = (overrides: Record<string, unknown>): CharacterInventoryItem => ({
  id: 'it1',
  typeId: 'sword',
  typeName: 'Sword',
  costGp: 0,
  equipped: false,
  notes: '',
  qty: 1,
  stack: 'single',
  ...overrides,
}) as unknown as CharacterInventoryItem

const request = (overrides: Partial<ItemApprovalRequest>): ItemApprovalRequest => ({
  id: 'r1',
  action: 'create',
  campaignId: 'c1',
  characterId: 'ch1',
  characterName: 'Mirelda',
  requestedByUserId: PLAYER,
  requestedByUsername: 'playerone',
  status: 'pending',
  createdAt: null,
  ...overrides,
})

const rerollRequest = () => request({ action: 'ability_reroll' })

const weapon = (overrides: Record<string, unknown> = {}) => item({
  kind: 'weapon',
  name: 'Fang',
  costGp: 15,
  isMagic: true,
  damageDiceCount: '1',
  damageDiceSides: '8',
  attackBonus: '1',
  damageBonus: '2',
  rangeShort: '10',
  rangeMedium: '20',
  rangeLong: '30',
  slow: false,
  twoHanded: true,
  description: 'Hums near dragons.',
  notes: 'Taken from the cave.',
  ...overrides,
})

const armour = (overrides: Record<string, unknown> = {}) => item({
  kind: 'armour',
  typeName: 'Shield',
  isMagic: true,
  armourClass: '1',
  shieldMod: '0',
  magicMod: '1',
  armourType: 'shield',
  ...overrides,
})

async function renderApprovals(...requests: ItemApprovalRequest[]) {
  mocks.approvals.pendingRequests = requests
  await renderAt('/groups/g1/campaigns/c1/notes')
  return screen.queryByRole('dialog')
}

describe('GroupShell approval requests', () => {
  it('shows nothing without pending requests', async () => {
    expect(await renderApprovals()).toBeNull()
  })

  it('shows nothing to a player even with pending requests', async () => {
    asUser(PLAYER)
    expect(await renderApprovals(rerollRequest())).toBeNull()
  })

  it('asks the GM about an ability re-roll', async () => {
    const dialog = await renderApprovals(rerollRequest())

    expect(markup(dialog as Element)).toMatchInlineSnapshot(`
      "<div
        aria-modal="true"
        class="confirm-overlay"
        role="dialog"
      >
        <div
          class="confirm-modal"
        >
          <h3>
            Ability Re-roll Request
          </h3>
          <p>
            <strong>
              playerone
            </strong>
             wants to re-roll ability scores for 
            <strong>
              Mirelda
            </strong>
            .
          </p>
          <div
            class="confirm-actions"
          >
            <button
              class="confirm-danger"
              type="button"
            >
              Reject
            </button>
            <button
              type="button"
            >
              Approve
            </button>
          </div>
        </div>
      </div>"
    `)
  })

  it('asks the GM about transcribing several spells', async () => {
    const dialog = await renderApprovals(request({ action: 'learn_spell', spellNames: ['Sleep', 'Light'] }), rerollRequest(), rerollRequest())

    expect(markup(dialog as Element)).toMatchInlineSnapshot(`
      "<div
        aria-modal="true"
        class="confirm-overlay"
        role="dialog"
      >
        <div
          class="confirm-modal"
        >
          <h3>
            Spell Transcription Request
          </h3>
          <p>
            <strong>
              playerone
            </strong>
             wants to transcribe spell
            s
             into 
            <strong>
              Mirelda
            </strong>
            's spell book:
          </p>
          <p
            style="margin: 8px 0px; font-weight: 600;"
          >
            Sleep, Light
          </p>
          <div
            class="confirm-actions"
          >
            <button
              class="confirm-danger"
              type="button"
            >
              Reject
            </button>
            <button
              type="button"
            >
              Approve
            </button>
          </div>
          <p
            style="margin-top: 8px; font-size: 0.85em; opacity: 0.7;"
          >
            +
            2
             more pending
          </p>
        </div>
      </div>"
    `)
  })

  it('asks the GM about transcribing one spell', async () => {
    const dialog = await renderApprovals(request({ action: 'learn_spell', spellNames: ['Sleep'] }))

    expect(within(dialog as HTMLElement).getByRole('heading').textContent).toBe('Spell Transcription Request')
    expect((dialog as HTMLElement).textContent).toContain('wants to transcribe spell into Mirelda\'s spell book:')
    expect((dialog as HTMLElement).textContent).toContain('Sleep')
  })

  it('says no spell names were given for a spell request without them', async () => {
    const dialog = await renderApprovals(request({ action: 'learn_spell' }))

    expect((dialog as HTMLElement).textContent).toContain('wants to transcribe spells into')
    expect(within(dialog as HTMLElement).getByText('(No spell names provided)')).toBeTruthy()
  })

  it('asks the GM about adding a magic weapon with every detail', async () => {
    const dialog = await renderApprovals(request({ item: weapon() }), rerollRequest())

    expect(markup(dialog as Element)).toMatchInlineSnapshot(`
      "<div
        aria-modal="true"
        class="confirm-overlay"
        role="dialog"
      >
        <div
          class="confirm-modal"
        >
          <h3>
            Item Approval Request
          </h3>
          <p>
            <strong>
              playerone
            </strong>
             wants to 
            add
             
            a 
            <strong>
              weapon
            </strong>
             
            to
             
            <strong>
              Mirelda
            </strong>
            :
          </p>
          <p
            style="margin: 8px 0px; font-weight: 600;"
          >
            Sword "Fang"
          </p>
          <p>
            Cost: 15 gp
          </p>
          <p
            style="font-size: 0.9em;"
          >
            Damage: 
            1
            d
            8
             | Atk +1
             | Dmg +2
             | Range 10/20/30
             | Two-handed
             | Magic
          </p>
          <p
            style="font-size: 0.9em; opacity: 0.8;"
          >
            Hums near dragons.
          </p>
          <p
            style="font-size: 0.9em; opacity: 0.8;"
          >
            Taken from the cave.
          </p>
          <div
            class="confirm-actions"
          >
            <button
              class="confirm-danger"
              type="button"
            >
              Reject
            </button>
            <button
              type="button"
            >
              Approve
            </button>
          </div>
          <p
            style="margin-top: 8px; font-size: 0.85em; opacity: 0.7;"
          >
            +
            1
             more pending
          </p>
        </div>
      </div>"
    `)
  })

  it('asks the GM about selling a plain weapon', async () => {
    const dialog = await renderApprovals(request({
      action: 'sell',
      item: weapon({ name: '', isMagic: false, twoHanded: false, attackBonus: '0', damageBonus: '', rangeShort: '0', description: '', notes: '' }),
    }))

    expect(markup(dialog as Element)).toMatchInlineSnapshot(`
      "<div
        aria-modal="true"
        class="confirm-overlay"
        role="dialog"
      >
        <div
          class="confirm-modal"
        >
          <h3>
            Sell Approval Request
          </h3>
          <p>
            <strong>
              playerone
            </strong>
             wants to 
            sell
             
            a 
            <strong>
              weapon
            </strong>
             
            from
             
            <strong>
              Mirelda
            </strong>
            :
          </p>
          <p
            style="margin: 8px 0px; font-weight: 600;"
          >
            Sword
          </p>
          <p>
            Sell for: 15 gp
          </p>
          <p
            style="font-size: 0.9em;"
          >
            Damage: 
            1
            d
            8
          </p>
          <div
            class="confirm-actions"
          >
            <button
              class="confirm-danger"
              type="button"
            >
              Reject
            </button>
            <button
              type="button"
            >
              Approve
            </button>
          </div>
        </div>
      </div>"
    `)
  })

  it('describes a magic shield', async () => {
    const dialog = await renderApprovals(request({ item: armour() }))

    expect(markup(dialog as Element)).toMatchInlineSnapshot(`
      "<div
        aria-modal="true"
        class="confirm-overlay"
        role="dialog"
      >
        <div
          class="confirm-modal"
        >
          <h3>
            Item Approval Request
          </h3>
          <p>
            <strong>
              playerone
            </strong>
             wants to 
            add
             
            a 
            <strong>
              armour
            </strong>
             
            to
             
            <strong>
              Mirelda
            </strong>
            :
          </p>
          <p
            style="margin: 8px 0px; font-weight: 600;"
          >
            Shield
          </p>
          <p
            style="font-size: 0.9em;"
          >
            AC: 
            1
             (Shield)
             | Magic +1
             | Magic
          </p>
          <div
            class="confirm-actions"
          >
            <button
              class="confirm-danger"
              type="button"
            >
              Reject
            </button>
            <button
              type="button"
            >
              Approve
            </button>
          </div>
        </div>
      </div>"
    `)
  })

  it('describes plain body armour sold for nothing', async () => {
    const dialog = await renderApprovals(request({ action: 'sell', item: armour({ typeName: 'Chain', armourType: 'body', magicMod: '0', isMagic: false, armourClass: '5' }) }))

    expect(markup(dialog as Element)).toMatchInlineSnapshot(`
      "<div
        aria-modal="true"
        class="confirm-overlay"
        role="dialog"
      >
        <div
          class="confirm-modal"
        >
          <h3>
            Sell Approval Request
          </h3>
          <p>
            <strong>
              playerone
            </strong>
             wants to 
            sell
             
            a 
            <strong>
              armour
            </strong>
             
            from
             
            <strong>
              Mirelda
            </strong>
            :
          </p>
          <p
            style="margin: 8px 0px; font-weight: 600;"
          >
            Chain
          </p>
          <p
            style="font-size: 0.9em;"
          >
            AC: 
            5
             (Body)
          </p>
          <div
            class="confirm-actions"
          >
            <button
              class="confirm-danger"
              type="button"
            >
              Reject
            </button>
            <button
              type="button"
            >
              Approve
            </button>
          </div>
        </div>
      </div>"
    `)
  })

  it('shows the quantity of ammunition and consumables only', async () => {
    let dialog = await renderApprovals(request({ item: item({ kind: 'ammunition', typeName: 'Arrows', qty: 20 }) }))
    expect((dialog as HTMLElement).textContent).toContain('Qty: 20')
    cleanup()

    dialog = await renderApprovals(request({ item: item({ kind: 'consumable', typeName: 'Torch', qty: 6 }) }))
    expect((dialog as HTMLElement).textContent).toContain('Qty: 6')
    cleanup()

    dialog = await renderApprovals(request({ item: item({ kind: 'general', typeName: 'Rope', qty: 3 }) }))
    expect(markup(dialog as Element)).toMatchInlineSnapshot(`
      "<div
        aria-modal="true"
        class="confirm-overlay"
        role="dialog"
      >
        <div
          class="confirm-modal"
        >
          <h3>
            Item Approval Request
          </h3>
          <p>
            <strong>
              playerone
            </strong>
             wants to 
            add
             
            a 
            <strong>
              general
            </strong>
             
            to
             
            <strong>
              Mirelda
            </strong>
            :
          </p>
          <p
            style="margin: 8px 0px; font-weight: 600;"
          >
            Rope
          </p>
          <div
            class="confirm-actions"
          >
            <button
              class="confirm-danger"
              type="button"
            >
              Reject
            </button>
            <button
              type="button"
            >
              Approve
            </button>
          </div>
        </div>
      </div>"
    `)
  })

  it('leaves the stats off a weapon or armour item missing its stat fields', async () => {
    let dialog = await renderApprovals(request({ item: item({ kind: 'weapon', typeName: 'Odd Blade' }) }))
    expect((dialog as HTMLElement).textContent).not.toContain('Damage')
    cleanup()

    dialog = await renderApprovals(request({ item: item({ kind: 'armour', typeName: 'Odd Plate' }) }))
    expect((dialog as HTMLElement).textContent).not.toContain('AC:')
  })

  it('shows only the title for an item request with no item', async () => {
    const dialog = await renderApprovals(request({ action: 'create' }), rerollRequest())

    expect(markup(dialog as Element)).toMatchInlineSnapshot(`
      "<div
        aria-modal="true"
        class="confirm-overlay"
        role="dialog"
      >
        <div
          class="confirm-modal"
        >
          <h3>
            Item Approval Request
          </h3>
        </div>
      </div>"
    `)
  })

  it('titles a sell request with no item as a sell request', async () => {
    const dialog = await renderApprovals(request({ action: 'sell' }))

    expect(within(dialog as HTMLElement).getByRole('heading').textContent).toBe('Sell Approval Request')
  })

  it('approves and rejects the first request, disabling both buttons while busy', async () => {
    const approval = deferred()
    ;(mocks.approvals.approveRequest as ReturnType<typeof vi.fn>).mockReturnValueOnce(approval.promise)
    const first = rerollRequest()
    const dialog = await renderApprovals(first, request({ id: 'r2', action: 'learn_spell' }))
    const buttons = () => within(dialog as HTMLElement).getAllByRole('button') as HTMLButtonElement[]

    fireEvent.click(within(dialog as HTMLElement).getByRole('button', { name: 'Approve' }))
    expect(mocks.approvals.approveRequest).toHaveBeenCalledWith(first)
    expect(buttons().map((button) => button.disabled)).toEqual([true, true])

    await act(async () => { approval.resolve(); await approval.promise })
    expect(buttons().map((button) => button.disabled)).toEqual([false, false])

    fireEvent.click(within(dialog as HTMLElement).getByRole('button', { name: 'Reject' }))
    expect(mocks.approvals.rejectRequest).toHaveBeenCalledWith(first)
    await act(async () => { await Promise.resolve() })
    expect(buttons().map((button) => button.disabled)).toEqual([false, false])
  })

  it('logs a failed approval or rejection and frees the buttons', async () => {
    const error = new Error('denied')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    ;(mocks.approvals.approveRequest as ReturnType<typeof vi.fn>).mockRejectedValueOnce(error)
    ;(mocks.approvals.rejectRequest as ReturnType<typeof vi.fn>).mockRejectedValueOnce(error)
    const dialog = await renderApprovals(request({ item: weapon() }))

    await act(async () => { fireEvent.click(within(dialog as HTMLElement).getByRole('button', { name: 'Approve' })) })
    expect(consoleError).toHaveBeenCalledWith('Approve failed', error)

    await act(async () => { fireEvent.click(within(dialog as HTMLElement).getByRole('button', { name: 'Reject' })) })
    expect(consoleError).toHaveBeenCalledWith('Reject failed', error)
    expect((within(dialog as HTMLElement).getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(false)
    consoleError.mockRestore()
  })

  it('approves spell requests from their own buttons', async () => {
    const spells = request({ action: 'learn_spell', spellNames: ['Sleep'] })
    const dialog = await renderApprovals(spells)

    await act(async () => { fireEvent.click(within(dialog as HTMLElement).getByRole('button', { name: 'Approve' })) })
    await act(async () => { fireEvent.click(within(dialog as HTMLElement).getByRole('button', { name: 'Reject' })) })
    expect(mocks.approvals.approveRequest).toHaveBeenCalledWith(spells)
    expect(mocks.approvals.rejectRequest).toHaveBeenCalledWith(spells)
  })

  it('approves item requests from their own buttons', async () => {
    const add = request({ item: weapon() })
    const dialog = await renderApprovals(add)

    await act(async () => { fireEvent.click(within(dialog as HTMLElement).getByRole('button', { name: 'Approve' })) })
    await act(async () => { fireEvent.click(within(dialog as HTMLElement).getByRole('button', { name: 'Reject' })) })
    expect(mocks.approvals.approveRequest).toHaveBeenCalledWith(add)
    expect(mocks.approvals.rejectRequest).toHaveBeenCalledWith(add)
  })
})
