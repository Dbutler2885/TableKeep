import { useEffect, useRef, useState } from 'react'
import type { TouchEventHandler } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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

export function CharacterTab({
  role,
  characters,
  charactersLoading,
  selectedCharacterId,
  setSelectedCharacterId,
  selectedCharacter,
}: CharacterTabProps) {
  const [view, setView] = useState<'list' | 'sheet'>('list')
  const [pageStart, setPageStart] = useState(0)
  const [pagesPerView, setPagesPerView] = useState(1)
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const displayCharacters = characters.length > 0 ? characters : mockCharacters
  const effectiveSelected =
    selectedCharacter ?? displayCharacters.find((character) => character.id === selectedCharacterId) ?? null
  const sheetPages = ['Core', 'Combat', 'Inventory', 'Spells & Notes']
  const maxStart = Math.max(0, sheetPages.length - pagesPerView)
  const clampedPageStart = Math.min(pageStart, maxStart)
  const visiblePages = sheetPages.slice(clampedPageStart, clampedPageStart + pagesPerView)

  useEffect(() => {
    const setResponsivePages = () => {
      if (window.innerWidth >= 1100) {
        setPagesPerView(2)
      } else {
        setPagesPerView(1)
      }
    }

    setResponsivePages()
    window.addEventListener('resize', setResponsivePages)
    return () => window.removeEventListener('resize', setResponsivePages)
  }, [])

  const openCharacterSheet = (character: CharacterRecord) => {
    setSelectedCharacterId(character.id)
    setPageStart(0)
    setView('sheet')
  }

  const goPrevPages = () => {
    setPageStart((current) => Math.max(0, Math.min(current, maxStart) - pagesPerView))
  }

  const goNextPages = () => {
    setPageStart((current) => Math.min(maxStart, Math.min(current, maxStart) + pagesPerView))
  }

  const handleTouchStart: TouchEventHandler<HTMLDivElement> = (event) => {
    const touch = event.changedTouches[0]
    touchStartX.current = touch.clientX
    touchStartY.current = touch.clientY
  }

  const handleTouchEnd: TouchEventHandler<HTMLDivElement> = (event) => {
    if (touchStartX.current === null || touchStartY.current === null) return

    const touch = event.changedTouches[0]
    const dx = touch.clientX - touchStartX.current
    const dy = touch.clientY - touchStartY.current

    touchStartX.current = null
    touchStartY.current = null

    if (Math.abs(dx) < 44 || Math.abs(dx) <= Math.abs(dy)) return

    if (dx < 0 && clampedPageStart < maxStart) {
      goNextPages()
    } else if (dx > 0 && clampedPageStart > 0) {
      goPrevPages()
    }
  }

  return (
    <div className="stack-tight">
      <h2>Character</h2>

      {charactersLoading ? <p>Loading characters...</p> : null}

      {!charactersLoading && characters.length === 0 ? (
        <p>Using temporary mock character cards for flow testing.</p>
      ) : null}

      {view === 'list' ? (
        <div className="character-card-grid">
          {displayCharacters.map((character) => (
            <button
              key={character.id}
              type="button"
              className="character-card"
              onClick={() => openCharacterSheet(character)}
            >
              <h3>{character.name}</h3>
              <p>
                {character.className} • Level {character.level}
              </p>
              <p>
                HP {character.hpCurrent}/{character.hpMax} • AC {character.ac}
              </p>
              <p>XP {character.xp.toLocaleString()}</p>
            </button>
          ))}
        </div>
      ) : null}

      {view === 'sheet' && effectiveSelected ? (
        <div className="stack-tight">
          <button type="button" className="back-link" onClick={() => setView('list')}>
            <ChevronLeft size={16} />
          </button>

          <h3>{effectiveSelected.name}</h3>
          <div className="info-grid">
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
            <p>
              <strong>View Mode:</strong> {role === 'gm' ? 'GM' : 'Player'}
            </p>
          </div>

          <div className="sheet-pages" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
            {visiblePages.map((pageName, index) => (
              <article key={`${pageName}-${index}`} className="sheet-page">
                <h4>Sheet Page {clampedPageStart + index + 1}</h4>
                <p>{pageName}</p>
                <p>Placeholder layout block for full sheet page flow.</p>
              </article>
            ))}
          </div>

          <div className="sheet-nav">
            <button
              type="button"
              className="sheet-nav-btn"
              onClick={goPrevPages}
              disabled={clampedPageStart === 0}
              aria-label="Previous sheet pages"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="sheet-nav-btn"
              onClick={goNextPages}
              disabled={clampedPageStart >= maxStart}
              aria-label="Next sheet pages"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
