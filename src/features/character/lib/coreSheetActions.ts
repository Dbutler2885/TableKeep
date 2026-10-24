// The core sheet's ability-score, class-data, and re-roll actions, as functions of the tab's current state.

import type { Dispatch, SetStateAction } from 'react'
import type { CharacterRecord, ItemApprovalRequest } from '../../../types/app'
import {
  type AbilityCode,
  type AbilityScores,
  type SaveScores,
  saveScoresForClassLevel,
  thacoForClassLevel,
} from '../characterRules'
import type { CharacterTabProps } from './characterTabTypes'

type AbilityScoreEditState = {
  effectiveSelected: CharacterRecord | null
  canEditAbilityScores: boolean
  isGuidedCreation: boolean
  selectedClassName: string
  selectedAbilityScores: AbilityScores
  tryBuildGuidedScores: (code: string, nextValue: number) => AbilityScores | null
  setAbilityScoresByCharacterId: Dispatch<SetStateAction<Record<string, AbilityScores>>>
  openReallocationClassRequired: () => void
}

/** An established edit: blank empties the score, 1 to 18 sets it, and anything else is rejected with null. */
export function freeformAbilityScores(scores: AbilityScores, code: AbilityCode, value: string): AbilityScores | null {
  if (value.trim().length === 0) return { ...scores, [code]: '' }
  const nextValue = Number.parseInt(value, 10)
  if (!Number.isFinite(nextValue) || nextValue < 1 || nextValue > 18) return null
  return { ...scores, [code]: String(nextValue) }
}

/** The scores after an edit, or null when it changes nothing; a guided edit without a class asks for one instead. */
export function abilityScoresAfterEdit(state: AbilityScoreEditState, code: AbilityCode, value: string): AbilityScores | null {
  if (!state.isGuidedCreation) return freeformAbilityScores(state.selectedAbilityScores, code, value)
  if (state.selectedClassName === '-') {
    state.openReallocationClassRequired()
    return null
  }
  return state.tryBuildGuidedScores(code, Number.parseInt(value, 10))
}

export function updateAbilityScore(state: AbilityScoreEditState, code: AbilityCode, value: string) {
  const { effectiveSelected } = state
  if (!effectiveSelected || !state.canEditAbilityScores) return
  const nextScores = abilityScoresAfterEdit(state, code, value)
  if (!nextScores) return
  state.setAbilityScoresByCharacterId((current) => ({
    ...current,
    [effectiveSelected.id]: nextScores,
  }))
}

type ClassDerivedDataState = {
  effectiveSelected: CharacterRecord | null
  setSaveScoresByCharacterId: Dispatch<SetStateAction<Record<string, SaveScores>>>
  setThacoByCharacterId: Dispatch<SetStateAction<Record<string, string>>>
}

/** The selected character's level, or level one for any other character. */
export function classLevelFor(effectiveSelected: CharacterRecord | null, characterId: string) {
  return characterId === effectiveSelected?.id ? (effectiveSelected.level ?? 1) : 1
}

/** Sets the class's saves and THAC0 for the character, leaving either alone when the class has none. */
export function applyClassDerivedData(state: ClassDerivedDataState, characterId: string, className: string) {
  const classLevel = classLevelFor(state.effectiveSelected, characterId)
  const saveProfile = saveScoresForClassLevel(className, classLevel)
  if (saveProfile) {
    state.setSaveScoresByCharacterId((current) => ({
      ...current,
      [characterId]: saveProfile,
    }))
  }
  const nextThaco = thacoForClassLevel(className, classLevel)
  if (nextThaco !== null) {
    state.setThacoByCharacterId((current) => ({
      ...current,
      [characterId]: String(nextThaco),
    }))
  }
}

/** Whether the character already has a pending ability re-roll request. Status is checked here as well as by the subscription. */
export function hasPendingAbilityRerollFor(requests: ItemApprovalRequest[], effectiveSelected: CharacterRecord | null) {
  return requests.some((request) =>
    request.action === 'ability_reroll'
    && request.characterId === effectiveSelected?.id
    && request.status === 'pending',
  )
}

type AbilityScoreRollState = Pick<CharacterTabProps, 'role' | 'currentUsername'> & {
  effectiveSelected: CharacterRecord | null
  canEditSelected: boolean
  isGuidedCreation: boolean
  hasRolledAbilityScores: boolean
  hasPendingAbilityReroll: boolean
  rollAbilityScores: () => void
  submitAbilityRerollRequest: (characterId: string, characterName: string, username: string) => Promise<unknown>
  setApprovalPendingFeedback: (message: string) => void
}

/** The first roll, and any GM roll, happens at once; a player's re-roll needs GM approval. */
export function rollsWithoutApproval({ hasRolledAbilityScores, role }: Pick<AbilityScoreRollState, 'hasRolledAbilityScores' | 'role'>) {
  return !hasRolledAbilityScores || role === 'gm'
}

export function requestAbilityScoreRoll(state: AbilityScoreRollState) {
  const { effectiveSelected } = state
  if (!effectiveSelected || !state.canEditSelected || !state.isGuidedCreation) return
  if (rollsWithoutApproval(state)) {
    state.rollAbilityScores()
    return
  }
  if (state.hasPendingAbilityReroll) return
  void state.submitAbilityRerollRequest(
    effectiveSelected.id,
    effectiveSelected.name,
    state.currentUsername,
  )
  state.setApprovalPendingFeedback('Ability score re-roll sent to GM for approval.')
}
