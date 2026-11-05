import { useState } from 'react'
import { LUBEC_RANGE_BANDS, type LubecRangeBand, type LubecWeaponRange } from '../../../ruleSets/lubec/gear/gearRecord'
import { combatBandName } from '../engine/attackAim'
import type { CombatAttack } from '../engine/types'
import { bandLabel, bandOf, pressedBand } from './attackWords'

/** A range row shows only for a frozen ranged aim, so its bands are the frozen weapon's own. */
const rangesOf = (attack: CombatAttack): readonly LubecWeaponRange[] => attack.frozen!.ranges

export type DeclareRange = (band: LubecRangeBand, modifier: number | null) => void

type TypedProps = { band: LubecRangeBand; onDeclare: DeclareRange }

/** A band the weapon does not number asks the GM for the Handle modifier, with 0 filled in. */
function TypedModifier({ band, onDeclare }: TypedProps) {
  const [typed, setTyped] = useState('0')
  const value = Number(typed)
  return (
    <span className="range-typed">
      <label className="note">{combatBandName(band)}: Handle modifier <input type="number" step={1} value={typed} aria-label={`${combatBandName(band)} Handle modifier`} onChange={(event) => setTyped(event.target.value)} /></label>
      <button type="button" className="btn line small" disabled={!Number.isSafeInteger(value)} onClick={() => onDeclare(band, value)}>Declare</button>
    </span>
  )
}

type BandsProps = { ranges: readonly LubecWeaponRange[]; pressed: LubecRangeBand | undefined; readOnly: boolean; onPress: (band: LubecRangeBand) => void }

function RangeBands({ ranges, pressed, readOnly, onPress }: BandsProps) {
  return (
    <span className="alts">
      {LUBEC_RANGE_BANDS.map((band) => (
        <button key={band} type="button" aria-pressed={pressed === band} title={bandOf(ranges, band)?.distance} disabled={readOnly} onClick={() => onPress(band)}>{bandLabel(ranges, band)}</button>
      ))}
    </span>
  )
}

const NO_PRESS = () => undefined

/** The GM's row: four live bands; a band the weapon numbers declares at once, any other asks for its number. */
function LiveRange({ attack, remembered, onDeclare }: { attack: CombatAttack; remembered?: LubecRangeBand; onDeclare: DeclareRange }) {
  const [typing, setTyping] = useState<LubecRangeBand | null>(null)
  const ranges = rangesOf(attack)
  const press = (band: LubecRangeBand) => (bandOf(ranges, band)?.modifier === undefined ? setTyping(band) : onDeclare(band, null))
  return (
    <div className="range-row">
      <span className="label">Range</span>
      <RangeBands ranges={ranges} pressed={pressedBand(attack, remembered)} readOnly={false} onPress={press} />
      {typing ? <TypedModifier key={typing} band={typing} onDeclare={onDeclare} /> : null}
    </div>
  )
}

/** The attacker's row: read-only, waiting until the GM declares the range. */
function ReadOnlyRange({ attack }: { attack: CombatAttack }) {
  return (
    <div className="range-row">
      <span className="label">Range</span>
      <RangeBands ranges={rangesOf(attack)} pressed={attack.range?.band} readOnly onPress={NO_PRESS} />
      {attack.range ? null : <span className="note">Waiting for the GM to declare the range</span>}
    </div>
  )
}

type RowProps = { attack: CombatAttack; remembered?: LubecRangeBand; onDeclare: DeclareRange | null }

/** The range row: the GM's four bands live for the GM, read-only for the attacker until the GM declares one. */
export function RangeRow({ attack, remembered, onDeclare }: RowProps) {
  return onDeclare ? <LiveRange attack={attack} remembered={remembered} onDeclare={onDeclare} /> : <ReadOnlyRange attack={attack} />
}
