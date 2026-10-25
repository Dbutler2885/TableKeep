import { useId, useState } from 'react'
import { lubecEffectiveHandle, type LubecModifier } from '../ruleSets/lubec/derivations'
import type { LubecSheet } from '../ruleSets/lubec/sheet'
import { LubecNumber } from './LubecMissing'

/**
 * The prototype's Fight bar, collapsed until tapped, over the Effective Handle
 * heading. The combat piece fills the panel with its allocation tools later.
 * Effective Handle is the character's own: no skill bonus and nobody's evasion
 * lowers it here, but the active effects' modifiers do. "In hand" will read the
 * Gear page's Hands, so until those exist it is an empty line, never a box to
 * type into.
 */
export function LubecFightPanel({ sheet, modifiers }: { sheet: LubecSheet; modifiers: readonly LubecModifier[] }) {
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()
  return (
    <section className="fight-region" aria-label="Fight controls">
      <button className="fight-toggle" type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(!expanded)}>
        <strong>Fight</strong>
        <span>Divide your Effective Handle between Defense commitments and your attack</span>
        <span className="caret" aria-hidden="true">⌄</span>
      </button>
      <div className="fight-panel" id={panelId} hidden={!expanded}>
        <div className="fight-heading">
          <div><div className="eyebrow">Combat allocation</div><h3>Handle</h3></div>
          <div className="effective-handle">Effective Handle <strong className="lubec-effective-handle"><LubecNumber value={lubecEffectiveHandle(sheet, modifiers)} /></strong></div>
        </div>
        <div className="lubec-hands"><span className="eyebrow">In hand</span><span className="lubec-in-hand" /></div>
      </div>
    </section>
  )
}
