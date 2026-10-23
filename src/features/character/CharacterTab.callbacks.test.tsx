// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ItemApprovalRequest } from '../../types/app'
import type { CharacterTabProps } from './lib/characterTabTypes'
import { characterFixture, generalItemFixture } from './characterTestFixtures'
import { emptyAbilityScores } from './characterRules'

const mocks = vi.hoisted(() => ({
  requests: [] as ItemApprovalRequest[],
  submitReroll: vi.fn(async () => undefined),
  rollScores: vi.fn(),
  uploadImage: vi.fn(async () => ({ path: 'stored/portrait', url: 'memory-url' })),
}))

vi.mock('../../firebase', () => ({ db: {}, auth: {}, storage: {} }))
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  collection: (_db: unknown, path: string) => ({ path }), doc: (_db: unknown, path: string) => ({ path }),
  query: (ref: unknown) => ref, where: () => ({}), orderBy: () => ({}), onSnapshot: () => () => undefined,
}))
vi.mock('../common/mediaStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../common/mediaStorage')>()), resolveStoragePathUrl: async () => null,
  uploadEntityImage: mocks.uploadImage,
}))
vi.mock('./hooks/useItemApprovals', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./hooks/useItemApprovals')>()
  return {
    useItemApprovals: (...args: Parameters<typeof actual.useItemApprovals>) => ({
      ...actual.useItemApprovals(...args), ownPendingRequests: mocks.requests, submitAbilityRerollRequest: mocks.submitReroll,
    }),
  }
})
vi.mock('./hooks/useCharacterCreationFlow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./hooks/useCharacterCreationFlow')>()
  return {
    useCharacterCreationFlow: vi.fn((...args: Parameters<typeof actual.useCharacterCreationFlow>) => ({
      ...actual.useCharacterCreationFlow(...args), rollAbilityScores: mocks.rollScores,
    })),
  }
})
vi.mock('./hooks/useCharacterPersistenceSync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./hooks/useCharacterPersistenceSync')>()
  return { useCharacterPersistenceSync: vi.fn(actual.useCharacterPersistenceSync) }
})
vi.mock('./hooks/useCharacterTransfer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./hooks/useCharacterTransfer')>()
  return { useCharacterTransfer: vi.fn(actual.useCharacterTransfer) }
})
vi.mock('./hooks/useInventoryDomain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./hooks/useInventoryDomain')>()
  return { useInventoryDomain: vi.fn(actual.useInventoryDomain) }
})

// These are contract tests for the callbacks CharacterTab gives its children.
// The separate characterization suite renders those children and drives real controls.
vi.mock('./components/CharacterCoreSheetPage', () => ({ CharacterCoreSheetPage: vi.fn(() => null) }))
vi.mock('./components/CharacterItemsPage', () => ({ CharacterItemsPage: vi.fn(() => null) }))
vi.mock('./components/AddItemModal', () => ({ AddItemModal: vi.fn(() => null) }))
vi.mock('./components/TransferPickerModal', () => ({ TransferPickerModal: vi.fn(() => null) }))
vi.mock('./components/CharacterWorkflowDialogs', () => ({ CharacterWorkflowDialogs: vi.fn(() => null) }))
vi.mock('./components/CharacterListPane', () => ({ CharacterListPane: vi.fn(() => null) }))
vi.mock('./components/CharacterSheetNavigation', () => ({ CharacterSheetNavigation: vi.fn(() => null) }))
vi.mock('./components/ItemDetailModal', () => ({ ItemDetailModal: vi.fn(() => null) }))
vi.mock('./components/StoreModal', () => ({ StoreModal: vi.fn(() => null) }))
vi.mock('./components/ItemInteractionDialogs', () => ({ ItemInteractionDialogs: vi.fn(() => null) }))

const { CharacterTab } = await import('./CharacterTab')
const { CharacterCoreSheetPage } = await import('./components/CharacterCoreSheetPage')
const { CharacterItemsPage } = await import('./components/CharacterItemsPage')
const { AddItemModal } = await import('./components/AddItemModal')
const { TransferPickerModal } = await import('./components/TransferPickerModal')
const { CharacterWorkflowDialogs } = await import('./components/CharacterWorkflowDialogs')
const { CharacterListPane } = await import('./components/CharacterListPane')
const { CharacterSheetNavigation } = await import('./components/CharacterSheetNavigation')
const { ItemDetailModal } = await import('./components/ItemDetailModal')
const { useCharacterCreationFlow } = await import('./hooks/useCharacterCreationFlow')
const { useCharacterPersistenceSync } = await import('./hooks/useCharacterPersistenceSync')
const { useCharacterTransfer } = await import('./hooks/useCharacterTransfer')
const { useInventoryDomain } = await import('./hooks/useInventoryDomain')
const { StoreModal } = await import('./components/StoreModal')
const { ItemInteractionDialogs } = await import('./components/ItemInteractionDialogs')

const core = () => vi.mocked(CharacterCoreSheetPage).mock.lastCall![0]
const items = () => vi.mocked(CharacterItemsPage).mock.lastCall![0]
const addItem = () => vi.mocked(AddItemModal).mock.lastCall![0]
const workflows = () => vi.mocked(CharacterWorkflowDialogs).mock.lastCall![0]
const list = () => vi.mocked(CharacterListPane).mock.lastCall![0]
const creation = () => vi.mocked(useCharacterCreationFlow).mock.lastCall![0]
const inventory = () => vi.mocked(useInventoryDomain).mock.lastCall![0]
const store = () => vi.mocked(StoreModal).mock.lastCall![0]

function setup(overrides: Partial<CharacterTabProps> = {}) {
  const hero = characterFixture()
  const props: CharacterTabProps = {
    campaignId: 'campaign', groupId: 'group', gmUserId: 'gm', currentUserId: 'player', currentUsername: 'player1', role: 'player',
    characters: [hero], charactersLoading: false, currentCharacterId: null, setCurrentCharacter: vi.fn(async () => undefined),
    selectedCharacterId: hero.id, setSelectedCharacterId: vi.fn(), selectedCharacter: hero,
    updateCharacter: vi.fn(), syncCharacterLocal: vi.fn(), deleteCharacter: vi.fn(), hasPendingWrite: () => false,
    createCharacter: vi.fn(async () => undefined), ...overrides,
  }
  return { props, ...render(<CharacterTab {...props} />) }
}

beforeEach(() => { window.innerWidth = 1600; vi.clearAllMocks(); mocks.requests = [] })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('character edit callbacks', () => {
  it('routes portrait uploads through the current group, campaign, character, and owner authority', async () => {
    setup()
    const file = new File(['portrait'], 'portrait.png', { type: 'image/png' })
    await expect(core().media.uploadCharacterPortraitImage(file)).resolves.toEqual({ portraitPath: 'stored/portrait', portraitUrl: 'memory-url' })
    expect(mocks.uploadImage).toHaveBeenCalledExactlyOnceWith({ campaignId: 'campaign', groupId: 'group', collectionName: 'characters', entityId: 'hero', mediaKind: 'portraits', file, maxWidth: 600, maxHeight: 800, uploadAuthority: 'owner' })
  })

  it('strips hpMax only from regular updates and preserves the caller object and system updates', () => {
    const { props } = setup()
    vi.mocked(props.updateCharacter).mockClear()
    const update = { name: 'Renamed', hpCurrent: 4, hpMax: 99 }
    act(() => core().actions.updateCharacter(update))
    expect(props.updateCharacter).toHaveBeenCalledExactlyOnceWith('hero', { name: 'Renamed', hpCurrent: 4 })
    expect(update).toEqual({ name: 'Renamed', hpCurrent: 4, hpMax: 99 })
    act(() => core().actions.updateCharacterSystem(update))
    expect(props.updateCharacter).toHaveBeenLastCalledWith('hero', update)
  })

  it('ignores regular and system updates without a selection', () => {
    const { props } = setup({ characters: [], selectedCharacterId: '', selectedCharacter: null })
    act(() => { creation().updateSelectedCharacter({ name: 'No target' }); creation().updateSelectedCharacterSystem({ hpMax: 10 }) })
    expect(props.updateCharacter).not.toHaveBeenCalled()
  })

  it('ignores ability-score callbacks for a read-only character', () => {
    const hero = characterFixture({ creationMode: 'established', creationStatus: 'established_draft' })
    const { props } = setup({ currentUserId: 'spectator', characters: [hero], selectedCharacter: hero })
    const before = core().derivations.selectedAbilityScores
    vi.mocked(props.updateCharacter).mockClear()
    act(() => core().actions.updateAbilityScore('STR', '14'))
    expect(core().derivations.selectedAbilityScores).toEqual(before)
    expect(props.updateCharacter).not.toHaveBeenCalled()
  })

  it('rejects nonnumeric established scores and treats whitespace as empty', () => {
    const hero = characterFixture({ creationMode: 'established', creationStatus: 'established_draft' })
    setup({ characters: [hero], selectedCharacter: hero })
    act(() => core().actions.updateAbilityScore('STR', '12'))
    act(() => core().actions.updateAbilityScore('STR', 'not a number'))
    expect(core().derivations.selectedAbilityScores.STR).toBe('12')
    act(() => core().actions.updateAbilityScore('STR', '  '))
    expect(core().derivations.selectedAbilityScores.STR).toBe('')
  })

  it('opens the class dialog for a guided edit without a class and ignores an invalid guided reallocation', () => {
    const hero = characterFixture({ className: '-' })
    const { props, rerender } = setup({ characters: [hero], selectedCharacter: hero })
    act(() => core().actions.updateAbilityScore('STR', '13'))
    expect(workflows().reallocationClassRequiredOpen).toBe(true)
    act(() => workflows().setReallocationClassRequiredOpen(false))
    const fighter = characterFixture()
    rerender(<CharacterTab {...props} characters={[fighter]} selectedCharacter={fighter} />)
    act(() => core().sheetState.stateSetters.setAbilityScoresByCharacterId({ hero: { ...emptyAbilityScores(), STR: '12' } }))
    const before = core().derivations.selectedAbilityScores
    act(() => core().actions.updateAbilityScore('STR', '99'))
    expect(core().derivations.selectedAbilityScores).toEqual(before)
    expect(workflows().reallocationClassRequiredOpen).toBe(false)
  })

  it('preserves other characters and scores when updating guided and established score maps', () => {
    const first = characterFixture({ creationMode: 'established', creationStatus: 'established_draft' })
    const second = characterFixture({ id: 'other' })
    const { props, rerender } = setup({ characters: [first, second], selectedCharacter: first })
    act(() => core().actions.updateAbilityScore('STR', '14'))
    act(() => core().actions.updateAbilityScore('INT', '11'))
    rerender(<CharacterTab {...props} selectedCharacter={second} selectedCharacterId={second.id} />)
    const rolled = { STR: '12', INT: '12', WIS: '12', DEX: '12', CON: '12', CHA: '12' }
    act(() => {
      core().sheetState.stateSetters.setRolledAbilityScoresByCharacterId({ other: rolled })
      core().sheetState.stateSetters.setAbilityScoresByCharacterId((current) => ({ ...current, other: { ...rolled, INT: '10' } }))
    })
    act(() => core().actions.updateAbilityScore('STR', '13'))
    expect(core().derivations.selectedAbilityScores).toEqual({ ...rolled, INT: '10', STR: '13' })
    rerender(<CharacterTab {...props} selectedCharacter={first} />)
    expect(core().derivations.selectedAbilityScores).toEqual({ ...emptyAbilityScores(), STR: '14', INT: '11' })
    act(() => core().actions.updateAbilityScore('STR', ''))
    expect(core().derivations.selectedAbilityScores.INT).toBe('11')
    expect(core().sheetState.stateMaps.abilityScoresByCharacterId.other).toEqual({ ...rolled, INT: '10', STR: '13' })
  })

  it('uses level one for a different character, preserves existing profiles, and leaves them alone for an unknown class', () => {
    const hero = characterFixture({ level: 7 })
    setup({ characters: [hero], selectedCharacter: hero })
    act(() => core().actions.applyClassDerivedData('hero', 'Fighter'))
    const heroSaves = core().sheetState.stateMaps.saveScoresByCharacterId.hero
    act(() => core().actions.applyClassDerivedData('other', 'Cleric'))
    expect(core().sheetState.stateMaps.saveScoresByCharacterId.other).toEqual({ D: '11', W: '12', P: '14', B: '16', S: '15' })
    expect(core().sheetState.stateMaps.thacoByCharacterId.other).toBe('19')
    expect(core().sheetState.stateMaps.saveScoresByCharacterId.hero).toEqual(heroSaves)
    expect(core().sheetState.stateMaps.thacoByCharacterId.hero).toBe('14')
    act(() => core().actions.applyClassDerivedData('other', 'Unknown class'))
    expect(core().sheetState.stateMaps.saveScoresByCharacterId.other).toEqual({ D: '11', W: '12', P: '14', B: '16', S: '15' })
    expect(core().sheetState.stateMaps.thacoByCharacterId.other).toBe('19')
  })
})

describe('ability re-roll approval routing', () => {
  it('can render an empty roster while an ability re-roll request is still in the subscription', () => {
    mocks.requests = [{ id: 'pending', action: 'ability_reroll', characterId: 'hero', status: 'pending' } as ItemApprovalRequest]
    setup({ characters: [], selectedCharacter: null, selectedCharacterId: '' })
    expect(list().effectiveSelectedId).toBeNull()
    expect(CharacterCoreSheetPage).not.toHaveBeenCalled()
  })
  it.each([
    { role: 'player' as const, rolled: false, rolls: 1, requests: 0 },
    { role: 'gm' as const, rolled: true, rolls: 1, requests: 0 },
    { role: 'player' as const, rolled: true, rolls: 0, requests: 1 },
  ])('routes a $role with rolled=$rolled', ({ role, rolled, rolls, requests }) => {
    setup({ role })
    act(() => core().sheetState.stateSetters.setAbilityScoresRolledByCharacterId({ hero: rolled }))
    act(() => core().actions.requestAbilityScoreRoll())
    expect(mocks.rollScores).toHaveBeenCalledTimes(rolls)
    expect(mocks.submitReroll).toHaveBeenCalledTimes(requests)
    if (requests) expect(mocks.submitReroll).toHaveBeenCalledWith('hero', 'Mirelda', 'player1')
  })

  it.each([
    { action: 'ability_reroll', characterId: 'hero', status: 'pending', blocked: true },
    { action: 'ability_reroll', characterId: 'other', status: 'pending', blocked: false },
    { action: 'create', characterId: 'hero', status: 'pending', blocked: false },
    { action: 'ability_reroll', characterId: 'hero', status: 'rejected', blocked: false },
  ])('only a matching pending ability re-roll blocks another request ($action, $characterId, $status)', ({ blocked, ...request }) => {
    // This boundary fixture also exercises stale subscription results: CharacterTab checks status itself.
    const base = { id: 'request', campaignId: 'campaign', characterName: 'Mirelda', requestedByUserId: 'player', requestedByUsername: 'player1', createdAt: null }
    mocks.requests = [{ ...base, ...request } as ItemApprovalRequest, { ...base, id: 'unrelated', action: 'create', characterId: 'other', status: 'pending' }]
    setup()
    act(() => core().sheetState.stateSetters.setAbilityScoresRolledByCharacterId({ hero: true }))
    expect(core().hasPendingAbilityReroll).toBe(blocked)
    act(() => core().actions.requestAbilityScoreRoll())
    expect(mocks.submitReroll).toHaveBeenCalledTimes(blocked ? 0 : 1)
    expect(mocks.rollScores).not.toHaveBeenCalled()
  })

  it.each([
    { currentUserId: 'spectator' },
    { selectedCharacter: characterFixture({ creationStatus: 'active' }) },
  ])('ignores a re-roll callback without guided edit permission (%j)', (overrides) => {
    setup(overrides)
    act(() => core().actions.requestAbilityScoreRoll())
    expect(mocks.rollScores).not.toHaveBeenCalled()
    expect(mocks.submitReroll).not.toHaveBeenCalled()
  })
})

describe('dialog and item wiring', () => {
  it('starts with empty entry fields, an adventuring store, and no in-progress inventory write', () => {
    setup()
    expect(store().state).toMatchObject({ storeOpen: false, storeCloseConfirmOpen: false, storeCategory: 'adventuring', customStoreName: '', customStoreCost: '', customStoreDescription: '', storeError: null })
    expect(vi.mocked(ItemDetailModal).mock.lastCall![0].goldSpendAmount).toBe('')
    expect(vi.mocked(ItemInteractionDialogs).mock.lastCall![0].stackActionQty).toBe('')
    expect(inventory().overflowWriting).toBe(false)
  })

  it('opens the store from the Items page and clears its previous error', () => {
    setup()
    act(() => vi.mocked(CharacterSheetNavigation).mock.calls[0][0].setActivePage('encumbrance'))
    act(() => items().onOpenStore())
    expect(store().state.storeOpen).toBe(true)
    act(() => store().actions.handleBuyCustomStoreItem())
    expect(store().state.storeError).toBe('Roll starting gold before buying equipment.')
    act(() => store().actions.setStoreOpen(false))
    act(() => items().onOpenStore())
    expect(store().state.storeOpen).toBe(true)
    expect(store().state.storeError).toBeNull()
  })

  it('clears approval and overflow feedback after five seconds', () => {
    vi.useFakeTimers()
    setup()
    act(() => core().sheetState.stateSetters.setAbilityScoresRolledByCharacterId({ hero: true }))
    act(() => core().actions.requestAbilityScoreRoll())
    act(() => inventory().setOverflowFeedback('Overflow notice'))
    act(() => vi.mocked(CharacterSheetNavigation).mock.calls[0][0].setActivePage('encumbrance'))
    expect(items().approvalPendingFeedback).toBe('Ability score re-roll sent to GM for approval.')
    expect(items().overflowFeedback).toBe('Overflow notice')
    act(() => vi.advanceTimersByTime(4999))
    expect(items().approvalPendingFeedback).toBeTruthy()
    expect(items().overflowFeedback).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))
    expect(items().approvalPendingFeedback).toBeNull()
    expect(items().overflowFeedback).toBeNull()
  })

  it('opens store-class and HP-class requirements through the supplied callbacks', () => {
    const hero = characterFixture({ className: '-' })
    setup({ characters: [hero], selectedCharacter: hero })
    act(() => core().actions.requestRollHitPoints())
    expect(workflows().hpClassRequiredOpen).toBe(true)
    act(() => vi.mocked(CharacterSheetNavigation).mock.calls[0][0].setActivePage('encumbrance'))
    act(() => items().onOpenStoreClassRequired())
    expect(workflows().storeClassRequiredOpen).toBe(true)
  })

  it('applies a player template to an open add-item modal and ignores one when closed', () => {
    const hero = characterFixture({ creationMode: 'established', creationStatus: 'established_draft' })
    setup({ characters: [hero], selectedCharacter: hero })
    act(() => addItem().onApplyTemplate('general', 'gear-rope'))
    expect(addItem().modal).toBeNull()
    act(() => vi.mocked(CharacterSheetNavigation).mock.calls[0][0].setActivePage('encumbrance'))
    act(() => items().inventoryDomain.openAddItemModal(false))
    act(() => addItem().onApplyTemplate('general', 'gear-rope'))
    expect(addItem().modal).toMatchObject({ kind: 'general', typeId: 'gear-rope', name: '', typeName: 'Rope (50 ft)' })
    const view = render(addItem().renderReadOnlyItemDetail(generalItemFixture({ name: 'Coiled rope' })))
    expect(view.getByText('Coiled rope')).toBeTruthy()
  })

  it('passes the matching detail item to transfer selection, or null for a missing or closed detail', () => {
    setup()
    const rope = generalItemFixture()
    const torch = generalItemFixture({ id: 'torch', name: 'Torch' })
    act(() => core().sheetState.stateSetters.setInventoryByCharacterId({ hero: [rope, torch] }))
    act(() => vi.mocked(ItemDetailModal).mock.lastCall![0].setItemDetailId('torch'))
    expect(vi.mocked(TransferPickerModal).mock.lastCall![0].detailItem).toEqual(torch)
    act(() => vi.mocked(ItemDetailModal).mock.lastCall![0].setItemDetailId('missing'))
    expect(vi.mocked(TransferPickerModal).mock.lastCall![0].detailItem).toBeNull()
    act(() => vi.mocked(ItemDetailModal).mock.lastCall![0].setItemDetailId(null))
    expect(vi.mocked(TransferPickerModal).mock.lastCall![0].detailItem).toBeNull()
  })

  it('closes item detail when the transfer hook reports completion', () => {
    setup()
    act(() => vi.mocked(ItemDetailModal).mock.lastCall![0].setItemDetailId('rope'))
    expect(vi.mocked(ItemDetailModal).mock.lastCall![0].itemDetailId).toBe('rope')
    act(() => vi.mocked(useCharacterTransfer).mock.lastCall![0].closeItemDetail())
    expect(vi.mocked(ItemDetailModal).mock.lastCall![0].itemDetailId).toBeNull()
  })

  it('removes a deleted character from the persistence caches as well as closing confirmation', () => {
    const { props } = setup()
    const refs = vi.mocked(useCharacterPersistenceSync).mock.results.at(-1)!.value as ReturnType<typeof useCharacterPersistenceSync>
    refs.seededCharacterIdsRef.current.add('hero')
    refs.seededCharacterIdsRef.current.add('other')
    refs.lastPersistedDetailsJsonRef.current.hero = 'hero details'
    refs.lastPersistedDetailsJsonRef.current.other = 'other details'
    act(() => list().onDeleteCharacter(characterFixture()))
    act(() => workflows().onConfirmDelete(workflows().deleteTarget!))
    expect(props.deleteCharacter).toHaveBeenCalledExactlyOnceWith('hero')
    expect(refs.seededCharacterIdsRef.current.has('hero')).toBe(false)
    expect(refs.seededCharacterIdsRef.current.has('other')).toBe(true)
    expect(refs.lastPersistedDetailsJsonRef.current).toEqual({ other: 'other details' })
    expect(workflows().deleteTarget).toBeNull()
  })
})
