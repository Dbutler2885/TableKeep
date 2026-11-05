import type { ReactNode } from 'react'
import { AttackScale, LiveDivider } from './AttackBar'
import { labelPlace, rollText } from './attackDraft'

type RollBarProps = {
  /** The number to roll under, 0 to 100. */
  value: number
  tag: string
  /** The roll once made, and whether it succeeded. */
  roll?: { roll: number; success: boolean } | null
  /** Full Defense's +10, shown only on its bar. */
  bonus?: boolean
  /** Moves the bar's end in tens, for a split still being chosen. */
  onMove?: (amount: number) => void
  controls: ReactNode
}

const rollClass = (roll: RollBarProps['roll']): string => (roll ? (roll.success ? 'success' : 'failure') : '')

function RollValue({ value, roll }: Pick<RollBarProps, 'value' | 'roll'>) {
  if (!roll) return <>{value}</>
  return <><span className="roll-result">{rollText(roll.roll)}</span>/{value}</>
}

/** The prototype's one-number roll bar: roll under it, with the roll written on it once made. */
export function RollBar({ value, tag, roll, bonus = false, onMove, controls }: RollBarProps) {
  const place = labelPlace(0, value)
  return (
    <>
      <div className="roll-controls">{controls}</div>
      <AttackScale />
      <div className="allocation-bar">
        <span className={`segment attack ${rollClass(roll)}`} style={{ left: 0, width: `${value}%` }} />
        <span className="segment unused" style={{ left: `${value}%`, width: `${100 - value}%` }} />
        <div className="effective-edge" style={{ left: `${value}%` }} />
        {onMove ? <LiveDivider at={value} onMove={onMove} /> : null}
      </div>
      <div className="allocation-labels">
        <span className={`allocation-label attack ${place.edge}`} style={{ left: `${place.left}%` }}><small>{tag}</small><strong><RollValue value={value} roll={roll} /></strong>{bonus ? <b className="fd10">+10</b> : null}</span>
      </div>
    </>
  )
}
