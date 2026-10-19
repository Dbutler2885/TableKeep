// @vitest-environment jsdom
/**
 * The OSE sheet with an old-format character. The sheet's reader runs OSE's
 * step, so the sheet shows the items the step made of the old lists, the
 * spell book included, without converting or adding anything itself.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import type { CharacterRecord } from '../../types/app'
import { reviveTimestamps, type CharacterFixture } from '../ruleSets/characterFixtures'
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

const oldFormatElf = (): CharacterRecord => {
  const { id, data } = reviveTimestamps(legacy['caster-without-book'], (iso) => Timestamp.fromDate(new Date(iso))) as CharacterFixture
  return readStoredCharacter(id, data, undefined, { userId: PLAYER, currentUsername: 'player1' })
}

function renderSheet(character: CharacterRecord) {
  const props: CharacterTabProps = {
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
  render(<CharacterTab {...props} />)
  return props
}

/** Opens the character's Items page; a narrow layout shows the character list first. */
function openItemsPage() {
  fireEvent.click(screen.getByRole('button', { name: /^Elf Without Book/ }))
  fireEvent.click(screen.getAllByRole('button', { name: 'Items' })[0])
}

afterEach(() => cleanup())

describe('the OSE sheet with an old-format character', () => {
  it('shows the items OSE\'s step made of the old lists, with its spell book', () => {
    const character = oldFormatElf()
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
    const props = renderSheet(oldFormatElf())
    openItemsPage()

    const writtenInventories = vi.mocked(props.updateCharacter).mock.calls
      .map(([, updates]) => updates.details?.inventory)
      .filter((inventory) => inventory !== undefined)
    // The sheet writes a sparsely stored sheet's defaults when it opens it, items included.
    expect(writtenInventories.length).toBeGreaterThan(0)
    for (const inventory of writtenInventories) {
      expect(inventory.filter((item) => item.kind === 'general' && item.typeId === 'spell-book')).toHaveLength(1)
    }
  })
})
