import { ChevronLeft } from 'lucide-react'
import type { Role } from '../../types/app'
import { useCharacterStore } from '../character/characterStore/useCharacterStore'
import { useResponsiveCharacterLayout } from '../character/hooks/useResponsiveCharacterLayout'
import { lubecCharacterStore } from '../ruleSets/lubec/characterParser'
import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'
import { LubecRoster } from './LubecRoster'
import { LubecSheetView } from './LubecSheetView'

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
  isSinglePane: boolean
  onBack: () => void
}

function LubecDetail({ character, isSinglePane, onBack }: DetailProps) {
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
        {character ? <LubecSheetView key={character.id} character={character} /> : <p className="lubec-sheet-none">Pick a character to open their sheet.</p>}
      </div>
    </div>
  )
}

/** A Lubec campaign's characters, loaded through the shared character store, and the chosen one's sheet. */
export function LubecCharacterTab({ campaignId, groupId, role, currentUserId, gmUserId, setError }: LubecCharacterTabProps) {
  const store = useCharacterStore({
    ruleSet: lubecCharacterStore, campaignId, groupId, userId: currentUserId, role, gmUserId, setError, enabled: true,
  })
  const layout = useResponsiveCharacterLayout({ hasOpenDetail: Boolean(store.selectedCharacterId) })
  const selectCharacter = (characterId: string) => {
    store.setSelectedCharacterId(characterId)
    layout.setPaneView('detail')
  }
  return (
    <div className="maps-layout monsters-layout characters-layout lubec-character-tab">
      {layout.showListPane ? (
        <LubecRoster
          characters={store.characters}
          loading={store.charactersLoading}
          selectedCharacterId={store.selectedCharacterId}
          currentUserId={currentUserId}
          onSelect={selectCharacter}
        />
      ) : null}
      {layout.showDetailPane ? (
        <LubecDetail character={store.selectedCharacter} isSinglePane={layout.isSinglePane} onBack={() => layout.setPaneView('list')} />
      ) : null}
    </div>
  )
}
