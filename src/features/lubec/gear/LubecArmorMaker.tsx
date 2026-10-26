import type { ReactNode } from 'react'
import { layersUsed } from '../../ruleSets/lubec/gear/armorLayers'
import { baseLoc, LOC_KEYS, locName, locSummary, RULES } from '../../ruleSets/lubec/gear/gearRules'
import type { LubecGear } from '../../ruleSets/lubec/gear/gearRecord'
import { WOUND_KINDS, WOUNDS } from './itemLabels'
import { lubecTogglePart, type LubecItemFields } from './itemForm'
import { LubecBodyMap } from './LubecBodyMap'
import type { LubecFieldsProps } from './LubecItemFormTop'

type MakerProps = LubecFieldsProps & { gear: LubecGear; editId: string | null }

type ToggleProps = { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }

/** B's switch: a knob, a name and a line under it. */
function Toggle({ checked, onChange, children }: ToggleProps) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="knob" aria-hidden="true" />
      <span className="t">{children}</span>
    </label>
  )
}

/** What the maker has picked, and any part already full, which it can't be worn on until something comes off there. */
function PickedText({ gear, locs, editId }: { gear: LubecGear; locs: readonly string[]; editId: string | null }) {
  const ordered = LOC_KEYS.filter((k) => locs.includes(k))
  if (!ordered.length) return <p className="picked">Nothing picked yet. Tap the body.</p>
  const full = ordered.filter((k) => layersUsed(gear, k, editId) >= RULES.layers[baseLoc(k)])
  const already = full.length ? ` Already full: ${full.map(locName).join(', ')}, so it can't be worn until something comes off there.` : ''
  return <p className="picked">Covers <b>{locSummary(ordered)}</b>.{already}</p>
}

function WoundNumbers({ fields, onFields }: LubecFieldsProps) {
  const set = (w: keyof LubecItemFields['armor'], value: string) => onFields({ ...fields, armor: { ...fields.armor, [w]: value } })
  return (
    <fieldset className="field wound-nums">
      <legend className="label">Armor against each kind of wound</legend>
      <div className="four-num">
        {WOUND_KINDS.map((w) => (
          <label key={w} className="field"><span className="label">{WOUNDS[w]}</span><input type="number" min="0" max="9" inputMode="numeric" value={fields.armor[w]} onChange={(e) => set(w, e.target.value)} /></label>
        ))}
      </div>
      <p className="field-note">Taken off Impact on each part it covers. Layers add up.</p>
    </fieldset>
  )
}

/** The armor maker: its four numbers, the parts it covers picked on the body, both sides at once, and exclusive (Rules A1 and A2). */
export function LubecArmorMaker({ fields, onFields, gear, editId }: MakerProps) {
  return (
    <div className="kind-block kb-armor">
      <WoundNumbers fields={fields} onFields={onFields} />
      <div className="eyebrow">Tap where it covers</div>
      <div className="armor-wrap maker">
        <div className="body-col"><LubecBodyMap gear={gear} picked={fields.locs} onTap={(k) => onFields(lubecTogglePart(fields, k))} /></div>
        <div className="armor-side">
          <Toggle checked={fields.bothSides} onChange={(bothSides) => onFields({ ...fields, bothSides })}>
            Both sides at once<small>A tap on an arm, hand, leg or foot picks the pair.</small>
          </Toggle>
          <PickedText gear={gear} locs={fields.locs} editId={editId} />
          {fields.locs.length ? <button type="button" className="btn line small" onClick={() => onFields({ ...fields, locs: [] })}>Clear</button> : null}
          <Toggle checked={fields.exclusive} onChange={(exclusive) => onFields({ ...fields, exclusive })}>
            Exclusive<small>Takes every layer where it covers, like a snowmobile suit. Ordinary armor takes one layer.</small>
          </Toggle>
        </div>
      </div>
    </div>
  )
}
