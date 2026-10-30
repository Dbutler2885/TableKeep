import { WOUND_KINDS, WOUND_SHORT } from '../gear/itemLabels'
import { LubecPortrait } from '../LubecPortrait'
import { LubecTokenFace } from '../LubecToken'
import { lubecCombatantFace, lubecCombatantKey, lubecCombatantWoundLevel, lubecCombatantWorn, type LubecCombatant, type LubecWornRow } from './lubecFightRequest'

function TargetCard({ target }: { target: LubecCombatant }) {
  const face = lubecCombatantFace(target)
  const level = lubecCombatantWoundLevel(target)
  return (
    <div className="target-card">
      <div className="lubec-id-art">
        <LubecPortrait character={face} />
        <div className="lubec-token" role="img" aria-label={`${face.name} map token`}><LubecTokenFace tokenIcon={face.tokenIcon} /></div>
      </div>
      <div className="target-words">
        <h3>{face.name}</h3>
        {/* The chip's place beside the name: it says nothing until wound level is decided. */}
        <span className={`wound-chip${level ? '' : ' silent'}`} role="status" aria-label="Wound level">{level}</span>
      </div>
    </div>
  )
}

// What the row stops, as the Gear page's armor reads it: the numbers are a piece's own, and they add up on a part it shares.
function WornRow({ row }: { row: LubecWornRow }) {
  return (
    <div className="wear-row">
      <span><b>{row.name}</b>{row.covers ? <small>{row.covers}</small> : null}</span>
      <span className="nums">
        {WOUND_KINDS.map((w) => <i key={w}><small>{WOUND_SHORT[w]}</small>{row.armor[w]}</i>)}
      </span>
    </div>
  )
}

// B's wearingCard. A sheet the viewer cannot read says so rather than say they wear nothing.
function WearingCard({ target }: { target: LubecCombatant }) {
  const worn = lubecCombatantWorn(target)
  const nothing = worn ? 'Nothing that stops a wound.' : 'No sheet to read here. The GM says what they are wearing.'
  return (
    <div className="wearing">
      <div className="wear-head"><span>{lubecCombatantFace(target).name} is wearing</span></div>
      {worn?.length ? worn.map((row) => <WornRow key={row.key} row={row} />) : <p className="none">{nothing}</p>}
    </div>
  )
}

type TargetStepProps = {
  target: LubecCombatant | null
  choices: readonly LubecCombatant[]
  onTarget: (key: string) => void
}

/** The Target step (B's targetBlock): who, on the left, what they wear, on the right. */
export function LubecFightTargetStep({ target, choices, onTarget }: TargetStepProps) {
  return (
    <div className="target-grid">
      <div>
        <p className="ask">Who are you attacking?</p>
        <label className="f"><span>Who</span>
          <select value={target ? lubecCombatantKey(target) : ''} onChange={(e) => onTarget(e.target.value)}>
            <option value="">Pick someone</option>
            {choices.map((c) => <option key={lubecCombatantKey(c)} value={lubecCombatantKey(c)}>{lubecCombatantFace(c).name}</option>)}
          </select>
        </label>
        {target ? <TargetCard target={target} /> : null}
      </div>
      {target ? <WearingCard target={target} /> : <p className="note">Pick who you are attacking to see what they are wearing.</p>}
    </div>
  )
}
