import './attackMatchup.css'

/** The current pairing stays prominent for the attacker, GM and spectators. */
export function AttackMatchup({ attacker, target }: { attacker: string; target: string | null }) {
  return (
    <div className="attack-matchup" role="group" aria-label="Current attack">
      <div className="matchup-fighter matchup-attacker"><small>Attacker</small><strong>{attacker}</strong></div>
      <span className="matchup-direction" aria-hidden="true">→</span>
      <div className="matchup-fighter matchup-target"><small>Target</small><strong>{target ?? 'Choose a target'}</strong></div>
    </div>
  )
}
