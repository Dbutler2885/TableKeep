import { lubecClass } from '../ruleSets/lubec/classes'
import { lubecCurrentValue, type LubecModifier } from '../ruleSets/lubec/derivations'
import type { LubecSheet } from '../ruleSets/lubec/sheet'
import { LubecMissing } from './LubecMissing'

// The prototype's Melee Strength Mod: one Impact for every full 20 of Strength.
// It reads current Strength, as Effective Handle reads current Handle.
function LubecMeleeStrengthMod({ strength }: { strength: number | null }) {
  return (
    <div className="record-value">
      <span>Melee Strength Mod</span>
      <strong>{strength === null ? <LubecMissing /> : `+${Math.floor(strength / 20)} Impact`}</strong>
    </div>
  )
}

/**
 * The prototype's class record: the class's name over its description, its
 * Trauma Response, its Class Rule when it has one, and the Melee Strength Mod;
 * nothing while the class is a hole.
 */
export function LubecClassRecord({ sheet, modifiers }: { sheet: LubecSheet; modifiers: readonly LubecModifier[] }) {
  const definition = lubecClass(sheet.class.key)
  if (!definition) return null
  return (
    <section className="class-section" aria-labelledby="lubec-class-title">
      <div className="section-bar"><h3 id="lubec-class-title">{definition.name}</h3></div>
      <article className="class-record">
        <p className="selected-class-description">{definition.description}</p>
        <div className="class-effects">
          <div className="trauma-response">
            <span>Trauma Response</span>
            <strong>{definition.traumaResponse.name}</strong>
            <p>{definition.traumaResponse.text}</p>
          </div>
          {definition.classRule ? (
            <div className="selected-class-rule"><span>Class Rule</span><p>{definition.classRule}</p></div>
          ) : null}
        </div>
        <div className="record-values">
          <LubecMeleeStrengthMod strength={lubecCurrentValue(sheet, 'Strength', modifiers)} />
        </div>
      </article>
    </section>
  )
}
