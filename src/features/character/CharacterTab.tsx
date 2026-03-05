import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, UserRound } from 'lucide-react'
import type { CharacterRecord, Role } from '../../types/app'

type CharacterTabProps = {
  role: Role | null
  characters: CharacterRecord[]
  charactersLoading: boolean
  selectedCharacterId: string
  setSelectedCharacterId: (id: string) => void
  selectedCharacter: CharacterRecord | null
}

const mockCharacters: CharacterRecord[] = [
  {
    id: 'mock-aldith',
    name: 'Aldith Fen',
    ownerUserId: 'mock-player-1',
    className: 'Cleric',
    level: 2,
    hpCurrent: 9,
    hpMax: 11,
    ac: 14,
    xp: 1860,
  },
  {
    id: 'mock-brann',
    name: 'Brann Ironroot',
    ownerUserId: 'mock-player-2',
    className: 'Fighter',
    level: 2,
    hpCurrent: 12,
    hpMax: 12,
    ac: 15,
    xp: 1720,
  },
  {
    id: 'mock-sable',
    name: 'Sable Thorne',
    ownerUserId: 'mock-player-3',
    className: 'Thief',
    level: 2,
    hpCurrent: 7,
    hpMax: 8,
    ac: 13,
    xp: 1640,
  },
  {
    id: 'mock-elin',
    name: 'Elin Vale',
    ownerUserId: 'mock-player-4',
    className: 'Magic-User',
    level: 2,
    hpCurrent: 5,
    hpMax: 6,
    ac: 12,
    xp: 1910,
  },
]

const sheetSectionPlaceholders = [
  'Identity',
  'Ability Scores',
  'Combat',
  'Saving Throws',
  'Equipment',
  'Spells',
  'Thief Skills',
  'Notes',
]

export function CharacterTab({
  role,
  characters,
  charactersLoading,
  selectedCharacterId,
  setSelectedCharacterId,
  selectedCharacter,
}: CharacterTabProps) {
  const [isMobile, setIsMobile] = useState<boolean>(() => window.innerWidth <= 900)
  const [mobileCharacterView, setMobileCharacterView] = useState<'list' | 'detail'>('list')

  const displayCharacters = characters.length > 0 ? characters : mockCharacters
  const sortedCharacters = useMemo(
    () => [...displayCharacters].sort((a, b) => a.name.localeCompare(b.name)),
    [displayCharacters],
  )

  const effectiveSelected =
    selectedCharacter ?? sortedCharacters.find((character) => character.id === selectedCharacterId) ?? null

  useEffect(() => {
    const updateMobileState = () => {
      const mobile = window.innerWidth <= 900
      setIsMobile(mobile)
      if (!mobile) setMobileCharacterView('list')
    }

    updateMobileState()
    window.addEventListener('resize', updateMobileState)
    return () => window.removeEventListener('resize', updateMobileState)
  }, [])

  useEffect(() => {
    if (sortedCharacters.length === 0) return
    if (!effectiveSelected) {
      setSelectedCharacterId(sortedCharacters[0].id)
    }
  }, [effectiveSelected, setSelectedCharacterId, sortedCharacters])

  const showListPane = !isMobile || mobileCharacterView === 'list'
  const showDetailPane = !isMobile || mobileCharacterView === 'detail'

  return (
    <div className="maps-layout monsters-layout characters-layout">
      {showListPane ? (
        <aside className="maps-sidebar monsters-sidebar characters-sidebar">
          <div className="maps-sidebar-header">
            <h2>{role === 'gm' ? 'Characters' : 'Character'}</h2>
          </div>

          {charactersLoading ? <p>Loading characters...</p> : null}

          {!charactersLoading && characters.length === 0 ? (
            <p>Using temporary mock character cards for flow testing.</p>
          ) : null}

          {sortedCharacters.length === 0 ? <p>No characters available.</p> : null}

          <div className="monster-list-grid character-list-grid">
            {sortedCharacters.map((character) => (
              <button
                key={character.id}
                type="button"
                className={character.id === effectiveSelected?.id ? 'monster-list-item active' : 'monster-list-item'}
                onClick={() => {
                  setSelectedCharacterId(character.id)
                  if (isMobile) setMobileCharacterView('detail')
                }}
              >
                <div className="monster-card-portrait">
                  <div className="monster-portrait-empty small">
                    <UserRound size={14} />
                  </div>
                </div>

                <div className="monster-card-main">
                  <h4>{character.name || 'Unnamed Character'}</h4>
                  <p className="monster-card-statline">
                    {character.className} • Level {character.level} • HP {character.hpCurrent}/{character.hpMax}
                  </p>
                  <p>AC {character.ac} • XP {character.xp.toLocaleString()}</p>
                </div>
              </button>
            ))}
          </div>
        </aside>
      ) : null}

      {showDetailPane ? (
        <div className="monsters-detail characters-detail">
          <div className="monsters-detail-inner characters-detail-inner">
            <div className="monster-detail-header-row">
              {isMobile && effectiveSelected ? (
                <button
                  type="button"
                  className="back-link monster-mobile-back"
                  onClick={() => setMobileCharacterView('list')}
                  aria-label="Back to character list"
                >
                  <ChevronLeft size={16} />
                </button>
              ) : <span />}
            </div>

            {!effectiveSelected ? (
              <p>Select a character from the list.</p>
            ) : (
              <div className="monster-editor-grid character-editor-grid">
                <section className="character-top-summary">
                  <h3 className="monster-section-title">Identity</h3>
                  <div className="character-summary-grid">
                    <p>
                      <strong>Name:</strong> {effectiveSelected.name || 'Unnamed Character'}
                    </p>
                    <p>
                      <strong>Class:</strong> {effectiveSelected.className}
                    </p>
                    <p>
                      <strong>Level:</strong> {effectiveSelected.level}
                    </p>
                    <p>
                      <strong>HP:</strong> {effectiveSelected.hpCurrent}/{effectiveSelected.hpMax}
                    </p>
                    <p>
                      <strong>AC:</strong> {effectiveSelected.ac}
                    </p>
                    <p>
                      <strong>XP:</strong> {effectiveSelected.xp.toLocaleString()}
                    </p>
                  </div>
                </section>

                {sheetSectionPlaceholders.map((section) => (
                  <section key={section} className="monster-section-block">
                    <h3 className="monster-section-title">{section}</h3>
                    <div className="character-placeholder-block">
                      <p>{section} fields will be implemented in the next pass.</p>
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
