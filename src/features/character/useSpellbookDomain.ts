// Spellbook domain: modal state, add/remove/memorize/consume handlers, sync effects.
// Persisted spell IDs stay in the container; this hook owns ephemeral UI state + mutations.

import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type {
  CharacterRecord,
  CharacterSpell,
  CharacterInventoryItem,
  CharacterGeneralItem,
} from '../../types/app'
import {
  SPELL_BOOK_TYPE_ID,
  arcaneSpellById,
  getAccessibleArcaneSpellLevels,
  spellBookSlotsPerSpellLevel,
} from './spellCatalog'
import { makeSpellBookItem } from './characterFactories'

type Params = {
  effectiveSelected: CharacterRecord | null
  selectedClassName: string
  selectedLevel: number
  selectedInventory: CharacterInventoryItem[]
  isInFinalizationFlow: boolean
  canEditSelected: boolean
  canMemorizeSpell: boolean
  requiresSpellLearnApproval: boolean
  currentUsername: string
  itemDetailId: string | null

  // Persisted state (owned by container)
  spellBookSpellIdsByCharacterId: Record<string, string[]>
  memorizedSpellIdsByCharacterId: Record<string, string[]>
  setSpellBookSpellIdsByCharacterId: Dispatch<SetStateAction<Record<string, string[]>>>
  setMemorizedSpellIdsByCharacterId: Dispatch<SetStateAction<Record<string, string[]>>>
  setInventoryByCharacterId: Dispatch<SetStateAction<Record<string, CharacterInventoryItem[]>>>

  submitSpellLearnRequest: (
    characterId: string,
    characterName: string,
    username: string,
    spellIds: string[],
    spellNames: string[],
  ) => Promise<void>
}

export function useSpellbookDomain({
  effectiveSelected,
  selectedClassName,
  selectedLevel,
  selectedInventory,
  isInFinalizationFlow,
  canEditSelected,
  canMemorizeSpell,
  requiresSpellLearnApproval,
  currentUsername,
  itemDetailId,
  spellBookSpellIdsByCharacterId,
  memorizedSpellIdsByCharacterId,
  setSpellBookSpellIdsByCharacterId,
  setMemorizedSpellIdsByCharacterId,
  setInventoryByCharacterId,
  submitSpellLearnRequest,
}: Params) {
  // ---------------------------------------------------------------------------
  // Ephemeral UI state
  // ---------------------------------------------------------------------------

  const [spellBookSelectedSpellId, setSpellBookSelectedSpellId] = useState<string | null>(null)
  const [spellBookAddModalOpen, setSpellBookAddModalOpen] = useState(false)
  const [spellBookAddTabLevel, setSpellBookAddTabLevel] = useState<number>(1)
  const [spellBookPendingAddIds, setSpellBookPendingAddIds] = useState<string[]>([])
  const [spellBookExpandedSpellId, setSpellBookExpandedSpellId] = useState<string | null>(null)
  const [memorizedSpellDetailId, setMemorizedSpellDetailId] = useState<string | null>(null)
  const [spellBookFeedback, setSpellBookFeedback] = useState<string | null>(null)

  // Auto-clear feedback
  useEffect(() => {
    if (!spellBookFeedback) return
    const timer = setTimeout(() => setSpellBookFeedback(null), 5000)
    return () => clearTimeout(timer)
  }, [spellBookFeedback])

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const selectedSpellBookItem = selectedInventory.find((item) =>
    item.kind === 'general' && item.typeId === SPELL_BOOK_TYPE_ID,
  ) as CharacterGeneralItem | undefined

  const selectedSpellBookSpellIds = effectiveSelected
    ? (spellBookSpellIdsByCharacterId[effectiveSelected.id] ?? [])
    : []
  const selectedMemorizedSpellIds = effectiveSelected
    ? (memorizedSpellIdsByCharacterId[effectiveSelected.id] ?? [])
    : []
  const selectedSpellBookSpells = selectedSpellBookSpellIds
    .map((id) => arcaneSpellById[id])
    .filter((spell): spell is CharacterSpell => !!spell)
  const selectedMemorizedSpells = selectedMemorizedSpellIds
    .map((id) => arcaneSpellById[id])
    .filter((spell): spell is CharacterSpell => !!spell)
  const accessibleSpellLevels = getAccessibleArcaneSpellLevels(selectedLevel)

  const canOpenSpellBookAddModal = !!effectiveSelected && canEditSelected && selectedClassName === 'Magic-User'

  const spellLevelCountsInBook = selectedSpellBookSpells.reduce<Record<number, number>>((acc, spell) => {
    acc[spell.level] = (acc[spell.level] ?? 0) + 1
    return acc
  }, {})
  const spellLevelCountsInPending = spellBookPendingAddIds
    .map((id) => arcaneSpellById[id])
    .filter((spell): spell is CharacterSpell => !!spell)
    .reduce<Record<number, number>>((acc, spell) => {
      acc[spell.level] = (acc[spell.level] ?? 0) + 1
      return acc
    }, {})
  const pendingSpellObjects = spellBookPendingAddIds
    .map((id) => arcaneSpellById[id])
    .filter((spell): spell is CharacterSpell => !!spell)
  const memorizedSpellDetail = memorizedSpellDetailId ? arcaneSpellById[memorizedSpellDetailId] ?? null : null

  // ---------------------------------------------------------------------------
  // Sync effects
  // ---------------------------------------------------------------------------

  // Ensure Magic-User gets a spell book item in inventory during creation
  function ensureSpellBookItemForCharacter(characterId: string) {
    setInventoryByCharacterId((current) => {
      const items = current[characterId] ?? []
      const hasSpellBook = items.some((item) => item.kind === 'general' && item.typeId === SPELL_BOOK_TYPE_ID)
      if (hasSpellBook) return current
      return {
        ...current,
        [characterId]: [...items, makeSpellBookItem()],
      }
    })
  }

  useEffect(() => {
    if (!effectiveSelected) return
    if (!isInFinalizationFlow) return
    if (effectiveSelected.className !== 'Magic-User') return
    ensureSpellBookItemForCharacter(effectiveSelected.id)
  }, [effectiveSelected?.id, effectiveSelected?.className, isInFinalizationFlow])

  // Reset selected spell when character changes or spell removed from book
  useEffect(() => {
    if (!effectiveSelected) {
      setSpellBookSelectedSpellId(null)
      return
    }
    const book = spellBookSpellIdsByCharacterId[effectiveSelected.id] ?? []
    if (!spellBookSelectedSpellId || book.includes(spellBookSelectedSpellId)) return
    setSpellBookSelectedSpellId(null)
  }, [effectiveSelected?.id, spellBookSpellIdsByCharacterId, spellBookSelectedSpellId])

  // Auto-select first spell when opening spell book detail
  useEffect(() => {
    if (!selectedSpellBookItem || itemDetailId !== selectedSpellBookItem.id) return
    if (spellBookSelectedSpellId) return
    const firstSpellId = selectedSpellBookSpellIds[0]
    if (!firstSpellId) return
    setSpellBookSelectedSpellId(firstSpellId)
  }, [itemDetailId, selectedSpellBookItem?.id, selectedSpellBookSpellIds, spellBookSelectedSpellId])

  // Close add modal when navigating away from spell book detail
  useEffect(() => {
    if (itemDetailId !== selectedSpellBookItem?.id) {
      setSpellBookAddModalOpen(false)
      setSpellBookPendingAddIds([])
    }
  }, [itemDetailId, selectedSpellBookItem?.id])

  // Clear memorized spell detail if spell no longer memorized
  useEffect(() => {
    if (!memorizedSpellDetailId) return
    if (!selectedMemorizedSpellIds.includes(memorizedSpellDetailId)) {
      setMemorizedSpellDetailId(null)
    }
  }, [memorizedSpellDetailId, selectedMemorizedSpellIds])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const memorizeSpell = (spellId: string) => {
    if (!effectiveSelected) return
    const spell = arcaneSpellById[spellId]
    if (!spell) return
    if (!canMemorizeSpell) {
      setSpellBookFeedback('Finalize character before memorizing spells.')
      return
    }
    if (!selectedSpellBookSpellIds.includes(spellId)) return
    if (selectedMemorizedSpellIds.includes(spellId)) {
      setSpellBookFeedback(`${spell.name} is already memorized.`)
      return
    }
    setMemorizedSpellIdsByCharacterId((current) => {
      const existing = current[effectiveSelected.id] ?? []
      if (existing.includes(spellId)) return current
      return {
        ...current,
        [effectiveSelected.id]: [...existing, spellId],
      }
    })
    setSpellBookFeedback(`${spell.name} memorized.`)
  }

  const removeSpellFromBook = (spellId: string) => {
    if (!effectiveSelected || !isInFinalizationFlow) return
    setSpellBookSpellIdsByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: (current[effectiveSelected.id] ?? []).filter((id) => id !== spellId),
    }))
    setMemorizedSpellIdsByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: (current[effectiveSelected.id] ?? []).filter((id) => id !== spellId),
    }))
    if (spellBookSelectedSpellId === spellId) setSpellBookSelectedSpellId(null)
  }

  const consumeMemorizedSpell = (spellId: string) => {
    if (!effectiveSelected) return
    const spellName = arcaneSpellById[spellId]?.name ?? 'Spell'
    setMemorizedSpellIdsByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: (current[effectiveSelected.id] ?? []).filter((id) => id !== spellId),
    }))
    setSpellBookFeedback(`${spellName} cast and removed from memorized spells.`)
  }

  const openSpellBookAddModal = () => {
    if (!canOpenSpellBookAddModal) return
    setSpellBookPendingAddIds([])
    setSpellBookExpandedSpellId(null)
    setSpellBookAddTabLevel(accessibleSpellLevels[0] ?? 1)
    setSpellBookAddModalOpen(true)
  }

  const queueSpellForBook = (spellId: string) => {
    const spell = arcaneSpellById[spellId]
    if (!spell) return
    if (!accessibleSpellLevels.includes(spell.level)) return
    if (selectedSpellBookSpellIds.includes(spell.id)) return
    if (spellBookPendingAddIds.includes(spell.id)) return
    const usedSlots = (spellLevelCountsInBook[spell.level] ?? 0) + (spellLevelCountsInPending[spell.level] ?? 0)
    if (usedSlots >= spellBookSlotsPerSpellLevel) {
      setSpellBookFeedback(`Level ${spell.level} already has its spell slot filled.`)
      return
    }
    setSpellBookPendingAddIds((current) => [...current, spell.id])
  }

  const removePendingSpell = (spellId: string) => {
    setSpellBookPendingAddIds((current) => current.filter((id) => id !== spellId))
  }

  const commitPendingSpellsToBook = () => {
    if (!effectiveSelected || spellBookPendingAddIds.length === 0) {
      setSpellBookAddModalOpen(false)
      return
    }
    const addedSpellNames = spellBookPendingAddIds
      .map((id) => arcaneSpellById[id]?.name)
      .filter((name): name is string => !!name)

    if (requiresSpellLearnApproval) {
      void submitSpellLearnRequest(
        effectiveSelected.id,
        effectiveSelected.name,
        currentUsername,
        spellBookPendingAddIds,
        addedSpellNames,
      )
      setSpellBookPendingAddIds([])
      setSpellBookAddModalOpen(false)
      setSpellBookFeedback('Spell transcription request sent to GM for approval.')
      return
    }

    setSpellBookSpellIdsByCharacterId((current) => {
      const existing = current[effectiveSelected.id] ?? []
      const merged = [...existing]
      for (const spellId of spellBookPendingAddIds) {
        if (!merged.includes(spellId)) merged.push(spellId)
      }
      return {
        ...current,
        [effectiveSelected.id]: merged,
      }
    })
    setSpellBookPendingAddIds([])
    setSpellBookAddModalOpen(false)
    setSpellBookFeedback(
      addedSpellNames.length === 1
        ? `${addedSpellNames[0]} added to spell book.`
        : `${addedSpellNames.length} spells added to spell book.`,
    )
  }

  return {
    // Ephemeral state (for JSX)
    spellBookSelectedSpellId,
    setSpellBookSelectedSpellId,
    spellBookAddModalOpen,
    setSpellBookAddModalOpen,
    spellBookAddTabLevel,
    setSpellBookAddTabLevel,
    spellBookPendingAddIds,
    spellBookExpandedSpellId,
    setSpellBookExpandedSpellId,
    memorizedSpellDetailId,
    setMemorizedSpellDetailId,
    spellBookFeedback,

    // Derived
    selectedSpellBookItem,
    selectedSpellBookSpellIds,
    selectedMemorizedSpellIds,
    selectedSpellBookSpells,
    selectedMemorizedSpells,
    accessibleSpellLevels,
    canOpenSpellBookAddModal,
    spellLevelCountsInBook,
    spellLevelCountsInPending,
    pendingSpellObjects,
    memorizedSpellDetail,

    // Handlers
    memorizeSpell,
    removeSpellFromBook,
    consumeMemorizedSpell,
    openSpellBookAddModal,
    queueSpellForBook,
    removePendingSpell,
    commitPendingSpellsToBook,
  }
}
