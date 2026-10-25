import type { Role } from '../../types/app'
import { canEditCharacterStoreCharacter } from '../character/characterStore/characterStoreActions'
import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'
import type { LubecSheetEdit } from '../ruleSets/lubec/directEntry'
import type { LubecSkills } from '../ruleSets/lubec/skillPicks'
import type { LubecCountersChange } from './LubecCountersPanel'
import type { LubecCorrections } from './LubecSheetView'

/** Who is looking at the sheet. */
export type LubecViewer = { role: Role | null; userId: string }

type CharacterUpdate = (characterId: string, updates: Partial<LubecCharacterRecord>) => void

/** The shared store's two ways of saving an edit, which is all the sheet's edits need. */
export type LubecSheetWiringStore = {
  updateCharacter: CharacterUpdate
  /** Saves at once rather than after the delay. */
  updateCharacterNow: CharacterUpdate
}

type LubecSkillsChange = (skills: LubecSkills) => void

/** What the viewer may do to a draft; all are null for a finalized character or someone else's. */
type DraftActions = {
  onDraftEdit: LubecSheetEdit | null
  /** Saves at once rather than after the delay; only a guided draft's dice and Swap use it. */
  onRollUp: LubecSheetEdit | null
  onFinalize: (() => void) | null
}

/** The sheet's edits for one viewer; each is null when the viewer may not make it. */
export type LubecSheetEdits = DraftActions & {
  onCountersChange: LubecCountersChange | null
  onSkillsChange: LubecSkillsChange | null
  corrections: LubecCorrections | null
}

// The owner and the GM change a character's counters; anyone else only sees them.
function countersChangeFor(
  character: LubecCharacterRecord | null,
  viewer: LubecViewer,
  update: CharacterUpdate,
): LubecCountersChange | null {
  if (!character || (viewer.role !== 'gm' && character.ownerUserId !== viewer.userId)) return null
  return (counters) => update(character.id, { lubec: { ...character.lubec, counters } })
}

// The owner and the GM change a character's skills until it is finalized; anyone else only sees them.
function skillsChangeFor(
  character: LubecCharacterRecord | null,
  viewer: LubecViewer,
  update: CharacterUpdate,
): LubecSkillsChange | null {
  if (!character || character.creationStatus === 'active') return null
  if (!canEditCharacterStoreCharacter(character, viewer.role, viewer.userId)) return null
  return (skills) => update(character.id, { lubec: { ...character.lubec, skills } })
}

// The GM may correct any locked value on a finalized character; nobody else may change one.
function correctionsFor(
  character: LubecCharacterRecord | null,
  viewer: { role: Role | null },
  update: CharacterUpdate,
): LubecCorrections | null {
  if (!character || character.creationStatus !== 'active' || viewer.role !== 'gm') return null
  return {
    onDraftEdit: (changes) => update(character.id, { lubec: { ...character.lubec, ...changes } }),
    onSkillsChange: (skills) => update(character.id, { lubec: { ...character.lubec, skills } }),
  }
}

// The owner and the GM may type into a draft and finalize it;
// nobody may do either to a finalized character, which has no way back.
function draftActionsFor(
  character: LubecCharacterRecord | null,
  viewer: LubecViewer,
  store: LubecSheetWiringStore,
): DraftActions {
  if (!character || character.creationStatus === 'active' || !canEditCharacterStoreCharacter(character, viewer.role, viewer.userId)) {
    return { onDraftEdit: null, onRollUp: null, onFinalize: null }
  }
  return {
    onDraftEdit: (changes) => store.updateCharacter(character.id, { lubec: { ...character.lubec, ...changes } }),
    onRollUp: (changes) => store.updateCharacterNow(character.id, { lubec: { ...character.lubec, ...changes } }),
    onFinalize: () => store.updateCharacter(character.id, { creationStatus: 'active' }),
  }
}

/**
 * The open sheet's edits for this viewer, saved through the shared store.
 * Every tab that shows a Lubec sheet takes its edits from here, so a new edit
 * is wired once.
 */
export function lubecSheetWiring(
  character: LubecCharacterRecord | null,
  viewer: LubecViewer,
  store: LubecSheetWiringStore,
): LubecSheetEdits {
  return {
    onCountersChange: countersChangeFor(character, viewer, store.updateCharacter),
    onSkillsChange: skillsChangeFor(character, viewer, store.updateCharacter),
    corrections: correctionsFor(character, viewer, store.updateCharacter),
    ...draftActionsFor(character, viewer, store),
  }
}
