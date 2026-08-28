import { Star } from 'lucide-react'
import type { CharacterRecord } from '../../../types/app'
import type { useLevelUpFlow } from '../hooks/useLevelUpFlow'
import type { useSelectedCharacterDerivations } from '../hooks/useSelectedCharacterDerivations'

type Props = {
  character: CharacterRecord | null
  flow: ReturnType<typeof useLevelUpFlow>
  derivations: ReturnType<typeof useSelectedCharacterDerivations>
}

export function LevelUpModal(props: Props) {
  const { flow, derivations } = props
  if (!flow.levelUpModalOpen || !props.character) return null
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" onClick={flow.closeLevelUpModal}>
      <div className="confirm-modal character-levelup-modal" onClick={(event) => event.stopPropagation()}>
        <header className="character-levelup-hero">
          <div className="character-levelup-kicker"><Star size={14} /><span>Level Up</span></div>
          <h3 className="character-levelup-title">{props.character.name} Advances</h3>
          <p className="character-levelup-story">As a level {flow.levelUpTargetLevel} {derivations.selectedClassName}, you should roll new hit points and review your updated class options.</p>
          <p className="character-levelup-flavor">{flow.levelUpFlavor}</p>
          <div className="character-levelup-meta">
            <span className="character-levelup-pill">Level {props.character.level} to {flow.levelUpTargetLevel}</span>
            <span className="character-levelup-pill">XP {props.character.xp.toLocaleString()}{derivations.selectedNextLevelXp !== null ? ` / ${derivations.selectedNextLevelXp.toLocaleString()}` : ''}</span>
          </div>
        </header>
        <div className="character-levelup-panes">
          <section className="character-levelup-panel"><h4 className="character-levelup-subhead">Checklist</h4><ul className="character-levelup-list">{flow.levelUpChecklist.map((step) => <li key={step}>{step}</li>)}</ul></section>
          <section className="character-levelup-panel">
            <h4 className="character-levelup-subhead">Hit Point Roll</h4>
            <div className="character-levelup-grid">
              <div className="character-levelup-row"><span>Class HD</span><strong>{derivations.selectedHitDie ? `d${derivations.selectedHitDie}` : '-'}</strong></div>
              <div className="character-levelup-row"><span>HP gained this level</span><strong>{flow.levelUpHpGain ?? '-'}</strong></div>
            </div>
            <div className="character-levelup-actions"><button type="button" className="character-levelup-roll-btn" onClick={flow.rollLevelUpHitPoints} disabled={flow.levelUpApplying || flow.levelUpHpRoll !== null}>Roll Hit Points</button></div>
            <p className="character-enc-help">This increase uses the hit die roll.</p>
          </section>
        </div>
        <section className="character-levelup-panel">
          <h4 className="character-levelup-subhead">New At This Level</h4>
          {flow.levelUpNewFeatures.length > 0 ? <ul className="character-levelup-list">{flow.levelUpNewFeatures.map((feature) => <li key={feature.id}><strong>{feature.name}.</strong> {feature.summary}</li>)}</ul> : <p className="character-enc-help">No new named feature unlocks at this exact level.</p>}
        </section>
        {flow.levelUpError ? <p className="error">{flow.levelUpError}</p> : null}
        <div className="confirm-actions">
          <button type="button" onClick={flow.closeLevelUpModal} disabled={flow.levelUpApplying}>Cancel</button>
          <button type="button" className="confirm-danger" onClick={flow.applyLevelUp} disabled={flow.levelUpApplying || flow.levelUpHpGain === null}>Apply Level Up</button>
        </div>
      </div>
    </div>
  )
}
