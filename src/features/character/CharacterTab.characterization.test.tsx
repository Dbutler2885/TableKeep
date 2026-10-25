// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { CharacterRecord } from '../../types/app'
import type { CharacterTabProps } from './lib/characterTabTypes'
import { characterFixture } from './characterTestFixtures'

// Keep the real sheet, state, and domain hooks; replace only external Firebase IO.
vi.mock('../../firebase', () => ({ db: {}, auth: {}, storage: {} }))
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  query: (ref: unknown) => ref, where: () => ({}), orderBy: () => ({}),
  onSnapshot: () => () => undefined,
  setDoc: vi.fn(async () => undefined), updateDoc: vi.fn(async () => undefined), deleteDoc: vi.fn(async () => undefined),
}))
vi.mock('../common/mediaStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../common/mediaStorage')>()),
  resolveStoragePathUrl: async () => null,
}))

const { CharacterTab } = await import('./CharacterTab')

function propsFor(characters: CharacterRecord[] = [], overrides: Partial<CharacterTabProps> = {}): CharacterTabProps {
  return {
    campaignId: 'campaign', groupId: 'group', gmUserId: 'gm', currentUserId: 'player', currentUsername: 'player1', role: 'player',
    characters, charactersLoading: false, currentCharacterId: null, setCurrentCharacter: vi.fn(async () => undefined),
    selectedCharacterId: '', setSelectedCharacterId: vi.fn(), selectedCharacter: null,
    updateCharacter: vi.fn(), syncCharacterLocal: vi.fn(), deleteCharacter: vi.fn(), hasPendingWrite: () => false,
    createCharacter: vi.fn(async () => undefined), ...overrides,
  }
}

function selectedSheet(character = characterFixture(), overrides: Partial<CharacterTabProps> = {}) {
  const props = propsFor([character], { selectedCharacterId: character.id, selectedCharacter: character, ...overrides })
  return { props, ...render(<CharacterTab {...props} />) }
}

// The legacy score inputs have no labels. Find the input alongside its visible code.
function abilityInput(code: string): HTMLInputElement {
  return screen.getByText(code, { selector: '.character-sheet-code' }).parentElement!.querySelector('input')!
}

beforeEach(() => { window.innerWidth = 1600 })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('roster display and selection', () => {
  it('sorts living players, living GM characters, then the dead, alphabetically within each tier without mutating the input', () => {
    const characters = [
      characterFixture({ id: 'dead-gm', name: 'Z dead GM', ownerUserId: 'gm', hpCurrent: -1 }),
      characterFixture({ id: 'gm-z', name: 'Z GM', ownerUserId: 'gm' }),
      characterFixture({ id: 'player-z', name: 'Z player', hpCurrent: 1 }),
      characterFixture({ id: 'dead-player', name: 'A dead player', hpCurrent: 0 }),
      characterFixture({ id: 'gm-a', name: 'A GM', ownerUserId: 'gm' }),
      characterFixture({ id: 'player-a', name: 'A player' }),
    ]
    const originalIds = characters.map(({ id }) => id)
    const props = propsFor(characters)
    const { container } = render(<CharacterTab {...props} />)
    expect([...container.querySelectorAll('.character-list-grid h4')].map((node) => node.textContent)).toEqual([
      'A player', 'Z player', 'A GM', 'Z GM', 'A dead player', 'Z dead GM',
    ])
    expect(characters.map(({ id }) => id)).toEqual(originalIds)
    expect(props.setSelectedCharacterId).toHaveBeenCalledExactlyOnceWith('player-a')
  })

  it('uses the explicit selected record before the matching roster record, and falls back to the id when it is absent', () => {
    const roster = characterFixture({ name: 'Roster name' })
    const explicit = characterFixture({ name: 'Selected name' })
    const props = propsFor([roster], { selectedCharacterId: roster.id, selectedCharacter: explicit })
    const { rerender } = render(<CharacterTab {...props} />)
    expect(screen.getByDisplayValue('Selected name')).toBeTruthy()
    expect(props.setSelectedCharacterId).not.toHaveBeenCalled()
    rerender(<CharacterTab {...props} selectedCharacter={null} />)
    expect(screen.getByDisplayValue('Roster name')).toBeTruthy()
    expect(props.setSelectedCharacterId).not.toHaveBeenCalled()
  })

  it('shows loading and empty state without selecting anything', () => {
    const props = propsFor([], { charactersLoading: true })
    render(<CharacterTab {...props} />)
    expect(screen.getByText('Loading characters...')).toBeTruthy()
    expect(screen.getByText('No characters available.')).toBeTruthy()
    expect(screen.getByText('Select a character from the list.')).toBeTruthy()
    expect(props.setSelectedCharacterId).not.toHaveBeenCalled()
  })

  it('selects the first character when a previously empty roster loads and updates it when that roster changes', () => {
    const props = propsFor()
    const { rerender } = render(<CharacterTab {...props} />)
    rerender(<CharacterTab {...props} characters={[characterFixture()]} />)
    expect(props.setSelectedCharacterId).toHaveBeenLastCalledWith('hero')
    rerender(<CharacterTab {...props} characters={[characterFixture({ id: 'next' })]} />)
    expect(props.setSelectedCharacterId).toHaveBeenLastCalledWith('next')
  })

  it.each([false, true])('keeps the appropriate pane when a wide layout narrows (selected=$selected)', (selected) => {
    selectedSheet(characterFixture(), selected ? {} : { selectedCharacterId: '', selectedCharacter: null })
    window.innerWidth = 600
    fireEvent(window, new Event('resize'))
    expect(Boolean(screen.queryByDisplayValue('Mirelda'))).toBe(selected)
    expect(Boolean(screen.queryByRole('button', { name: /^Mirelda/ }))).toBe(!selected)
  })

  it('keeps an open grant pane when narrowing even without a selected character', () => {
    const props = propsFor([], { role: 'gm' })
    render(<CharacterTab {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /^Grant Grant XP/ }))
    window.innerWidth = 600
    fireEvent(window, new Event('resize'))
    expect(screen.getByRole('button', { name: 'Back to character list' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Grant Grant XP/ })).toBeNull()
  })

  it.each([
    { width: 1100, expectedClass: 'character-sheet-main-grid intermediate' },
    { width: 850, expectedClass: 'character-sheet-main-grid intermediate mobile-intermediate' },
  ])('passes the responsive sheet layout at $width pixels', ({ width, expectedClass }) => {
    window.innerWidth = width
    const { container } = selectedSheet()
    fireEvent.click(screen.getByRole('button', { name: /^Mirelda/ }))
    expect(container.querySelector('.character-sheet-main-grid')?.className).toBe(expectedClass)
  })

  it.each([
    { currentCharacterId: 'hero', ownerUserId: 'player', visible: true },
    { currentCharacterId: 'other', ownerUserId: 'player', visible: false },
    { currentCharacterId: 'hero', ownerUserId: 'other-player', visible: false },
    { currentCharacterId: null, ownerUserId: 'player', visible: false },
  ])('embedded player shows only their current character ($currentCharacterId, $ownerUserId)', ({ currentCharacterId, ownerUserId, visible }) => {
    const hero = characterFixture({ ownerUserId })
    const props = propsFor([hero, characterFixture({ id: 'other', name: 'Other', ownerUserId: 'other-player' })], {
      embeddedMode: true, currentCharacterId, selectedCharacter: hero, selectedCharacterId: hero.id,
    })
    const { container } = render(<CharacterTab {...props} />)
    expect(container.querySelector('.characters-sidebar')).toBeNull()
    expect(Boolean(screen.queryByDisplayValue('Mirelda'))).toBe(visible)
    expect(Boolean(screen.queryByText("You don't have a character, yet."))).toBe(!visible)
    expect(screen.queryByDisplayValue('Other')).toBeNull()
    expect(props.setSelectedCharacterId).not.toHaveBeenCalled()
  })

  it('embedded GM uses the first sorted character rather than the explicit selection', () => {
    const props = propsFor([characterFixture({ id: 'z', name: 'Zebra' }), characterFixture({ name: 'Alpha' })], {
      role: 'gm', embeddedMode: true, selectedCharacter: characterFixture({ id: 'z', name: 'Zebra' }), selectedCharacterId: 'z',
    })
    render(<CharacterTab {...props} />)
    expect(screen.getByDisplayValue('Alpha')).toBeTruthy()
    expect(screen.queryByDisplayValue('Zebra')).toBeNull()
    expect(props.setSelectedCharacterId).not.toHaveBeenCalled()
  })

  it('updates an embedded player sheet when their current character changes', () => {
    const hero = characterFixture()
    const other = characterFixture({ id: 'other', name: 'Other' })
    const props = propsFor([hero, other], { embeddedMode: true, currentCharacterId: hero.id })
    const { rerender } = render(<CharacterTab {...props} />)
    expect(screen.getByDisplayValue('Mirelda')).toBeTruthy()
    rerender(<CharacterTab {...props} currentCharacterId={other.id} />)
    expect(screen.getByDisplayValue('Other')).toBeTruthy()
    expect(screen.queryByDisplayValue('Mirelda')).toBeNull()
  })

  it('single-pane selection opens detail, Back returns to the list, and a later selection clears a level-up dialog', () => {
    window.innerWidth = 600
    const hero = characterFixture({ creationStatus: 'active', xp: 2500 })
    const { props } = selectedSheet(hero)
    expect(screen.queryByDisplayValue('Mirelda')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Mirelda/ }))
    expect(props.setSelectedCharacterId).toHaveBeenCalledWith('hero')
    expect(screen.getByDisplayValue('Mirelda')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Level up character' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back to character list' }))
    fireEvent.click(screen.getByRole('button', { name: /^Mirelda/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

// Each of these renders the whole OSE sheet and drives it through its real
// controls. One takes a few hundred milliseconds on a quiet machine, but under
// coverage on a loaded one it has passed Vitest's 5 s default, so the block
// allows more time; the assertions are unchanged.
describe('sheet workflows through the real controls', { timeout: 20_000 }, () => {
  it('edits established ability scores within 1..18, truncates decimals, and clears an empty input while preserving other scores', () => {
    const { props } = selectedSheet(characterFixture({ creationMode: 'established', creationStatus: 'established_draft' }))
    fireEvent.change(abilityInput('INT'), { target: { value: '14' } })
    for (const value of ['1', '18', '10.9']) {
      fireEvent.change(abilityInput('STR'), { target: { value } })
      expect(abilityInput('STR').value).toBe(String(Number.parseInt(value, 10)))
      expect(abilityInput('INT').value).toBe('14')
    }
    for (const value of ['0', '-1', '19']) {
      fireEvent.change(abilityInput('STR'), { target: { value } })
      expect(abilityInput('STR').value).toBe('10')
    }
    fireEvent.change(abilityInput('STR'), { target: { value: '' } })
    expect(abilityInput('STR').value).toBe('')
    expect(abilityInput('INT').value).toBe('14')
    expect(vi.mocked(props.updateCharacter).mock.calls.at(-1)?.[1].details?.abilityScores).toMatchObject({ STR: '', INT: '14' })
  })

  it('rolls guided scores once, reallocates two INT points into one STR point, and requests player re-roll approval', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    selectedSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(abilityInput('STR').value).toBe('12')
    fireEvent.click(screen.getByRole('button', { name: 'Decrease INT' }))
    fireEvent.click(screen.getByRole('button', { name: 'Decrease INT' }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase STR' }))
    expect(abilityInput('STR').value).toBe('13')
    expect(abilityInput('INT').value).toBe('10')
    fireEvent.click(screen.getByRole('button', { name: 'Request Re-roll' }))
    fireEvent.click(screen.getByRole('button', { name: 'Items' }))
    expect(screen.getByText('Ability score re-roll sent to GM for approval.')).toBeTruthy()
  })

  it('opens class-required dialogs for guided reallocation and HP, then dismisses them', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    selectedSheet(characterFixture({ className: '-' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll HP' }))
    expect(screen.getByText('To Roll for HP, set class to determine Hit Dice')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Choose class before reallocation' })[0])
    expect(screen.getByText('Please choose class before reallocation.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('applies class-derived saving throws and THAC0 at the selected character level', () => {
    selectedSheet(characterFixture({ level: 7, creationMode: 'established', creationStatus: 'established_draft' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Class' }), { target: { value: 'Cleric' } })
    const field = (code: string) => screen.getByText(code, { selector: '.character-sheet-code' }).parentElement!.querySelector('input')!.value
    expect(['D', 'W', 'P', 'B', 'S'].map(field)).toEqual(['9', '10', '12', '14', '12'])
    const thaco = screen.getByText('THAC0', { selector: '.character-combat-tag' }).parentElement!.querySelector('input')!
    expect(thaco.value).toBe('17')
  })

  it('sends regular edits and system HP edits to the selected character', () => {
    const { props } = selectedSheet(characterFixture({ creationMode: 'established', creationStatus: 'established_draft' }))
    vi.mocked(props.updateCharacter).mockClear()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Renamed' } })
    expect(props.updateCharacter).toHaveBeenCalledExactlyOnceWith('hero', { name: 'Renamed' })
    const maxHp = screen.getByText('Maximum hit points').parentElement!.querySelector('input')!
    fireEvent.change(maxHp, { target: { value: '12' } })
    expect(props.updateCharacter).toHaveBeenLastCalledWith('hero', { hpMax: 12 })
  })

  it.each(['New', 'Established'])('creates a %s character and opens detail on a narrow viewport', (mode) => {
    window.innerWidth = 600
    const props = propsFor()
    render(<CharacterTab {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add character' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: mode }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(props.createCharacter).toHaveBeenCalledOnce()
    const created = vi.mocked(props.createCharacter).mock.calls[0][0]
    expect(created.creationMode).toBe(mode.toLowerCase() === 'new' ? 'new' : 'established')
    expect(props.setSelectedCharacterId).toHaveBeenCalledWith(created.id)
    expect(screen.getByText('Select a character from the list.')).toBeTruthy()
  })

  it('cancels creation without writing', () => {
    const props = propsFor()
    render(<CharacterTab {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add character' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(props.createCharacter).not.toHaveBeenCalled()
  })

  it.each(['Mirelda', ''])('cancels and then confirms deleting a character named %j', (name) => {
    const { props } = selectedSheet(characterFixture({ name }))
    fireEvent.click(screen.getByRole('button', { name: `Delete ${name || 'character'}` }))
    expect(within(screen.getByRole('dialog')).getByText(`Are you sure you want to delete ${name || 'character'}? This cannot be undone.`)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(props.deleteCharacter).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: `Delete ${name || 'character'}` }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(props.deleteCharacter).toHaveBeenCalledExactlyOnceWith('hero')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens and exits GM grants, and leaves grant mode on character selection', () => {
    const { props } = selectedSheet(characterFixture(), { role: 'gm' })
    fireEvent.click(screen.getByRole('button', { name: /^Grant Grant XP/ }))
    expect(screen.getByRole('button', { name: 'Exit grant mode' })).toBeTruthy()
    expect(screen.queryByDisplayValue('Mirelda')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Exit grant mode' }))
    expect(screen.getByDisplayValue('Mirelda')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Grant Grant XP/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Mirelda/ }))
    expect(screen.queryByRole('button', { name: 'Exit grant mode' })).toBeNull()
    expect(screen.getByDisplayValue('Mirelda')).toBeTruthy()
    expect(props.setSelectedCharacterId).toHaveBeenCalledWith('hero')
  })

  it('hides grant tools if the viewer loses the GM role while grant mode is open', () => {
    const { props, rerender } = selectedSheet(characterFixture(), { role: 'gm' })
    fireEvent.click(screen.getByRole('button', { name: /^Grant Grant XP/ }))
    rerender(<CharacterTab {...props} role="player" />)
    expect(screen.getByDisplayValue('Mirelda')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Exit grant mode' })).toBeNull()
  })

  it('shows the current guided finalization error on the sheet', () => {
    selectedSheet(characterFixture({ className: '-' }))
    fireEvent.click(screen.getByRole('button', { name: 'Finalize character' }))
    expect(screen.getByText('Choose a class before finalizing.')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('finalizes an established draft through its confirmation dialog', () => {
    const { props } = selectedSheet(characterFixture({ creationMode: 'established', creationStatus: 'established_draft' }))
    fireEvent.click(screen.getByRole('button', { name: 'Finalize character' }))
    expect(screen.getByText('This will finalize the imported established character. Item changes will require GM approval after this.')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Finalize' }))
    expect(props.updateCharacter).toHaveBeenCalledWith('hero', { creationStatus: 'active' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
