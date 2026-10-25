type CorrectSwitchProps = { on: boolean; onChange: (on: boolean) => void }

/**
 * The GM's "Correct" switch on a finalized character. It is a view switch held
 * only on the GM's screen and never stored; while it is on, every locked value
 * can be changed, holes included. It is the prototype's rust action button,
 * filled while it is on, with its hint in the phase chip beside it.
 */
export function LubecCorrectSwitch({ on, onChange }: CorrectSwitchProps) {
  return (
    <div className="lubec-correct-bar">
      <p className="phase-chip">{on ? 'GM only: every value is unlocked.' : 'GM only: unlock the locked values to fix them.'}</p>
      <button type="button" role="switch" aria-checked={on} className="action-button lubec-correct-switch" onClick={() => onChange(!on)}>
        Correct
      </button>
    </div>
  )
}
