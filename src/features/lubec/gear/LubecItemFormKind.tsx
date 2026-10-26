import type { LubecGear, LubecSupply, LubecWoundKind } from '../../ruleSets/lubec/gear/gearRecord'
import { HOLD, type LubecHoldWay } from '../../ruleSets/lubec/gear/gearRules'
import { TABLES, WOUND_KINDS, WOUND_SHORT } from './itemLabels'
import { lubecBothHandsByRule, lubecWithMode, type LubecItemFields } from './itemForm'
import { LubecArmorMaker } from './LubecArmorMaker'
import type { LubecFieldsProps } from './LubecItemFormTop'

type KindProps = LubecFieldsProps & { supplies: readonly LubecSupply[] }

type ChoiceProps<T extends string> = { name: string; value: T; options: readonly (readonly [T, string, string])[]; onPick: (value: T) => void; className?: string }

/** A row of big choices, each with a line under its name (B's `.choices`). */
function Choices<T extends string>({ name, value, options, onPick, className = 'choices' }: ChoiceProps<T>) {
  return (
    <div className={className}>
      {options.map(([v, label, small]) => (
        <label key={v}><input type="radio" name={name} value={v} checked={value === v} onChange={() => onPick(v)} /><span>{label}<small>{small}</small></span></label>
      ))}
    </div>
  )
}

type NumberProps = { label: string; value: string; min: number; max: number; onValue: (value: string) => void; placeholder?: string }

function NumberField({ label, value, min, max, onValue, placeholder }: NumberProps) {
  return <label className="field"><span className="label">{label}</span><input type="number" min={min} max={max} inputMode="numeric" placeholder={placeholder} value={value} onChange={(e) => onValue(e.target.value)} /></label>
}

type SupplyProps = { label: string; value: string; empty: string; supplies: readonly LubecSupply[]; onValue: (value: string) => void }

/** A pick of the supplies (Rule L1): what a gun or holder takes, or what a loose stack goes into. */
function SupplyField({ label, value, empty, supplies, onValue }: SupplyProps) {
  return (
    <label className="field"><span className="label">{label}</span>
      <select value={value} onChange={(e) => onValue(e.target.value)}>
        <option value="">{empty}</option>
        {supplies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </label>
  )
}

const MODES = [['melee', 'Melee', 'Strength adds'], ['firearm', 'Firearm', 'no Strength, takes rounds'], ['thrown', 'Thrown', 'Strength adds, from a distance']] as const
const REACHES = [['long', 'Long', 'like a bat; not on the ground'], ['short', 'Short', 'like a knife; works in a grapple']] as const
const TABLE_CHOICES = Object.entries(TABLES).filter(([k]) => k !== 'fisticuffs')

const toggled = (list: readonly LubecWoundKind[], w: LubecWoundKind) => (list.includes(w) ? list.filter((x) => x !== w) : [...list, w])

function WoundPick({ fields, onFields }: LubecFieldsProps) {
  return (
    <fieldset className="field wound-pick">
      <legend className="label">Wounds by <small>pick each way it can be used</small></legend>
      <div className="seg-row fours">
        {WOUND_KINDS.map((w) => (
          <label key={w}><input type="checkbox" name="wound" value={w} checked={fields.wounds.includes(w)} onChange={() => onFields({ ...fields, wounds: toggled(fields.wounds, w) })} /><span>{WOUND_SHORT[w]}</span></label>
        ))}
      </div>
    </fieldset>
  )
}

function FirearmFields({ fields, onFields, supplies }: KindProps) {
  const set = (changes: Partial<LubecItemFields>) => onFields({ ...fields, ...changes })
  return (
    <div className="stack w-firearm">
      <div className="two">
        <NumberField label="Holds" value={fields.wCapacity} min={1} max={99} onValue={(wCapacity) => set({ wCapacity })} />
        <NumberField label="Loaded" value={fields.wLoaded} min={0} max={99} onValue={(wLoaded) => set({ wLoaded })} />
      </div>
      <SupplyField label="Takes" value={fields.wTakes} empty="Pick one" supplies={supplies} onValue={(wTakes) => set({ wTakes })} />
    </div>
  )
}

const HANDS = [[1, 'One'], [2, 'Both']] as const

/** How many hands it takes to use: one unless picked, and both whenever the hands rule says so (Rule W3, spec D15). */
function HandsPick({ fields, onFields }: LubecFieldsProps) {
  const byRule = lubecBothHandsByRule(fields)
  return (
    <fieldset className="field hands-pick">
      <legend className="label">Hands</legend>
      <div className="seg-row halves">
        {HANDS.map(([n, label]) => (
          <label key={n}><input type="radio" name="hands" value={n} disabled={byRule && n === 1} checked={(byRule ? 2 : fields.hands) === n} onChange={() => onFields({ ...fields, hands: n })} /><span>{label}</span></label>
        ))}
      </div>
    </fieldset>
  )
}

/** What a weapon needs to be wielded: a minimum Strength, which costs Handle below it, and its hands. */
function HandlingFields(props: KindProps) {
  const { fields, onFields } = props
  return (
    <div className="two w-handling">
      <NumberField label="Minimum Strength" placeholder="None" value={fields.minStrength} min={0} max={99} onValue={(minStrength) => onFields({ ...fields, minStrength })} />
      <HandsPick {...props} />
    </div>
  )
}

// A melee weapon's reach, or a firearm's rounds; a thrown weapon has neither.
function ModeFields(props: KindProps) {
  const { fields, onFields } = props
  if (fields.mode === 'firearm') return <FirearmFields {...props} />
  if (fields.mode === 'thrown') return null
  return <Choices name="reach" value={fields.reach} options={REACHES} onPick={(reach) => onFields({ ...fields, reach })} className="choices w-melee" />
}

/** A weapon's page: melee, firearm or thrown, base Impact, the results table, the wounds it deals, what wielding it takes, and its reach or its rounds. */
function WeaponPage(props: KindProps) {
  const { fields, onFields } = props
  const set = (changes: Partial<LubecItemFields>) => onFields({ ...fields, ...changes })
  return (
    <div className="kind-block kb-weapon">
      <div className="eyebrow">Weapon</div>
      <Choices name="mode" value={fields.mode} options={MODES} onPick={(mode) => onFields(lubecWithMode(fields, mode))} />
      <div className="two">
        <NumberField label="Base Impact" value={fields.impact} min={-5} max={10} onValue={(impact) => set({ impact })} />
        <label className="field"><span className="label">Results table</span>
          <select value={fields.table} onChange={(e) => set({ table: e.target.value })}>{TABLE_CHOICES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
      </div>
      <WoundPick {...props} />
      <HandlingFields {...props} />
      <ModeFields {...props} />
    </div>
  )
}

function ConsumablePage({ fields, onFields, supplies }: KindProps) {
  return (
    <div className="kind-block kb-consumable">
      <div className="eyebrow">Consumable</div>
      <SupplyField label="Goes into a gun or holder?" value={fields.fits} empty="No" supplies={supplies} onValue={(fits) => onFields({ ...fields, fits })} />
    </div>
  )
}

const WAYS = (Object.keys(HOLD) as LubecHoldWay[]).map((k) => [k, HOLD[k].name, HOLD[k].like] as const)

function HolderPage({ fields, onFields, supplies }: KindProps) {
  const set = (changes: Partial<LubecItemFields>) => onFields({ ...fields, ...changes })
  return (
    <div className="kind-block kb-holder">
      <div className="eyebrow">Holder</div>
      <Choices name="hold" value={fields.hold} options={WAYS} onPick={(hold) => set({ hold })} />
      <div className="two">
        <NumberField label="Holds" value={fields.hCapacity} min={1} max={999} onValue={(hCapacity) => set({ hCapacity })} />
        <NumberField label="In it now" value={fields.hLoaded} min={0} max={999} onValue={(hLoaded) => set({ hLoaded })} />
      </div>
      <SupplyField label="Holds what" value={fields.hTakes} empty="Pick one" supplies={supplies} onValue={(hTakes) => set({ hTakes })} />
      <p className="field-note">It stays when it's empty. Load, fill or empty it from its card.</p>
    </div>
  )
}

type KindPageProps = KindProps & { gear: LubecGear; editId: string | null }

/** The kind's own page: a Thing has none. */
export function LubecItemFormKind(props: KindPageProps) {
  const { kind } = props.fields
  if (kind === 'weapon') return <WeaponPage {...props} />
  if (kind === 'armor') return <LubecArmorMaker {...props} />
  if (kind === 'consumable') return <ConsumablePage {...props} />
  return kind === 'holder' ? <HolderPage {...props} /> : null
}
