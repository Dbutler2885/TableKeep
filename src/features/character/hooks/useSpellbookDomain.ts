// Owns spellbook selection, draft-reset, and inventory-sync effects.
// Declare this hook before the orchestrator's justSeeded clearing effect.
// Persisted spell IDs stay in the container; this hook owns ephemeral UI state + mutations.

import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type {
  CharacterRecord,
  CharacterSpell,
  CharacterInventoryItem,
  CharacterGeneralItem,
} from '../../../types/app'
import {
  SPELL_BOOK_TYPE_ID,
  arcaneSpellById,
  getAccessibleDivineSpellLevels,
  getCappedAccessibleArcaneSpellLevels,
  getCappedArcaneSpellsPerDay,
  getDivineSpellsPerDay,
  divineSpellById,
} from '../spellCatalog'
import { ensureSpellBookInInventory, isArcaneSpellbookClass } from '../characterFactories'

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
  const [divinePrepareModalOpen, setDivinePrepareModalOpen] = useState(false)
  const [divinePrepareTabLevel, setDivinePrepareTabLevel] = useState<number>(1)
  const [divinePrepareExpandedSpellId, setDivinePrepareExpandedSpellId] = useState<string | null>(null)
  const [divinePreparedDraftIds, setDivinePreparedDraftIds] = useState<string[]>([])
  const [memorizedSpellDetailId, setMemorizedSpellDetailId] = useState<string | null>(null)
  const [spellBookFeedback, setSpellBookFeedback] = useState<string | null>(null)
  const hasArcaneSpellbook = selectedClassName === 'Magic-User' || selectedClassName === 'Elf'

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
  const classSpellById = selectedClassName === 'Cleric' ? divineSpellById : arcaneSpellById
  const selectedMemorizedSpells = selectedMemorizedSpellIds
    .map((id) => classSpellById[id])
    .filter((spell): spell is CharacterSpell => !!spell)
  // Per-class arcane caps (elves: level 10 / 5th-level spells) are applied on top of the
  // shared magic-user tables, so an elf never gains 6th-level spells or level 11+ slots
  // even if their level is somehow set beyond the class maximum.
  const accessibleArcaneSpellLevels = getCappedAccessibleArcaneSpellLevels(selectedClassName, selectedLevel)
  const accessibleDivineSpellLevels = getAccessibleDivineSpellLevels(selectedLevel)
  const arcaneSpellsPerDay = getCappedArcaneSpellsPerDay(selectedClassName, selectedLevel)
  const divineSpellsPerDay = getDivineSpellsPerDay(selectedLevel)
  const preparedSpellLevels = selectedClassName === 'Cleric' ? accessibleDivineSpellLevels : accessibleArcaneSpellLevels
  const preparedSlotsPerDay = selectedClassName === 'Cleric' ? divineSpellsPerDay : arcaneSpellsPerDay

  const canOpenSpellBookAddModal = !!effectiveSelected && canEditSelected && hasArcaneSpellbook
  const canOpenDivinePrepareModal = !!effectiveSelected && canEditSelected && canMemorizeSpell && selectedClassName === 'Cleric'

  const memorizedCountsByLevel = selectedMemorizedSpells.reduce<Record<number, number>>((acc, spell) => {
    acc[spell.level] = (acc[spell.level] ?? 0) + 1
    return acc
  }, {})
  const pendingSpellObjects = spellBookPendingAddIds
    .map((id) => arcaneSpellById[id])
    .filter((spell): spell is CharacterSpell => !!spell)
  const memorizedSpellDetail = memorizedSpellDetailId ? classSpellById[memorizedSpellDetailId] ?? null : null
  const preparedCountsBySpellId = selectedMemorizedSpellIds.reduce<Record<string, number>>((acc, spellId) => {
    acc[spellId] = (acc[spellId] ?? 0) + 1
    return acc
  }, {})
  const divinePreparedDraftSpells = divinePreparedDraftIds
    .map((id) => divineSpellById[id])
    .filter((spell): spell is CharacterSpell => !!spell)
  const divineDraftCountsByLevel = divinePreparedDraftSpells.reduce<Record<number, number>>((acc, spell) => {
    acc[spell.level] = (acc[spell.level] ?? 0) + 1
    return acc
  }, {})
  const divineDraftCountsBySpellId = divinePreparedDraftIds.reduce<Record<string, number>>((acc, spellId) => {
    acc[spellId] = (acc[spellId] ?? 0) + 1
    return acc
  }, {})

  // ---------------------------------------------------------------------------
  // Sync effects
  // ---------------------------------------------------------------------------

  // Ensure arcane spellcasters get a spell book item in inventory during creation.
  // (Already-finalized characters are healed on load in useCharacterPersistenceSync.)
  function ensureSpellBookItemForCharacter(characterId: string, className: string) {
    setInventoryByCharacterId((current) => {
      const items = current[characterId] ?? []
      const nextItems = ensureSpellBookInInventory(className, items)
      if (nextItems === items) return current
      return { ...current, [characterId]: nextItems }
    })
  }

  useEffect(() => {
    if (!effectiveSelected) return
    if (!isInFinalizationFlow) return
    if (!isArcaneSpellbookClass(effectiveSelected.className)) return
    ensureSpellBookItemForCharacter(effectiveSelected.id, effectiveSelected.className)
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

  useEffect(() => {
    if (selectedClassName !== 'Cleric' || !canMemorizeSpell) {
      setDivinePrepareModalOpen(false)
    }
  }, [selectedClassName, canMemorizeSpell])

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
    const spellLevelIndex = Math.max(0, spell.level - 1)
    const slotsAtLevel = arcaneSpellsPerDay[spellLevelIndex] ?? 0
    if (slotsAtLevel <= 0) {
      setSpellBookFeedback(`No level ${spell.level} spell slots available.`)
      return
    }
    const usedSlotsAtLevel = memorizedCountsByLevel[spell.level] ?? 0
    if (usedSlotsAtLevel >= slotsAtLevel) {
      setSpellBookFeedback(`Level ${spell.level} spell slots are full (${usedSlotsAtLevel}/${slotsAtLevel}).`)
      return
    }
    setMemorizedSpellIdsByCharacterId((current) => {
      const existing = current[effectiveSelected.id] ?? []
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
    const spellName = classSpellById[spellId]?.name ?? 'Spell'
    setMemorizedSpellIdsByCharacterId((current) => {
      const existing = current[effectiveSelected.id] ?? []
      const removeIndex = existing.indexOf(spellId)
      if (removeIndex < 0) return current
      const next = [...existing]
      next.splice(removeIndex, 1)
      return {
        ...current,
        [effectiveSelected.id]: next,
      }
    })
    setSpellBookFeedback(`${spellName} cast and removed from memorized spells.`)
  }

  const openDivinePrepareModal = () => {
    if (!canOpenDivinePrepareModal) return
    setDivinePrepareExpandedSpellId(null)
    setDivinePrepareTabLevel(accessibleDivineSpellLevels[0] ?? 1)
    setDivinePreparedDraftIds(selectedMemorizedSpellIds)
    setDivinePrepareModalOpen(true)
  }

  const prepareDivineSpell = (spellId: string) => {
    if (!effectiveSelected || selectedClassName !== 'Cleric') return
    const spell = divineSpellById[spellId]
    if (!spell) return
    if (!canMemorizeSpell) {
      setSpellBookFeedback('Finalize character before preparing spells.')
      return
    }
    const levelIndex = Math.max(0, spell.level - 1)
    const slotsAtLevel = divineSpellsPerDay[levelIndex] ?? 0
    if (slotsAtLevel <= 0) {
      setSpellBookFeedback(`No level ${spell.level} spell slots available.`)
      return
    }
    const usedSlotsAtLevel = divineDraftCountsByLevel[spell.level] ?? 0
    if (usedSlotsAtLevel >= slotsAtLevel) {
      setSpellBookFeedback(`Level ${spell.level} spell slots are full (${usedSlotsAtLevel}/${slotsAtLevel}).`)
      return
    }
    setDivinePreparedDraftIds((current) => [...current, spell.id])
  }

  const removePreparedDivineSpell = (spellId: string) => {
    if (!effectiveSelected || selectedClassName !== 'Cleric') return
    setDivinePreparedDraftIds((current) => {
      const removeIndex = current.indexOf(spellId)
      if (removeIndex < 0) return current
      const next = [...current]
      next.splice(removeIndex, 1)
      return next
    })
  }

  const clearPreparedDivineSpells = () => {
    if (selectedClassName !== 'Cleric') return
    setDivinePreparedDraftIds([])
  }

  const commitPreparedDivineSpells = () => {
    if (!effectiveSelected || selectedClassName !== 'Cleric') return
    setMemorizedSpellIdsByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: divinePreparedDraftIds,
    }))
    setDivinePrepareModalOpen(false)
    setDivinePrepareExpandedSpellId(null)
    setSpellBookFeedback('Prepared spells updated.')
  }

  const openSpellBookAddModal = () => {
    if (!canOpenSpellBookAddModal) return
    setSpellBookPendingAddIds([])
    setSpellBookExpandedSpellId(null)
    setSpellBookAddTabLevel(accessibleArcaneSpellLevels[0] ?? 1)
    setSpellBookAddModalOpen(true)
  }

  const queueSpellForBook = (spellId: string) => {
    const spell = arcaneSpellById[spellId]
    if (!spell) return
    if (!accessibleArcaneSpellLevels.includes(spell.level)) return
    if (selectedSpellBookSpellIds.includes(spell.id)) return
    if (spellBookPendingAddIds.includes(spell.id)) return
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
    setSpellBookPendingAddIds,
    spellBookExpandedSpellId,
    setSpellBookExpandedSpellId,
    divinePrepareModalOpen,
    setDivinePrepareModalOpen,
    divinePrepareTabLevel,
    setDivinePrepareTabLevel,
    divinePrepareExpandedSpellId,
    setDivinePrepareExpandedSpellId,
    divinePreparedDraftIds,
    setDivinePreparedDraftIds,
    memorizedSpellDetailId,
    setMemorizedSpellDetailId,
    spellBookFeedback,

    // Derived
    selectedSpellBookItem,
    selectedSpellBookSpellIds,
    selectedMemorizedSpellIds,
    selectedSpellBookSpells,
    selectedMemorizedSpells,
    accessibleSpellLevels: accessibleArcaneSpellLevels,
    canOpenSpellBookAddModal,
    canOpenDivinePrepareModal,
    arcaneSpellsPerDay,
    divineSpellsPerDay,
    preparedSpellLevels,
    preparedSlotsPerDay,
    memorizedCountsByLevel,
    preparedCountsBySpellId,
    divinePreparedDraftSpells,
    divineDraftCountsByLevel,
    divineDraftCountsBySpellId,
    pendingSpellObjects,
    memorizedSpellDetail,

    // Handlers
    memorizeSpell,
    removeSpellFromBook,
    consumeMemorizedSpell,
    openSpellBookAddModal,
    openDivinePrepareModal,
    prepareDivineSpell,
    removePreparedDivineSpell,
    clearPreparedDivineSpells,
    commitPreparedDivineSpells,
    queueSpellForBook,
    removePendingSpell,
    commitPendingSpellsToBook,
  }
}
