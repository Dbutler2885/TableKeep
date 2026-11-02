import { useId, useState } from 'react'
import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
import { lubecFightHandle, lubecFightSkillBonus, lubecFightSkills } from '../ruleSets/lubec/fightAllocation'
import { lubecWielder } from '../ruleSets/lubec/gear/minStrength'
import { LubecFightAllocation } from './fight/LubecFightAllocation'
import { useLubecFightStart } from './fight/lubecFightStart'
import type { LubecGearDrop } from './gear/lubecGearDrop'
import { LubecInHand } from './LubecInHand'
import { LubecNumber } from './LubecMissing'
import type { LubecRoller } from './useLubecRoller'

type FightPanelProps = {
  sheet: LubecCharacterSheet
  onDrop: LubecGearDrop
  /** The Core page's roller, whose armed skill the bar takes; null for a viewer who may not roll. */
  roller: LubecRoller | null
}

/**
 * The prototype's Fight bar, collapsed until tapped, over the Effective Handle
 * heading and the prototype's allocation bar, which divides it between Defense
 * lines and the attack, each part rolled on its own. Effective Handle is the
 * character's own, with the active effects' modifiers, plus the bonus of the
 * skill armed for the fight, which the skill strip's chips arm too; nobody's
 * evasion lowers it here. "In hand" reads the Gear page's Hands, each weapon
 * with its attack's Handle, in the heading's row. "Start a fight" opens the
 * fight modal for a viewer who may fight as the character.
 */
export function LubecFightPanel({ sheet, onDrop, roller }: FightPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()
  const wielder = lubecWielder(sheet)
  const start = useLubecFightStart()
  const armed = roller?.armed ?? null
  const bonus = lubecFightSkillBonus(sheet, armed)
  const handle = wielder.handle === null ? null : lubecFightHandle(wielder.handle, bonus)
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
          <div className="effective-handle">
            Effective Handle <strong className="lubec-effective-handle"><LubecNumber value={handle} /></strong>
            {bonus > 0 ? <span className="effective-handle-skill">+{bonus} {armed}</span> : null}
          </div>
          {start ? <button className="fight-start" type="button" onClick={() => start()}>Start a fight</button> : null}
        </div>
        <LubecFightAllocation handle={handle ?? 0} skills={lubecFightSkills(sheet)} roller={roller} />
      </div>
    </section>
  )
}
