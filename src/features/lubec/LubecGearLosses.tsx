import { useId } from 'react'
import { describeLubecEffectStep } from '../ruleSets/lubec/effects'
import type { LubecGear } from '../ruleSets/lubec/gear/gearRecord'
import { isLubecGearLossOff, lubecGearModifiers, lubecSwitchGearLoss, type LubecGearModifier } from '../ruleSets/lubec/modifiers'

// The Effects panel's second group, "From your gear": each Speed loss gear
// causes now (spec 5.3), drawn as the same grey modifier bar the effects use,
// with its reason. Gear works the losses out, so they are not edited here: the
// owner and the GM may only turn one off, which keeps it listed, marked off,
// counting for nothing, and turn it on again. A different number is an
// ordinary effect, added above.

/** Saves the character's next gear; null for a viewer who may only look. */
type GearChange = ((gear: LubecGear) => void) | null

type LossProps = { loss: LubecGearModifier; off: boolean; onSwitch: (() => void) | null }

function LubecGearLoss({ loss, off, onSwitch }: LossProps) {
  const label = off ? 'Turn on' : 'Turn off'
  return (
    <li className={off ? 'lubec-effect lubec-gear-loss is-off' : 'lubec-effect lubec-gear-loss'}>
      <div className="modifier lubec-effect-line">
        <span className="lubec-effect-name">{loss.reason}</span>
        <span className="lubec-effect-now">{describeLubecEffectStep({ modifiers: [loss], labels: [] })}</span>
        {off ? <span className="lubec-effect-next">turned off</span> : null}
      </div>
      {onSwitch ? <button type="button" className="secondary-button" aria-label={`${label} ${loss.reason}`} onClick={onSwitch}>{label}</button> : null}
    </li>
  )
}

/** Gear's Speed losses under the stored effects, with the owner's and GM's Turn off switch; nothing while gear costs nothing. */
export function LubecGearLosses({ gear, onGearChange }: { gear: LubecGear; onGearChange: GearChange }) {
  const titleId = useId()
  const losses = lubecGearModifiers(gear)
  if (losses.length === 0) return null
  const switchOf = (loss: LubecGearModifier, off: boolean) => onGearChange && (() => onGearChange(lubecSwitchGearLoss(gear, loss.key, off)))
  return (
    <div className="lubec-gear-losses">
      <p className="skill-strip-hint" id={titleId}>From your gear</p>
      <ul className="modifier-list lubec-effect-list" aria-labelledby={titleId}>
        {losses.map((loss) => {
          const off = isLubecGearLossOff(gear, loss)
          return <LubecGearLoss key={loss.key} loss={loss} off={off} onSwitch={switchOf(loss, off)} />
        })}
      </ul>
    </div>
  )
}
