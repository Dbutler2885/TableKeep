// @vitest-environment jsdom
/**
 * The OSE sheet with an arcane caster. A character the migration brought from
 * the old format shows the items OSE's step made of its old lists, the spell
 * book included, and the sheet converts and adds nothing itself; a newly
 * created magic-user gets its spell book while it is being created.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import type { CharacterRecord } from '../../types/app'
import { migratedFixture, reviveTimestamps, type CharacterFixture } from '../ruleSets/characterFixtures'
import { oseCharacterVersioning } from '../ruleSets/characterMigrations'
import legacy from '../ruleSets/ose/fixtures/legacy.json'
import type { CharacterTabProps } from './lib/characterTabTypes'

vi.mock('../../firebase', () => ({ db: { name: 'db-stub' }, auth: {}, storage: {} }))
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  query: (ref: unknown) => ref,
  where: () => ({}),
  orderBy: () => ({}),
  onSnapshot: () => () => undefined,
  setDoc: vi.fn(async () => undefined),
  updateDoc: vi.fn(async () => undefined),
  deleteDoc: vi.fn(async () => undefined),
}))
vi.mock('../common/mediaStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../common/mediaStorage')>()),
  resolveStoragePathUrl: async () => null,
}))

const { CharacterTab } = await import('./CharacterTab')
const { readStoredCharacter } = await import('./lib/storedCharacterRecord')

const PLAYER = 'player-uid'

const VIEWER = { userId: PLAYER, currentUsername: 'player1' }

/** An Elf stored in the old format, with no spell book, as the migration left it. */
const migratedElf = (): CharacterRecord => {
  const fixture = reviveTimestamps(legacy['caster-without-book'], (iso) => Timestamp.fromDate(new Date(iso))) as CharacterFixture
  const { id, data } = migratedFixture(oseCharacterVersioning, fixture)
  return readStoredCharacter(id, data, undefined, VIEWER)
}

/** A character just created, as its create stores it, once its player has picked a class. */
const newCharacter = (className: string): CharacterRecord => readStoredCharacter('new-pc', {
  name: 'New Character', ownerUserId: PLAYER, ownerUsername: 'player1', creationMode: 'new', creationModeExplicit: true,
  creationStatus: 'draft', class: className, level: 1, hpCurrent: 0, hpMax: 0, ac: 10, xp: 0, schemaVersion: 1,
}, undefined, VIEWER)

function sheetProps(character: CharacterRecord): CharacterTabProps {
  return {
    campaignId: 'campaign-1',
    groupId: 'group-1',
    gmUserId: 'gm-uid',
    currentUserId: PLAYER,
    currentUsername: 'player1',
    role: 'player',
    characters: [character],
    charactersLoading: false,
    currentCharacterId: character.id,
    setCurrentCharacter: async () => undefined,
    selectedCharacterId: character.id,
    setSelectedCharacterId: vi.fn(),
    selectedCharacter: character,
    updateCharacter: vi.fn(),
    syncCharacterLocal: vi.fn(),
    deleteCharacter: vi.fn(),
    hasPendingWrite: () => false,
  }
}

function renderSheet(character: CharacterRecord) {
  const props = sheetProps(character)
  render(<CharacterTab {...props} />)
  return props
}

/** Opens the character's Items page; a narrow layout shows the character list first. */
function openItemsPage(characterName: RegExp = /^Elf Without Book/) {
  fireEvent.click(screen.getByRole('button', { name: characterName }))
  fireEvent.click(screen.getAllByRole('button', { name: 'Items' })[0])
}

/** The spell books in each set of items the sheet wrote. */
const writtenSpellBooks = (props: CharacterTabProps) => vi.mocked(props.updateCharacter).mock.calls
  .map(([, updates]) => updates.details?.inventory)
  .filter((inventory) => inventory !== undefined)
  .map((inventory) => inventory.filter((item) => item.kind === 'general' && item.typeId === 'spell-book'))

afterEach(() => cleanup())

describe('the OSE sheet with a character migrated from the old format', () => {
  it('shows the items OSE\'s step made of the old lists, with its spell book', () => {
    const character = migratedElf()
    expect(character.details?.inventory.map(({ id }) => id)).toEqual([
      'w1',
      'legacy-legacy-elf-no-book-packedItems-0',
      'legacy-legacy-elf-no-book-spell-book',
    ])

    renderSheet(character)
    openItemsPage()

    expect(screen.getAllByText(/Long sword/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Rope/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Spell Book/).length).toBeGreaterThan(0)
  })

  it('adds no second spell book to the items it was given', () => {
    const props = renderSheet(migratedElf())
    openItemsPage()

    const written = writtenSpellBooks(props)
    // The sheet writes a sparsely stored sheet's defaults when it opens it, items included.
    expect(written.length).toBeGreaterThan(0)
    for (const books of written) expect(books).toHaveLength(1)
  })
})

describe('the OSE sheet with a newly created character', () => {
  it('gives a magic-user a spell book once its class is picked', () => {
    const props = sheetProps(newCharacter('-'))
    const { rerender } = render(<CharacterTab {...props} />)
    expect(writtenSpellBooks(props).flat()).toEqual([])

    const magicUser = newCharacter('Magic-User')
    rerender(<CharacterTab {...props} characters={[magicUser]} selectedCharacter={magicUser} />)
    openItemsPage(/^New Character/)

    expect(screen.getAllByText(/Spell Book/).length).toBeGreaterThan(0)
    const written = writtenSpellBooks(props)
    expect(written.length).toBeGreaterThan(0)
    expect(written.at(-1)).toHaveLength(1)
  })
})
