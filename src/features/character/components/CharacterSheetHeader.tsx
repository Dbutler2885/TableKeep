import type { CharacterRecord } from '../../../types/app'
import type { useCharacterMedia } from '../hooks/useCharacterMedia'
import type { useCharacterSheetState } from '../hooks/useCharacterSheetState'
import type { deriveCharacterPermissions } from '../lib/characterPermissions'
import { alignmentOptions, classOptions } from '../lib/characterClassData'
import { EntityMediaEditor } from '../../common/EntityMediaEditor'

type HeaderActions = {
  updateCharacter: (updates: Partial<CharacterRecord>) => void
  updateCharacterSystem: (updates: Partial<CharacterRecord>) => void
  applyClassDerivedData: (characterId: string, className: string) => void
}

type PortraitProps = {
  character: CharacterRecord
  permissions: ReturnType<typeof deriveCharacterPermissions>
  media: ReturnType<typeof useCharacterMedia>
  onChange: (updates: Partial<CharacterRecord>) => void
}

export function CharacterPortraitSection({ character, permissions, media, onChange }: PortraitProps) {
  return (
    <section className="monster-section-block">
      <h3 className="monster-section-title">Portrait</h3>
      <div className="character-media-wrap">
        <EntityMediaEditor
          entityName={character.name || 'character'}
          portraitUrl={character.portraitUrl}
          portraitFocusX={character.portraitFocusX}
          portraitFocusY={character.portraitFocusY}
          tokenIcon={character.tokenIcon}
          onChange={onChange}
          onUploadPortraitImage={media.uploadCharacterPortraitImage}
          onUploadTokenImage={media.uploadCharacterTokenImage}
          portraitAltLabel="Character portrait"
          tokenButtonAriaLabel="Edit character token icon"
          removePortraitMessage="Remove the portrait image from this character?"
          disabled={!permissions.canEditSelected}
          showDeadOverlay={character.hpCurrent <= 0}
        />
      </div>
    </section>
  )
}

type Props = {
  character: CharacterRecord
  permissions: ReturnType<typeof deriveCharacterPermissions>
  media: ReturnType<typeof useCharacterMedia>
  sheetState: ReturnType<typeof useCharacterSheetState>
  actions: HeaderActions
  isMobile: boolean
  useIntermediateLayout: boolean
}

export function CharacterSheetHeader(props: Props) {
  const { character, permissions, media, sheetState, actions } = props
  const { canEditSelected, canEditClassAndAlignment, isGuidedCreation } = permissions
  const { hpBaseRollByCharacterId, titleByCharacterId, alignmentByCharacterId } = sheetState.stateMaps
  const { setHpBaseRollByCharacterId, setTitleByCharacterId, setAlignmentByCharacterId } = sheetState.stateSetters
  return (
    <>
      <div className="character-sheet-header-grid">
        <label className="character-header-field character-header-field-name">
          <span className="character-header-tag">Name</span>
          <input type="text" value={character.name} onChange={(event) => actions.updateCharacter({ name: event.target.value })} disabled={!canEditSelected} />
        </label>
        <label className="character-header-field character-header-field-title">
          <span className="character-header-tag">Title</span>
          <input
            type="text"
            value={titleByCharacterId[character.id] ?? ''}
            onChange={(event) => setTitleByCharacterId((current) => ({ ...current, [character.id]: event.target.value }))}
            disabled={!canEditSelected}
          />
        </label>
        <div className="character-header-compact-row">
          <label className="character-header-field character-header-field-level">
            <span className="character-header-tag">Level</span>
            <input type="number" min={1} max={14} value={String(character.level)} readOnly disabled />
          </label>
          <label className="character-header-field character-header-field-class">
            <span className="character-header-tag">Class</span>
            <select
              value={character.className}
              onChange={(event) => {
                if (!canEditClassAndAlignment) return
                const nextClass = event.target.value
                const classChanged = nextClass !== character.className
                const hasRolledForSelected = typeof hpBaseRollByCharacterId[character.id] === 'number'
                if (classChanged && hasRolledForSelected && isGuidedCreation) {
                  setHpBaseRollByCharacterId((current) => {
                    const next = { ...current }
                    delete next[character.id]
                    return next
                  })
                  actions.updateCharacterSystem({ className: nextClass, hpCurrent: 0, hpMax: 0 })
                } else {
                  actions.updateCharacter({ className: nextClass })
                }
                actions.applyClassDerivedData(character.id, nextClass)
              }}
              disabled={!canEditClassAndAlignment}
            >
              {classOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              {!classOptions.includes(character.className) ? <option value={character.className}>{character.className}</option> : null}
            </select>
          </label>
        </div>
        <label className="character-header-field character-header-field-align">
          <span className="character-header-tag">Align</span>
          <select
            value={alignmentByCharacterId[character.id] ?? 'Neutrality'}
            disabled={!canEditClassAndAlignment}
            onChange={(event) => {
              if (!canEditClassAndAlignment) return
              setAlignmentByCharacterId((current) => ({ ...current, [character.id]: event.target.value }))
            }}
          >
            {alignmentOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
      </div>
      {props.isMobile && !props.useIntermediateLayout ? (
        <CharacterPortraitSection character={character} permissions={permissions} media={media} onChange={actions.updateCharacter} />
      ) : null}
    </>
  )
}
