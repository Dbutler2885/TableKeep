import type { LubecGear, LubecItem, LubecItemWeight } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecCostText } from '../../ruleSets/lubec/gear/moveCost'
import { lubecDestinations, WEIGHT_NAMES, weightHint } from './itemLabels'
import { lubecWithDest } from './itemForm'
import type { LubecFieldsProps } from './LubecItemFormTop'

type BottomProps = LubecFieldsProps & {
  gear: LubecGear
  editing: LubecItem | undefined
  /** False for an item that has no place, as in the GM's Items tab: "where it goes" is left out. */
  placed: boolean
}

const WEIGHTS = Object.keys(WEIGHT_NAMES) as LubecItemWeight[]

function WhereItGoes({ fields, onFields, gear, editing }: Omit<BottomProps, 'placed'>) {
  return (
    <>
      <label className="field"><span className="label">Put it</span>
        <select value={fields.dest} onChange={(e) => onFields(lubecWithDest(fields, e.target.value))}>
          <optgroup label="On you">{lubecDestinations(gear, fields.kind).map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</optgroup>
        </select>
      </label>
      <p className="cost">{editing ? lubecCostText(editing.carrier, fields.dest) : ''}</p>
    </>
  )
}

/** Where it goes, what moving it there costs when it is being edited, and its weight. */
export function LubecItemFormBottom({ placed, ...props }: BottomProps) {
  const { fields, onFields } = props
  return (
    <div className="form-bottom">
      {placed ? <WhereItGoes {...props} /> : null}
      <fieldset className="field weight-pick">
        <legend className="label">Weight</legend>
        <div className="seg-row thirds">
          {WEIGHTS.map((w) => (
            <label key={w}><input type="radio" name="weight" value={w} checked={fields.weight === w} onChange={() => onFields({ ...fields, weight: w })} /><span>{WEIGHT_NAMES[w]}</span></label>
          ))}
        </div>
        <p className="field-note" aria-live="polite">{weightHint(fields.weight)}</p>
      </fieldset>
    </div>
  )
}
