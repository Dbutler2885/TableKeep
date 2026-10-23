// @vitest-environment jsdom
/**
 * How the OSE sheet seeds its local state from stored characters, takes in
 * other people's edits, and writes local edits back, recorded before the
 * hook was split into small pieces. Since OSE's step took over converting
 * old-format sheets and adding missing spell books, hydration does neither.
 */
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { CharacterInventoryItem, CharacterRecord, CharacterSheetDetails } from '../../../types/app'
import { emptyAbilityScores } from '../characterRules'
import { stableStringify } from '../characterFactories'
import { useCharacterSheetState } from './useCharacterSheetState'
import { useCharacterPersistenceSync } from './useCharacterPersistenceSync'

type Props = {
  selectedCharacterId: string
  characters: CharacterRecord[]
  hasPendingWrite: (id: string) => boolean
  updateCharacter: (characterId: string, updates: Partial<CharacterRecord>) => void
  clearJustSeeded: boolean
}

type SheetMaps = ReturnType<typeof useCharacterSheetState>['stateMaps']

/** The sheet as CharacterTab wires it: sheet state, then persistence, then its justSeeded clearing effect. */
function useSheetWithPersistence({ clearJustSeeded, ...params }: Props) {
  const { stateMaps, stateSetters } = useCharacterSheetState()
  const sync = useCharacterPersistenceSync({ ...params, stateMaps, stateSetters })
  const { justSeededRef } = sync
  useEffect(() => {
    if (!clearJustSeeded || !params.selectedCharacterId) return
    justSeededRef.current.delete(params.selectedCharacterId)
  })
  return { ...sync, stateMaps, stateSetters }
}

const item = (id: string, name: string, extra: Record<string, unknown> = {}) =>
  ({ id, kind: 'general', name, typeId: id, typeName: name, qty: 1, ...extra }) as unknown as CharacterInventoryItem

const rope = item('rope', 'Rope')
const torch = item('torch', 'Torch')

const character = (id: string, details: Partial<CharacterSheetDetails> | null, className = 'Fighter') =>
  ({ id, className, details }) as unknown as CharacterRecord

const scores = { STR: '13', INT: '9', WIS: '10', DEX: '15', CON: '12', CHA: '8' }

/** A sheet with every field stored. */
const fullDetails = (): CharacterSheetDetails => ({
  abilityScores: scores,
  rolledAbilityScores: { ...scores, STR: '11' },
  abilityScoresRolled: true,
  hpBaseRoll: 6,
  inventory: [rope],
  thaco: '19',
  saveScores: { death: '12' },
  adventureScores: { listen: '2' },
  adventureSeedClass: 'Fighter',
  thiefSkills: { climb: '87' },
  startingGold: 120,
  storeSpent: 35,
  storeCart: [{ key: 'rope', name: 'Rope', costGp: 1, qty: 1, kind: 'general' }],
  spellBookSpellIds: ['sleep'],
  memorizedSpellIds: ['light'],
  alignment: 'Law',
  title: 'Veteran',
  languagesText: 'Common, Elvish',
  unencumberingItemsText: 'Ring',
  otherNotesText: 'Owes the guild',
})

/** The sheet state CharacterTab shows for a fully stored character. */
const fullSheetState = () => ({
  abilityScoresByCharacterId: scores,
  rolledAbilityScoresByCharacterId: { ...scores, STR: '11' },
  abilityScoresRolledByCharacterId: true,
  hpBaseRollByCharacterId: 6,
  inventoryByCharacterId: [rope],
  thacoByCharacterId: '19',
  saveScoresByCharacterId: { death: '12' },
  adventureScoresByCharacterId: { listen: '2' },
  adventureSeedClassByCharacterId: 'Fighter',
  thiefSkillsByCharacterId: { climb: '87' },
  startingGoldByCharacterId: 120,
  storeSpentByCharacterId: 35,
  storeCartByCharacterId: [{ key: 'rope', name: 'Rope', costGp: 1, qty: 1, kind: 'general' }],
  spellBookSpellIdsByCharacterId: ['sleep'],
  memorizedSpellIdsByCharacterId: ['light'],
  alignmentByCharacterId: 'Law',
  titleByCharacterId: 'Veteran',
  languagesTextByCharacterId: 'Common, Elvish',
  unencumberingItemsTextByCharacterId: 'Ring',
  otherNotesTextByCharacterId: 'Owes the guild',
})

/** The details a sheet with no local state writes. */
const defaultDetails = (): CharacterSheetDetails => ({
  abilityScores: emptyAbilityScores(),
  rolledAbilityScores: null,
  abilityScoresRolled: false,
  hpBaseRoll: null,
  inventory: [],
  thaco: '',
  saveScores: null,
  adventureScores: null,
  adventureSeedClass: '',
  thiefSkills: null,
  startingGold: null,
  storeSpent: 0,
  storeCart: [],
  spellBookSpellIds: [],
  memorizedSpellIds: [],
  alignment: 'Neutrality',
  title: '',
  languagesText: '',
  unencumberingItemsText: '',
  otherNotesText: '',
})

/** Every sheet field held for one character, by state map name. */
const sheetState = (maps: SheetMaps, id: string) =>
  Object.fromEntries(
    Object.entries(maps)
      .filter(([, byId]) => id in byId)
      .map(([name, byId]) => [name, (byId as Record<string, unknown>)[id]]),
  )

function renderSheet(overrides: Partial<Props> = {}) {
  const pending = new Set<string>()
  const props: Props = {
    selectedCharacterId: '',
    characters: [],
    hasPendingWrite: (id) => pending.has(id),
    updateCharacter: vi.fn(),
    clearJustSeeded: true,
    ...overrides,
  }
  const view = renderHook((current: Props) => useSheetWithPersistence(current), { initialProps: props })
  let latest = props
  const rerender = (next: Partial<Props>) => {
    latest = { ...latest, ...next }
    view.rerender(latest)
  }
  return { ...view, rerender, pending, updateCharacter: vi.mocked(props.updateCharacter) }
}

afterEach(() => cleanup())

describe('seeding a character the first time it loads', () => {
  it('copies every stored sheet field into the sheet state', () => {
    const { result } = renderSheet({ characters: [character('a', fullDetails())] })
    expect(sheetState(result.current.stateMaps, 'a')).toEqual(fullSheetState())
    expect(result.current.seededCharacterIdsRef.current).toEqual(new Set(['a']))
    expect(result.current.lastPersistedDetailsJsonRef.current.a).toBe(stableStringify(fullDetails()))
  })

  it('leaves out each field that is missing or empty, except the items', () => {
    const { result } = renderSheet({ characters: [character('a', {})] })
    expect(sheetState(result.current.stateMaps, 'a')).toEqual({ inventoryByCharacterId: [] })
    expect(result.current.lastPersistedDetailsJsonRef.current.a).toBe('{}')
  })

  it('takes numbers and notes by their type, and everything else only when it is set', () => {
    const { result } = renderSheet({
      characters: [character('a', {
        abilityScoresRolled: false,
        hpBaseRoll: 0,
        inventory: [],
        thaco: '',
        adventureSeedClass: '',
        startingGold: 0,
        storeSpent: 0,
        alignment: '',
        title: '',
        languagesText: '',
        unencumberingItemsText: '',
        otherNotesText: '',
      })],
    })
    expect(sheetState(result.current.stateMaps, 'a')).toEqual({
      hpBaseRollByCharacterId: 0,
      inventoryByCharacterId: [],
      startingGoldByCharacterId: 0,
      storeSpentByCharacterId: 0,
      languagesTextByCharacterId: '',
      unencumberingItemsTextByCharacterId: '',
      otherNotesTextByCharacterId: '',
    })
  })

  // The migration gave every stored arcane caster its spell book; hydration adds none.
  it('adds no spell book to an arcane caster', () => {
    const { result } = renderSheet({ characters: [character('a', { ...fullDetails(), inventory: [rope] }, 'Magic-User')] })
    expect(result.current.stateMaps.inventoryByCharacterId.a).toEqual([rope])
  })

  it('keeps an arcane caster\'s spell book as stored', () => {
    const book = item('book', 'Spell book', { typeId: 'spell-book' })
    const { result } = renderSheet({ characters: [character('a', { ...fullDetails(), inventory: [book] }, 'Elf')] })
    expect(result.current.stateMaps.inventoryByCharacterId.a).toEqual([book])
  })

  it('seeds nothing for a character with no sheet and remembers it as stored without one', () => {
    const { result } = renderSheet({ characters: [character('a', null)] })
    expect(sheetState(result.current.stateMaps, 'a')).toEqual({})
    expect(result.current.seededCharacterIdsRef.current).toEqual(new Set(['a']))
    expect(result.current.lastPersistedDetailsJsonRef.current.a).toBe('null')
  })

  it('seeds each character once, however often the list arrives', () => {
    const { result, rerender } = renderSheet({ characters: [character('a', fullDetails())] })
    act(() => result.current.stateSetters.setTitleByCharacterId((prev) => ({ ...prev, a: 'Hero' })))
    rerender({ characters: [character('a', fullDetails()), character('b', fullDetails())] })
    expect(result.current.stateMaps.titleByCharacterId).toEqual({ a: 'Hero', b: 'Veteran' })
  })

  it('marks a character just seeded until CharacterTab clears it', () => {
    const { result } = renderSheet({ characters: [character('a', fullDetails())], clearJustSeeded: false })
    expect(result.current.justSeededRef.current).toEqual(new Set(['a']))
  })
})

describe('writing local edits', () => {
  it('writes nothing when a fully stored character is opened', () => {
    const { updateCharacter } = renderSheet({ selectedCharacterId: 'a', characters: [character('a', fullDetails())] })
    expect(updateCharacter).not.toHaveBeenCalled()
  })

  it('writes the whole sheet when the open character is edited, once per change', () => {
    const { result, updateCharacter } = renderSheet({ selectedCharacterId: 'a', characters: [character('a', fullDetails())] })
    act(() => result.current.stateSetters.setThacoByCharacterId((prev) => ({ ...prev, a: '17' })))
    expect(updateCharacter).toHaveBeenCalledTimes(1)
    expect(updateCharacter).toHaveBeenCalledWith('a', { details: { ...fullDetails(), thaco: '17' } })
    expect(result.current.lastPersistedDetailsJsonRef.current.a).toBe(stableStringify({ ...fullDetails(), thaco: '17' }))
    act(() => result.current.stateSetters.setTitleByCharacterId((prev) => ({ ...prev, b: 'Unrelated' })))
    expect(updateCharacter).toHaveBeenCalledTimes(1)
  })

  it('writes every sheet field it holds, filling defaults for the ones it does not', () => {
    const { updateCharacter } = renderSheet({ selectedCharacterId: 'a', characters: [character('a', {})] })
    expect(updateCharacter).toHaveBeenCalledTimes(1)
    expect(updateCharacter).toHaveBeenCalledWith('a', { details: defaultDetails() })
  })

  it('writes nothing for a character stored without a sheet until it is edited, then a default sheet', () => {
    const { result, updateCharacter } = renderSheet({ selectedCharacterId: 'a', characters: [character('a', null)] })
    expect(updateCharacter).not.toHaveBeenCalled()
    act(() => result.current.stateSetters.setTitleByCharacterId((prev) => ({ ...prev, a: 'Hero' })))
    expect(updateCharacter).toHaveBeenCalledTimes(1)
    expect(updateCharacter).toHaveBeenCalledWith('a', { details: { ...defaultDetails(), title: 'Hero' } })
  })

  it('writes an arcane caster\'s items as stored with the first edit after the caster is opened', () => {
    const { result, rerender, updateCharacter } = renderSheet({ characters: [character('a', fullDetails(), 'Magic-User')] })
    rerender({ selectedCharacterId: 'a' })
    expect(updateCharacter).not.toHaveBeenCalled()
    act(() => result.current.stateSetters.setTitleByCharacterId((prev) => ({ ...prev, a: 'Hero' })))
    expect(updateCharacter).toHaveBeenCalledTimes(1)
    expect(updateCharacter).toHaveBeenCalledWith('a', { details: { ...fullDetails(), title: 'Hero' } })
  })

  it('does not write while the open character is still marked just seeded', () => {
    const { result, updateCharacter } = renderSheet({
      selectedCharacterId: 'a',
      characters: [character('a', {})],
      clearJustSeeded: false,
    })
    act(() => result.current.stateSetters.setThacoByCharacterId((prev) => ({ ...prev, a: '17' })))
    expect(updateCharacter).not.toHaveBeenCalled()
  })

  it('does not write edits to a character that is not open, or before any is chosen', () => {
    const { result, updateCharacter } = renderSheet({ characters: [character('a', fullDetails())] })
    act(() => result.current.stateSetters.setThacoByCharacterId((prev) => ({ ...prev, a: '17' })))
    expect(updateCharacter).not.toHaveBeenCalled()
  })

  it('does not write for an open character that has not loaded', () => {
    const { result, updateCharacter } = renderSheet({ selectedCharacterId: 'a' })
    act(() => result.current.stateSetters.setThacoByCharacterId((prev) => ({ ...prev, a: '17' })))
    expect(updateCharacter).not.toHaveBeenCalled()
    expect(result.current.seededCharacterIdsRef.current.size).toBe(0)
  })

  it('writes an edit made before a character was opened with the first edit after it is', () => {
    const { result, rerender, updateCharacter } = renderSheet({
      selectedCharacterId: 'a',
      characters: [character('a', fullDetails()), character('b', fullDetails())],
    })
    act(() => result.current.stateSetters.setThacoByCharacterId((prev) => ({ ...prev, b: '15' })))
    rerender({ selectedCharacterId: 'b' })
    expect(updateCharacter).not.toHaveBeenCalled()
    act(() => result.current.stateSetters.setTitleByCharacterId((prev) => ({ ...prev, b: 'Hero' })))
    expect(updateCharacter).toHaveBeenCalledTimes(1)
    expect(updateCharacter).toHaveBeenCalledWith('b', { details: { ...fullDetails(), thaco: '15', title: 'Hero' } })
  })

  it('writes an edit made before a settled character was opened as soon as it is', () => {
    const { result, rerender, updateCharacter } = renderSheet({ selectedCharacterId: 'a', characters: [character('a', fullDetails())] })
    rerender({ selectedCharacterId: '' })
    act(() => result.current.stateSetters.setThacoByCharacterId((prev) => ({ ...prev, a: '15' })))
    expect(updateCharacter).not.toHaveBeenCalled()
    rerender({ selectedCharacterId: 'a' })
    expect(updateCharacter).toHaveBeenCalledWith('a', { details: { ...fullDetails(), thaco: '15' } })
  })

  it('writes through the newest updateCharacter it was given', () => {
    const { result, rerender, updateCharacter } = renderSheet({ selectedCharacterId: 'a', characters: [character('a', fullDetails())] })
    const newer = vi.fn()
    rerender({ updateCharacter: newer })
    act(() => result.current.stateSetters.setThacoByCharacterId((prev) => ({ ...prev, a: '17' })))
    expect(updateCharacter).not.toHaveBeenCalled()
    expect(newer).toHaveBeenCalledTimes(1)
  })

  it('writes again after CharacterTab forgets what it last wrote', () => {
    const { result, rerender, updateCharacter } = renderSheet({ selectedCharacterId: 'a', characters: [character('a', fullDetails())] })
    delete result.current.lastPersistedDetailsJsonRef.current.a
    rerender({ selectedCharacterId: '' })
    rerender({ selectedCharacterId: 'a' })
    expect(updateCharacter).toHaveBeenCalledWith('a', { details: fullDetails() })
  })
})

describe('taking in another person\'s edit', () => {
  it('replaces the sheet state with the incoming sheet', () => {
    const { result, rerender } = renderSheet({ characters: [character('a', {})] })
    rerender({ characters: [character('a', fullDetails())] })
    expect(sheetState(result.current.stateMaps, 'a')).toEqual(fullSheetState())
    expect(result.current.lastPersistedDetailsJsonRef.current.a).toBe(stableStringify(fullDetails()))
  })

  it('clears some fields an incoming sheet leaves out and keeps the rest', () => {
    const { result, rerender } = renderSheet({ characters: [character('a', fullDetails())] })
    rerender({ characters: [character('a', { inventory: [rope] })] })
    expect(sheetState(result.current.stateMaps, 'a')).toEqual({
      ...fullSheetState(),
      abilityScoresByCharacterId: emptyAbilityScores(),
      abilityScoresRolledByCharacterId: false,
      thacoByCharacterId: '',
      spellBookSpellIdsByCharacterId: [],
      memorizedSpellIdsByCharacterId: [],
      languagesTextByCharacterId: '',
      unencumberingItemsTextByCharacterId: '',
      otherNotesTextByCharacterId: '',
    })
  })

  it('keeps the earlier values for unset fields an incoming sheet stores as empty', () => {
    const { result, rerender } = renderSheet({ characters: [character('a', fullDetails())] })
    rerender({
      characters: [character('a', {
        inventory: [rope],
        hpBaseRoll: null,
        adventureSeedClass: '',
        startingGold: null,
        alignment: '',
        title: '',
        languagesText: 'Common',
        unencumberingItemsText: '',
        otherNotesText: '',
      })],
    })
    expect(sheetState(result.current.stateMaps, 'a')).toEqual({
      ...fullSheetState(),
      abilityScoresByCharacterId: emptyAbilityScores(),
      abilityScoresRolledByCharacterId: false,
      thacoByCharacterId: '',
      spellBookSpellIdsByCharacterId: [],
      memorizedSpellIdsByCharacterId: [],
      languagesTextByCharacterId: 'Common',
      unencumberingItemsTextByCharacterId: '',
      otherNotesTextByCharacterId: '',
    })
  })

  it('leaves the sheet alone when the incoming sheet is the one it last stored', () => {
    const { result, rerender } = renderSheet({ characters: [character('a', fullDetails())] })
    act(() => result.current.stateSetters.setTitleByCharacterId((prev) => ({ ...prev, a: 'Hero' })))
    rerender({ characters: [character('a', fullDetails())] })
    expect(result.current.stateMaps.titleByCharacterId.a).toBe('Hero')
  })

  it('overwrites an unsaved edit to a character that is not open', () => {
    const { result, rerender } = renderSheet({ characters: [character('a', fullDetails())] })
    act(() => result.current.stateSetters.setTitleByCharacterId((prev) => ({ ...prev, a: 'Hero' })))
    rerender({ characters: [character('a', { ...fullDetails(), thaco: '17' })] })
    expect(result.current.stateMaps.titleByCharacterId.a).toBe('Veteran')
    expect(result.current.stateMaps.thacoByCharacterId.a).toBe('17')
  })

  it('takes in nothing while the character has a write waiting', () => {
    const { result, rerender, pending } = renderSheet({ characters: [character('a', fullDetails())] })
    pending.add('a')
    rerender({ characters: [character('a', { ...fullDetails(), thaco: '17', inventory: [torch] })] })
    expect(sheetState(result.current.stateMaps, 'a')).toEqual(fullSheetState())
    expect(result.current.lastPersistedDetailsJsonRef.current.a).toBe(stableStringify(fullDetails()))
  })

  it('takes in an edit once the waiting write is done', () => {
    const { result, rerender, pending } = renderSheet({ characters: [character('a', fullDetails())] })
    pending.add('a')
    rerender({ characters: [character('a', { ...fullDetails(), thaco: '17' })] })
    pending.delete('a')
    rerender({ hasPendingWrite: (id) => pending.has(id) })
    expect(result.current.stateMaps.thacoByCharacterId.a).toBe('17')
  })

  it('keeps an edit made to the open character in the same render, and writes it', () => {
    const { result, rerender, updateCharacter } = renderSheet({ selectedCharacterId: 'a', characters: [character('a', fullDetails())] })
    act(() => {
      result.current.stateSetters.setThacoByCharacterId((prev) => ({ ...prev, a: '15' }))
      rerender({ characters: [character('a', { ...fullDetails(), thaco: '17', title: 'Lord' })] })
    })
    expect(result.current.stateMaps.thacoByCharacterId.a).toBe('15')
    expect(result.current.stateMaps.titleByCharacterId.a).toBe('Veteran')
    expect(updateCharacter).toHaveBeenCalledTimes(1)
    expect(updateCharacter).toHaveBeenCalledWith('a', { details: { ...fullDetails(), thaco: '15' } })
  })

  it('writes back the mix of kept and incoming fields when the open character takes in a sparse sheet', () => {
    const { rerender, updateCharacter } = renderSheet({ selectedCharacterId: 'a', characters: [character('a', fullDetails())] })
    rerender({ characters: [character('a', { inventory: [rope] })] })
    expect(updateCharacter).toHaveBeenCalledTimes(1)
    expect(updateCharacter).toHaveBeenCalledWith('a', {
      details: {
        ...fullDetails(),
        abilityScores: emptyAbilityScores(),
        abilityScoresRolled: false,
        thaco: '',
        spellBookSpellIds: [],
        memorizedSpellIds: [],
        languagesText: '',
        unencumberingItemsText: '',
        otherNotesText: '',
      },
    })
  })

  it('takes in a sheet for a character first stored without one', () => {
    const { result, rerender } = renderSheet({ characters: [character('a', null)] })
    rerender({ characters: [character('a', fullDetails())] })
    expect(sheetState(result.current.stateMaps, 'a')).toEqual(fullSheetState())
  })

  it('ignores a character that loses its sheet', () => {
    const { result, rerender } = renderSheet({ characters: [character('a', fullDetails())] })
    rerender({ characters: [character('a', null)] })
    expect(sheetState(result.current.stateMaps, 'a')).toEqual(fullSheetState())
    expect(result.current.lastPersistedDetailsJsonRef.current.a).toBe(stableStringify(fullDetails()))
  })
})

describe('taking in another person\'s items', () => {
  it('takes in changed items', () => {
    const { result, rerender } = renderSheet({ characters: [character('a', fullDetails())] })
    rerender({ characters: [character('a', { ...fullDetails(), inventory: [rope, torch] })] })
    expect(result.current.stateMaps.inventoryByCharacterId.a).toEqual([rope, torch])
  })

  it('keeps unsaved local items on a character that is not open', () => {
    const { result, rerender } = renderSheet({ characters: [character('a', fullDetails())] })
    act(() => result.current.stateSetters.setInventoryByCharacterId((prev) => ({ ...prev, a: [torch] })))
    rerender({ characters: [character('a', { ...fullDetails(), inventory: [rope, torch], thaco: '17' })] })
    expect(result.current.stateMaps.inventoryByCharacterId.a).toEqual([torch])
    expect(result.current.stateMaps.thacoByCharacterId.a).toBe('17')
  })

  it('takes in items again once local items are back to what was stored', () => {
    const { result, rerender } = renderSheet({ characters: [character('a', fullDetails())] })
    act(() => result.current.stateSetters.setInventoryByCharacterId((prev) => ({ ...prev, a: [torch] })))
    act(() => result.current.stateSetters.setInventoryByCharacterId((prev) => ({ ...prev, a: [rope] })))
    rerender({ characters: [character('a', { ...fullDetails(), inventory: [rope, torch] })] })
    expect(result.current.stateMaps.inventoryByCharacterId.a).toEqual([rope, torch])
  })

  it('takes in an arcane caster\'s changed items, having added nothing to them locally', () => {
    const { result, rerender } = renderSheet({ characters: [character('a', fullDetails(), 'Magic-User')] })
    rerender({ characters: [character('a', { ...fullDetails(), inventory: [rope, torch] }, 'Magic-User')] })
    expect(result.current.stateMaps.inventoryByCharacterId.a).toEqual([rope, torch])
  })

  it('takes in the items of a character first stored without a sheet', () => {
    const { result, rerender } = renderSheet({ characters: [character('a', null)] })
    rerender({ characters: [character('a', { inventory: [torch] })] })
    expect(result.current.stateMaps.inventoryByCharacterId.a).toEqual([torch])
  })

  it('does not take in empty items for a character first stored without a sheet', () => {
    const { result, rerender } = renderSheet({ characters: [character('a', null)] })
    rerender({ characters: [character('a', { title: 'Hero' })] })
    expect(result.current.stateMaps.inventoryByCharacterId).not.toHaveProperty('a')
  })
})
