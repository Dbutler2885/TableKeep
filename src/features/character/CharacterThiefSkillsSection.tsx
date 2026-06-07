import { memo } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { ThiefSkillScores } from './characterRules'

type ThiefSkillCode = 'CS' | 'TR' | 'HN' | 'HS' | 'MS' | 'OL' | 'PP' | 'RL'

type ThiefSkillRow = {
  code: ThiefSkillCode
  note: string
}

type CharacterThiefSkillsSectionProps = {
  characterId: string
  selectedThiefSkills: ThiefSkillScores
  thiefRemainingExpertisePoints: number
  canEditSelected: boolean
  thiefSkillRows: ThiefSkillRow[]
  defaultThiefSkills: () => ThiefSkillScores
  setThiefSkillsByCharacterId: Dispatch<SetStateAction<Record<string, ThiefSkillScores>>>
}

export const CharacterThiefSkillsSection = memo(function CharacterThiefSkillsSection({
  characterId,
  selectedThiefSkills,
  thiefRemainingExpertisePoints,
  canEditSelected,
  thiefSkillRows,
  defaultThiefSkills,
  setThiefSkillsByCharacterId,
}: CharacterThiefSkillsSectionProps) {
  return (
    <section className="monster-section-block">
      <div className="section-head">
        <h3 className="monster-section-title">Thief Skills</h3>
        <span className="character-roll-points">{thiefRemainingExpertisePoints} points</span>
      </div>
      <div className="character-sheet-rows">
        {thiefSkillRows.map((row) => (
          <div key={row.code} className="character-sheet-row in-six">
            <span className="character-sheet-code">{row.code}</span>
            <div className="character-in-six-field">
              <input
                type="number"
                step={1}
                min={1}
                max={5}
                value={selectedThiefSkills[row.code]}
                onChange={(event) => {
                  const raw = event.target.value
                  if (raw.trim().length === 0) return
                  const parsed = Number.parseInt(raw, 10)
                  if (Number.isNaN(parsed)) return
                  const nextScore = Math.min(5, Math.max(1, parsed))
                  const currentScoreRaw = Number.parseInt(selectedThiefSkills[row.code], 10)
                  const currentScore = Number.isNaN(currentScoreRaw) ? 1 : Math.min(5, Math.max(1, currentScoreRaw))
                  const delta = nextScore - currentScore
                  if (delta > thiefRemainingExpertisePoints) return
                  setThiefSkillsByCharacterId((current) => ({
                    ...current,
                    [characterId]: {
                      ...(current[characterId] ?? defaultThiefSkills()),
                      [row.code]: String(nextScore),
                    },
                  }))
                }}
                disabled={!canEditSelected}
              />
              <span className="character-in-six-suffix">-in-6</span>
            </div>
            <small>{row.note}</small>
          </div>
        ))}
      </div>
    </section>
  )
})
