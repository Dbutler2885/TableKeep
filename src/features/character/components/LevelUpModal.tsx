import { Star } from 'lucide-react'
import type { CharacterRecord } from '../../../types/app'
import type { ClassFeature } from '../lib/characterTabTypes'

type Props = {
  open: boolean
  character: CharacterRecord | null
  targetLevel: number | null
  className: string
  flavor: string
  nextLevelXp: number | null
  checklist: string[]
  hitDie: number | null
  hpGain: number | null
  hpRoll: number | null
  applying: boolean
  newFeatures: ClassFeature[]
  error: string | null
  onClose: () => void
  onRoll: () => void
  onApply: () => void
}

export function LevelUpModal(props: Props) {
  if (!props.open || !props.character) return null
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" onClick={props.onClose}>
      <div className="confirm-modal character-levelup-modal" onClick={(event) => event.stopPropagation()}>
        <header className="character-levelup-hero">
          <div className="character-levelup-kicker"><Star size={14} /><span>Level Up</span></div>
          <h3 className="character-levelup-title">{props.character.name} Advances</h3>
          <p className="character-levelup-story">As a level {props.targetLevel} {props.className}, you should roll new hit points and review your updated class options.</p>
          <p className="character-levelup-flavor">{props.flavor}</p>
          <div className="character-levelup-meta">
            <span className="character-levelup-pill">Level {props.character.level} to {props.targetLevel}</span>
            <span className="character-levelup-pill">XP {props.character.xp.toLocaleString()}{props.nextLevelXp !== null ? ` / ${props.nextLevelXp.toLocaleString()}` : ''}</span>
          </div>
        </header>
        <div className="character-levelup-panes">
          <section className="character-levelup-panel"><h4 className="character-levelup-subhead">Checklist</h4><ul className="character-levelup-list">{props.checklist.map((step) => <li key={step}>{step}</li>)}</ul></section>
          <section className="character-levelup-panel">
            <h4 className="character-levelup-subhead">Hit Point Roll</h4>
            <div className="character-levelup-grid">
              <div className="character-levelup-row"><span>Class HD</span><strong>{props.hitDie ? `d${props.hitDie}` : '-'}</strong></div>
              <div className="character-levelup-row"><span>HP gained this level</span><strong>{props.hpGain ?? '-'}</strong></div>
            </div>
            <div className="character-levelup-actions"><button type="button" className="character-levelup-roll-btn" onClick={props.onRoll} disabled={props.applying || props.hpRoll !== null}>Roll Hit Points</button></div>
            <p className="character-enc-help">This increase uses the hit die roll.</p>
          </section>
        </div>
        <section className="character-levelup-panel">
          <h4 className="character-levelup-subhead">New At This Level</h4>
          {props.newFeatures.length > 0 ? <ul className="character-levelup-list">{props.newFeatures.map((feature) => <li key={feature.id}><strong>{feature.name}.</strong> {feature.summary}</li>)}</ul> : <p className="character-enc-help">No new named feature unlocks at this exact level.</p>}
        </section>
        {props.error ? <p className="error">{props.error}</p> : null}
        <div className="confirm-actions">
          <button type="button" onClick={props.onClose} disabled={props.applying}>Cancel</button>
          <button type="button" className="confirm-danger" onClick={props.onApply} disabled={props.applying || props.hpGain === null}>Apply Level Up</button>
        </div>
      </div>
    </div>
  )
}
