import { adventureRows } from '../lib/characterSheetTables'
import type { AdventureEditableCode } from '../lib/characterTabTypes'

type Props = {
  derivedOpenStuckDoor: string
  selectedAdventureScores: Record<AdventureEditableCode, string>
}

export function CharacterAdventuringSkillsSection({ derivedOpenStuckDoor, selectedAdventureScores }: Props) {
  return (
    <section className="monster-section-block">
      <h3 className="monster-section-title">Adventuring Skills</h3>
      <div className="character-sheet-rows">
        {adventureRows.map((row) => (
          <div key={row.code} className="character-sheet-row in-six">
            <span className="character-sheet-code">{row.code}</span>
            <div className="character-in-six-field">
              {row.code === 'OD' ? (
                <input type="text" value={derivedOpenStuckDoor} readOnly />
              ) : (
                <input
                  type="number"
                  step={1}
                  min={1}
                  max={6}
                  value={selectedAdventureScores[row.code as AdventureEditableCode]}
                  readOnly
                />
              )}
              <span className="character-in-six-suffix">-in-6</span>
            </div>
            <small>{row.note}</small>
          </div>
        ))}
      </div>
    </section>
  )
}
