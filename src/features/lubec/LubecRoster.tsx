import { UserRound } from 'lucide-react'
import { lubecClass } from '../ruleSets/lubec/classes'
import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'
import { LubecNewCharacter, type LubecDoors } from './LubecNewCharacter'
import { lubecCharacterName } from './lubecNames'

type RosterProps = {
  characters: LubecCharacterRecord[]
  loading: boolean
  selectedCharacterId: string
  currentUserId: string
  onSelect: (characterId: string) => void
  /** The ways to start a new character; null when the viewer may not make one. */
  doors?: LubecDoors | null
}

type CardProps = {
  character: LubecCharacterRecord
  selected: boolean
  own: boolean
  onSelect: (characterId: string) => void
}

function LubecRosterThumb({ character }: { character: LubecCharacterRecord }) {
  if (!character.portraitUrl) return <div className="monster-portrait-empty small"><UserRound size={14} /></div>
  return <img src={character.portraitUrl} alt="" className="monster-portrait" />
}

function LubecRosterCard({ character, selected, own, onSelect }: CardProps) {
  return (
    <button type="button" className={selected ? 'monster-list-item active' : 'monster-list-item'} onClick={() => onSelect(character.id)}>
      <div className="monster-card-portrait"><LubecRosterThumb character={character} /></div>
      <div className="monster-card-main">
        <div className="character-card-title-row">
          <h4>{lubecCharacterName(character)}</h4>
          {own ? <span className="lubec-own-tag">Yours</span> : null}
        </div>
        <p className="monster-card-statline">{lubecClass(character.lubec.class.key)?.name ?? 'No class yet'}</p>
        <p className="character-card-owner">{character.ownerUsername ?? 'Unassigned'}</p>
      </div>
    </button>
  )
}

/** The campaign's Lubec characters the viewer may see, with their own marked. */
export function LubecRoster({ characters, loading, selectedCharacterId, currentUserId, onSelect, doors = null }: RosterProps) {
  return (
    <aside className="maps-sidebar monsters-sidebar characters-sidebar lubec-roster">
      <div className="maps-sidebar-header">
        <h2>Characters</h2>
        {doors ? <LubecNewCharacter {...doors} /> : null}
      </div>
      {loading ? <p>Loading characters...</p> : null}
      {!loading && characters.length === 0 ? <p className="lubec-roster-empty">No characters yet.</p> : null}
      <div className="monster-list-grid character-list-grid">
        {characters.map((character) => (
          <LubecRosterCard
            key={character.id}
            character={character}
            selected={character.id === selectedCharacterId}
            own={character.ownerUserId === currentUserId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </aside>
  )
}
