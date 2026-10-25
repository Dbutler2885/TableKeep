type CorrectSwitchProps = { on: boolean; onChange: (on: boolean) => void }

/**
 * The GM's "Correct" switch on a finalized character. It is a view switch held
 * only on the GM's screen and never stored; while it is on, every locked value
 * can be changed, holes included.
 */
export function LubecCorrectSwitch({ on, onChange }: CorrectSwitchProps) {
  return (
    <div className="lubec-correct-bar">
      <label className="lubec-correct-switch">
        <input type="checkbox" role="switch" checked={on} onChange={(event) => onChange(event.target.checked)} />
        Correct
      </label>
      <p className="lubec-correct-hint">{on ? 'GM only: every value is unlocked.' : 'GM only: unlock the locked values to fix them.'}</p>
    </div>
  )
}
