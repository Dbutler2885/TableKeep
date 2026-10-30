import { useId, useState } from 'react'
import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
import { lubecWielder } from '../ruleSets/lubec/gear/minStrength'
import type { LubecGearDrop } from './gear/lubecGearDrop'
import { LubecInHand } from './LubecInHand'
import { LubecNumber } from './LubecMissing'

/**
 * The prototype's Fight bar, collapsed until tapped, over the Effective Handle
 * heading. The combat piece fills the panel with its allocation tools later.
 * Effective Handle is the character's own: no skill bonus and nobody's evasion
 * lowers it here, but the active effects' modifiers do. "In hand" reads the
 * Gear page's Hands, each weapon with its attack's Handle, in the heading's
 * row so the opened bar keeps the Core page on one desktop screen.
 */
export function LubecFightPanel({ sheet, onDrop }: { sheet: LubecCharacterSheet; onDrop: LubecGearDrop }) {
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()
  const wielder = lubecWielder(sheet)
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
          <LubecInHand gear={sheet.gear} wielder={wielder} onDrop={onDrop} />
          <div className="effective-handle">Effective Handle <strong className="lubec-effective-handle"><LubecNumber value={wielder.handle} /></strong></div>
        </div>
      </div>
    </section>
  )
}
