import { Gift, Plus, Skull, Star, Trash2, UserRound } from 'lucide-react'
import type { CharacterRecord, Role } from '../../types/app'

type Props = {
  role: Role | null
  canCreateCharacter: boolean
  charactersLoading: boolean
  sortedCharacters: CharacterRecord[]
  effectiveSelectedId: string | null
  currentCharacterId: string | null
  canDeleteCharacter: (character: CharacterRecord) => boolean
  onCreateCharacter: () => void
  onSelectCharacter: (characterId: string) => void
  onDeleteCharacter: (character: CharacterRecord) => void
  showGrantCard: boolean
  isGrantMode: boolean
  selectedGrantTargetIds: string[]
  onEnterGrantMode: () => void
  onToggleGrantTarget: (characterId: string, checked: boolean) => void
}

export function CharacterListPane({
  role,
  canCreateCharacter,
  charactersLoading,
  sortedCharacters,
  effectiveSelectedId,
  currentCharacterId,
  canDeleteCharacter,
  onCreateCharacter,
  onSelectCharacter,
  onDeleteCharacter,
  showGrantCard,
  isGrantMode,
  selectedGrantTargetIds,
  onEnterGrantMode,
  onToggleGrantTarget,
}: Props) {
  const selectedTargetSet = new Set(selectedGrantTargetIds)

  return (
    <aside className="maps-sidebar monsters-sidebar characters-sidebar">
      <div className="maps-sidebar-header">
        <h2>{role === 'gm' ? 'Characters' : 'Character'}</h2>
        {canCreateCharacter ? (
          <button
            type="button"
            className="monster-add-btn"
            onClick={onCreateCharacter}
            aria-label="Add character"
          >
            <Plus size={16} />
          </button>
        ) : null}
      </div>

      {charactersLoading ? <p>Loading characters...</p> : null}

      {sortedCharacters.length === 0 ? <p>No characters available.</p> : null}

      <div className="monster-list-grid character-list-grid">
        {showGrantCard ? (
          <button
            type="button"
            className={isGrantMode ? 'monster-list-item active' : 'monster-list-item'}
            onClick={onEnterGrantMode}
          >
            <div className="monster-card-portrait">
              <div className="monster-portrait-empty small">
                <Gift size={14} />
              </div>
            </div>
            <div className="monster-card-main">
              <div className="character-card-title-row">
                <h4>Grant</h4>
              </div>
              <p className="monster-card-statline">Grant XP, gp, and items</p>
              <p>{isGrantMode ? 'Grant mode active' : 'Open grant mode'}</p>
            </div>
          </button>
        ) : null}
        {sortedCharacters.map((character) => (
          <div key={character.id} className="character-list-item-wrap">
            <button
              type="button"
              className={
                character.id === effectiveSelectedId
                  ? 'monster-list-item active'
                  : 'monster-list-item'
              }
              onClick={() => onSelectCharacter(character.id)}
            >
              <div className="monster-card-portrait">
                {character.portraitUrl ? (
                  <img
                    src={character.portraitUrl}
                    alt={`${character.name} portrait`}
                    className="monster-portrait"
                    style={{ objectPosition: `${character.portraitFocusX}% ${character.portraitFocusY}%` }}
                  />
                ) : (
                  <div className="monster-portrait-empty small">
                    <UserRound size={14} />
                  </div>
                )}
                {character.hpCurrent <= 0 ? (
                  <div className="character-dead-overlay" aria-label={`${character.name || 'Character'} is dead`}>
                    <Skull size={26} />
                  </div>
                ) : null}
              </div>

              <div className="monster-card-main">
                <div className="character-card-title-row">
                  <h4>{character.name || 'Unnamed Character'}</h4>
                  {currentCharacterId === character.id ? (
                    <span className="character-current-badge">
                      <Star size={12} />
                      Current
                    </span>
                  ) : null}
                </div>
                <p className="monster-card-statline">
                  {character.className} • Level {character.level} • HP {character.hpCurrent}/{character.hpMax}
                </p>
                <p>AC {character.ac} • XP {character.xp.toLocaleString()}</p>
                <p className="character-card-owner">
                  {character.ownerUsername || 'Unassigned'}
                </p>
              </div>
            </button>
            {isGrantMode ? (
              <label className="character-card-grant-target" onClick={(event) => event.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedTargetSet.has(character.id)}
                  onChange={(event) => onToggleGrantTarget(character.id, event.target.checked)}
                  aria-label={`Select ${character.name || 'character'} as grant target`}
                />
              </label>
            ) : null}
            {canDeleteCharacter(character) && !isGrantMode ? (
              <button
                type="button"
                className="map-delete-btn character-card-delete-btn"
                onClick={() => onDeleteCharacter(character)}
                aria-label={`Delete ${character.name || 'character'}`}
              >
                <Trash2 size={14} />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </aside>
  )
}
