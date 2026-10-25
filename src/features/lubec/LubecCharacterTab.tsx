import { ChevronLeft } from 'lucide-react'
import type { Role } from '../../types/app'
import { makeId } from '../character/characterFactories'
import { canEditCharacterStoreCharacter } from '../character/characterStore/characterStoreActions'
import { useCharacterStore } from '../character/characterStore/useCharacterStore'
import { CharacterDeleteDialog } from '../character/components/CharacterDeleteDialog'
import { PlayerAssignmentModal } from '../character/components/PlayerAssignmentModal'
import { useCharacterMedia } from '../character/hooks/useCharacterMedia'
import { useResponsiveCharacterLayout } from '../character/hooks/useResponsiveCharacterLayout'
import { lubecCharacterStore } from '../ruleSets/lubec/characterParser'
import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'
import { makeLubecDirectEntryCharacter, makeLubecGuidedCharacter, type LubecOwner, type LubecSheetEdit } from '../ruleSets/lubec/directEntry'
import type { LubecSkills } from '../ruleSets/lubec/skillPicks'
import type { LubecCountersChange } from './LubecCountersPanel'
import { importLubecCharacter, type LubecImportContext } from './lubecImport'
import type { LubecSheetEditing } from './LubecNameBandEditor'
import type { LubecDoors } from './LubecNewCharacter'
import { LubecRoster } from './LubecRoster'
import { lubecCharacterName } from './lubecNames'
import { LubecSheetView, type LubecCorrections } from './LubecSheetView'
import { useLubecCharacterDelete } from './useLubecCharacterDelete'
import { useLubecPlayerAssignment } from './useLubecPlayerAssignment'

export type LubecCharacterTabProps = {
  campaignId: string
  groupId: string
  role: Role | null
  currentUserId: string
  currentUsername: string
  gmUserId: string | null
  setError: (message: string) => void
}

type DetailProps = {
  character: LubecCharacterRecord | null
  editing: LubecSheetEditing | null
  isSinglePane: boolean
  onBack: () => void
  onCountersChange: LubecCountersChange | null
  onSkillsChange: LubecSkillsChange | null
  corrections: LubecCorrections | null
  /** Asks to delete the character, at any stage; null when the viewer may not. */
  onDelete: (() => void) | null
  /** Opens Give to Player; null unless the viewer is the GM. */
  onAssign: (() => void) | null
} & DraftActions

/** What the viewer may do to a draft; all are null for a finalized character or someone else's. */
type DraftActions = {
  onDraftEdit: LubecSheetEdit | null
  /** Saves at once rather than after the delay; only a guided draft's dice and Swap use it. */
  onRollUp: LubecSheetEdit | null
  onFinalize: (() => void) | null
}

type CharacterUpdate = (characterId: string, updates: Partial<LubecCharacterRecord>) => void

type LubecSkillsChange = (skills: LubecSkills) => void

// The owner and the GM change a character's counters; anyone else only sees them.
function countersChangeFor(
  character: LubecCharacterRecord | null,
  viewer: { role: Role | null; userId: string },
  update: CharacterUpdate,
): LubecCountersChange | null {
  if (!character || (viewer.role !== 'gm' && character.ownerUserId !== viewer.userId)) return null
  return (counters) => update(character.id, { lubec: { ...character.lubec, counters } })
}

// The owner and the GM change a character's skills until it is finalized; anyone else only sees them.
function skillsChangeFor(
  character: LubecCharacterRecord | null,
  viewer: { role: Role | null; userId: string },
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
  viewer: { role: Role | null; userId: string },
  store: { updateCharacter: CharacterUpdate; updateCharacterNow: CharacterUpdate },
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

type DoorsOptions = Pick<LubecCharacterTabProps, 'campaignId' | 'groupId' | 'role' | 'currentUserId' | 'currentUsername' | 'setError'> &
  Pick<LubecImportContext, 'addCharacter' | 'updateCharacter'> & { onCreated: () => void }

// The ways a player or the GM starts a character, which they then own; null for anyone else.
function lubecDoorsFor({ role, currentUserId, currentUsername, onCreated, ...context }: DoorsOptions): LubecDoors | null {
  if (role !== 'gm' && role !== 'player') return null
  const owner = { userId: currentUserId, username: currentUsername }
  const create = (make: (id: string, owner: LubecOwner) => LubecCharacterRecord) => () => {
    void context.addCharacter(make(makeId(), owner))
    onCreated()
  }
  return {
    onDirectEntry: create(makeLubecDirectEntryCharacter),
    onGuided: create(makeLubecGuidedCharacter),
    onImport: (imported) => {
      void importLubecCharacter({ ...context, owner }, imported)
      onCreated()
    },
  }
}

function LubecDetail({ character, editing, isSinglePane, onBack, ...sheetProps }: DetailProps) {
  return (
    <div className="monsters-detail characters-detail">
      <div className="monsters-detail-inner characters-detail-inner">
        {isSinglePane ? (
          <div className="monster-detail-header-row">
            <button type="button" className="back-link monster-mobile-back" onClick={onBack} aria-label="Back to character list">
              <ChevronLeft size={16} />
            </button>
          </div>
        ) : null}
        {character ? (
          <LubecSheetView
            key={character.id}
            character={character}
            editing={editing}
            {...sheetProps}
          />
        ) : <p className="lubec-sheet-none">Pick a character to open their sheet.</p>}
      </div>
    </div>
  )
}

type EditingProps = Pick<LubecCharacterTabProps, 'campaignId' | 'groupId' | 'role' | 'currentUserId'> & {
  character: LubecCharacterRecord | null
  updateCharacter: (characterId: string, updates: Partial<LubecCharacterRecord>) => void
}

// The open sheet's edits for its owner and the GM, saved through the shared
// store, with art uploaded under the uploader's authority; null for anyone else.
function useLubecSheetEditing({ character, updateCharacter, role, currentUserId, ...campaign }: EditingProps): LubecSheetEditing | null {
  const canEdit = character !== null && canEditCharacterStoreCharacter(character, role, currentUserId)
  const media = useCharacterMedia({ ...campaign, currentUserId, effectiveSelected: character, canEditSelected: canEdit })
  if (!character || !canEdit) return null
  return {
    update: (updates) => updateCharacter(character.id, updates),
    uploadPortrait: media.uploadCharacterPortraitImage,
    uploadToken: media.uploadCharacterTokenImage,
  }
}

/** A Lubec campaign's characters, loaded through the shared character store, and the chosen one's sheet. */
export function LubecCharacterTab({ campaignId, groupId, role, currentUserId, currentUsername, gmUserId, setError }: LubecCharacterTabProps) {
  const store = useCharacterStore({
    ruleSet: lubecCharacterStore, campaignId, groupId, userId: currentUserId, role, gmUserId, setError, enabled: true,
  })
  const editing = useLubecSheetEditing({
    character: store.selectedCharacter, updateCharacter: store.updateCharacter, campaignId, groupId, role, currentUserId,
  })
  const layout = useResponsiveCharacterLayout({ hasOpenDetail: Boolean(store.selectedCharacterId) })
  const selectCharacter = (characterId: string) => {
    store.setSelectedCharacterId(characterId)
    layout.setPaneView('detail')
  }
  const doors = lubecDoorsFor({
    campaignId, groupId, role, currentUserId, currentUsername, setError,
    addCharacter: store.addCharacter, updateCharacter: store.updateCharacter, onCreated: () => layout.setPaneView('detail'),
  })
  const viewer = { role, userId: currentUserId }
  const deletion = useLubecCharacterDelete(store, viewer, () => layout.setPaneView('list'))
  const assignment = useLubecPlayerAssignment(store, role, gmUserId)
  const selectedName = store.selectedCharacter ? { name: lubecCharacterName(store.selectedCharacter) } : null
  return (
    <div className="maps-layout monsters-layout characters-layout lubec-character-tab">
      {layout.showListPane ? (
        <LubecRoster
          characters={store.characters}
          loading={store.charactersLoading}
          selectedCharacterId={store.selectedCharacterId}
          currentUserId={currentUserId}
          onSelect={selectCharacter}
          deleteFor={deletion.deleteFor}
          doors={doors}
        />
      ) : null}
      {layout.showDetailPane ? (
        <LubecDetail
          character={store.selectedCharacter}
          editing={editing}
          isSinglePane={layout.isSinglePane}
          onBack={() => layout.setPaneView('list')}
          onCountersChange={countersChangeFor(store.selectedCharacter, { role, userId: currentUserId }, store.updateCharacter)}
          onSkillsChange={skillsChangeFor(store.selectedCharacter, { role, userId: currentUserId }, store.updateCharacter)}
          corrections={correctionsFor(store.selectedCharacter, viewer, store.updateCharacter)}
          onDelete={deletion.deleteFor(store.selectedCharacter)}
          onAssign={assignment.onAssign}
          {...draftActionsFor(store.selectedCharacter, viewer, store)}
        />
      ) : null}
      <CharacterDeleteDialog target={deletion.target} onConfirm={deletion.confirm} onCancel={deletion.cancel} />
      <PlayerAssignmentModal character={selectedName} flow={assignment.flow} />
    </div>
  )
}
