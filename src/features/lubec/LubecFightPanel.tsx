import { lubecEffectiveHandle } from '../ruleSets/lubec/derivations'
import type { LubecSheet } from '../ruleSets/lubec/sheet'
import { LubecNumber } from './LubecMissing'

// Reserved for the combat piece, which fills it later. Effective Handle is the
// character's own: no skill bonus and nobody's evasion lowers it here. "In hand"
// will read the Gear page's Hands, so until those exist it is an empty line,
// never a box to type into. Until active effects exist, current Handle is its
// final value.
export function LubecFightPanel({ sheet }: { sheet: LubecSheet }) {
  return (
    <section className="lubec-panel rust" aria-labelledby="lubec-panel-fight">
      <div className="lubec-section-head"><h3 id="lubec-panel-fight">Fight</h3></div>
      <dl className="lubec-fight">
        <div>
          <dt>Effective Handle</dt>
          <dd className="lubec-effective-handle"><LubecNumber value={lubecEffectiveHandle(sheet, [])} /></dd>
        </div>
        <div>
          <dt>In hand</dt>
          <dd className="lubec-in-hand" />
        </div>
      </dl>
    </section>
  )
}
