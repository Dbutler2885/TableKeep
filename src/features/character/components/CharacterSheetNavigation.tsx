import { Check, ChevronLeft, Sparkles, Star } from 'lucide-react'
import type { CharacterRecord } from '../../../types/app'
import type { useLevelUpFlow } from '../hooks/useLevelUpFlow'
import type { deriveCharacterPermissions } from '../lib/characterPermissions'

type Page = 'core' | 'encumbrance'

type Props = {
  position: 'top' | 'bottom'
  character: CharacterRecord | null
  effectiveGrantMode: boolean
  activePage: Page
  setActivePage: (page: Page) => void
  permissions: ReturnType<typeof deriveCharacterPermissions>
  levelUpFlow: ReturnType<typeof useLevelUpFlow>
  canSelectedLevelUp: boolean
  currentCharacterId: string | null
  setCurrentCharacter: (characterId: string) => Promise<void>
  isMobile: boolean
  isSinglePane: boolean
  embeddedMode: boolean
  onFinalize: () => void
  onAssign: () => void
  onExitGrant: () => void
  onBackToList: () => void
}

function PageTabs({ activePage, setActivePage, compact }: Pick<Props, 'activePage' | 'setActivePage'> & { compact: boolean }) {
  return (
    <div className="character-sheet-tab-bar">
      <button
        type="button"
        className={activePage === 'core' ? 'character-sheet-tab active' : 'character-sheet-tab'}
        onClick={() => setActivePage('core')}
      >
        {compact ? 'Core' : 'Core Sheet'}
      </button>
      <button
        type="button"
        className={activePage === 'encumbrance' ? 'character-sheet-tab active' : 'character-sheet-tab'}
        onClick={() => setActivePage('encumbrance')}
      >
        Items
      </button>
    </div>
  )
}

export function CharacterSheetNavigation(props: Props) {
  const {
    canSetCurrentCharacter, canAssignCharacter, canEditSelected,
    isInFinalizationFlow,
  } = props.permissions
  const showCharacterActions = props.character && !props.effectiveGrantMode

  if (props.position === 'bottom') {
    if (!props.isMobile) return null
    return (
      <div className="character-sheet-page-tabs bottom">
        <PageTabs activePage={props.activePage} setActivePage={props.setActivePage} compact />
      </div>
    )
  }

  return (
    <>
      {!props.isMobile && (props.character || props.effectiveGrantMode) ? (
        <div className="character-sheet-page-tabs top">
          <PageTabs activePage={props.activePage} setActivePage={props.setActivePage} compact={false} />
          <div className="character-sheet-tab-actions">
            {canSetCurrentCharacter && showCharacterActions ? (
              <button
                type="button"
                className={props.currentCharacterId === props.character?.id ? 'character-current-action active' : 'character-current-action'}
                onClick={() => void props.setCurrentCharacter(props.character!.id)}
                aria-label="Set as current character"
              >
                <Star size={14} />
                <span>Current Character</span>
              </button>
            ) : null}
            {isInFinalizationFlow && canEditSelected && showCharacterActions ? (
              <button type="button" className="character-current-action" onClick={props.onFinalize} aria-label="Finalize character">
                <Check size={14} />
                <span>Finalize Character</span>
              </button>
            ) : null}
            {props.canSelectedLevelUp && showCharacterActions ? (
              <button type="button" className="character-current-action character-levelup-action" onClick={props.levelUpFlow.openLevelUpModal} disabled={!canEditSelected} aria-label="Level up character">
                <Sparkles size={14} />
                <span>Level Up</span>
              </button>
            ) : null}
            {canAssignCharacter ? (
              <button type="button" className="character-current-action" onClick={props.onAssign} aria-label="Give character to player">
                <span>Give to Player</span>
              </button>
            ) : null}
            {props.effectiveGrantMode ? (
              <button type="button" className="character-current-action" onClick={props.onExitGrant} aria-label="Exit grant mode">
                <ChevronLeft size={14} />
                <span>Exit Grant</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {props.isSinglePane && !props.embeddedMode ? (
        <div className="monster-detail-header-row">
          {props.character || props.effectiveGrantMode ? (
            <button
              type="button"
              className="back-link monster-mobile-back"
              onClick={props.effectiveGrantMode ? props.onExitGrant : props.onBackToList}
              aria-label="Back to character list"
            >
              <ChevronLeft size={16} />
            </button>
          ) : <span />}
          {canSetCurrentCharacter && showCharacterActions ? (
            <button
              type="button"
              className={props.currentCharacterId === props.character?.id ? 'character-current-action active' : 'character-current-action'}
              onClick={() => void props.setCurrentCharacter(props.character!.id)}
              aria-label="Set as current character"
            >
              <Star size={14} />
              <span>Current Character</span>
            </button>
          ) : <span />}
          {isInFinalizationFlow && canEditSelected && showCharacterActions ? (
            <button type="button" className="character-current-action" onClick={props.onFinalize} aria-label="Finalize character">
              <Check size={14} />
              <span>Finalize</span>
            </button>
          ) : null}
          {props.canSelectedLevelUp && showCharacterActions ? (
            <button type="button" className="character-current-action character-levelup-action" onClick={props.levelUpFlow.openLevelUpModal} disabled={!canEditSelected} aria-label="Level up character">
              <Sparkles size={14} />
              <span>Level Up</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
