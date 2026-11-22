import { OverPop } from './OverPop'
import './lubecFight.css'
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
    <div className="wear-row" title={row.covers ? `${row.name}: ${row.covers}` : row.name}>
      <span><b>{row.name}</b>{row.covers ? <small>{row.covers}</small> : null}</span>
      <span className="nums">
        {WOUND_KINDS.map((w) => <i key={w}><small>{WOUND_SHORT[w]}</small>{row.armor[w]}</i>)}
      </span>
    </div>
  )
}

/** The rows a card of `limit` lines shows, keeping its last line for "+N more", and the rows that open over it. */
function splitWorn(worn: readonly LubecWornRow[], limit: number | undefined): { shown: readonly LubecWornRow[]; rest: readonly LubecWornRow[] } {
  if (limit === undefined || worn.length <= limit) return { shown: worn, rest: [] }
  return { shown: worn.slice(0, limit - 1), rest: worn.slice(limit - 1) }
}

function WearMore({ name, worn, more }: { name: string; worn: readonly LubecWornRow[]; more: number }) {
  if (!more) return null
  return (
    <OverPop className="wear-more" summary={`+${more} more`}>
      <div className="wear-pop" role="group" aria-label={`Everything ${name} is wearing`}>{worn.map((row) => <WornRow key={row.key} row={row} />)}</div>
    </OverPop>
  )
}

const NO_SHEET = 'No sheet to read here. The GM says what they are wearing.'

// B's wearingCard. A sheet the viewer cannot read says so rather than say they wear nothing.
// With a limit the card keeps one size: that many lines, and the rest open over it rather than grow it.
export function LubecFightWearingContent({ target, limit }: { target: LubecCombatant; limit?: number }) {
  const worn = lubecCombatantWorn(target)
  const name = lubecCombatantFace(target).name
  const { shown, rest } = splitWorn(worn ?? [], limit)
  return (
    <div className="wearing">
      <div className="wear-head"><span>{name} is wearing</span></div>
      {shown.length ? shown.map((row) => <WornRow key={row.key} row={row} />) : <p className="none">{worn ? 'Nothing that stops a wound.' : NO_SHEET}</p>}
      <WearMore name={name} worn={worn ?? []} more={rest.length} />
    </div>
  )
}

type TargetStepProps = {
  target: LubecCombatant | null
  choices: readonly LubecCombatant[]
  onTarget: (key: string) => void
}

/** The Target step (B's targetBlock): who, on the left, what they wear, on the right. */
export function LubecFightTargetContent({ target, choices, onTarget }: TargetStepProps) {
  return (
    <div className="lubec-fight-content target-grid">
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
      {target ? <LubecFightWearingContent target={target} /> : <p className="note">Pick who you are attacking to see what they are wearing.</p>}
    </div>
  )
}

