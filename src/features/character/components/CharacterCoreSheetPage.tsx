import { Fragment } from 'react'
import type { CharacterRecord } from '../../../types/app'
import type { CharacterTabProps } from '../lib/characterTabTypes'
import type { useCharacterSheetState } from '../hooks/useCharacterSheetState'
import type { useSelectedCharacterDerivations } from '../hooks/useSelectedCharacterDerivations'
import type { useCharacterCreationFlow } from '../hooks/useCharacterCreationFlow'
import type { useCharacterMedia } from '../hooks/useCharacterMedia'
import type { deriveCharacterPermissions } from '../lib/characterPermissions'
import { CharacterAdventuringSkillsSection } from './CharacterAdventuringSkillsSection'
import { CharacterClassFeaturesSection } from './CharacterClassFeaturesSection'
import { CharacterLanguagesSection } from './CharacterLanguagesSection'
import { CharacterThiefSkillsSection } from './CharacterThiefSkillsSection'
import { abilityRows, saveRows, thiefSkillRows } from '../lib/characterSheetTables'
import { defaultThiefSkills, type AbilityCode } from '../characterRules'
import { CharacterPortraitSection, CharacterSheetHeader } from './CharacterSheetHeader'

type Props = {
  character: CharacterRecord
  role: CharacterTabProps['role']
  layout: {
    isMobile: boolean
    useIntermediateLayout: boolean
    isIntermediateMobileLayout: boolean
  }
  permissions: ReturnType<typeof deriveCharacterPermissions>
  derivations: ReturnType<typeof useSelectedCharacterDerivations>
  creationFlow: ReturnType<typeof useCharacterCreationFlow>
  media: ReturnType<typeof useCharacterMedia>
  sheetState: ReturnType<typeof useCharacterSheetState>
  hasPendingAbilityReroll: boolean
  actions: {
    updateCharacter: (updates: Partial<CharacterRecord>) => void
    updateCharacterSystem: (updates: Partial<CharacterRecord>) => void
    applyClassDerivedData: (characterId: string, className: string) => void
    requestAbilityScoreRoll: () => void
    requestRollHitPoints: () => void
    updateAbilityScore: (code: AbilityCode, value: string) => void
    openReallocationClassRequired: () => void
  }
}

export function CharacterCoreSheetPage({
  character: effectiveSelected,
  role,
  layout: { isMobile, useIntermediateLayout, isIntermediateMobileLayout },
  permissions,
  derivations,
  creationFlow,
  media,
  sheetState,
  hasPendingAbilityReroll,
  actions,
}: Props) {
  const {
    canEditSelected, canEditAbilityScores, isGuidedCreation,
  } = permissions
  const {
    selectedAbilityScores, selectedClassName, hasRolledAbilityScores,
    availableAbilityTradePoints, selectedThaco, selectedThacoRaw,
    selectedAdventureScores, selectedThiefSkills, thiefRemainingExpertisePoints,
    unlockedClassFeatures, derivedDexAcModifier, derivedUnarmouredAc,
    derivedInitModifier, derivedReactionModifier, derivedOpenStuckDoor, derivedMeleeModifier,
    derivedMissileModifier, derivedConModifier, derivedWisMagicSaveModifier,
    displayedSaveScores, derivedOverlandMove, derivedExplorationMove, derivedEncounterMove,
  } = derivations
  const { tryBuildGuidedScores, hasRolledHp, canFreeRerollHp } = creationFlow
  const {
    languagesTextByCharacterId,
  } = sheetState.stateMaps
  const {
    setLanguagesTextByCharacterId, setThiefSkillsByCharacterId, setThacoByCharacterId,
  } = sheetState.stateSetters
  const updateSelectedCharacter = actions.updateCharacter
  const updateSelectedCharacterSystem = actions.updateCharacterSystem
  const { requestAbilityScoreRoll, requestRollHitPoints, updateAbilityScore } = actions
  const setReallocationClassRequiredOpen = (open: boolean) => {
    if (open) actions.openReallocationClassRequired()
  }
  const renderThiefSkillsSection = () => (effectiveSelected.className === 'Thief' ? (
    <CharacterThiefSkillsSection
      characterId={effectiveSelected.id}
      selectedThiefSkills={selectedThiefSkills}
      thiefRemainingExpertisePoints={thiefRemainingExpertisePoints}
      canEditSelected={canEditSelected}
      thiefSkillRows={thiefSkillRows}
      defaultThiefSkills={defaultThiefSkills}
      setThiefSkillsByCharacterId={setThiefSkillsByCharacterId}
    />
  ) : null)

  return (
<section className={isGuidedCreation ? 'character-sheet guided-creation' : 'character-sheet'}>
  <div
    className={
      useIntermediateLayout
        ? `character-sheet-main-grid intermediate${isIntermediateMobileLayout ? ' mobile-intermediate' : ''}`
        : 'character-sheet-main-grid'
    }
  >
    <div className="character-sheet-left">
      <CharacterSheetHeader
        character={effectiveSelected}
        permissions={permissions}
        media={media}
        sheetState={sheetState}
        actions={actions}
        isMobile={isMobile}
        useIntermediateLayout={useIntermediateLayout}
      />
      <div className="character-sheet-two-col">
        <section className="monster-section-block">
          <div className="section-head">
            <h3 className="monster-section-title">Ability Scores</h3>
            {isGuidedCreation ? (
              <button
                type="button"
                className="monster-example-btn"
                onClick={requestAbilityScoreRoll}
                disabled={!canEditSelected || hasPendingAbilityReroll}
              >
                {hasRolledAbilityScores && role !== 'gm'
                  ? hasPendingAbilityReroll ? 'Re-roll Pending' : 'Request Re-roll'
                  : hasRolledAbilityScores ? 'Re-roll' : 'Roll'}
              </button>
            ) : null}
            {isGuidedCreation && hasRolledAbilityScores ? (
              <span className="character-roll-points">Points: {availableAbilityTradePoints}</span>
            ) : null}
          </div>
          <div className="character-sheet-rows">
            {abilityRows.map((row) => (
              <div key={row.code} className="character-sheet-row">
                <span className="character-sheet-code">{row.code}</span>
                {isGuidedCreation ? (
                  (() => {
                    const abilityCode = row.code as AbilityCode
                    const currentValue = Number.parseInt(selectedAbilityScores[abilityCode], 10)
                    const classChosen = selectedClassName !== '-'
                    const canDecrease = canEditSelected
                      && hasRolledAbilityScores
                      && classChosen
                      && Number.isFinite(currentValue)
                      && tryBuildGuidedScores(abilityCode, currentValue - 1) !== null
                    const canIncrease = canEditSelected
                      && hasRolledAbilityScores
                      && classChosen
                      && Number.isFinite(currentValue)
                      && tryBuildGuidedScores(abilityCode, currentValue + 1) !== null
                    return (
                      <div className="character-ability-adjust">
                        {canEditSelected && hasRolledAbilityScores && !classChosen ? (
                          <button
                            type="button"
                            className="character-ability-adjust-btn"
                            onClick={() => setReallocationClassRequiredOpen(true)}
                            aria-label="Choose class before reallocation"
                          >
                            -
                          </button>
                        ) : canDecrease ? (
                          <button
                            type="button"
                            className="character-ability-adjust-btn"
                            onClick={() => updateAbilityScore(abilityCode, String(currentValue - 1))}
                            aria-label={`Decrease ${abilityCode}`}
                          >
                            -
                          </button>
                        ) : <span />}
                        <input
                          type="number"
                          step={1}
                          min={1}
                          max={18}
                          className="character-ability-score-input"
                          value={selectedAbilityScores[abilityCode]}
                          onChange={(event) => updateAbilityScore(abilityCode, event.target.value)}
                          disabled
                          readOnly
                        />
                        {canEditSelected && hasRolledAbilityScores && !classChosen ? (
                          <button
                            type="button"
                            className="character-ability-adjust-btn"
                            onClick={() => setReallocationClassRequiredOpen(true)}
                            aria-label="Choose class before reallocation"
                          >
                            +
                          </button>
                        ) : canIncrease ? (
                          <button
                            type="button"
                            className="character-ability-adjust-btn"
                            onClick={() => updateAbilityScore(abilityCode, String(currentValue + 1))}
                            aria-label={`Increase ${abilityCode}`}
                          >
                            +
                          </button>
                        ) : <span />}
                      </div>
                    )
                  })()
                ) : (
                  <input
                    type="number"
                    step={1}
                    min={1}
                    max={18}
                    className="character-ability-score-input"
                    value={selectedAbilityScores[row.code as AbilityCode]}
                    onChange={(event) => updateAbilityScore(row.code as AbilityCode, event.target.value)}
                    disabled={!canEditAbilityScores}
                    placeholder="-"
                  />
                )}
                <small>{row.note}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="monster-section-block">
          <h3 className="monster-section-title">Saving Throws</h3>
          <div className="character-sheet-rows">
            {saveRows.map((row) => (
              <div key={row.code} className="character-sheet-row">
                <span className="character-sheet-code">{row.code}</span>
                <input
                  type="text"
                  value={
                    row.code === 'D' || row.code === 'W' || row.code === 'P' || row.code === 'B' || row.code === 'S'
                      ? displayedSaveScores[row.code]
                      : derivedWisMagicSaveModifier
                  }
                  readOnly
                />
                <small>{row.note}</small>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className={isIntermediateMobileLayout ? 'character-combat-attack-wrap character-mobile-intermediate-pair' : 'character-combat-attack-wrap'}>
        <section className="monster-section-block">
          <div className="section-head">
            <h3 className="monster-section-title">Combat</h3>
            {isGuidedCreation ? (
              <button
                type="button"
                className="monster-example-btn"
                onClick={requestRollHitPoints}
                disabled={!canEditSelected || (hasRolledHp && !canFreeRerollHp)}
              >
                {!hasRolledHp ? 'Roll HP' : canFreeRerollHp ? 'Re-roll HP' : 'HP Rolled'}
              </button>
            ) : null}
          </div>
          <div className="character-combat-layout">
            <div className="character-combat-column">
              <div className="character-combat-major-row">
                <span className="character-combat-tag">HP</span>
                <input
                  type="number"
                  value={String(effectiveSelected.hpCurrent)}
                  onChange={(event) =>
                    updateSelectedCharacter({ hpCurrent: Number(event.target.value || 0) })
                  }
                  disabled={!canEditSelected || isGuidedCreation}
                />
                <small>Hit points</small>
              </div>
              <div className="character-combat-side-row">
                <span className="character-combat-tag">Max</span>
                <input
                  type="number"
                  value={String(effectiveSelected.hpMax)}
                  onChange={(event) =>
                    updateSelectedCharacterSystem({ hpMax: Number(event.target.value || 0) })
                  }
                  readOnly={isGuidedCreation || !canEditSelected}
                  disabled={isGuidedCreation || !canEditSelected}
                />
                <small>Maximum hit points</small>
              </div>
              <div className="character-combat-side-row">
                <span className="character-combat-tag">±</span>
                <input type="text" value={derivedConModifier} readOnly />
                <small>CON modifier to hit points</small>
              </div>
            </div>

            <div className="character-combat-column">
              <div className="character-combat-major-row">
                <span className="character-combat-tag">AC</span>
                <input
                  type="number"
                  value={String(effectiveSelected.ac)}
                  readOnly
                  disabled
                />
                <small>Armour Class</small>
              </div>
              <div className="character-combat-side-row">
                <span className="character-combat-tag">Un</span>
                <input type="text" value={derivedUnarmouredAc} readOnly />
                <small>Unarmoured AC: 9 [10] + DEX AC adjustment</small>
              </div>
              <div className="character-combat-side-row">
                <span className="character-combat-tag">±</span>
                <input type="text" value={derivedDexAcModifier} readOnly />
                <small>DEX adjustment to Armour Class (descending)</small>
              </div>
            </div>
          </div>
        </section>

        <section className="monster-section-block">
          <h3 className="monster-section-title">Attack Rolls</h3>
          <div className="character-attack-mod-list">
            <div className="character-attack-mod-row">
              <div className="character-attack-mod-cell">
                <span className="character-combat-tag">Mel</span>
                <input type="text" value={derivedMeleeModifier} readOnly />
              </div>
              <small>STR mod to melee att./dmg.</small>
            </div>
            <div className="character-attack-mod-row">
              <div className="character-attack-mod-cell">
                <span className="character-combat-tag">Mis</span>
                <input type="text" value={derivedMissileModifier} readOnly />
              </div>
              <small>DEX mod to missile attacks (+1 halfling bonus)</small>
            </div>
          </div>
          <div className="character-attack-thaco-row">
            <div className="character-attack-mod-cell character-thaco-cell">
              <span className="character-combat-tag">THAC0</span>
              <input
                type="number"
                step={1}
                value={selectedThacoRaw}
                onChange={(event) => {
                  if (!effectiveSelected) return
                  setThacoByCharacterId((current) => ({
                    ...current,
                    [effectiveSelected.id]: event.target.value,
                  }))
                }}
                disabled={!canEditSelected}
              />
            </div>
            <p>Descending AC matrix (DAC)</p>
          </div>
          <div className="character-attack-matrix-grid">
            {Array.from({ length: 10 }, (_, idx) => 9 - idx).map((armorClass) => {
              const requiredRoll = Number.isNaN(selectedThaco) ? '' : String(selectedThaco - armorClass)
              return (
                <Fragment key={`dac-${armorClass}`}>
                  <span className="character-attack-ac-label">{armorClass}</span>
                  <span className="character-attack-roll-value">{requiredRoll}</span>
                </Fragment>
              )
            })}
          </div>
          <p className="character-attack-help">
            Descending AC: Look up attack roll in matrix to determine hit Armour Class.
          </p>
        </section>
      </div>

      <section className="monster-section-block">
        <div className="character-encounter-movement-grid">
          <section className="monster-section-block">
            <h3 className="monster-section-title">Encounters</h3>
            <div className="character-encounter-grid">
              <div className="character-encounter-row">
                <span className="character-combat-tag">Init</span>
                <input type="text" value={derivedInitModifier} readOnly />
                <small>DEX modifier to initiative (+1 halfling bonus, optional)</small>
              </div>
              <div className="character-encounter-row">
                <span className="character-combat-tag">±</span>
                <input type="text" value={derivedReactionModifier} readOnly />
                <small>CHA modifier to reaction rolls</small>
              </div>
            </div>
          </section>

          <section className="monster-section-block">
            <div className="character-section-head-with-note">
              <h3 className="monster-section-title">Movement</h3>
              <p>Base mv. rate = 120, unless encumbered</p>
            </div>
            <div className="character-encounter-grid">
              <div className="character-encounter-row">
                <span className="character-combat-tag">Ov</span>
                <input type="number" step={1} value={String(derivedOverlandMove)} readOnly />
                <small>Overland: ⅕ base mv. rate (miles/day)</small>
              </div>
              <div className="character-encounter-row">
                <span className="character-combat-tag">Ex</span>
                <input type="number" step={1} value={String(derivedExplorationMove)} readOnly />
                <small>Exploration: base mv. rate (feet/turn)</small>
              </div>
              <div className="character-encounter-row">
                <span className="character-combat-tag">En</span>
                <input type="number" step={1} value={String(derivedEncounterMove)} readOnly />
                <small>Encounter: ⅓ base mv. rate (feet/round)</small>
              </div>
            </div>
          </section>
        </div>
      </section>

      {useIntermediateLayout && !isIntermediateMobileLayout ? (
        <div className="character-sheet-two-col">
          <CharacterAdventuringSkillsSection derivedOpenStuckDoor={derivedOpenStuckDoor} selectedAdventureScores={selectedAdventureScores} />
          {renderThiefSkillsSection()}
        </div>
      ) : null}

      {isIntermediateMobileLayout ? (
        <div className="character-mobile-intermediate-pair">
          <CharacterAdventuringSkillsSection derivedOpenStuckDoor={derivedOpenStuckDoor} selectedAdventureScores={selectedAdventureScores} />
          <CharacterClassFeaturesSection features={unlockedClassFeatures} />
        </div>
      ) : (
        <CharacterClassFeaturesSection features={unlockedClassFeatures} />
      )}

      {isIntermediateMobileLayout ? renderThiefSkillsSection() : null}

      {useIntermediateLayout ? (
        <CharacterLanguagesSection
          value={effectiveSelected ? (languagesTextByCharacterId[effectiveSelected.id] ?? '') : ''}
          canEdit={canEditSelected}
          onCommit={(value) => {
            if (!effectiveSelected) return
            setLanguagesTextByCharacterId((current) => ({ ...current, [effectiveSelected.id]: value }))
          }}
        />
      ) : null}

    </div>

    <div className="character-sheet-right">
      {!isMobile || useIntermediateLayout ? (
        <CharacterPortraitSection
          character={effectiveSelected}
          permissions={permissions}
          media={media}
          onChange={updateSelectedCharacter}
        />
      ) : null}

      {!useIntermediateLayout ? <CharacterAdventuringSkillsSection derivedOpenStuckDoor={derivedOpenStuckDoor} selectedAdventureScores={selectedAdventureScores} /> : null}

      {!useIntermediateLayout ? renderThiefSkillsSection() : null}

      {!useIntermediateLayout ? (
        <CharacterLanguagesSection
          value={effectiveSelected ? (languagesTextByCharacterId[effectiveSelected.id] ?? '') : ''}
          canEdit={canEditSelected}
          onCommit={(value) => {
            if (!effectiveSelected) return
            setLanguagesTextByCharacterId((current) => ({ ...current, [effectiveSelected.id]: value }))
          }}
        />
      ) : null}
    </div>
  </div>
</section>

  )
}
