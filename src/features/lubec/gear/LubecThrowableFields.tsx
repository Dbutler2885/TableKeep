import './lubecThrowableFields.css'
import { LUBEC_RANGE_BANDS, type LubecRangeBand } from '../../ruleSets/lubec/gear/gearRecord'
import { canBeThrown, withRangeBand, type LubecRangeFields } from './throwableFields'
import { WOUND_KINDS, WOUNDS } from './itemLabels'
import type { LubecFieldsProps } from './LubecItemFormTop'

const bandName = (band: string): string => band[0].toUpperCase() + band.slice(1)

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="toggle"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span className="knob" aria-hidden="true" /><span className="t">{label}</span></label>
}

function ThrownDamage({ fields, onFields }: LubecFieldsProps) {
  return <div className="two">
    <label className="field"><span className="label">Thrown Impact</span><input type="number" inputMode="numeric" value={fields.thrownImpact} onChange={(e) => onFields({ ...fields, thrownImpact: e.target.value })} /></label>
    <label className="field"><span className="label">Thrown damage type</span><select value={fields.thrownWound} onChange={(e) => onFields({ ...fields, thrownWound: e.target.value as typeof fields.thrownWound })}>
      {WOUND_KINDS.map((wound) => <option key={wound} value={wound}>{WOUNDS[wound]}</option>)}
    </select></label>
  </div>
}

function CatchFields({ fields, onFields }: LubecFieldsProps) {
  return <div className="stack">
    <label className="field"><span className="label">Catch chance (%)</span><input type="number" min={0} max={100} inputMode="numeric" placeholder="Cannot be caught" value={fields.catchChance} onChange={(e) => onFields({ ...fields, catchChance: e.target.value })} /></label>
    <Toggle label="Catching this puts the thrower out" checked={fields.catchPutsThrowerOut} onChange={(catchPutsThrowerOut) => onFields({ ...fields, catchPutsThrowerOut })} />
  </div>
}

/** A melee weapon can add one fixed thrown damage type; thrown mode uses its ordinary damage. */
export function LubecThrowableFields(props: LubecFieldsProps) {
  const { fields, onFields } = props
  if (fields.mode === 'firearm') return null
  return <div className="stack throwable-fields">
    {fields.mode === 'melee' ? <Toggle label="Can be thrown" checked={fields.canThrow} onChange={(canThrow) => onFields({ ...fields, canThrow })} /> : null}
    {canBeThrown(fields) ? <>
      {fields.mode === 'melee' ? <ThrownDamage {...props} /> : null}
      <CatchFields {...props} />
    </> : null}
  </div>
}

type RangeProps = LubecFieldsProps & { band: LubecRangeBand; range: LubecRangeFields | undefined }

function RangeRow({ fields, onFields, band, range }: RangeProps) {
  const change = (patch: Partial<LubecRangeFields>) => onFields({ ...fields, ranges: fields.ranges.map((entry) => entry.band === band ? { ...entry, ...patch } : entry) })
  return <div className="stack range-row">
    <Toggle label={bandName(band)} checked={Boolean(range)} onChange={(enabled) => onFields(withRangeBand(fields, band, enabled))} />
    {range ? <div className="two">
      <label className="field"><span className="label">{bandName(band)} distance</span><input type="text" placeholder="In your own words" value={range.distance} onChange={(e) => change({ distance: e.target.value })} /></label>
      <label className="field"><span className="label">{bandName(band)} Handle modifier</span><input type="number" inputMode="numeric" placeholder="GM decides" value={range.modifier} onChange={(e) => change({ modifier: e.target.value })} /></label>
    </div> : null}
  </div>
}

/** Each selected band belongs to this weapon; blank entries defer to the GM. */
export function LubecRangeFields(props: LubecFieldsProps) {
  const { fields } = props
  if (fields.mode === 'melee' && !fields.canThrow) return null
  return <details className="weapon-ranges"><summary>Weapon ranges</summary>
    <div className="stack">
      <p className="field-note">Include any bands this weapon uses. Distances and Handle modifiers are optional.</p>
      {LUBEC_RANGE_BANDS.map((band) => <RangeRow key={band} {...props} band={band} range={fields.ranges.find((range) => range.band === band)} />)}
    </div>
  </details>
}
