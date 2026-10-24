import type { ReactNode } from 'react'
import type { CharacterRecord } from '../../../types/app'

type Props = {
  character: CharacterRecord | null
  embeddedMode: boolean
  grantMode: boolean
  activePage: 'core' | 'encumbrance'
  finalizeError: string | null
  renderNavigation: (position: 'top' | 'bottom') => ReactNode
  renderGrantTools: () => ReactNode
  renderCorePage: (character: CharacterRecord) => ReactNode
  renderItemsPage: (character: CharacterRecord) => ReactNode
}

function NoCharacterSelected({ embeddedMode }: { embeddedMode: boolean }) {
  return <p>{embeddedMode ? "You don't have a character, yet." : 'Select a character from the list.'}</p>
}

/** The detail pane: the grant builder in grant mode, otherwise the selected character's sheet page between its navigation bars. */
export function CharacterDetailPane({
  character, embeddedMode, grantMode, activePage, finalizeError,
  renderNavigation, renderGrantTools, renderCorePage, renderItemsPage,
}: Props) {
  return (
    <div className="monsters-detail characters-detail">
      <div className="monsters-detail-inner characters-detail-inner">
        {renderNavigation('top')}

        {finalizeError ? <p className="error">{finalizeError}</p> : null}

        {grantMode ? (
          renderGrantTools()
        ) : !character ? (
          <NoCharacterSelected embeddedMode={embeddedMode} />
        ) : (
          <div className="monster-editor-grid character-editor-grid">
            {activePage === 'core' ? renderCorePage(character) : renderItemsPage(character)}

            {renderNavigation('bottom')}
          </div>
        )}
      </div>
    </div>
  )
}
