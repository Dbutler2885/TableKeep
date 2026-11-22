import type { LubecTargetPart } from '../ruleSets/lubec/valueParts'
import type { LubecRollDice } from './lubecRollDice'
import './lubecRollBreakdown.css'

// What happened at a roll, shown beside its result wherever the Lubec roller
// shows one: both dice under Advantage or Disadvantage, the kept one marked and
// the other set aside, with the mode and the card that set it; then each
// change to the number the roll was made under, and that number.


const MODES = {
  advantage: { name: 'Advantage', keeps: 'keep the better' },
  disadvantage: { name: 'Disadvantage', keeps: 'keep the worse' },
} as const

const pad = (value: number) => String(value).padStart(2, '0')

/** "from Broken rib(s)": the reason without the mode's own name, which the label already says. */
function reasonWords(dice: LubecRollDice): string | null {
  const name = MODES[dice.mode].name
  if (!dice.because) return null
  return dice.because.startsWith(name) ? dice.because.slice(name.length).trim() : dice.because
}

function DiceView({ dice }: { dice: LubecRollDice }) {
  const kept = dice.values.indexOf(dice.kept)
  const { name, keeps } = MODES[dice.mode]
  const reason = reasonWords(dice)
  return (
    <div className={`lubec-roll-dice ${dice.mode}`}>
      <p className="lubec-roll-mode"><strong>{name}</strong>{reason ? <span>{` ${reason}`}</span> : null}<span>{`: ${keeps}`}</span></p>
      <ol aria-label={`${name} dice`}>
        {dice.values.map((value, index) => (
          <li key={index} className={index === kept ? 'kept' : 'set-aside'}>
            <b>{pad(value)}</b><small>{index === kept ? 'kept' : 'set aside'}</small>
          </li>
        ))}
      </ol>
    </div>
  )
}

function PartsView({ parts, name, target }: { parts: readonly LubecTargetPart[]; name: string; target: number }) {
  return (
    <ol className="lubec-roll-parts" aria-label={`How ${name} ${target} is reached`}>
      {parts.map((part, index) => <li key={index}><span>{part.label}</span><b>{part.value}</b></li>)}
      <li className="total"><span>{name}</span><b>{target}</b></li>
    </ol>
  )
}

type BreakdownProps = { dice: LubecRollDice | null; parts: readonly LubecTargetPart[] | null; name: string; target: number }

/** The dice and the target's parts for one roll; nothing when the roll had one die and no parts to show. */
export function LubecRollBreakdown({ dice, parts, name, target }: BreakdownProps) {
  if (!dice && !parts) return null
  return (
    <div className="lubec-roll-breakdown">
      {dice ? <DiceView dice={dice} /> : null}
      {parts ? <PartsView parts={parts} name={name} target={target} /> : null}
    </div>
  )
}
