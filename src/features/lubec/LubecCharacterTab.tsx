import { ChevronLeft } from 'lucide-react'
import type { Role } from '../../types/app'
import { makeId } from '../character/characterFactories'
import { CharacterDeleteDialog } from '../character/components/CharacterDeleteDialog'
import { PlayerAssignmentModal } from '../character/components/PlayerAssignmentModal'
import { useResponsiveCharacterLayout } from '../character/hooks/useResponsiveCharacterLayout'
import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'
import { makeLubecDirectEntryCharacter, makeLubecGuidedCharacter, type LubecOwner } from '../ruleSets/lubec/directEntry'
import { LubecSheetFightHost } from './fight/LubecSheetFightHost'
import { importLubecCharacter, type LubecImportContext } from './lubecImport'
import type { LubecDoors } from './LubecNewCharacter'
import { LubecRoster } from './LubecRoster'
import { lubecCharacterName } from './lubecNames'
import { LubecSheetView } from './LubecSheetView'
import { useLubecCharacterDelete } from './useLubecCharacterDelete'
import { useLubecPlayerAssignment } from './useLubecPlayerAssignment'
import { useLubecSheetSession, type LubecSheetProps } from './useLubecSheetSession'

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
  /** The open sheet's props, or null while none is open. */
  sheetProps: LubecSheetProps | null
  isSinglePane: boolean
  onBack: () => void
  /** Asks to delete the character, at any stage; null when the viewer may not. */
  onDelete: (() => void) | null
  /** Opens Give to Player; null unless the viewer is the GM. */
  onAssign: (() => void) | null
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

function LubecDetail({ sheetProps, isSinglePane, onBack, onDelete, onAssign }: DetailProps) {
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
        {sheetProps ? (
          <LubecSheetView key={sheetProps.character.id} {...sheetProps} onDelete={onDelete} onAssign={onAssign} />
        ) : <p className="lubec-sheet-none">Pick a character to open their sheet.</p>}
      </div>
    </div>
  )
}

/** A Lubec campaign's characters, loaded through the shared character store, and the chosen one's sheet. */
export function LubecCharacterTab({ campaignId, groupId, role, currentUserId, currentUsername, gmUserId, setError }: LubecCharacterTabProps) {
  const { store, character, viewer, sheetProps } = useLubecSheetSession({
    source: { kind: 'characters' }, campaignId, groupId, role, currentUserId, gmUserId, setError,
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
  const deletion = useLubecCharacterDelete(store, viewer, () => layout.setPaneView('list'), setError)
  const assignment = useLubecPlayerAssignment(store, role, gmUserId)
  const selectedName = character ? { name: lubecCharacterName(character) } : null
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
      <LubecSheetFightHost scope={{ campaignId, groupId }} viewer={viewer} gmUserId={gmUserId} store={store} character={character} setError={setError}>
        {layout.showDetailPane ? (
          <LubecDetail
            sheetProps={sheetProps}
            isSinglePane={layout.isSinglePane}
            onBack={() => layout.setPaneView('list')}
            onDelete={deletion.deleteFor(character)}
            onAssign={assignment.onAssign}
          />
        ) : null}
      </LubecSheetFightHost>
      <CharacterDeleteDialog target={deletion.target} onConfirm={deletion.confirm} onCancel={deletion.cancel} />
      <PlayerAssignmentModal character={selectedName} flow={assignment.flow} />
    </div>
  )
}
