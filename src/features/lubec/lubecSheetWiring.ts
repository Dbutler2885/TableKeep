import type { Role } from '../../types/app'
import { canEditCharacterStoreCharacter } from '../character/characterStore/characterStoreActions'
import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'
import type { LubecSheetEdit } from '../ruleSets/lubec/directEntry'
import type { LubecGear } from '../ruleSets/lubec/gear/gearRecord'
import type { LubecSkills } from '../ruleSets/lubec/skillPicks'
import { lubecGearDrop, type LubecGearDrop, type LubecGearRecords } from './gear/lubecGearDrop'
import type { LubecGearChange } from './gear/LubecGearPage'
import { lubecCharacterName } from './lubecNames'
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
  /** True while a save of the character waits out its delay or is in flight. */
  hasPendingWrite: (characterId: string) => boolean
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
  onGearChange: LubecGearChange
  onGearDrop: LubecGearDrop
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

// The owner and the GM change a character's gear at every stage, draft or in play; anyone else only sees it.
function gearChangeFor(character: LubecCharacterRecord | null, viewer: LubecViewer, update: CharacterUpdate): LubecGearChange {
  if (!character || !canEditCharacterStoreCharacter(character, viewer.role, viewer.userId)) return null
  return (gear: LubecGear) => update(character.id, { lubec: { ...character.lubec, gear } })
}

// The owner and the GM drop a character's things to the GM's Items tab; anyone else only sees them.
function gearDropFor(
  character: LubecCharacterRecord | null,
  viewer: LubecViewer,
  store: LubecSheetWiringStore,
  records: LubecGearRecords | null,
): LubecGearDrop {
  if (!character || !records || !canEditCharacterStoreCharacter(character, viewer.role, viewer.userId)) return null
  return lubecGearDrop(records, store, { characterId: character.id, characterName: lubecCharacterName(character), userId: viewer.userId })
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
 * is wired once. A move that leaves the sheet's record, a drop, needs to know
 * where the records are; without `records` there is none.
 */
export function lubecSheetWiring(
  character: LubecCharacterRecord | null,
  viewer: LubecViewer,
  store: LubecSheetWiringStore,
  records: LubecGearRecords | null = null,
): LubecSheetEdits {
  return {
    onCountersChange: countersChangeFor(character, viewer, store.updateCharacter),
    onSkillsChange: skillsChangeFor(character, viewer, store.updateCharacter),
    corrections: correctionsFor(character, viewer, store.updateCharacter),
    onGearChange: gearChangeFor(character, viewer, store.updateCharacter),
    onGearDrop: gearDropFor(character, viewer, store, records),
    ...draftActionsFor(character, viewer, store),
  }
}
